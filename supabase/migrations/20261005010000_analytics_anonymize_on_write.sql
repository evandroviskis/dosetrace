-- Regulatory review 2026-10-05: older apps (1.2.x) still insert their user_id and health fields.
-- Every write is anonymized on the server, whatever app version sends it; tracking_types is health data too.
-- APPLIED on production 2026-10-05 (dry run first); 851 rows → 0 linked, 0 with health fields.
create or replace function public.analytics_events_anonymize()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  new.user_id := null;
  new.properties := coalesce(new.properties, '{}'::jsonb) - array['compound','dose','dose_unit','frequency','wellness_goal','color','type','compound_type','query','name','goal','tracking_types'];
  return new;
end;
$$;
drop trigger if exists analytics_events_anonymize on public.analytics_events;
create trigger analytics_events_anonymize before insert or update on public.analytics_events
  for each row execute function public.analytics_events_anonymize();
update public.analytics_events set properties = properties - 'tracking_types' where properties ? 'tracking_types';
