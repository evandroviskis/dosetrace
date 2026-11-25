-- Profile synced (founder 2026-11-24 13:13 EST: "pode corrigir... vamos fazer tudo junto"; spec
-- docs/specs/profile-synced.md; picture docs/design/perfil-sincronizado.html). The account profile moves
-- out of auth.users.raw_user_meta_data (no history, no tombstones, overwrite-prone) into a synced,
-- RLS-protected table: ONE row per account, ONE jsonb payload merged per key (the app: lib/profileStore,
-- lib/syncCore; the calc_inputs pattern, DV-010).
--
-- NOT APPLIED. Apply only with the founder's "pode aplicar". An app build WITHOUT this table keeps
-- working: "table not found" (PGRST205 / 42P01) is "not there yet" (lib/syncCore LATE_TABLES) — the
-- profile is read from user_metadata exactly as 1.3.1 does, and every other table syncs as before.
--
-- Name: public.account_profile, NOT public.profiles — that one is the legacy table (id, email, name,
-- plan) the core tables reference by foreign key; it is not touched here.
--
-- What it does (additive; nothing existing is changed or removed; user_metadata is never written):
--   1. public.account_profile (user_id unique, ON DELETE CASCADE from the account), own-row RLS
--      (select / insert / update; no delete policy: the app never deletes the row — account deletion
--      runs as the service role and by cascade), the updated_at trigger (the app's push writes only over
--      the updated_at it read), the A-119 device guard when A-119 is installed.
--   2. public.dt_profile_keys(meta): the profile keys of a metadata object — every key except the
--      sign-in provider's identity claims, the values that have their own synced table and the app's
--      migration markers (the same list as lib/profileStore EXCLUDED_KEYS; __tests__/profileSynced PS-3).
--   3. Backfill: every account's current user_metadata profile into the table. Re-runnable: a key the
--      table already has is never overwritten (excluded.payload || existing payload: the existing wins).
--   4. Transition while 1.3.0 / 1.3.1 are in the stores (they read and write only user_metadata): a
--      trigger on auth.users copies the profile keys that CHANGED in each metadata write (an old
--      version's, the new app's mirror, a sign-up) into the row, merged over it (a metadata change is
--      the newest value of that key). It never fails a sign-up or a sign-in: any error is a warning
--      plus one row in public.account_profile_copy_errors (service role only). It is created BEFORE
--      the backfill runs, so no metadata write can fall between the two.
--      Removed in the later cleanup, once no store version older than this one is in use.
--
-- BEFORE APPLYING (Gate B F3 d): the A-119 block at the end REPLACES public.dt_pre_request with the body of
-- 20261026000000_lab_prefs.sql lines 78-91 plus account_profile. Diff the live one first, read-only:
--   select pg_get_functiondef('public.dt_pre_request'::regproc);
-- against that body; if production has anything more (a table or a rule added since), add it here first.
-- The unique user_id is the only index needed (one row per account).
--
-- Depends on public.set_updated_at() (production; used by calc_inputs / lab_prefs).
-- ROLLBACK (only before any phone wrote here; the rows are user data — user_metadata still has every
-- value, so nothing is lost):
--   drop trigger if exists dt_profile_from_auth on auth.users;
--   drop table if exists public.account_profile_copy_errors;
--   drop function if exists public.dt_profile_from_auth();
--   drop table if exists public.account_profile;
--   drop function if exists public.dt_profile_keys(jsonb);
--   and run the dt_pre_request body of 20261026000000_lab_prefs.sql again (without account_profile).

begin;

create table if not exists public.account_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_profile enable row level security;

drop policy if exists "account_profile select own" on public.account_profile;
drop policy if exists "account_profile insert own" on public.account_profile;
drop policy if exists "account_profile update own" on public.account_profile;
create policy "account_profile select own" on public.account_profile for select using ((select auth.uid()) = user_id);
create policy "account_profile insert own" on public.account_profile for insert with check ((select auth.uid()) = user_id);
create policy "account_profile update own" on public.account_profile for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists account_profile_set_updated_at on public.account_profile;
create trigger account_profile_set_updated_at before update on public.account_profile
  for each row execute function public.set_updated_at();

-- The profile keys of a metadata object (not an object → empty).
create or replace function public.dt_profile_keys(meta jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when meta is null or jsonb_typeof(meta) <> 'object' then '{}'::jsonb else coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(meta) e
    where not (e.key = any (array['iss', 'sub', 'aud', 'email', 'email_verified', 'phone', 'phone_verified', 'name', 'full_name', 'given_name', 'family_name', 'nickname', 'avatar_url', 'picture', 'provider_id', 'custom_claims', 'is_private_email', 'user_name', 'preferred_username', 'slug', 'calc_inputs', 'calc_reality_open', 'calc_reality_checks', 'calc_snapshots', 'favorite_markers', 'report_tags', 'bloodwork_credits']))
      and e.key !~ 'migrated'
  ), '{}'::jsonb) end;
$$;
revoke all on function public.dt_profile_keys(jsonb) from public, anon, authenticated;

-- Drift made visible (Gate B F3 c): a copy the trigger could not make leaves one row here (who, the error,
-- when) besides the warning; the app's own push then fills the row (lib/profileStore, fill-only). Read by
-- the service role only (RLS on, no policies, no grants): select * from public.account_profile_copy_errors.
create table if not exists public.account_profile_copy_errors (
  id bigserial primary key,
  user_id uuid,
  sqlstate text,
  message text,
  at timestamptz not null default now()
);
alter table public.account_profile_copy_errors enable row level security;
revoke all on table public.account_profile_copy_errors from public, anon, authenticated;

-- 4. The transition trigger, created BEFORE the backfill (Gate B F3 a): create trigger takes a SHARE ROW
-- EXCLUSIVE lock on auth.users that this transaction holds until commit, so no metadata write can land
-- between the backfill's read and the trigger — a write waits, then the trigger copies it. The profile
-- keys that changed in this metadata write, merged over the row. Everything that can fail runs inside the
-- exception block (Gate B F3 b): an error never fails a sign-up, a sign-in or an updateUser.
create or replace function public.dt_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_changed jsonb;
begin
  v_new := public.dt_profile_keys(new.raw_user_meta_data);
  v_old := case when tg_op = 'UPDATE' then public.dt_profile_keys(old.raw_user_meta_data) else '{}'::jsonb end;
  select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) into v_changed
  from jsonb_each(v_new) n
  where (v_old -> n.key) is distinct from n.value;
  if v_changed = '{}'::jsonb and tg_op = 'UPDATE' then return new; end if;
  insert into public.account_profile (user_id, payload) values (new.id, v_changed)
  on conflict (user_id) do update
    set payload = public.account_profile.payload || excluded.payload;
  return new;
exception when others then
  raise warning 'dt_profile_from_auth: % (%)', sqlerrm, sqlstate;
  begin
    insert into public.account_profile_copy_errors (user_id, sqlstate, message) values (new.id, sqlstate, left(sqlerrm, 500));
  exception when others then
    null; -- recording the error is best effort too: the auth write always goes on
  end;
  return new;
end;
$$;
revoke all on function public.dt_profile_from_auth() from public, anon, authenticated;

drop trigger if exists dt_profile_from_auth on auth.users;
create trigger dt_profile_from_auth
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.dt_profile_from_auth();

-- 3. Backfill (re-runnable; the table's own keys win — a value the trigger just wrote included).
insert into public.account_profile (user_id, payload)
select u.id, public.dt_profile_keys(u.raw_user_meta_data)
from auth.users u
on conflict (user_id) do update
  set payload = excluded.payload || public.account_profile.payload
  where (excluded.payload || public.account_profile.payload) is distinct from public.account_profile.payload;

-- A-119 device guard (20261021010000_one_active_device.sql), only when it is installed: the
-- statement-level write guard, and the pre-request check of reads and writes (the body of
-- 20261026000000_lab_prefs.sql with account_profile added). The trigger above writes from the auth
-- server's connection (no PostgREST request, auth.uid() null), which the guard lets through.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_device_guard') then
    execute 'drop trigger if exists dt_device_guard on public.account_profile';
    execute 'create trigger dt_device_guard before insert or update or delete on public.account_profile for each statement execute function public.dt_device_guard()';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_pre_request')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_require_active_device') then
    execute $fn$
create or replace function public.dt_pre_request()
returns void language plpgsql security definer set search_path = public, pg_temp as $body$
declare
  v_path text := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/+', '');
  v_method text := upper(coalesce(nullif(current_setting('request.method', true), ''), 'GET'));
  v_table text := split_part(split_part(v_path, '?', 1), '/', 1);
begin
  if v_table = any (array['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'lab_prefs', 'account_profile']) then
    perform public.dt_require_active_device(v_method not in ('GET', 'HEAD'));
  elsif v_table = 'push_tokens' and v_method in ('POST', 'PATCH', 'PUT') then
    perform public.dt_require_active_device(true);
  end if;
end;
$body$;
$fn$;
    execute 'revoke all on function public.dt_pre_request() from public';
    execute 'grant execute on function public.dt_pre_request() to anon, authenticated, service_role';
  end if;
end;
$$;

commit;

-- PostgREST picks up the new table (and the replaced pre-request body) on a schema reload.
notify pgrst, 'reload schema';
