-- Founder 2026-10-05 "sim, anonimiza as antigas": rows stored before 1.3.0 lose the account id
-- and every health field, so stored analytics match the "anonymous" the app promises.
-- APPLIED on production 2026-10-05: 850 rows, 0 linked and 0 with health fields afterwards.
update public.analytics_events
set user_id = null,
    properties = coalesce(properties, '{}'::jsonb) - array['compound','dose','dose_unit','frequency','wellness_goal','color','type','compound_type','query','name','goal'];
