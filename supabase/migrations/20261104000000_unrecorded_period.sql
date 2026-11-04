-- Unrecorded period beyond 14 days, option B (founder 2026-11-03 "B"; answers 2026-11-04 10:04 EST;
-- docs/specs/unrecorded-period.md UP-35, UP-36). Additive only: two nullable columns, no default, no data change.
-- STATUS: APPLIED to production 2026-11-04 15:12 EST (founder "pode aplicar"). The app works before and after:
-- both columns are optional (lib/syncMappers OPTIONAL_COLUMNS), sent only when set; while the cloud lacks one
-- it answers PGRST204 and the write is retried without it (the value stays on the phone, re-sent later).
--
-- 1. dose_logs.outcome_by_person (UP-36, founder answer 3 "sim se foram ativamente marcadas como perdidas"):
--    who wrote the row's outcome — true the person, false the app's Missed scan; NULL = a row from before this
--    version (counted as the app's). A "Perdida" older than 14 days stays red and out of the question only when
--    true. Covered by the existing dose_logs policies ((select auth.uid()) = user_id, 20261103120000).
alter table public.dose_logs add column if not exists outcome_by_person boolean;

-- 2. protocols.unrecorded_unknown (UP-35, founder answer 2 "Não lembro"): JSON TEXT, the ranges of slots the
--    person answered "Não lembro" for ([{ from, to, at }]); the question never comes back for them, on a new
--    phone included. Lives on the protocol, so it goes with it (Delete forever blanks it below; the account
--    deletion removes the protocol row). Covered by the existing protocols policies.
alter table public.protocols add column if not exists unrecorded_unknown text;

-- 3. Delete forever (AD-67 / DV-221): the blanking trigger also blanks the new protocol column (same body as
--    20261101030000 plus unrecorded_unknown); old tombstones are blanked again.
create or replace function public.protocols_blank_purged()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.purged_at is not null then
    new.name := ''; new.unit := null; new.amount := null; new.water := null; new.dose := null;
    new.dose_unit := null; new.syringe_size := null; new.concentration := null; new.frequency := null;
    new.reminder_time := null; new.goal := null; new.notes := null; new.note := null;
    new.start_date := null; new.schedule_total := null; new.diluent := null; new.compound_id := null;
    new.vial_valid_days := null; new.serving_strength := null; new.serving_strength_unit := null;
    new.serving_units := null; new.container_units := null; new.units_taken := null;
    new.composition := null; new.history_from := null; new.ended_at := null; new.active := false;
    new.ends_on := null; new.still_going_at := null;
    new.interval_days := 1; new.doses_per_day := 1; new.concentration_unit := 'mg'; new.divisible := null; new.dose_history := null;
    new.schedule_history := null;
    new.unrecorded_unknown := null;
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;

-- ROLLBACK (in this order): run the function body of 20261101030000_protocol_purge_schedule_history.sql again;
--   alter table public.protocols drop column if exists unrecorded_unknown;
--   alter table public.dose_logs drop column if exists outcome_by_person;
