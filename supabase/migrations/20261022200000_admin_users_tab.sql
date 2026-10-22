-- Admin panel 3.3 Users tab (docs/specs/admin-panel.md Phase 3 › 3.3, rows US2, US4, US5 and US8; signed by
-- the founder 2026-10-21; the single "Opções" menu per selected account, founder 2026-10-22) and A-163 TM-25
-- (automatic translation of a team message, founder 2026-10-22). Mirrors supabase_admin_rpcs.sql sections
-- "3.3 Users tab" and "TM-25"; __tests__/admAccounts.test.js and __tests__/admTranslate.test.js keep every
-- body identical in both files.
--
-- STATUS: NOT APPLIED. Apply only with the founder's go, as ONE transaction, BEFORE deploying the 3.3 / TM-25
-- code: api/adm-account.js calls admin_account_card and admin_resend_begin, and api/adm-messages.js calls
-- admin_translate_take and admin_message_begin with p_translated. Until it is applied the account card and
-- the resend answer "not configured", translation says "not set up" (the founder can still send the
-- original), and a send from the NEW page fails closed ("not configured") because admin_message_begin has no
-- p_translated yet. The page now live keeps working after the apply: admin_message_begin keeps its first four
-- parameters and p_translated defaults to false; admin_accounts_list's rows lose protocols_live (the live
-- page then shows "—" in that one column until the deploy).
--
-- What it does:
--   1. admin_actions_log: actions gain resend_confirmation (reason null, like messages); the two check
--      constraints on action and reason are found by their column (not by name) and replaced. New column
--      translated (boolean, message_send rows only, TM-25). Still no e-mail column, no health field.
--   2. admin_translate_usage + admin_translate_take(actor): at most 60 AI translations per hour per admin.
--      A table, not memory: Vercel runs several short-lived instances that share no memory. The table keeps
--      who and when only (no text, no account, no language). RLS on, no policies, no grants.
--   3. admin_message_begin: the A-163 body plus p_translated (default false), stored in the log row. The old
--      4-argument version is dropped so PostgREST has one candidate for both the live and the new code.
--   4. admin_message_info: the A-163 body plus translated in each history row (the dialog marks it), and the
--      A-163 review fix (Gate B 2026-10-22): push_tokens is keyed on (user_id, expo_token), so one phone can sit
--      under two accounts; only a token whose NEWEST row (by updated_at) belongs to the recipient is used, so a
--      message to account A never reaches a phone now signed in as account B. Function only, no table change.
--   5. admin_accounts_list: has_active_protocol (yes/no) instead of the protocols_live count (US4, Q3).
--   6. admin_account_card(user): the card fields of handoff 3.2 (US2). The only health-related key is
--      has_active_protocol = exists(a protocol not deleted and active); no count, no content (US4). "Last
--      seen" / "App version" are read only when A-119's user_devices or app_releases' push_tokens.app_version
--      exist; otherwise *_measured = false and the panel says "not measured" with the reason.
--   7. admin_resend_begin(...): replay; refuses an unknown, confirmed or non e-mail (OAuth) account before
--      any row; then 30 rows per hour per admin (the one shared counter) and 1 resend per account per hour
--      (ok or pending; a failed one does not count); then one pending row. The row is finished by the 3.2
--      admin_action_finish. The e-mail itself is sent by Supabase Auth (/auth/v1/resend, type signup) from
--      api/adm-account.js — this file sends nothing.
-- It changes NO Supabase Auth setting and nothing in the auth schema. No force sign-out, no delete.

begin;

do $$
declare c record;
begin
  for c in
    select distinct con.conname from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
     where con.conrelid = 'public.admin_actions_log'::regclass and con.contype = 'c' and a.attname in ('action', 'reason')
  loop
    execute format('alter table public.admin_actions_log drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.admin_actions_log add constraint admin_actions_log_action_check
  check (action in ('premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw', 'resend_confirmation'));
alter table public.admin_actions_log add constraint admin_actions_log_reason_check
  check ((action like 'premium\_%' and reason is not null and char_length(reason) between 1 and 200) or ((action like 'message\_%' or action = 'resend_confirmation') and reason is null));
alter table public.admin_actions_log add column if not exists translated boolean check (translated is null or action = 'message_send');

create table if not exists public.admin_translate_usage (
  id bigserial primary key,
  actor uuid not null,
  at timestamptz not null default now()
);
create index if not exists admin_translate_usage_actor_at on public.admin_translate_usage (actor, at desc);
alter table public.admin_translate_usage enable row level security;
revoke all on table public.admin_translate_usage from public, anon, authenticated, service_role;
revoke all on sequence public.admin_translate_usage_id_seq from public, anon, authenticated, service_role;

create or replace function public.admin_translate_take(p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  n int;
  t0 timestamptz;
begin
  if p_actor is null then raise exception 'actor required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_translate:' || p_actor::text, 0));
  delete from public.admin_translate_usage where actor = p_actor and at < now() - interval '1 day';
  select count(*), min(at) into n, t0 from public.admin_translate_usage where actor = p_actor and at > now() - interval '1 hour';
  if n >= 60 then
    return jsonb_build_object('state', 'limited', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  insert into public.admin_translate_usage (actor) values (p_actor);
  return jsonb_build_object('state', 'ok', 'used', n + 1);
end;
$$;

drop function if exists public.admin_message_begin(uuid, uuid, uuid, text);
create or replace function public.admin_message_begin(p_request_id uuid, p_actor uuid, p_user_id uuid, p_body text, p_translated boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  r public.admin_actions_log;
  n int;
  t0 timestamptz;
  new_id bigint;
  m public.team_messages;
begin
  if p_request_id is null or p_actor is null or p_user_id is null then raise exception 'request_id, actor and user_id required'; end if;
  if p_body is null or char_length(p_body) not between 1 and 200 or p_body <> btrim(p_body) then raise exception 'invalid body'; end if;
  -- The same two locks as admin_action_begin (one per admin, one per account, same order): one counter.
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> 'message_send' or r.user_id <> p_user_id
       or not exists (select 1 from public.team_messages x where x.id = r.message_id and x.body = p_body) then
      return jsonb_build_object('state', 'conflict');
    end if;
    if r.status = 'pending' then return jsonb_build_object('state', 'in_progress'); end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  select max(at) into t0 from public.admin_actions_log where user_id = p_user_id and action = 'message_send' and at > now() - interval '1 minute';
  if t0 is not null then
    return jsonb_build_object('state', 'limited', 'scope', 'account', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 minute' - now())))::int));
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then return jsonb_build_object('state', 'not_found'); end if;
  insert into public.team_messages (user_id, body) values (p_user_id, p_body) returning * into m;
  insert into public.admin_actions_log (request_id, actor, action, user_id, message_id, translated)
    values (p_request_id, p_actor, 'message_send', p_user_id, m.id, coalesce(p_translated, false))
    returning id into new_id;
  return jsonb_build_object('state', 'started', 'id', new_id, 'message_id', m.id, 'created_at', m.created_at);
end;
$$;

create or replace function public.admin_message_info(p_user_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'email', lower(u.email),
    'language', case when lower(left(u.raw_user_meta_data->>'language', 2)) in ('en', 'es', 'pt', 'fr', 'de', 'it')
                     then lower(left(u.raw_user_meta_data->>'language', 2)) end,
    'silent', coalesce(u.raw_user_meta_data->>'silent_mode', '') = 'true',
    'tokens', coalesce((select jsonb_agg(jsonb_build_object('token', p.expo_token, 'platform', lower(coalesce(p.platform, ''))) order by p.updated_at desc)
                          from public.push_tokens p where p.user_id = u.id
                           and not exists (select 1 from public.push_tokens q where q.expo_token = p.expo_token and q.user_id <> u.id and q.updated_at > p.updated_at)), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
                  select m.id, m.body, m.created_at, m.read_at, m.withdrawn_at, l.devices, l.accepted, l.failed,
                         coalesce(l.result->'body'->>'silent', '') = 'true' as silent, coalesce(l.translated, false) as translated
                    from public.team_messages m
                    left join public.admin_actions_log l on l.message_id = m.id and l.action = 'message_send'
                   where m.user_id = u.id
                   order by m.created_at desc limit 50) h), '[]'::jsonb)
  )
    from auth.users u where u.id = p_user_id;
$$;

create or replace function public.admin_accounts_list()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'test_excluded', (select count(*) from auth.users where public.admin_is_test(email)),
    'by_rule', (select count(*) from auth.users where public.admin_test_kind(email) = 'rule'),
    'tests', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', lower(u.email), 'kind', public.admin_test_kind(u.email)) order by u.created_at desc)
                         from auth.users u where public.admin_is_test(u.email)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'created', to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD'),
        'provider', coalesce(u.raw_app_meta_data->>'provider', ''),
        'apple', coalesce(u.raw_app_meta_data->>'provider', '') = 'apple',
        'pu', coalesce((select jsonb_agg(distinct lower(p.platform)) from public.push_tokens p where p.user_id = u.id and p.platform is not null), '[]'::jsonb),
        'ua', coalesce((select jsonb_agg(distinct x.k) from (
                 select case when s.user_agent ~* '(okhttp|android)' then 'android'
                             when s.user_agent ~* '(cfnetwork|darwin)' then 'ios' end as k
                   from auth.sessions s where s.user_id = u.id) x where x.k is not null), '[]'::jsonb),
        'onboarded', coalesce(u.raw_user_meta_data ? 'onboarded_at', false),
        'confirmed', u.email_confirmed_at is not null,
        'has_active_protocol', exists (select 1 from public.protocols p where p.user_id = u.id and p.deleted_at is null and p.active is true),
        'last_sign_in', case when u.last_sign_in_at is null then null else to_char(u.last_sign_in_at at time zone 'UTC', 'YYYY-MM-DD') end,
        'excepted', exists (select 1 from public.admin_test_exceptions x where x.email = lower(u.email))
      ) order by u.created_at desc)
      from auth.users u where not public.admin_is_test(u.email)), '[]'::jsonb)
  );
$$;

create or replace function public.admin_account_card(p_user_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  u auth.users;
  v_seen timestamptz;
  v_seen_ok boolean := false;
  v_ver text;
  v_ver_ok boolean := false;
begin
  select * into u from auth.users where id = p_user_id;
  if not found then return null; end if;
  -- Read only what exists: A-119's user_devices (last seen + version), else app_releases' push_tokens.app_version.
  if to_regclass('public.user_devices') is not null then
    execute 'select max(last_seen_at), (array_agg(app_version order by last_seen_at desc nulls last))[1] from public.user_devices where user_id = $1'
      into v_seen, v_ver using p_user_id;
    v_seen_ok := true;
    v_ver_ok := true;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_tokens' and column_name = 'app_version') then
    execute 'select (array_agg(app_version order by updated_at desc nulls last))[1] from public.push_tokens where user_id = $1 and app_version is not null'
      into v_ver using p_user_id;
    v_ver_ok := true;
  end if;
  return jsonb_build_object(
    'user_id', u.id,
    'email', lower(u.email),
    'created_at', u.created_at,
    'provider', coalesce(u.raw_app_meta_data->>'provider', ''),
    'email_confirmed_at', u.email_confirmed_at,
    'last_sign_in_at', u.last_sign_in_at,
    'apple', coalesce(u.raw_app_meta_data->>'provider', '') = 'apple',
    'pu', coalesce((select jsonb_agg(distinct lower(p.platform)) from public.push_tokens p where p.user_id = u.id and p.platform is not null), '[]'::jsonb),
    'ua', coalesce((select jsonb_agg(distinct x.k) from (
             select case when s.user_agent ~* '(okhttp|android)' then 'android'
                         when s.user_agent ~* '(cfnetwork|darwin)' then 'ios' end as k
               from auth.sessions s where s.user_id = u.id) x where x.k is not null), '[]'::jsonb),
    'onboarded', coalesce(u.raw_user_meta_data ? 'onboarded_at', false),
    'test_kind', public.admin_test_kind(u.email),
    'has_active_protocol', exists (select 1 from public.protocols p where p.user_id = u.id and p.deleted_at is null and p.active is true),
    'last_seen_at', v_seen,
    'last_seen_measured', v_seen_ok,
    'app_version', v_ver,
    'app_version_measured', v_ver_ok,
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc) from (
                  select l.at, l.action, l.status from public.admin_actions_log l where l.user_id = u.id
                  union all
                  select a.at, a.action, 'ok' from public.admin_audit_log a where a.email = lower(u.email)
                  order by 1 desc limit 20) h), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_resend_begin(p_request_id uuid, p_actor uuid, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  r public.admin_actions_log;
  n int;
  t0 timestamptz;
  new_id bigint;
  u auth.users;
begin
  if p_request_id is null or p_actor is null or p_user_id is null then raise exception 'request_id, actor and user_id required'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> 'resend_confirmation' or r.user_id <> p_user_id then
      return jsonb_build_object('state', 'conflict');
    end if;
    if r.status = 'pending' then return jsonb_build_object('state', 'in_progress'); end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select * into u from auth.users where id = p_user_id;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if u.email_confirmed_at is not null then return jsonb_build_object('state', 'refused', 'code', 'already_confirmed'); end if;
  if coalesce(u.raw_app_meta_data->>'provider', '') <> 'email' then return jsonb_build_object('state', 'refused', 'code', 'not_email_signup'); end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  select max(at) into t0 from public.admin_actions_log
   where user_id = p_user_id and action = 'resend_confirmation' and status in ('ok', 'pending') and at > now() - interval '1 hour';
  if t0 is not null then
    return jsonb_build_object('state', 'limited', 'scope', 'account', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  insert into public.admin_actions_log (request_id, actor, action, user_id)
    values (p_request_id, p_actor, 'resend_confirmation', p_user_id)
    returning id into new_id;
  return jsonb_build_object('state', 'started', 'id', new_id);
end;
$$;

revoke execute on function public.admin_translate_take(uuid) from public, anon, authenticated;
revoke execute on function public.admin_message_begin(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_message_info(uuid) from public, anon, authenticated;
revoke execute on function public.admin_accounts_list() from public, anon, authenticated;
revoke execute on function public.admin_account_card(uuid) from public, anon, authenticated;
revoke execute on function public.admin_resend_begin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_translate_take(uuid) to service_role;
grant execute on function public.admin_message_begin(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.admin_message_info(uuid) to service_role;
grant execute on function public.admin_accounts_list() to service_role;
grant execute on function public.admin_account_card(uuid) to service_role;
grant execute on function public.admin_resend_begin(uuid, uuid, uuid) to service_role;

commit;

-- Checks after apply (expected results in brackets):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.admin_actions_log'::regclass and contype = 'c';                       [action_check with resend_confirmation; reason_check premium / message+resend; translated check]
--   select count(*) from public.admin_actions_log where action like 'premium\_%' and reason is null;  [0 — existing rows still valid]
--   select relrowsecurity from pg_class where oid = 'public.admin_translate_usage'::regclass;        [true]
--   select grantee from information_schema.role_table_grants where table_name = 'admin_translate_usage' and grantee <> 'postgres'; [none]
--   select proname, pg_get_function_identity_arguments(oid), proacl from pg_proc where proname in
--     ('admin_translate_take', 'admin_message_begin', 'admin_message_info', 'admin_accounts_list', 'admin_account_card', 'admin_resend_begin');
--                                                                                                    [one admin_message_begin (5 args); service_role only]
--   md5 of each body (pg_get_functiondef) = this file                                                [equal]
--   select (public.admin_accounts_list())->'rows'->0 ? 'has_active_protocol',
--          not ((public.admin_accounts_list())->'rows'->0 ? 'protocols_live');                       [true, true]
--   select jsonb_object_keys(public.admin_account_card('<the test account id>'));                    [the 17 keys of the static test]
--   anon POST /rest/v1/rpc/admin_account_card, admin_resend_begin, admin_translate_take               [401 / 404 not exposed]
--
-- Rollback (only if the 3.3 / TM-25 deploy is rolled back; the log rows stay — they say who did what):
--   begin;
--   drop function if exists public.admin_account_card(uuid);
--   drop function if exists public.admin_resend_begin(uuid, uuid, uuid);
--   drop function if exists public.admin_translate_take(uuid);
--   drop function if exists public.admin_message_begin(uuid, uuid, uuid, text, boolean);
--   -- then re-create admin_message_begin(uuid, uuid, uuid, text), admin_message_info and admin_accounts_list from
--   -- 20261022180000_team_messages.sql / 20261022120000_admin_actions_log.sql. The translated column, the
--   -- counter table and the wider check constraints are harmless to the older code and may stay.
--   commit;
