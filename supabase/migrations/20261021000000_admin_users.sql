-- Admin panel 3.1 login (docs/specs/admin-panel.md Phase 3 › 3.1, rows AU5 and AU6; signed by the
-- founder 2026-10-21). Mirrors supabase_admin_rpcs.sql (the panel's versioned SQL; a test keeps the
-- admin_mark_test body identical in both files).
--
-- STATUS: APPLIED 2026-10-21 (founder go). Do not re-apply or roll back. Original note: applied as ONE transaction, BEFORE deploying the 3.1
-- code: the new api/adm.js reads admin_users and calls admin_mark_test(p_emails, p_mark, p_actor).
-- Between this apply and the deploy, the live (old) panel cannot mark test accounts (its 2-argument
-- call is refused, nothing is written); reading is unaffected.
--
-- What it does:
--   1. admin_users: the allow-list (user_id, role viewer|admin, added_at). RLS on, no policies,
--      service_role only (select). Rows are added by SQL only.
--   2. admin_audit_log.actor: the admin's user_id on every new row (rows before 3.1 stay null).
--   3. admin_mark_test gains p_actor (required); the 2-argument version is dropped so no write can
--      skip the actor.
-- It changes NO Supabase Auth setting (AU7) and nothing in the auth schema.

begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'admin')),
  added_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;
grant select on table public.admin_users to service_role;

alter table public.admin_audit_log add column if not exists actor uuid;

drop function if exists public.admin_mark_test(text[], boolean);
create or replace function public.admin_mark_test(p_emails text[], p_mark boolean, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  e text;
  b boolean;
  a boolean;
  n int := 0;
begin
  if p_actor is null then raise exception 'actor required'; end if;
  if p_emails is null or array_length(p_emails, 1) is null then raise exception 'no emails'; end if;
  if array_length(p_emails, 1) > 200 then raise exception 'too many emails (max 200)'; end if;
  foreach e in array p_emails loop
    e := lower(trim(e));
    if not exists (select 1 from auth.users u where lower(u.email) = e) then raise exception 'unknown email: %', e; end if;
  end loop;
  foreach e in array p_emails loop
    e := lower(trim(e));
    b := public.admin_is_test(e);
    if p_mark then
      delete from public.admin_test_exceptions where email = e;
      insert into public.admin_test_accounts (email, reason) values (e, 'admin panel ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
        on conflict (email) do nothing;
    else
      delete from public.admin_test_accounts where email = e;
      if public.admin_is_test(e) then
        insert into public.admin_test_exceptions (email, reason) values (e, 'admin panel ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
          on conflict (email) do nothing;
      end if;
    end if;
    a := public.admin_is_test(e);
    insert into public.admin_audit_log (action, email, before, after, actor) values (case when p_mark then 'mark_test' else 'unmark_test' end, e, b, a, p_actor);
    if a is distinct from b then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'changed', n, 'count', array_length(p_emails, 1));
end;
$$;


revoke execute on function public.admin_mark_test(text[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_mark_test(text[], boolean, uuid) to service_role;

commit;

-- Step 2, separate founder go (founder 2026-10-21: the panel account is hello@dosetrace.io, role admin).
-- Run on its own after the migration; it must insert exactly 1 row:
-- insert into public.admin_users (user_id, role) select id, 'admin' from auth.users where lower(email) = 'hello@dosetrace.io';
--
-- Checks after apply (expected results in brackets):
--   select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass;            [true]
--   select count(*) from pg_policies where tablename = 'admin_users';                          [0]
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'admin_users';                                                        [service_role SELECT only, plus the owner]
--   select oid::regprocedure, proacl from pg_proc where proname = 'admin_mark_test';           [one row: (text[],boolean,uuid), service_role only]
--   anon REST read of /rest/v1/admin_users with the anon key                                   [401 or 42501, no rows]
--
-- Rollback (only if the 3.1 deploy is rolled back to the token version):
--   begin;
--   drop function if exists public.admin_mark_test(text[], boolean, uuid);
--   -- re-create the 2-argument admin_mark_test from git (supabase_admin_rpcs.sql at commit 69fe447) and its grants
--   drop table if exists public.admin_users;
--   -- admin_audit_log.actor is kept (nullable); dropping it would erase who acted
--   commit;
