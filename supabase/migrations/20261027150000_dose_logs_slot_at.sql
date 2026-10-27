-- Founder 2026-10-27 (with option A, "Migration dose_logs.slot_at approved"; docs/decisions.md): a Taken
-- dose whose time is corrected keeps the slot it was marked for, so the Missed scan never writes a false
-- "Perdida" for it (lib/missedDoses coverMsOf, lib/doseEdit timeEditFields). Additive and nullable: sent
-- only when set (lib/syncMappers OPTIONAL_COLUMNS); older apps never send it and an upsert without the
-- column keeps it. RLS is the table's own (unchanged).
alter table public.dose_logs add column if not exists slot_at timestamptz;
