-- DV-247 (AD-95): a protocol's schedule changes (interval, doses per day, dose times), each with the moment
-- it took effect (lib/scheduleHistory), so the past days keep the schedule they had. TEXT (JSON), optional:
-- the app sends it only when set and retries without it until this column exists (lib/syncMappers).
alter table public.protocols add column if not exists schedule_history text;
