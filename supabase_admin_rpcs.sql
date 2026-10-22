-- DoseTrace admin panel RPCs (Supabase project "dosesync", ref mqfvnqfusqyhqhowfweh).
--
-- Used ONLY by the web admin panel (api/adm.js calls them with the service role).
-- The mobile app never calls admin_* (grep lib/ screens/ components/ App.js: no matches, 2026-09-27).
--
-- admin_activity is the verbatim live body of 2026-09-27 (finding A-8); it is no longer called by
-- the panel (analytics have no user_id since 2026-10-04). admin_metrics and admin_feature_adoption
-- are the v2 bodies of 2026-10-16 (Panel #011 step 3); their 2026-09-27 bodies are in git history.
--
-- Finding A-1 (P0): admin_metrics and admin_activity are SECURITY DEFINER and were
-- granted EXECUTE to anon and authenticated. The anon key ships in the app, so anyone
-- could read every account's country, goal, gender, age and search terms. The
-- lockdown at the end of this file restricts all three to service_role.
--
-- STATUS: LOCKDOWN APPLIED 2026-09-27 23:42 UTC (founder go, Panel #002): only the six
-- REVOKE/GRANT statements at the end of this file were run; the CREATE OR REPLACE bodies
-- were NOT re-run (body md5s unchanged). Re-check with:
--   select proname, proacl from pg_proc where proname like 'admin_%';
-- Expected afterwards: {postgres=X/postgres,service_role=X/postgres} for all three.

CREATE OR REPLACE FUNCTION public.admin_activity()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'u', u)), '[]'::jsonb)
  from (
    select to_char(created_at,'YYYY-MM-DD') as d, dense_rank() over (order by user_id) as u
    from analytics_events
    where created_at > now() - interval '180 days'
  ) x;
$function$
;

-- v2 (Panel #011 step 3, 2026-10-16): events only, never people (analytics are anonymous
-- since 2026-10-04, so per-user counts are impossible); total_users excludes test accounts.
-- The pre-v2 body is in git history.
create or replace function public.admin_feature_adoption()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'total_users', (select count(*) from auth.users where not public.admin_is_test(email)),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('event', e.event, 'events', e.events) order by e.events desc)
      from (select event, count(*) as events from public.analytics_events group by event) e
    ), '[]'::jsonb)
  );
$$;

-- v2 (Panel #011 step 3, 2026-10-16): every number excludes test accounts through ONE
-- set, `real` (admin_is_test). Event-per-account metrics (dau, retention cohorts,
-- searches, protocol-created events, scanned users) are gone: analytics are anonymous
-- since 2026-10-04 (user_id is null on every row). Days are UTC. Protocol counts skip
-- deleted rows. The pre-v2 body (with test accounts and events) is in git history.
create or replace function public.admin_metrics()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  with
  real as (select id, email from auth.users where not public.admin_is_test(email)),
  ts as (select d::date as day from generate_series((now() at time zone 'UTC')::date - 179, (now() at time zone 'UTC')::date, interval '1 day') d),
  sg as (select (u.created_at at time zone 'UTC')::date d, count(*) n from auth.users u join real r on r.id = u.id group by 1),
  dl as (select (l.logged_at at time zone 'UTC')::date d, count(*) n from public.dose_logs l join real r on r.id = l.user_id group by 1),
  pcr as (select (p.created_at at time zone 'UTC')::date d, count(*) n from public.protocols p join real r on r.id = p.user_id where p.deleted_at is null group by 1),
  scn as (select (created_at at time zone 'UTC')::date d, count(*) n from public.analytics_events where event = 'bloodwork_uploaded' group by 1),
  kpi as (select to_char(ts.day, 'YYYY-MM-DD') as date, coalesce(sg.n, 0) as signups, coalesce(dl.n, 0) as doses,
                 coalesce(pcr.n, 0) as protocols_created, coalesce(scn.n, 0) as scans
            from ts left join sg on sg.d = ts.day left join dl on dl.d = ts.day left join pcr on pcr.d = ts.day left join scn on scn.d = ts.day
           order by ts.day),
  udim as (select to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD') as signup_date,
                  coalesce(nullif(u.raw_user_meta_data->>'country', ''), '(unset)') as country,
                  coalesce(nullif(u.raw_user_meta_data->>'primary_goal', ''), '') as goal,
                  coalesce(nullif(u.raw_user_meta_data->>'activity_level', ''), '(unset)') as activity,
                  coalesce(nullif(u.raw_user_meta_data->>'gender', ''), '(unset)') as gender,
                  case when (u.raw_user_meta_data->>'birth_year') ~ '^[0-9]{4}$'
                       then extract(year from now())::int - (u.raw_user_meta_data->>'birth_year')::int else null end as age
             from auth.users u join real r on r.id = u.id),
  funnel as (select (select count(*) from real) signed_up,
                    (select count(*) from auth.users u join real r on r.id = u.id
                      where nullif(u.raw_user_meta_data->>'display_name', '') is not null and nullif(u.raw_user_meta_data->>'country', '') is not null
                        and nullif(u.raw_user_meta_data->>'primary_goal', '') is not null and nullif(u.raw_user_meta_data->>'activity_level', '') is not null) profile_complete,
                    (select count(distinct p.user_id) from public.protocols p join real r on r.id = p.user_id where p.deleted_at is null) created_protocol,
                    (select count(distinct l.user_id) from public.dose_logs l join real r on r.id = l.user_id) logged_dose),
  totals as (select (select count(*) from real) users,
                    (select count(*) from public.protocols p join real r on r.id = p.user_id where p.deleted_at is null) protocols,
                    (select count(*) from public.protocols p join real r on r.id = p.user_id where p.deleted_at is null and p.active) protocols_active,
                    (select count(*) from public.dose_logs l join real r on r.id = l.user_id) dose_logs,
                    (select count(*) from public.biomarkers b join real r on r.id = b.user_id) biomarkers,
                    (select count(*) from public.vaccines v join real r on r.id = v.user_id) vaccines),
  adherence as (select count(*) filter (where l.outcome = 'Taken') taken, count(*) filter (where l.outcome = 'Missed') missed,
                       count(*) filter (where l.outcome = 'Skipped') skipped, count(*) total
                  from public.dose_logs l join real r on r.id = l.user_id),
  top_biomarkers as (select b.marker as k, count(*) n from public.biomarkers b join real r on r.id = b.user_id group by 1 order by 2 desc limit 12)
  select jsonb_build_object(
    'generated_at', now(),
    'test_excluded', (select count(*) from auth.users where public.admin_is_test(email)),
    'kpi_timeseries', (select jsonb_agg(jsonb_build_object('date', date, 'signups', signups, 'doses', doses, 'protocols_created', protocols_created, 'scans', scans)) from kpi),
    'users_dim', coalesce((select jsonb_agg(jsonb_build_object('signup_date', signup_date, 'country', country, 'goal', goal, 'activity', activity, 'gender', gender, 'age', age)) from udim), '[]'::jsonb),
    'funnel', (select row_to_json(funnel) from funnel),
    'totals', (select row_to_json(totals) from totals),
    'adherence', (select row_to_json(adherence) from adherence),
    'top_biomarkers', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n)) from top_biomarkers), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- A-1 lockdown (APPLIED 2026-09-27 23:42 UTC)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_feature_adoption() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_feature_adoption() TO service_role;

-- ===========================================================================
-- Phase 2 — Management view (docs/specs/admin-panel.md "Phase 2 — Management view")
-- STATUS: APPLIED 2026-10-16 ~20:55 UTC (Panel #010; founder go of 28 Sep 18:46 ET).
-- Same ACL pattern as the A-1 lockdown: REVOKE from PUBLIC, anon, authenticated;
-- GRANT to service_role only. Supabase's default privileges grant new objects to
-- anon/authenticated, so the REVOKEs are required, not decorative.
-- ===========================================================================

-- MV-0: ONE test-account list for every panel metric. Adding a test account is a
-- single row:  insert into public.admin_test_accounts (email, reason)
--              values ('someone@example.com', 'founder decision YYYY-MM-DD');
create table if not exists public.admin_test_accounts (
  email text primary key check (email = lower(email)),
  reason text not null,
  added_at timestamptz not null default now()
);
alter table public.admin_test_accounts enable row level security;
revoke all on table public.admin_test_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_test_accounts to service_role;

-- Seed: DEVELOPER_EMAILS (lib/purchases.js, main) + the test account. Guarded by
-- __tests__/admManagement.test.js (every DEVELOPER_EMAILS entry must be here).
insert into public.admin_test_accounts (email, reason) values
  ('jootaerre@gmail.com', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('hello@dosetrace.io', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('appreview@dosetrace.io', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('victor.s.engenharia@gmail.com', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('jootaerre@yahoo.com.br', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('jeovane_m@live.com', 'DEVELOPER_EMAILS (lib/purchases.js)'),
  ('evandro1985@gmail.com', 'test account (spec MV-0)')
on conflict (email) do nothing;

-- Founder decision 2026-10-16 (Panel #011 step 2): store reviewer + Google Play robots.
-- One more account on a company domain was marked test the same day; it is in the live
-- table only (its address stays out of the repo: product guardrail). Applied 2026-10-16.
insert into public.admin_test_accounts (email, reason) values
  ('testreviewer123@gmail.com', 'founder decision 2026-10-16: store reviewer account'),
  ('6swua43q6ycihps7hd4ahf-lvl-02@cloudtestlabaccounts.com', 'founder decision 2026-10-16: Google Play pre-launch robot'),
  ('6swua43q6ycihps7hd4ahf-lvl-01@cloudtestlabaccounts.com', 'founder decision 2026-10-16: Google Play pre-launch robot')
on conflict (email) do nothing;

-- Panel #016 (founder GO 2026-10-17): accounts the founder marked "não é teste". An exception
-- wins over the list and over every rule. Written only by admin_mark_test.
create table if not exists public.admin_test_exceptions (
  email text primary key check (email = lower(email)),
  reason text not null,
  added_at timestamptz not null default now()
);
alter table public.admin_test_exceptions enable row level security;
revoke all on table public.admin_test_exceptions from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_test_exceptions to service_role;

-- Panel #016: every mark/unmark from the panel writes one row per email, in the same
-- transaction as the change (admin_mark_test). Never deleted by the panel.
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  email text not null,
  before boolean,
  after boolean
);
alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;
-- 3.1 (founder 2026-10-21): the admin who acted (auth user_id) on every new row; rows before 3.1 stay null.
alter table public.admin_audit_log add column if not exists actor uuid;

-- 3.1 admin login (docs/specs/admin-panel.md Phase 3 › 3.1, AU5): the accounts allowed into the
-- panel. RLS on with no policies and service_role only, so neither anon nor a signed-in app user
-- can read it. Rows are added by SQL only, with the founder's go (never by the panel).
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'admin')),
  added_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;
grant select on table public.admin_users to service_role;

-- MV-0 v3 (Panel #016): is this email a test account? Order of precedence:
--   1. founder exception ("não é teste")          -> false
--   2. the list admin_test_accounts                -> true
--   3. domain rules @dosetrace.io, @cloudtestlabaccounts.com -> true
--   4. Gmail name.number rule ^[a-z]+\.[0-9]{5,6}@gmail\.com (case-insensitive) -> true
create or replace function public.admin_is_test(p_email text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $$
  select case when exists (select 1 from public.admin_test_exceptions x where x.email = lower(p_email)) then false
              when exists (select 1 from public.admin_test_accounts t where t.email = lower(p_email)) then true
              when coalesce(lower(p_email) like '%@dosetrace.io', false) then true
              when coalesce(lower(p_email) like '%@cloudtestlabaccounts.com', false) then true
              when lower(p_email) ~ '^[a-z]+\.[0-9]{5,6}@gmail\.com$' then true
              else false end;
$$;

-- Why an email is (or is not) test, for badges: 'exception' | 'list' | 'domain' | 'rule' | null.
create or replace function public.admin_test_kind(p_email text)
 returns text
 language sql
 stable
 set search_path to 'public'
as $$
  select case when exists (select 1 from public.admin_test_exceptions x where x.email = lower(p_email)) then 'exception'
              when exists (select 1 from public.admin_test_accounts t where t.email = lower(p_email)) then 'list'
              when coalesce(lower(p_email) like '%@dosetrace.io', false) or coalesce(lower(p_email) like '%@cloudtestlabaccounts.com', false) then 'domain'
              when lower(p_email) ~ '^[a-z]+\.[0-9]{5,6}@gmail\.com$' then 'rule'
              else null end;
$$;

-- The panel's ONLY write (Panel #016). Marks or unmarks up to 200 existing accounts, all or
-- nothing. Mark = insert into the list and drop any exception. Unmark = drop the list row and,
-- when a rule still makes it test, insert an exception so the founder's word wins. One audit
-- row per email in the same transaction, with the admin's user_id as the actor (3.1). Never
-- touches auth.users. The 2-argument version without an actor is dropped by the 3.1 migration.
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

-- One row per account, no ids and no emails: the created UTC day, the test flag, the
-- raw platform signals (the MV-0 rule is applied in api/adm.js platformOf, tested),
-- funnel flags, and the ISO-week offsets with >=1 analytics event (for G2).
-- 'e' uses last_sign_in_at only as "ever signed in" (spec MV-0).
create or replace function public.admin_accounts()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'c', to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD'),
        't', public.admin_is_test(u.email),
        'apple', coalesce(u.raw_app_meta_data->>'provider', '') = 'apple',
        'ev', coalesce((select jsonb_agg(distinct lower(a.properties->>'platform'))
                          from public.analytics_events a
                         where a.user_id = u.id and a.properties ? 'platform'), '[]'::jsonb),
        'pu', coalesce((select jsonb_agg(distinct lower(p.platform))
                          from public.push_tokens p
                         where p.user_id = u.id and p.platform is not null), '[]'::jsonb),
        'ua', coalesce((select jsonb_agg(distinct x.k) from (
                          select case when s.user_agent ~* '(okhttp|android)' then 'android'
                                      when s.user_agent ~* '(cfnetwork|darwin)' then 'ios' end as k
                            from auth.sessions s where s.user_id = u.id) x
                         where x.k is not null), '[]'::jsonb),
        'e', (u.email_confirmed_at is not null or u.last_sign_in_at is not null),
        'o', coalesce(u.raw_user_meta_data ? 'onboarded_at', false),
        'pr', exists (select 1 from public.protocols pr where pr.user_id = u.id and pr.deleted_at is null),
        'd', exists (select 1 from public.dose_logs dl where dl.user_id = u.id),
        'w', coalesce((select jsonb_agg(distinct ((date_trunc('week', e.created_at at time zone 'UTC')::date
                                                  - date_trunc('week', u.created_at at time zone 'UTC')::date) / 7))
                         from public.analytics_events e
                        where e.user_id = u.id
                          and e.created_at >= date_trunc('week', u.created_at at time zone 'UTC') at time zone 'UTC'), '[]'::jsonb)
      ))
      from auth.users u), '[]'::jsonb),
    'protocols_live', (select count(*) from public.protocols p join auth.users u on u.id = p.user_id where p.deleted_at is null and not public.admin_is_test(u.email))
  );
$$;

-- X5/X6: exact full-id join of RevenueCat app_user_ids to auth.users. Returns
-- { "<id>": "real" | "test" | "none" } for the ids passed in. Called server-side only;
-- api/adm.js turns it into counts and never sends ids to the browser.
create or replace function public.admin_match_ids(p_ids text[])
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select coalesce(jsonb_object_agg(i.id,
           case when u.id is null then 'none'
                when public.admin_is_test(u.email) then 'test'
                else 'real' end), '{}'::jsonb)
  from (select distinct unnest(p_ids) as id) i
  left join auth.users u on u.id::text = i.id;
$$;

-- Contas tab (Panel #012/#013, view-only): one row per REAL account for the admin only.
-- Emails are shown to the admin; no analytics fields (anonymous since 2026-10-04).
-- last_sign_in is display only (spec MV-0: never used for churn).
-- 3.2 (2026-10-22): rows and tests carry the account id, so the Premium dialog names the account by its
-- Supabase id (= the RevenueCat app_user_id). Migration 20261022120000_admin_actions_log.sql.
-- 3.3 (US4, founder Q3 2026-10-21): has_active_protocol (yes/no) replaced the protocols_live count
-- (migration 20261022200000_admin_users_tab.sql). The pre-3.3 body is in git history.
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

revoke execute on function public.admin_is_test(text) from public, anon, authenticated;
revoke execute on function public.admin_test_kind(text) from public, anon, authenticated;
revoke execute on function public.admin_mark_test(text[], boolean, uuid) from public, anon, authenticated;
revoke execute on function public.admin_accounts_list() from public, anon, authenticated;
revoke execute on function public.admin_accounts() from public, anon, authenticated;
revoke execute on function public.admin_match_ids(text[]) from public, anon, authenticated;
grant execute on function public.admin_is_test(text) to service_role;
grant execute on function public.admin_test_kind(text) to service_role;
grant execute on function public.admin_mark_test(text[], boolean, uuid) to service_role;
grant execute on function public.admin_accounts_list() to service_role;
grant execute on function public.admin_accounts() to service_role;
grant execute on function public.admin_match_ids(text[]) to service_role;

-- ===========================================================================
-- 3.2 Premium (docs/specs/admin-panel.md Phase 3 › 3.2, PR3/PR7/PR8/PR14; signed 2026-10-21).
-- Same bodies as supabase/migrations/20261022120000_admin_actions_log.sql (a test keeps them equal).
-- NOT APPLIED: the migration is applied only with the founder's go.
-- admin_actions_log: one row per Premium action; no e-mail and no health field; before/after hold the
-- plan state only; written only by admin_action_begin / admin_action_finish (append-only).
-- ===========================================================================
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

revoke execute on function public.admin_premium_target(uuid) from public, anon, authenticated;
revoke execute on function public.admin_action_begin(uuid, uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.admin_action_finish(bigint, text, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.admin_premium_target(uuid) to service_role;
grant execute on function public.admin_action_begin(uuid, uuid, text, uuid, timestamptz, text) to service_role;
grant execute on function public.admin_action_finish(bigint, text, int, jsonb, jsonb, jsonb) to service_role;

-- ===========================================================================
-- A-163 team messages (dosetrace docs/specs/team-messages.md, TM-5/TM-7/TM-9/TM-12/TM-21; signed 2026-10-22).
-- Same statements as supabase/migrations/20261022180000_team_messages.sql (a test keeps the function
-- bodies equal); the app contract (list own, mark read, push payload, language, Silent mode) is at the top
-- of that migration. NOT APPLIED: the migration is applied only with the founder’s go.
-- team_messages: one row per message to ONE account; the app reads its own (RLS) and marks read through
-- team_message_mark_read; only the panel server writes, through the admin_message_* definer functions.
-- admin_actions_log (3.2, above) is extended: message rows share the 30-per-hour counter with Premium.
-- ===========================================================================
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200 and body = btrim(body)),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  withdrawn_at timestamptz,
  constraint team_messages_read_or_withdrawn check (read_at is null or withdrawn_at is null)
);
create index if not exists team_messages_user_created on public.team_messages (user_id, created_at desc);
alter table public.team_messages enable row level security;
revoke all on table public.team_messages from public, anon, authenticated, service_role;
grant select on table public.team_messages to authenticated, service_role;
drop policy if exists "team_messages select own" on public.team_messages;
create policy "team_messages select own" on public.team_messages for select to authenticated using (auth.uid() = user_id and withdrawn_at is null);

-- admin_actions_log: the 3.2 table, extended for messages. The two check constraints on action and reason
-- are found by their column (not by name), so the apply cannot leave the old Premium-only rule in place.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
     where con.conrelid = 'public.admin_actions_log'::regclass and con.contype = 'c' and a.attname in ('action', 'reason')
  loop
    execute format('alter table public.admin_actions_log drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.admin_actions_log alter column reason drop not null;
alter table public.admin_actions_log add constraint admin_actions_log_action_check
  check (action in ('premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw'));
alter table public.admin_actions_log add constraint admin_actions_log_reason_check
  check ((action like 'premium\_%' and reason is not null and char_length(reason) between 1 and 200) or (action like 'message\_%' and reason is null));
alter table public.admin_actions_log add column if not exists message_id uuid references public.team_messages (id) on delete set null;
alter table public.admin_actions_log add column if not exists devices int check (devices >= 0);
alter table public.admin_actions_log add column if not exists accepted int check (accepted >= 0);
alter table public.admin_actions_log add column if not exists failed int check (failed >= 0);
create index if not exists admin_actions_log_message on public.admin_actions_log (message_id);

create or replace function public.team_message_mark_read(p_id uuid, p_at timestamptz default null)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  r timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.team_messages
     set read_at = least(now(), greatest(created_at, coalesce(p_at, now())))
   where id = p_id and user_id = auth.uid() and withdrawn_at is null and read_at is null
   returning read_at into r;
  if r is null then
    select m.read_at into r from public.team_messages m where m.id = p_id and m.user_id = auth.uid() and m.withdrawn_at is null;
  end if;
  return r;
end;
$$;

-- TM-25 (founder 2026-10-22): each history row also says whether the message was translated; A-163 review fix
-- (Gate B 2026-10-22): only tokens whose newest push_tokens row belongs to the recipient (a shared phone).
-- (migration 20261022200000_admin_users_tab.sql). The A-163 body is in git history.
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

-- TM-25 (founder 2026-10-22): p_translated (default false) is stored in the log row; the 4-argument
-- A-163 version is dropped by migration 20261022200000_admin_users_tab.sql.
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

create or replace function public.admin_message_finish(p_id bigint, p_devices int, p_accepted int, p_failed int, p_http int, p_result jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
begin
  if p_devices is null or p_accepted is null or p_failed is null or p_devices < 0 or p_accepted < 0 or p_failed < 0 or p_accepted + p_failed <> p_devices then
    raise exception 'invalid counts';
  end if;
  update public.admin_actions_log
     set status = 'ok', devices = p_devices, accepted = p_accepted, failed = p_failed, http = p_http, result = p_result
   where id = p_id and status = 'pending' and action = 'message_send';
  return found;
end;
$$;

create or replace function public.admin_message_withdraw(p_request_id uuid, p_actor uuid, p_user_id uuid, p_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  r public.admin_actions_log;
  n int;
  t0 timestamptz;
  m public.team_messages;
  st text := 'ok';
  code int := 200;
  res jsonb;
begin
  if p_request_id is null or p_actor is null or p_user_id is null or p_message_id is null then raise exception 'request_id, actor, user_id and message_id required'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> 'message_withdraw' or r.user_id <> p_user_id or r.message_id is distinct from p_message_id then
      return jsonb_build_object('state', 'conflict');
    end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  update public.team_messages set withdrawn_at = now()
   where id = p_message_id and user_id = p_user_id
     and withdrawn_at is null and read_at is null
   returning * into m;
  if found then
    res := jsonb_build_object('status', 200, 'body', jsonb_build_object('ok', true, 'action', 'withdraw', 'request_id', p_request_id, 'message_id', m.id, 'withdrawn_at', m.withdrawn_at));
  else
    select * into m from public.team_messages where id = p_message_id and user_id = p_user_id;
    st := 'refused'; code := 409;
    res := jsonb_build_object('status', 409, 'body', jsonb_build_object('ok', false, 'action', 'withdraw', 'request_id', p_request_id,
             'code', case when m.id is null then 'message_not_found' when m.withdrawn_at is not null then 'already_withdrawn' else 'already_read' end));
  end if;
  insert into public.admin_actions_log (request_id, actor, action, user_id, message_id, status, http, result)
    values (p_request_id, p_actor, 'message_withdraw', p_user_id, m.id, st, code, res);
  return jsonb_build_object('state', 'done', 'http', code, 'result', res);
end;
$$;

revoke execute on function public.team_message_mark_read(uuid, timestamptz) from public, anon;
grant execute on function public.team_message_mark_read(uuid, timestamptz) to authenticated;
revoke execute on function public.admin_message_info(uuid) from public, anon, authenticated;
revoke execute on function public.admin_message_begin(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_message_finish(bigint, int, int, int, int, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_message_withdraw(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_message_info(uuid) to service_role;
grant execute on function public.admin_message_begin(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.admin_message_finish(bigint, int, int, int, int, jsonb) to service_role;
grant execute on function public.admin_message_withdraw(uuid, uuid, uuid, uuid) to service_role;

-- ===========================================================================
-- 3.3 Users tab (docs/specs/admin-panel.md Phase 3 › 3.3, US2/US4/US5/US8) and A-163 TM-25 (automatic
-- translation of a team message). Migration 20261022200000_admin_users_tab.sql — STATUS: NOT APPLIED.
-- admin_actions_log gains resend_confirmation and translated; admin_translate_usage counts AI translations
-- (60 per hour per admin, who and when only); admin_account_card is the account card (the only health key is
-- has_active_protocol); admin_resend_begin gates "Resend confirmation e-mail" (no force sign-out, no delete).
-- The redefined admin_accounts_list, admin_message_info and admin_message_begin bodies are above, in place.
-- ===========================================================================
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
revoke execute on function public.admin_account_card(uuid) from public, anon, authenticated;
revoke execute on function public.admin_resend_begin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_translate_take(uuid) to service_role;
grant execute on function public.admin_account_card(uuid) to service_role;
grant execute on function public.admin_resend_begin(uuid, uuid, uuid) to service_role;
