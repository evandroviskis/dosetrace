-- Contas tab summary strip (founder request 2026-10-22): on the "Contas de teste" view the strip shows the test
-- accounts' own numbers (login, platform, onboarding, active protocol), so admin_accounts_list gives each TEST
-- account the same fields a real account already has. Nothing else changes: the rows (real accounts) are byte for
-- byte the 20261022200000 body, and the only health-related key is still has_active_protocol (yes/no, no count, no
-- content). Mirrors supabase_admin_rpcs.sql (__tests__/admStrip.test.js keeps the two bodies identical).
--
-- STATUS: NOT APPLIED. Apply only with the founder's go, as ONE transaction. Safe in either order with the page:
-- the new page says "not measured" on the four test-view blocks until this is applied (it never shows a zero
-- for a field the rows do not carry), and the page now live ignores the extra keys.
-- It changes NO Supabase Auth setting and nothing in the auth schema (it only reads auth.users / auth.sessions,
-- as before).

begin;

create or replace function public.admin_accounts_list()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'test_excluded', (select count(*) from auth.users where public.admin_is_test(email)),
    'by_rule', (select count(*) from auth.users where public.admin_test_kind(email) = 'rule'),
    'tests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', lower(u.email),
        'kind', public.admin_test_kind(u.email),
        'provider', coalesce(u.raw_app_meta_data->>'provider', ''),
        'apple', coalesce(u.raw_app_meta_data->>'provider', '') = 'apple',
        'pu', coalesce((select jsonb_agg(distinct lower(p.platform)) from public.push_tokens p where p.user_id = u.id and p.platform is not null), '[]'::jsonb),
        'ua', coalesce((select jsonb_agg(distinct x.k) from (
                 select case when s.user_agent ~* '(okhttp|android)' then 'android'
                             when s.user_agent ~* '(cfnetwork|darwin)' then 'ios' end as k
                   from auth.sessions s where s.user_id = u.id) x where x.k is not null), '[]'::jsonb),
        'onboarded', coalesce(u.raw_user_meta_data ? 'onboarded_at', false),
        'has_active_protocol', exists (select 1 from public.protocols p where p.user_id = u.id and p.deleted_at is null and p.active is true)
      ) order by u.created_at desc)
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

revoke execute on function public.admin_accounts_list() from public, anon, authenticated;
grant execute on function public.admin_accounts_list() to service_role;

commit;

-- Checks after apply (expected results in brackets):
--   select (public.admin_accounts_list())->'tests'->0 ?& array['provider', 'apple', 'pu', 'ua', 'onboarded', 'has_active_protocol']; [true]
--   select jsonb_array_length((public.admin_accounts_list())->'tests') = (public.admin_accounts_list()->>'test_excluded')::int;      [true]
--   select proacl from pg_proc where proname = 'admin_accounts_list';                                                                [service_role only]
--   anon POST /rest/v1/rpc/admin_accounts_list                                                                                       [401 / 404 not exposed]
--
-- Rollback: re-create admin_accounts_list from 20261022200000_admin_users_tab.sql (the extra keys are harmless to
-- every page version, so a rollback is never required).
