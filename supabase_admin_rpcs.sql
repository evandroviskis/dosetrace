-- DoseTrace admin panel RPCs (Supabase project "dosesync", ref mqfvnqfusqyhqhowfweh).
--
-- Used ONLY by the web admin panel (api/adm.js calls them with the service role).
-- The mobile app never calls admin_* (grep lib/ screens/ components/ App.js: no matches, 2026-09-27).
--
-- The three function bodies below are copied verbatim from the live database
-- (pg_get_functiondef, read-only, 2026-09-27) so they are versioned in git (finding A-8).
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

CREATE OR REPLACE FUNCTION public.admin_feature_adoption()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'active_users_30d', (select count(distinct user_id) from public.analytics_events
                          where created_at > now() - interval '30 days'),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('event', e.event, 'events', e.events, 'users', e.users)
                       order by e.users desc, e.events desc)
      from (
        select event, count(*) as events, count(distinct user_id) as users
        from public.analytics_events
        group by event
      ) e
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.admin_metrics()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with
  ts as (select d::date as day from generate_series((now()-interval '179 days')::date, now()::date, interval '1 day') d),
  sg as (select created_at::date d, count(*) n from profiles group by 1),
  ac as (select created_at::date d, count(distinct user_id) n from analytics_events group by 1),
  dl as (select logged_at::date d, count(*) n from dose_logs group by 1),
  pcr as (select created_at::date d, count(*) n from protocols group by 1),
  scn as (select created_at::date d, count(*) n from analytics_events where event='bloodwork_uploaded' group by 1),
  kpi as (select to_char(ts.day,'YYYY-MM-DD') as date, coalesce(sg.n,0) as signups, coalesce(ac.n,0) as dau, coalesce(dl.n,0) as doses, coalesce(pcr.n,0) as protocols_created, coalesce(scn.n,0) as scans
    from ts left join sg on sg.d=ts.day left join ac on ac.d=ts.day left join dl on dl.d=ts.day left join pcr on pcr.d=ts.day left join scn on scn.d=ts.day order by ts.day),
  udim as (select to_char(created_at,'YYYY-MM-DD') as signup_date,
      coalesce(nullif(raw_user_meta_data->>'country',''),'(unset)') as country,
      coalesce(nullif(raw_user_meta_data->>'primary_goal',''),'') as goal,
      coalesce(nullif(raw_user_meta_data->>'activity_level',''),'(unset)') as activity,
      coalesce(nullif(raw_user_meta_data->>'gender',''),'(unset)') as gender,
      case when (raw_user_meta_data->>'birth_year') ~ '^[0-9]{4}$' then extract(year from now())::int - (raw_user_meta_data->>'birth_year')::int else null end as age
    from auth.users),
  searches as (select to_char(created_at,'YYYY-MM-DD') as date, coalesce(nullif(properties->>'query',''),'(unknown)') as query from analytics_events where event='compound_search'),
  protos as (select to_char(created_at,'YYYY-MM-DD') as date, coalesce(nullif(properties->>'compound',''),'(unknown)') as compound, coalesce(nullif(properties->>'type',''),'') as ptype from analytics_events where event='protocol_created'),
  cohort_users as (select id, date_trunc('week', created_at)::date cw from auth.users where created_at >= date_trunc('week', now()) - interval '7 weeks'),
  cohort_size as (select cw, count(*) size from cohort_users group by cw),
  uaw as (select distinct cu.id, cu.cw, ((date_trunc('week', e.created_at)::date - cu.cw)/7) as wk from cohort_users cu join analytics_events e on e.user_id=cu.id where e.created_at >= cu.cw),
  rcells as (select cw, wk, count(distinct id) active from uaw where wk between 0 and 7 group by cw, wk),
  funnel as (select (select count(*) from auth.users) signed_up,
    (select count(*) from auth.users where nullif(raw_user_meta_data->>'display_name','') is not null and nullif(raw_user_meta_data->>'country','') is not null and nullif(raw_user_meta_data->>'primary_goal','') is not null and nullif(raw_user_meta_data->>'activity_level','') is not null) profile_complete,
    (select count(distinct user_id) from protocols) created_protocol,
    (select count(distinct user_id) from dose_logs) logged_dose,
    (select count(distinct user_id) from analytics_events where event='bloodwork_uploaded') scanned),
  plans as (select coalesce(nullif(plan,''),'(none)') as plan, count(*) as n from profiles group by 1 order by 2 desc),
  totals as (select (select count(*) from auth.users) users, (select count(*) from protocols) protocols, (select count(*) from protocols where active) protocols_active, (select count(*) from dose_logs) dose_logs, (select count(*) from biomarkers) biomarkers, (select count(*) from vaccines) vaccines, (select count(*) from referral_codes) referral_codes, (select count(*) from referrals) referrals),
  adherence as (select count(*) filter (where outcome='Taken') taken, count(*) filter (where outcome='Missed') missed, count(*) filter (where outcome='Skipped') skipped, count(*) total from dose_logs),
  top_biomarkers as (select marker as k, count(*) n from biomarkers group by 1 order by 2 desc limit 12)
  select jsonb_build_object(
    'generated_at', now(),
    'kpi_timeseries', (select jsonb_agg(jsonb_build_object('date',date,'signups',signups,'dau',dau,'doses',doses,'protocols_created',protocols_created,'scans',scans)) from kpi),
    'users_dim', (select jsonb_agg(jsonb_build_object('signup_date',signup_date,'country',country,'goal',goal,'activity',activity,'gender',gender,'age',age)) from udim),
    'searches', (select jsonb_agg(jsonb_build_object('date',date,'query',query)) from searches),
    'protocols_created_events', (select jsonb_agg(jsonb_build_object('date',date,'compound',compound,'type',ptype)) from protos),
    'retention', jsonb_build_object('cohorts', (select jsonb_agg(jsonb_build_object('cohort',to_char(cs.cw,'YYYY-MM-DD'),'size',cs.size,'cells',(select coalesce(jsonb_object_agg(rc.wk::text, rc.active),'{}'::jsonb) from rcells rc where rc.cw=cs.cw)) order by cs.cw) from cohort_size cs)),
    'funnel', (select row_to_json(funnel) from funnel),
    'plans', (select jsonb_agg(jsonb_build_object('plan',plan,'n',n)) from plans),
    'totals', (select row_to_json(totals) from totals),
    'adherence', (select row_to_json(adherence) from adherence),
    'top_biomarkers', (select jsonb_agg(jsonb_build_object('k',k,'n',n)) from top_biomarkers)
  );
$function$
;

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

-- MV-0: is this email a test account? The table, plus the @dosetrace.io domain rule.
create or replace function public.admin_is_test(p_email text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $$
  select coalesce(lower(p_email) like '%@dosetrace.io', false)
      or exists (select 1 from public.admin_test_accounts t where t.email = lower(p_email));
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
        'pr', exists (select 1 from public.protocols pr where pr.user_id = u.id),
        'd', exists (select 1 from public.dose_logs dl where dl.user_id = u.id),
        'w', coalesce((select jsonb_agg(distinct ((date_trunc('week', e.created_at at time zone 'UTC')::date
                                                  - date_trunc('week', u.created_at at time zone 'UTC')::date) / 7))
                         from public.analytics_events e
                        where e.user_id = u.id
                          and e.created_at >= date_trunc('week', u.created_at at time zone 'UTC') at time zone 'UTC'), '[]'::jsonb)
      ))
      from auth.users u), '[]'::jsonb),
    'protocols_live', (select count(*) from public.protocols where deleted_at is null)
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

revoke execute on function public.admin_is_test(text) from public, anon, authenticated;
revoke execute on function public.admin_accounts() from public, anon, authenticated;
revoke execute on function public.admin_match_ids(text[]) from public, anon, authenticated;
grant execute on function public.admin_is_test(text) to service_role;
grant execute on function public.admin_accounts() to service_role;
grant execute on function public.admin_match_ids(text[]) to service_role;
