-- Founder 2026-11-01 ("6- ok"): a dose marked "Não houve dose" (app 1.3.1, dose_logs.outcome 'NoDose') is not a
-- missed dose; the panel's adherence total leaves it out and reports it on its own (no_dose). Function body only,
-- same grants; identical to supabase_admin_rpcs.sql (__tests__/admAdherenceNoDose.test.js).
-- STATUS: APPLIED in production 2026-11-01 (founder "Pode aplicar e publicar o painel").
begin;

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
                       count(*) filter (where l.outcome = 'Skipped') skipped, count(*) filter (where l.outcome = 'NoDose') no_dose,
                       count(*) filter (where l.outcome is distinct from 'NoDose') total
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



commit;
