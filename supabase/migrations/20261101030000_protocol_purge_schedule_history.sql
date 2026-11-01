-- Council 2026-11-01 (backend): DV-247 added protocols.schedule_history (20261101010000) after the DV-221 trigger
-- (20261101000000), so Delete forever kept a protocol's past dose times and intervals in the cloud (AD-67: every
-- content column is blanked). Same trigger body plus schedule_history; old tombstones are blanked again.
-- __tests__/dv221PurgeBlanksAll.test.js now reads every column the migrations add to protocols.
-- STATUS: NOT APPLIED (production apply needs the founder go).
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
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;
