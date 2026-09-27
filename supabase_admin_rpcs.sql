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
-- STATUS: NOT APPLIED. Apply only on the founder's explicit go, then re-check with:
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
-- A-1 lockdown (NOT APPLIED — founder go required)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_feature_adoption() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_feature_adoption() TO service_role;
