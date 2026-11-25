-- Dose mark and observation, option B (founder 2026-11-24 13:02 / 13:06 EST; picture
-- docs/design/dose-jejum-refeicao-treino.html; docs/specs/dose-observation.md DO-1..DO-5).
-- Additive only: four nullable columns, no default, no data change.
-- STATUS: WRITTEN, NOT APPLIED (needs the founder's "pode"). The app works before and after: the four columns
-- are regular columns sent with NULL (lib/syncMappers CLEARABLE_COLUMNS); while the cloud lacks one it answers
-- PGRST204 and the write is retried without it (lib/syncCore writeWithOptionalRetry), the value stays on the
-- phone (optional_pending) and is re-sent once the column exists; a pull without the key never erases it.
-- An older app version ignores the columns and never sends them, so it never clears them.
-- The old dose_logs.notes / pre_tags columns stay as they are and are not reused (unknown old content).
--
-- 1. dose_logs.dose_context: the person's mark on a completed dose — 'fasted' (Em jejum), 'meal' (Com
--    refeição) or NULL. dose_logs.dose_note: the observation the person writes about the dose (free text).
--    Covered by the existing dose_logs policies ((select auth.uid()) = user_id, 20261103120000); Delete
--    forever already deletes the protocol's dose logs (20261004000000).
alter table public.dose_logs add column if not exists dose_context text;
alter table public.dose_logs add column if not exists dose_note text;
alter table public.dose_logs drop constraint if exists dose_logs_dose_context_check;
alter table public.dose_logs add constraint dose_logs_dose_context_check check (dose_context is null or dose_context in ('fasted', 'meal'));

-- 2. protocols.repeat_dose_context / repeat_dose_note: "Repetir nas próximas doses" — what every new completed
--    dose of the protocol gets (both NULL = repeat off). Covered by the existing protocols policies.
alter table public.protocols add column if not exists repeat_dose_context text;
alter table public.protocols add column if not exists repeat_dose_note text;
alter table public.protocols drop constraint if exists protocols_repeat_dose_context_check;
alter table public.protocols add constraint protocols_repeat_dose_context_check check (repeat_dose_context is null or repeat_dose_context in ('fasted', 'meal'));

-- 3. Delete forever (AD-67 / DV-221): the blanking trigger also blanks the repeat columns (same body as
--    20261104000000 plus repeat_dose_context / repeat_dose_note); old tombstones are blanked again.
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
    new.repeat_dose_context := null;
    new.repeat_dose_note := null;
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;

-- ROLLBACK (in this order): run the function body of 20261104000000_unrecorded_period.sql again;
--   alter table public.protocols drop column if exists repeat_dose_note;
--   alter table public.protocols drop column if exists repeat_dose_context;
--   alter table public.dose_logs drop column if exists dose_note;
--   alter table public.dose_logs drop column if exists dose_context;
