-- A-127 in-app update notice (founder 2026-10-15 / checklist signed 2026-10-16; docs/specs/update-notice.md
-- UN-1, UN-4, UN-6; picture docs/design/a127-update-notice.html).
--
-- NOT APPLIED. Apply only with the founder's "pode aplicar". A build with A-127 and WITHOUT this
-- migration behaves as before: its read of app_releases answers "table not found" (PostgREST 12.2:
-- HTTP 404 with code 42P01), which the app treats as "nothing to say" — no invitation, no required
-- screen (lib/updateFlow refresh keeps its cache on any error; __tests__/updateNotice.test.js "a
-- missing table"). Its push_tokens upsert without app_version retries without the column
-- named in the error (lib/notifications registerPushToken).
-- push_tokens.language (A-156) is its own migration, 20261021230000_push_tokens_language.sql; the
-- senders read the tokens without it if it is not there yet (English).
--
-- BEFORE applying, create the cron secret in Vault and give the function the same value (the hourly
-- call sends it; version-notice refuses a call without it):
--   select vault.create_secret('<a long random value>', 'dosetrace_cron_secret');
--   supabase secrets set CRON_SECRET=<the same value>
--   supabase functions deploy version-notice --no-verify-jwt
-- CHECK after applying (a missing secret makes the hourly header empty and every run a refused 401;
-- the function logs "[version-notice] refused: no Authorization header" when that happens):
--   select count(*) from vault.decrypted_secrets where name = 'dosetrace_cron_secret';   -- must be 1
--   then, after the next :05, the version-notice function log has no "refused" line.
-- Needs A-119's migration (20261021010000_one_active_device.sql) only for push_tokens.device_id,
-- which registerPushToken already handles missing.
--
-- What the founder edits WITHOUT a new build (Supabase dashboard › Table editor › app_releases, one
-- row per platform):
--   latest_version — e.g. '1.3.3'. Set it only AFTER the version is live in that store (App Store /
--                    Google Play, released to 100%): "Atualizar" opens the store, and a version not
--                    there yet would invite people to nothing and spend the one push. Below it, at app
--                    open, the invitation "Nova versão do DoseTrace" with "Agora não" (once per
--                    version, once more 7 days later, never twice a day), and — 24 h after this
--                    field changed (latest_set_at, set by the trigger below) — one push to the people
--                    who said yes.
--   min_version    — leave EMPTY (null) unless an old version must stop (changed Terms / Privacy
--                    Policy). Set it only AFTER the version is live in that store, too: below it the
--                    full screen "Atualize o DoseTrace para continuar" cannot be closed, and its only
--                    button opens the store — with nothing new there it would lock people out.
--                    Nothing on the phone is deleted. Never above latest_version.
--   notes          — "O que há de novo", two or three lines per language:
--                    {"en": ["The food log stands out", "…"], "pt": ["Destaque no registro de comida", "…"],
--                     "es": […], "fr": […], "de": […], "it": […]}  (a missing language shows English)
--                    The first line is also the push text.
--   reason         — the reason line on the required screen, one per language:
--                    {"en": "We updated the Terms of Use and the Privacy Policy.", "pt": "Atualizamos …", …}
-- A-119's device_policy.min_app_version stays the SERVER's refusal floor (DT003, for a server change
-- old versions cannot work with); below it the app shows the same required screen.
--
-- ROLLBACK (in this order):
--   select cron.unschedule('dosetrace-version-notice');
--   drop function if exists public.claim_version_notice();
--   drop table if exists public.app_release_pushes, public.version_notice_runs, public.app_releases;
--   drop function if exists public.app_releases_touch();
--   (push_tokens.app_version may stay: nullable, unused by older builds.)

-- ── UN-1: the release row per platform ──────────────────────────────────────────────────────
create table if not exists public.app_releases (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text check (latest_version is null or latest_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  min_version text check (min_version is null or min_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  notes jsonb not null default '{}'::jsonb check (jsonb_typeof(notes) = 'object'),
  reason jsonb not null default '{}'::jsonb check (jsonb_typeof(reason) = 'object'),
  updated_at timestamptz not null default now(),
  -- When latest_version last changed (the trigger below): the push waits 24 h after it.
  latest_set_at timestamptz,
  -- A typo that put the minimum above the latest would lock every phone out: refused.
  constraint app_releases_min_not_above_latest check (
    min_version is null or latest_version is null
    or string_to_array(min_version, '.')::int[] <= string_to_array(latest_version, '.')::int[]
  )
);
insert into public.app_releases (platform) values ('ios'), ('android') on conflict (platform) do nothing;

create or replace function public.app_releases_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.latest_version is not null then new.latest_set_at := now(); end if;
  elsif new.latest_version is distinct from old.latest_version then
    new.latest_set_at := case when new.latest_version is null then null else now() end;
  else
    new.latest_set_at := old.latest_set_at; -- never moved by hand
  end if;
  return new;
end;
$$;
drop trigger if exists app_releases_touch on public.app_releases;
create trigger app_releases_touch before insert or update on public.app_releases for each row execute function public.app_releases_touch();

-- Public, read-only: the app reads it signed in or not (the required screen applies to everyone,
-- and a phone below the minimum must still read its reason line). Only the dashboard / service role
-- writes it.
alter table public.app_releases enable row level security;
drop policy if exists app_releases_read on public.app_releases;
create policy app_releases_read on public.app_releases for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on table public.app_releases from anon, authenticated;
grant select on table public.app_releases to anon, authenticated;

-- ── UN-6: the app version on the device row ─────────────────────────────────────────────────
alter table public.push_tokens add column if not exists app_version text check (app_version is null or char_length(app_version) <= 20);

-- One push per person per version (the sender claims a row before sending; a failed send releases it).
create table if not exists public.app_release_pushes (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  version text not null check (char_length(version) <= 20),
  sent_at timestamptz not null default now(),
  primary key (user_id, platform, version)
);
-- No policy: only the service role (the edge function) reaches it.
alter table public.app_release_pushes enable row level security;
revoke all on table public.app_release_pushes from anon, authenticated;

-- At most one run per 50 minutes: a call from anyone who finds the URL does nothing.
create table if not exists public.version_notice_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now()
);
alter table public.version_notice_runs enable row level security;
revoke all on table public.version_notice_runs from anon, authenticated;

create or replace function public.claim_version_notice()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('dosetrace-version-notice'));
  if exists (select 1 from public.version_notice_runs where ran_at > now() - interval '50 minutes') then
    return false;
  end if;
  insert into public.version_notice_runs default values;
  delete from public.version_notice_runs where ran_at < now() - interval '7 days';
  return true;
end;
$$;
revoke all on function public.claim_version_notice() from public, anon, authenticated;
grant execute on function public.claim_version_notice() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Every hour at :05 (each person is reached in their first daytime hour, 10:00–19:59 local).
select cron.schedule(
  'dosetrace-version-notice',
  '5 * * * *',
  $$ select net.http_post(
       url := 'https://mqfvnqfusqyhqhowfweh.supabase.co/functions/v1/version-notice',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dosetrace_cron_secret')
       ),
       body := '{}'::jsonb
     ); $$
);
