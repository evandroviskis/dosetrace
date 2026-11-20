-- Creators program (affiliates) — docs/specs/creators.md, founder approved 2026-11-20.
-- Every table: RLS on, 0 policies, service_role only (written by the Vercel functions api/adm-creators.js,
-- api/creator.js, api/go.js and api/rc-webhook.js). anon/authenticated get nothing (42501).
-- Sensitive fields (payout profile, tokens shown again to the admin) are AES-256-GCM sealed by the server
-- (CREATOR_DATA_KEY on Vercel); the database never sees them in clear. Tokens are looked up by sha256.
-- Rollback: drop the functions, then the tables, in reverse order (bottom of this file).

begin;
create extension if not exists pgcrypto;

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,12}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]{3,12}$' and slug = lower(code)),
  display_name text not null check (char_length(display_name) between 1 and 80),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  platforms text[] not null default '{}' check (platforms <@ array['instagram','youtube','tiktok','facebook','x','site','outro']::text[]),
  status text not null default 'invited' check (status in ('invited','submitted','active','paused','ended','rejected')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  approved_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Invite and portal links. One live link per kind; "new link" revokes the previous one.
-- token_enc = the sealed token, so the admin can see and copy the same link again (founder 2026-11-20).
create table if not exists public.creator_links (
  id bigserial primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  kind text not null check (kind in ('invite','portal')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text not null check (token_enc like 'v1.%'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create unique index if not exists creator_links_live on public.creator_links (creator_id, kind) where revoked_at is null;

-- The creator's sign-up: the whole profile sealed, plus a masked copy for display. One row per submission.
create table if not exists public.creator_profiles (
  id bigserial primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  country text not null check (country ~ '^[A-Z]{2}$'),
  method text not null check (method in ('pix','paypal','wise','ach')),
  profile_enc text not null check (profile_enc like 'v1.%'),
  masked jsonb not null check (jsonb_typeof(masked) = 'object'),
  rules_version text not null,
  review text not null default 'submitted' check (review in ('submitted','approved','changes_requested','rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_at timestamptz,
  tax_form_received_on date
);
create index if not exists creator_profiles_creator on public.creator_profiles (creator_id, submitted_at desc);

-- Commission model, in versions (a change creates a new version from a date).
create table if not exists public.creator_terms (
  id bigserial primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  valid_from date not null,
  pct numeric(5,2) not null default 0 check (pct between 0 and 100),
  duration text not null default 'months' check (duration in ('lifetime','while_subscribed','months')),
  duration_months int check (duration_months is null or duration_months between 1 and 120),
  basis text not null default 'all' check (basis in ('all','first_only')),
  fixed_month_cents int not null default 0 check (fixed_month_cents between 0 and 10000000),
  fixed_post_cents int not null default 0 check (fixed_post_cents between 0 and 10000000),
  contract_signed_on date,
  contract_ref text check (contract_ref is null or char_length(contract_ref) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  unique (creator_id, valid_from)
);

-- Taps on /go/<creator>/<platform>: one counter per day, platform and device. No IP, user agent, cookie or referer.
create table if not exists public.creator_clicks (
  creator_id uuid not null references public.creators(id) on delete cascade,
  platform text not null,
  day date not null,
  device text not null check (device in ('ios','android','desktop')),
  n int not null default 0 check (n >= 0),
  primary key (creator_id, platform, day, device)
);

-- An app account that used a creator code (first touch; written by the app through api/creator.js).
create table if not exists public.creator_attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  platform text,
  code text not null check (code ~ '^[A-Z0-9]{3,12}(-[A-Z]{1,4})?$'),
  source text not null check (source in ('typed','link','play_referrer')),
  first_seen_at timestamptz not null default now()
);
create index if not exists creator_attributions_creator on public.creator_attributions (creator_id);

-- RevenueCat webhook ledger: only the listed fields of each event (never an e-mail or another attribute).
create table if not exists public.rc_events (
  id text primary key check (char_length(id) between 1 and 128),
  type text, environment text, app_user_id text, original_app_user_id text, aliases text[] not null default '{}',
  product_id text, store text, period_type text, is_trial_conversion boolean not null default false, renewal_number int,
  cancel_reason text, event_at timestamptz not null, purchased_at timestamptz, expiration_at timestamptz,
  price_usd numeric, price_local numeric, currency text, tax_pct numeric, commission_pct numeric, country_code text,
  transaction_id text, original_transaction_id text, creator_code text, creator_source text,
  received_at timestamptz not null default now()
);
create index if not exists rc_events_user on public.rc_events (app_user_id, event_at);
create index if not exists rc_events_code on public.rc_events (creator_code) where creator_code is not null;

create table if not exists public.creator_posts (
  id bigserial primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  posted_on date not null,
  platform text,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- A month marked as paid: the amount due is frozen here.
create table if not exists public.creator_payouts (
  id bigserial primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_due_cents int not null,
  paid_on date not null,
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  paid_currency text not null check (paid_currency ~ '^[A-Z]{3}$'),
  fx numeric(14,6),
  method text not null check (char_length(method) between 1 and 60),
  reference text check (reference is null or char_length(reference) <= 120),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  unique (creator_id, month)
);

create table if not exists public.creator_program_settings (
  id int primary key default 1 check (id = 1),
  payouts_enabled boolean not null default false,
  accountant_ok_at timestamptz, lawyer_ok_at timestamptz,
  min_payout_cents int not null default 2000 check (min_payout_cents between 0 and 1000000),
  holdback_days int not null default 30 check (holdback_days between 0 and 120),
  benefit_text text check (benefit_text is null or char_length(benefit_text) <= 200),
  apple_pt text check (apple_pt is null or apple_pt ~ '^[0-9]{3,20}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (not payouts_enabled or (accountant_ok_at is not null and lawyer_ok_at is not null))
);
insert into public.creator_program_settings (id) values (1) on conflict (id) do nothing;

-- Admin audit of every write in the creators tab (no PII in detail: the server checks it).
create table if not exists public.creator_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid not null,
  action text not null check (char_length(action) between 1 and 40),
  creator_id uuid references public.creators(id) on delete set null,
  detail jsonb check (detail is null or position('@' in detail::text) = 0)
);

-- ---------------------------------------------------------------- functions (service_role only)
-- Click: counts only an active (or test) creator and one of its platforms; returns what the redirect needs.
create or replace function public.creator_go(p_slug text, p_platform text, p_device text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.creators;
begin
  select * into c from public.creators where slug = lower(p_slug);
  if not found then return jsonb_build_object('found', false); end if;
  if c.status in ('active') or (c.is_test and c.status <> 'ended') then
    if p_platform = any(c.platforms) and p_device in ('ios','android','desktop') then
      insert into public.creator_clicks (creator_id, platform, day, device, n) values (c.id, p_platform, (now() at time zone 'utc')::date, p_device, 1)
        on conflict (creator_id, platform, day, device) do update set n = public.creator_clicks.n + 1;
    end if;
    return jsonb_build_object('found', true, 'live', true, 'code', c.code, 'platforms', c.platforms, 'name', c.display_name,
      'pt', (select apple_pt from public.creator_program_settings where id = 1), 'benefit', (select benefit_text from public.creator_program_settings where id = 1));
  end if;
  return jsonb_build_object('found', true, 'live', false);
end; $$;

-- Which of these accounts are test accounts (admin_is_test: list, domain, rule, exceptions).
create or replace function public.creator_test_users(p_ids uuid[])
 returns setof uuid language sql stable security definer set search_path to 'public', 'auth' as $$
  select u.id from auth.users u where u.id = any(p_ids) and public.admin_is_test(u.email);
$$;

-- Create a creator with its first model version and both links, in one transaction.
create or replace function public.creator_create(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare new_id uuid;
begin
  insert into public.creators (code, slug, display_name, country, platforms, is_test, created_by)
    values (p->>'code', lower(p->>'code'), p->>'display_name', nullif(p->>'country',''),
            array(select jsonb_array_elements_text(p->'platforms')), coalesce((p->>'is_test')::boolean, false), (p->>'actor')::uuid)
    returning id into new_id;
  if p ? 'terms' and p->'terms' <> 'null'::jsonb then
    insert into public.creator_terms (creator_id, valid_from, pct, duration, duration_months, basis, fixed_month_cents, fixed_post_cents, created_by)
      values (new_id, coalesce((p->'terms'->>'valid_from')::date, (now() at time zone 'utc')::date), (p->'terms'->>'pct')::numeric,
              p->'terms'->>'duration', nullif(p->'terms'->>'duration_months','')::int, p->'terms'->>'basis',
              coalesce((p->'terms'->>'fixed_month_cents')::int, 0), coalesce((p->'terms'->>'fixed_post_cents')::int, 0), (p->>'actor')::uuid);
  end if;
  insert into public.creator_links (creator_id, kind, token_hash, token_enc, expires_at)
    values (new_id, 'invite', p->>'invite_hash', p->>'invite_enc', (p->>'invite_expires_at')::timestamptz),
           (new_id, 'portal', p->>'portal_hash', p->>'portal_enc', null);
  insert into public.creator_audit (actor, action, creator_id, detail) values ((p->>'actor')::uuid, 'create', new_id, jsonb_build_object('code', p->>'code', 'is_test', coalesce((p->>'is_test')::boolean, false)));
  return jsonb_build_object('id', new_id);
exception when unique_violation then
  return jsonb_build_object('error', 'code_taken');
end; $$;

-- Replace a live link (invite or portal) with a new one.
create or replace function public.creator_link_rotate(p_creator uuid, p_kind text, p_hash text, p_enc text, p_expires timestamptz, p_actor uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  update public.creator_links set revoked_at = now() where creator_id = p_creator and kind = p_kind and revoked_at is null;
  insert into public.creator_links (creator_id, kind, token_hash, token_enc, expires_at) values (p_creator, p_kind, p_hash, p_enc, p_expires);
  insert into public.creator_audit (actor, action, creator_id, detail) values (p_actor, 'link_' || p_kind, p_creator, null);
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------- grants
do $$
declare t text;
begin
  foreach t in array array['creators','creator_links','creator_profiles','creator_terms','creator_clicks','creator_attributions','rc_events','creator_posts','creator_payouts','creator_program_settings','creator_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
grant select, update on public.creators to service_role;
grant select, update on public.creator_links to service_role;
grant select, insert, update on public.creator_profiles to service_role;
grant select, insert on public.creator_terms to service_role;
grant select on public.creator_clicks to service_role;
grant select, insert on public.creator_attributions to service_role;
grant select, insert on public.rc_events to service_role;
grant select, insert, delete on public.creator_posts to service_role;
grant select, insert on public.creator_payouts to service_role;
grant select, update on public.creator_program_settings to service_role;
grant select, insert on public.creator_audit to service_role;
grant usage on sequence public.creator_profiles_id_seq, public.creator_terms_id_seq, public.creator_posts_id_seq, public.creator_payouts_id_seq, public.creator_audit_id_seq to service_role;
revoke all on function public.creator_go(text, text, text), public.creator_test_users(uuid[]), public.creator_create(jsonb), public.creator_link_rotate(uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.creator_go(text, text, text), public.creator_test_users(uuid[]), public.creator_create(jsonb), public.creator_link_rotate(uuid, text, text, text, timestamptz, uuid) to service_role;

commit;

-- Rollback (only with the founder's go):
-- begin;
-- drop function if exists public.creator_link_rotate(uuid, text, text, text, timestamptz, uuid), public.creator_create(jsonb), public.creator_test_users(uuid[]), public.creator_go(text, text, text);
-- drop table if exists public.creator_audit, public.creator_program_settings, public.creator_payouts, public.creator_posts, public.rc_events, public.creator_attributions, public.creator_clicks, public.creator_terms, public.creator_profiles, public.creator_links, public.creators;
-- commit;
