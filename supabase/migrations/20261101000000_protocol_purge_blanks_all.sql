-- DV-221 (AD-67, founder "3 sim", decisions.md:552/:556): Delete forever blanks the tombstone's content.
-- The trigger (20261004010000, extended 20261020000000) left interval_days, doses_per_day,
-- concentration_unit and divisible, and dose_history (added 20261027020000 after it). Every content column
-- is blanked now — NULL, or the column default where there is one (interval_days 1, doses_per_day 1,
-- concentration_unit 'mg'); identity stays: id, user_id, type, color, timestamps, deleted_at, purged_at.
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
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;
