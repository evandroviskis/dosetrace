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
create or replace function public.admin_accounts_list()
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'test_excluded', (select count(*) from auth.users where public.admin_is_test(email)),
    'by_rule', (select count(*) from auth.users where public.admin_test_kind(email) = 'rule'),
    'tests', coalesce((select jsonb_agg(jsonb_build_object('email', lower(u.email), 'kind', public.admin_test_kind(u.email)) order by u.created_at desc)
                         from auth.users u where public.admin_is_test(u.email)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
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
