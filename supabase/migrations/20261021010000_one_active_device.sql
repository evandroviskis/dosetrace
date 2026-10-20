-- A-119 one active device per account (founder 2026-10-15, AD-77; docs/specs/one-active-device.md
-- OD-1..OD-18; DL-102..DL-108; plan docs/specs/one-active-device-plan.md section 1).
--
-- NOT APPLIED. Apply only with the founder's "pode aplicar", before any build with A-119 reaches a
-- phone (a build without this migration keeps working: its device calls answer "function not
-- found" = unknown, never a verdict). Rehearse on a Supabase branch or a local stack first.
--
-- BEFORE applying, check that no other pre-request function is set (this migration sets one):
--   select rolconfig from pg_roles where rolname = 'authenticator';
-- If a pgrst.db_pre_request is already there, call it from public.dt_pre_request instead.
--
-- What it does (additive; no existing row is changed or removed):
--   1. account_devices — per account: the ONE active device and the session that claimed it.
--      user_devices    — per account and device: its name for the other phone's notice, its last
--                        complete send (server time), whether it was replaced (when, by which), the
--                        rebuild and the notice owed to it after a takeover, the hash of its
--                        background-check secret.
--      device_policy   — the minimum app version (DL-105; null = none). RPC-only tables: RLS on, no
--                        policies, no grants.
--   2. push_tokens.device_id — a takeover removes the other devices' tokens (OD-16).
--   3. The guard (OD-7, DL-105): every read and write of a synced table from a device that is not the
--      account's active one is refused with a distinct SQLSTATE before the query runs (PostgREST
--      pre-request): DT001 not the active device, DT002 no device id while the account has one
--      (an older app version), DT003 below the minimum version. Never a silent empty result: today's
--      app (1.3.0) keeps its rows pending on any error and deletes nothing locally. Writes are checked
--      again by statement-level triggers (they fire even for 0 rows) and take a FOR SHARE lock on the
--      account row, so a write in flight lands either before a takeover (and is in the new phone's
--      import) or after it (refused) — OD-3. The service role and requests without a user are exempt
--      (account deletion, the server senders).
--   4. RPCs: claim_device, device_status, release_device, device_mark_sent, device_ack (signed in);
--      device_status_by_secret (the Android background run, no session refresh) and account_exists
--      (after a session ended on its own) for anon.
--
-- ROLLBACK (run in this order):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
--   do $$ declare t text; begin foreach t in array array['protocols','vials','dose_logs','biomarkers',
--     'vaccines','food_logs','reality_checks','calc_snapshots','calc_targets','reality_check_open',
--     'calc_inputs','push_tokens'] loop execute format('drop trigger if exists dt_device_guard on public.%I', t);
--     end loop; end $$;
--   drop function if exists public.dt_pre_request(), public.dt_device_guard(),
--     public.dt_require_active_device(boolean), public.dt_header(text), public.dt_version_below(text, text),
--     public.claim_device(text, text, text, text, text, text), public.device_status(text),
--     public.release_device(text), public.device_mark_sent(text), public.device_ack(text, text),
--     public.device_status_by_secret(text), public.account_exists(uuid);
--   drop table if exists public.user_devices, public.account_devices, public.device_policy;
--   (push_tokens.device_id may stay: nullable, unused by older builds.)

-- ── 1. Tables ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.account_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_device text,
  since timestamptz not null default now(),
  session_created_at timestamptz
);

create table if not exists public.user_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 128),
  platform text check (platform is null or char_length(platform) <= 16),
  name text check (name is null or char_length(name) <= 60),
  brand text check (brand is null or char_length(brand) <= 40),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  secret_hash text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_full_send_at timestamptz,
  replaced_at timestamptz,
  replaced_by text,
  rebuild_owed boolean not null default false,
  notice jsonb,
  primary key (user_id, device_id)
);
create index if not exists user_devices_secret_hash on public.user_devices (secret_hash) where secret_hash is not null;

create table if not exists public.device_policy (
  id boolean primary key default true check (id),
  min_app_version text check (min_app_version is null or min_app_version ~ '^[0-9]+(\.[0-9]+)*$')
);
insert into public.device_policy (id) values (true) on conflict (id) do nothing;

alter table public.account_devices enable row level security;
alter table public.user_devices enable row level security;
alter table public.device_policy enable row level security;
revoke all on table public.account_devices, public.user_devices, public.device_policy from public, anon, authenticated;

-- ── 2. push_tokens names its device ─────────────────────────────────────────────────────────
alter table public.push_tokens add column if not exists device_id text;

-- ── 3. The guard ────────────────────────────────────────────────────────────────────────────
-- A request header as PostgREST passes it (lower-case names); null when absent or empty.
create or replace function public.dt_header(p_name text)
returns text language sql stable set search_path = public, pg_temp as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> p_name, '')
$$;

-- "1.3.0" below "1.3.1"; anything unreadable is never below.
create or replace function public.dt_version_below(p_version text, p_min text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_version is null or p_min is null then false
    when p_version !~ '^[0-9]+(\.[0-9]+)*$' or p_min !~ '^[0-9]+(\.[0-9]+)*$' then false
    else string_to_array(p_version, '.')::int[] < string_to_array(p_min, '.')::int[]
  end
$$;

create or replace function public.dt_require_active_device(p_lock boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_dev text := public.dt_header('x-dt-device');
  v_ver text := public.dt_header('x-dt-app-version');
  v_min text;
  v_active text;
  v_found boolean;
begin
  if v_uid is null or coalesce(auth.role(), '') = 'service_role' then return; end if;
  -- claim_device's own writes (it removes the other devices' push tokens).
  if coalesce(current_setting('dt.in_claim', true), '') = '1' then return; end if;
  select min_app_version into v_min from public.device_policy where id;
  if v_min is not null and v_ver is not null and public.dt_version_below(v_ver, v_min) then
    raise exception using errcode = 'DT003', message = 'update_required', hint = v_min;
  end if;
  if p_lock then
    select active_device into v_active from public.account_devices where user_id = v_uid for share;
  else
    select active_device into v_active from public.account_devices where user_id = v_uid;
  end if;
  v_found := found;
  if v_dev is null then
    if v_found then raise exception using errcode = 'DT002', message = 'device_required'; end if;
    return;
  end if;
  if not v_found or v_active is distinct from v_dev then
    raise exception using errcode = 'DT001', message = 'device_not_active';
  end if;
end;
$$;

-- PostgREST runs this before every request (reads included): the synced tables are checked before
-- the query, so a device that is not the active one never gets an empty answer it could act on.
create or replace function public.dt_pre_request()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_path text := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/+', '');
  v_method text := upper(coalesce(nullif(current_setting('request.method', true), ''), 'GET'));
  v_table text := split_part(split_part(v_path, '?', 1), '/', 1);
begin
  if v_table = any (array['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs']) then
    perform public.dt_require_active_device(v_method not in ('GET', 'HEAD'));
  elsif v_table = 'push_tokens' and v_method in ('POST', 'PATCH', 'PUT') then
    perform public.dt_require_active_device(true);
  end if;
end;
$$;
revoke all on function public.dt_pre_request() from public;
grant execute on function public.dt_pre_request() to anon, authenticated;
alter role authenticator set pgrst.db_pre_request to 'public.dt_pre_request';
notify pgrst, 'reload config';

-- Statement-level: fires for every write statement, even one that touches 0 rows.
create or replace function public.dt_device_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.dt_require_active_device(true);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'push_tokens'] loop
    execute format('drop trigger if exists dt_device_guard on public.%I', t);
    execute format('create trigger dt_device_guard before insert or update or delete on public.%I for each statement execute function public.dt_device_guard()', t);
  end loop;
end;
$$;

-- ── 4. RPCs ─────────────────────────────────────────────────────────────────────────────────
-- p_mode: 'signin' (a sign-in the person made on a phone with no session, DL-102), 'use_here'
-- (screen 4), 'silent' (a phone already signed in when no device is active — DL-103).
-- → { status: 'active', took_over, rebuild_owed, notice, secret } | { status: 'superseded', at }
--   | { status: 'replaced', at } | { status: 'in_use', device }
create or replace function public.claim_device(p_device text, p_platform text, p_name text, p_brand text, p_app_version text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_sess timestamptz;
  v_acc public.account_devices;
  v_me public.user_devices;
  v_prev public.user_devices;
  v_secret text;
  v_notice jsonb;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  if p_device is null or char_length(p_device) not between 8 and 128 then raise exception using errcode = '22023', message = 'bad device'; end if;
  if p_mode is null or p_mode not in ('signin', 'use_here', 'silent') then raise exception using errcode = '22023', message = 'bad mode'; end if;
  perform set_config('dt.in_claim', '1', true);
  select s.created_at into v_sess from auth.sessions s where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid;

  insert into public.account_devices (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_acc from public.account_devices where user_id = v_uid for update;

  insert into public.user_devices (user_id, device_id, platform, name, brand, app_version, last_seen_at)
  values (v_uid, p_device, left(p_platform, 16), left(p_name, 60), left(p_brand, 40), left(p_app_version, 20), v_now)
  on conflict (user_id, device_id) do update set platform = excluded.platform, name = excluded.name, brand = excluded.brand,
    app_version = excluded.app_version, last_seen_at = v_now;
  select * into v_me from public.user_devices where user_id = v_uid and device_id = p_device;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  -- The same device again: no notice (DL-108 / OD-2).
  if v_acc.active_device = p_device then
    update public.account_devices set session_created_at = greatest(coalesce(session_created_at, v_sess), coalesce(v_sess, session_created_at)) where user_id = v_uid;
    update public.user_devices set secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex') where user_id = v_uid and device_id = p_device;
    return jsonb_build_object('status', 'active', 'took_over', false, 'rebuild_owed', v_me.rebuild_owed, 'notice', v_me.notice, 'secret', v_secret, 'server_time', v_now);
  end if;

  -- No device active (never registered, or the last one signed out normally — DL-108): this one,
  -- data kept, no notice. A replaced device's cold start never takes the account back (OD-14).
  if v_acc.active_device is null then
    if p_mode = 'silent' and v_me.replaced_at is not null then
      return jsonb_build_object('status', 'replaced', 'at', v_me.replaced_at, 'server_time', v_now);
    end if;
    update public.account_devices set active_device = p_device, since = v_now, session_created_at = coalesce(v_sess, v_now) where user_id = v_uid;
    update public.user_devices set replaced_at = null, replaced_by = null, rebuild_owed = false, notice = null,
      secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex') where user_id = v_uid and device_id = p_device;
    return jsonb_build_object('status', 'active', 'took_over', false, 'rebuild_owed', false, 'notice', null, 'secret', v_secret, 'server_time', v_now);
  end if;

  select * into v_prev from public.user_devices where user_id = v_uid and device_id = v_acc.active_device;

  -- Another device is active and this phone did not sign in: never silently (DL-103, screen 4).
  if p_mode = 'silent' then
    if v_me.replaced_at is not null then
      return jsonb_build_object('status', 'replaced', 'at', v_me.replaced_at, 'server_time', v_now);
    end if;
    return jsonb_build_object('status', 'in_use', 'device', jsonb_build_object('platform', v_prev.platform, 'name', v_prev.name, 'brand', v_prev.brand), 'server_time', v_now);
  end if;

  -- Last sign-in wins: a delayed claim from an OLDER sign-in than the active one is superseded
  -- (a server-confirmed answer for that phone).
  if p_mode = 'signin' and v_sess is not null and v_acc.session_created_at is not null and v_sess < v_acc.session_created_at then
    update public.user_devices set replaced_at = coalesce(replaced_at, v_now), replaced_by = v_acc.active_device where user_id = v_uid and device_id = p_device;
    return jsonb_build_object('status', 'superseded', 'at', coalesce(v_me.replaced_at, v_now), 'server_time', v_now);
  end if;

  -- The takeover. The old device is replaced (its next contact says so, OD-4); this one owes a
  -- rebuild from the account (DL-104) and its notice names the old device and its last full send.
  v_notice := jsonb_build_object('id', gen_random_uuid()::text, 'platform', v_prev.platform, 'name', v_prev.name, 'brand', v_prev.brand,
    'last_full_send_at', v_prev.last_full_send_at);
  update public.user_devices set replaced_at = v_now, replaced_by = p_device, rebuild_owed = false, notice = null
    where user_id = v_uid and device_id = v_acc.active_device;
  update public.user_devices set replaced_at = null, replaced_by = null, rebuild_owed = true, notice = v_notice,
    secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex') where user_id = v_uid and device_id = p_device;
  update public.account_devices set active_device = p_device, since = v_now, session_created_at = coalesce(v_sess, v_now) where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid and device_id is distinct from p_device;
  return jsonb_build_object('status', 'active', 'took_over', true, 'rebuild_owed', true, 'notice', v_notice, 'secret', v_secret, 'server_time', v_now);
end;
$$;

-- The check before every sync pass, foreground and cold start (OD-4).
create or replace function public.device_status(p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_acc public.account_devices;
  v_me public.user_devices;
  v_act public.user_devices;
  v_min text;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  -- OD-10 / DL-85: the account was deleted (on another phone): its own answer.
  if not exists (select 1 from auth.users where id = v_uid) then
    return jsonb_build_object('status', 'account_gone', 'server_time', v_now);
  end if;
  select min_app_version into v_min from public.device_policy where id;
  select * into v_acc from public.account_devices where user_id = v_uid;
  select * into v_me from public.user_devices where user_id = v_uid and device_id = p_device;
  if v_acc.user_id is not null and v_acc.active_device = p_device then
    update public.user_devices set last_seen_at = v_now where user_id = v_uid and device_id = p_device;
    return jsonb_build_object('status', 'active', 'rebuild_owed', coalesce(v_me.rebuild_owed, false), 'notice', v_me.notice, 'min_version', v_min, 'server_time', v_now);
  end if;
  if v_me.replaced_at is not null then
    return jsonb_build_object('status', 'replaced', 'at', v_me.replaced_at, 'min_version', v_min, 'server_time', v_now);
  end if;
  if v_acc.user_id is null or v_acc.active_device is null then
    return jsonb_build_object('status', 'none', 'min_version', v_min, 'server_time', v_now);
  end if;
  select * into v_act from public.user_devices where user_id = v_uid and device_id = v_acc.active_device;
  return jsonb_build_object('status', 'in_use', 'device', jsonb_build_object('platform', v_act.platform, 'name', v_act.name, 'brand', v_act.brand),
    'min_version', v_min, 'server_time', v_now);
end;
$$;

-- DL-108: a normal sign-out (nothing unsent) releases the account.
create or replace function public.release_device(p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  update public.account_devices set active_device = null, since = now() where user_id = v_uid and active_device = p_device;
  get diagnostics v_n = row_count;
  if v_n > 0 then update public.user_devices set secret_hash = null where user_id = v_uid and device_id = p_device; end if;
  return jsonb_build_object('released', v_n > 0);
end;
$$;

-- A pass left nothing unsent on the active device: the server time of its last complete send.
create or replace function public.device_mark_sent(p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_now timestamptz := now(); v_n int;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  update public.user_devices d set last_full_send_at = v_now
    where d.user_id = v_uid and d.device_id = p_device
      and exists (select 1 from public.account_devices a where a.user_id = v_uid and a.active_device = p_device);
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('status', 'not_active'); end if;
  return jsonb_build_object('status', 'active', 'at', v_now);
end;
$$;

-- The new phone rebuilt its copy / stored its notice.
create or replace function public.device_ack(p_device text, p_what text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not signed in'; end if;
  if p_what = 'rebuild' then
    update public.user_devices d set rebuild_owed = false where d.user_id = v_uid and d.device_id = p_device
      and exists (select 1 from public.account_devices a where a.user_id = v_uid and a.active_device = p_device);
  elsif p_what = 'notice' then
    update public.user_devices d set notice = null where d.user_id = v_uid and d.device_id = p_device
      and exists (select 1 from public.account_devices a where a.user_id = v_uid and a.active_device = p_device);
  else
    raise exception using errcode = '22023', message = 'bad ack';
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end;
$$;

-- OD-16: the Android background run asks by this phone's secret (no session, no refresh).
create or replace function public.device_status_by_secret(p_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me public.user_devices; v_active text;
begin
  if p_secret is null or char_length(p_secret) < 32 then return jsonb_build_object('status', 'unknown'); end if;
  select * into v_me from public.user_devices where secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex') limit 1;
  if v_me.user_id is null then return jsonb_build_object('status', 'unknown'); end if;
  select active_device into v_active from public.account_devices where user_id = v_me.user_id;
  if v_active = v_me.device_id then return jsonb_build_object('status', 'active'); end if;
  if v_me.replaced_at is not null then return jsonb_build_object('status', 'replaced', 'at', v_me.replaced_at); end if;
  return jsonb_build_object('status', 'unknown');
end;
$$;

-- OD-10 / DL-85: after a session ended on its own, does that account still exist? (A random UUID
-- reveals nothing; only the phone that held the account's data knows its id.)
create or replace function public.account_exists(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.users where id = p_user)
$$;

revoke all on function public.dt_header(text), public.dt_version_below(text, text), public.dt_require_active_device(boolean), public.dt_device_guard() from public, anon, authenticated;
revoke all on function public.claim_device(text, text, text, text, text, text), public.device_status(text), public.release_device(text), public.device_mark_sent(text), public.device_ack(text, text), public.device_status_by_secret(text), public.account_exists(uuid) from public;
grant execute on function public.claim_device(text, text, text, text, text, text), public.device_status(text), public.release_device(text), public.device_mark_sent(text), public.device_ack(text, text) to authenticated;
grant execute on function public.device_status_by_secret(text), public.account_exists(uuid) to anon, authenticated;
