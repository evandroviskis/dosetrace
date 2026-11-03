-- Load-test rig: synthetic data at a future scale (psql -v users=N -v days=D). Test data only.
-- Ids are deterministic so the load generator can address them without reading them back:
--   user k      md5('u' || k)::uuid           device 'i:lt' || lpad(k, 18, '0')
--   protocol    md5('p' || k || '-' || j)::uuid   (j = 1..3; j = 3 of every 10th user is soft-deleted)
--   vial        md5('v' || k || '-' || j)::uuid
-- Triggers and FK checks are off while loading (session_replication_role = replica); the tables are
-- analyzed at the end. Per user: 3 protocols, one dose per protocol per day for D days (~3·D dose
-- logs), 2 vials and 1 reminder per protocol, 40 biomarkers, D/2 food logs, D/4 calc snapshots,
-- 3 vaccines, 12 reality checks, 10 lab prefs, 1 each of calc_inputs/targets/reality_check_open,
-- push token, referral code, team message, device rows; 1 referral per user from the previous one.
set session_replication_role = replica;
set synchronous_commit = off;

insert into auth.users (id, email, aud, role, created_at)
select md5('u' || k)::uuid, 'lt' || k || '@load.test', 'authenticated', 'authenticated', now() - interval '400 days'
from generate_series(1, :users) k;

insert into public.profiles (id, email, name, plan)
select md5('u' || k)::uuid, 'lt' || k || '@load.test', 'Load ' || k, case when k % 5 = 0 then 'premium' else 'free' end
from generate_series(1, :users) k;

insert into public.account_devices (user_id, active_device, since, session_created_at, last_device)
select md5('u' || k)::uuid, 'i:lt' || lpad(k::text, 18, '0'), now() - interval '30 days', now() - interval '30 days', 'i:lt' || lpad(k::text, 18, '0')
from generate_series(1, :users) k;
insert into public.user_devices (user_id, device_id, platform, name, brand, app_version, registered_at, last_seen_at)
select md5('u' || k)::uuid, 'i:lt' || lpad(k::text, 18, '0'), 'ios', 'iPhone', 'Apple', '1.3.2', now() - interval '30 days', now() - interval '1 day'
from generate_series(1, :users) k;

insert into public.protocols (id, user_id, name, type, color, unit, amount, water, dose, dose_unit, syringe_size, concentration,
  frequency, reminder_time, active, created_at, interval_days, doses_per_day, start_date, updated_at, compound_id, deleted_at)
select md5('p' || k || '-' || j)::uuid, md5('u' || k)::uuid, 'Compound ' || j, 'peptide', '#3366ff', 'mg', 5, 2, 0.25, 'mg', 100, 2.5,
  'daily', '08:00', true, now() - (:days || ' days')::interval, 1, 1, (now() - (:days || ' days')::interval)::date,
  now() - ((k * 7 + j * 13) % :days) * interval '1 day' - ((k + j) % 1440) * interval '1 minute', 'bpc-157',
  case when j = 3 and k % 10 = 0 then now() - interval '5 days' end
from generate_series(1, :users) k, generate_series(1, 3) j;

-- The big one: one dose per protocol per day; updated_at a few seconds after logged_at.
insert into public.dose_logs (user_id, protocol_id, logged_at, outcome, injection_site, slot_at, updated_at, created_at, dose_amount, dose_unit)
select md5('u' || k)::uuid, md5('p' || k || '-' || j)::uuid,
  t, case when d % 17 = 0 then 'Skipped' else 'Taken' end, 'abdomen-left', date_trunc('day', t) + interval '8 hours',
  t + interval '3 seconds', t, 0.25, 'mg'
from generate_series(1, :users) k, generate_series(1, 3) j, generate_series(0, :days - 1) d,
  lateral (select now() - d * interval '1 day' - ((k * 31 + j * 17) % 600) * interval '1 minute' as t) x;

insert into public.vials (id, user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, expires_on)
select md5('v' || k || '-' || (j * 2 - 1 + v))::uuid, md5('u' || k)::uuid, md5('p' || k || '-' || j)::uuid, (now() - (v * 30 + j) * interval '1 day')::date,
  2, 20, (k + j) % 20, v = 0, now() - (v * 30 + j) * interval '1 day', now() - (v * 30 + j) * interval '1 day' + interval '1 hour',
  to_char(now() + interval '28 days', 'YYYY-MM-DD')
from generate_series(1, :users) k, generate_series(1, 3) j, generate_series(0, 1) v;

insert into public.reminders (user_id, protocol_id, "time", frequency, days)
select md5('u' || k)::uuid, md5('p' || k || '-' || j)::uuid, '08:00', 'daily', array['mon','tue','wed','thu','fri','sat','sun']
from generate_series(1, :users) k, generate_series(1, 3) j;

insert into public.biomarkers (user_id, report_date, marker, value, unit, reference_min, reference_max, status, created_at, updated_at)
select md5('u' || k)::uuid, (now() - (b / 10) * interval '90 days')::date, 'marker_' || (b % 10), 50 + b, 'ng/dL', 10, 100, 'normal',
  now() - (b / 10) * interval '90 days', now() - (b / 10) * interval '90 days' - (k % 500) * interval '1 minute'
from generate_series(1, :users) k, generate_series(0, 39) b;

insert into public.food_logs (user_id, entry_date, raw_text, parsed_items, kcal, protein_g, carb_g, fat_g, source, parse_status, created_at, updated_at)
select md5('u' || k)::uuid, to_char(now() - d * interval '2 days', 'YYYY-MM-DD'), 'chicken, rice and salad',
  '[{"name":"chicken","kcal":300},{"name":"rice","kcal":250}]'::jsonb, 650, 45, 60, 18, 'ai', 'done',
  now() - d * interval '2 days', now() - d * interval '2 days' + (k % 300) * interval '1 second'
from generate_series(1, :users) k, generate_series(0, :days / 2 - 1) d;

insert into public.calc_snapshots (user_id, entry_date, weight_kg, body_fat_pct, lbm, bmr, tdee, created_at, updated_at, waist_cm)
select md5('u' || k)::uuid, to_char(now() - d * interval '4 days', 'YYYY-MM-DD'), 82 - d * 0.02, 18, 67, 1800, 2500,
  now() - d * interval '4 days', now() - d * interval '4 days', 88
from generate_series(1, :users) k, generate_series(0, :days / 4 - 1) d;

insert into public.vaccines (user_id, name, date_given, created_at, updated_at)
select md5('u' || k)::uuid, 'Vaccine ' || v, to_char(now() - v * interval '100 days', 'YYYY-MM-DD'), now() - v * interval '100 days', now() - v * interval '100 days'
from generate_series(1, :users) k, generate_series(1, 3) v;

insert into public.reality_checks (user_id, entry_date, tdee, rate_per_week_kg, created_at, updated_at)
select md5('u' || k)::uuid, to_char(now() - r * interval '30 days', 'YYYY-MM-DD'), 2450, -0.3, now() - r * interval '30 days', now() - r * interval '30 days'
from generate_series(1, :users) k, generate_series(0, 11) r;

insert into public.calc_targets (user_id, entry_date, target_weight_kg, target_body_fat_pct, created_at, updated_at)
select md5('u' || k)::uuid, '2026-06-01', 78, 14, now() - interval '150 days', now() - interval '150 days' from generate_series(1, :users) k;
insert into public.reality_check_open (user_id, start_date, start_weight_kg, created_at, updated_at)
select md5('u' || k)::uuid, '2026-10-20', 81, now() - interval '14 days', now() - interval '14 days' from generate_series(1, :users) k;
insert into public.calc_inputs (user_id, payload, created_at, updated_at)
select md5('u' || k)::uuid, '{"age":38,"sex":"m","height_cm":180}'::jsonb, now() - interval '200 days', now() - interval '20 days' from generate_series(1, :users) k;
insert into public.lab_prefs (user_id, kind, test_key, item_key, value, created_at, updated_at)
select md5('u' || k)::uuid, case when i % 2 = 0 then 'star' else 'label' end, 'panel', 'item_' || i, 'v', now() - i * interval '10 days', now() - i * interval '10 days'
from generate_series(1, :users) k, generate_series(1, 10) i;

insert into public.push_tokens (user_id, expo_token, platform, timezone, device_id, language, app_version)
select md5('u' || k)::uuid, 'ExponentPushToken[lt' || k || ']', 'ios', 'America/New_York', 'i:lt' || lpad(k::text, 18, '0'), 'en', '1.3.2'
from generate_series(1, :users) k;
insert into public.referral_codes (user_id, code, times_used) select md5('u' || k)::uuid, 'LT' || k, 1 from generate_series(1, :users) k;
insert into public.referrals (referrer_id, referred_id, code) select md5('u' || (k - 1))::uuid, md5('u' || k)::uuid, 'LT' || (k - 1) from generate_series(2, :users) k;
insert into public.team_messages (user_id, body, created_at) select md5('u' || k)::uuid, 'Hello from the team', now() - interval '3 days' from generate_series(1, :users) k;
-- Analytics: anonymous (as production stores them), plus one own row per user to exercise the SELECT policy.
insert into public.analytics_events (user_id, event, properties, created_at)
select null, 'screen_view', '{"screen":"today"}'::jsonb, now() - (e % 365) * interval '1 day' from generate_series(1, :users * 40) e;
insert into public.analytics_events (user_id, event, properties, created_at)
select md5('u' || k)::uuid, 'legacy_event', '{}'::jsonb, now() - interval '200 days' from generate_series(1, :users) k;

set session_replication_role = origin;
analyze;
