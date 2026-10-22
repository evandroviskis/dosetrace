-- Admin panel 3.2 Premium (docs/specs/admin-panel.md Phase 3 › 3.2, rows PR3, PR7, PR8 and PR14;
-- signed by the founder 2026-10-21). Mirrors supabase_admin_rpcs.sql section "3.2 Premium" (the
-- panel's versioned SQL; __tests__/admPremium.test.js keeps every body identical in both files).
--
-- STATUS: APPLIED 2026-10-22 (founder go). Do not re-apply or roll back. Original note: applied as ONE transaction, BEFORE deploying the 3.2
-- code: api/adm-premium.js calls admin_premium_target, admin_action_begin and admin_action_finish, and
-- the Contas tab needs the account id that admin_accounts_list now returns. Until it is applied the
-- Premium button answers "not configured" and nothing is written; reading the panel is unaffected.
--
-- What it does:
--   1. admin_actions_log: one row per Premium action (actor = the admin's user_id, action, target
--      user_id, end date, reason, plan state before/after, status, http). No e-mail column and no
--      health field: before/after may only hold {premium, source, expires_at} (check constraints).
--      RLS on, no policies; service_role may only SELECT. Rows are written only by the two definer
--      functions below, so the log is append-only (the single pending -> final update included).
--   2. admin_premium_target(p_user_id): the account behind a user id, or null (-> 404, PR3).
--   3. admin_action_begin(...): under an advisory lock, in this order: the same request_id again ->
--      the stored answer (PR7; a pending one -> in_progress; a different payload -> conflict); more
--      than 30 actions by this admin in the last hour, or a Premium action on this account in the
--      last minute -> limited, with the seconds to wait (PR14); otherwise one pending row.
--   4. admin_action_finish(...): pending -> ok | failed | refused, with http, before, after and the
--      answer the panel got (for PR7). A finished row is never changed again.
--   5. admin_accounts_list: the same body plus the account id ('id') in rows and tests, so the Premium
--      dialog can name the account by its Supabase id (the RevenueCat app_user_id).
-- It changes NO Supabase Auth setting and nothing in the auth schema.

begin;

create table if not exists public.admin_actions_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  request_id uuid not null unique,
  actor uuid not null,
  action text not null check (action in ('premium_grant', 'premium_revoke', 'premium_change_end')),
  user_id uuid not null,
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 1 and 200),
  before jsonb check (before is null or (jsonb_typeof(before) = 'object' and (before - array['premium', 'source', 'expires_at']) = '{}'::jsonb)),
  after jsonb check (after is null or (jsonb_typeof(after) = 'object' and (after - array['premium', 'source', 'expires_at']) = '{}'::jsonb)),
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed', 'refused')),
  http int,
  result jsonb check (result is null or position('@' in result::text) = 0)
);
create index if not exists admin_actions_log_actor_at on public.admin_actions_log (actor, at desc);
create index if not exists admin_actions_log_user_at on public.admin_actions_log (user_id, at desc);
alter table public.admin_actions_log enable row level security;
revoke all on table public.admin_actions_log from public, anon, authenticated, service_role;
grant select on table public.admin_actions_log to service_role;
revoke all on sequence public.admin_actions_log_id_seq from public, anon, authenticated, service_role;

create or replace function public.admin_premium_target(p_user_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object('user_id', u.id, 'email', lower(u.email))
    from auth.users u where u.id = p_user_id;
$$;

create or replace function public.admin_action_begin(p_request_id uuid, p_actor uuid, p_action text, p_user_id uuid, p_expires_at timestamptz, p_reason text)
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
begin
  if p_request_id is null or p_actor is null or p_user_id is null then raise exception 'request_id, actor and user_id required'; end if;
  -- One lock per admin and one per account, always taken in the same order (no deadlock).
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> p_action or r.user_id <> p_user_id or r.expires_at is distinct from p_expires_at then
      return jsonb_build_object('state', 'conflict');
    end if;
    if r.status = 'pending' then return jsonb_build_object('state', 'in_progress'); end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  select max(at) into t0 from public.admin_actions_log where user_id = p_user_id and action like 'premium\_%' and at > now() - interval '1 minute';
  if t0 is not null then
    return jsonb_build_object('state', 'limited', 'scope', 'account', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 minute' - now())))::int));
  end if;
  insert into public.admin_actions_log (request_id, actor, action, user_id, expires_at, reason)
    values (p_request_id, p_actor, p_action, p_user_id, p_expires_at, p_reason)
    returning id into new_id;
  return jsonb_build_object('state', 'started', 'id', new_id);
end;
$$;

create or replace function public.admin_action_finish(p_id bigint, p_status text, p_http int, p_before jsonb, p_after jsonb, p_result jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
begin
  if p_status not in ('ok', 'failed', 'refused') then raise exception 'invalid status: %', p_status; end if;
  update public.admin_actions_log
     set status = p_status, http = p_http, before = p_before, after = p_after, result = p_result
   where id = p_id and status = 'pending';
  return found;
end;
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
        'protocols_live', (select count(*) from public.protocols p where p.user_id = u.id and p.deleted_at is null),
        'last_sign_in', case when u.last_sign_in_at is null then null else to_char(u.last_sign_in_at at time zone 'UTC', 'YYYY-MM-DD') end,
        'excepted', exists (select 1 from public.admin_test_exceptions x where x.email = lower(u.email))
      ) order by u.created_at desc)
      from auth.users u where not public.admin_is_test(u.email)), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_premium_target(uuid) from public, anon, authenticated;
revoke execute on function public.admin_action_begin(uuid, uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.admin_action_finish(bigint, text, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_accounts_list() from public, anon, authenticated;
grant execute on function public.admin_premium_target(uuid) to service_role;
grant execute on function public.admin_action_begin(uuid, uuid, text, uuid, timestamptz, text) to service_role;
grant execute on function public.admin_action_finish(bigint, text, int, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.admin_accounts_list() to service_role;

commit;

-- Checks after apply (expected results in brackets):
--   select relrowsecurity from pg_class where oid = 'public.admin_actions_log'::regclass;      [true]
--   select count(*) from pg_policies where tablename = 'admin_actions_log';                    [0]
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'admin_actions_log' and grantee <> 'postgres';                        [service_role SELECT only]
--   select proname, proacl from pg_proc where proname in
--     ('admin_premium_target', 'admin_action_begin', 'admin_action_finish', 'admin_accounts_list'); [service_role only]
--   md5 of each body (pg_get_functiondef) = this file                                          [equal]
--   anon REST read of /rest/v1/admin_actions_log and POST /rest/v1/rpc/admin_action_begin      [401 or 42501]
--   select jsonb_array_length((public.admin_accounts_list())->'rows') > 0
--      and ((public.admin_accounts_list())->'rows'->0) ? 'id';                                  [true]
--
-- Rollback (only if the 3.2 deploy is rolled back; the log is kept — it says who changed what):
--   begin;
--   drop function if exists public.admin_premium_target(uuid);
--   drop function if exists public.admin_action_begin(uuid, uuid, text, uuid, timestamptz, text);
--   drop function if exists public.admin_action_finish(bigint, text, int, jsonb, jsonb, jsonb);
--   -- admin_accounts_list: the body without 'id' from git (supabase_admin_rpcs.sql before 3.2); the extra key is harmless to the old page
--   commit;
