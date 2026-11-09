-- CP-1 pen path (docs/specs/pen-path.md): the pen's data on a protocol whose form is a pen.
-- JSON text (lib/penPath): kind (single / fixed / dial), the printed doses, doses per pen, the closed pens
-- of the current dose and the days out of the fridge. Optional for the client (lib/syncMappers
-- OPTIONAL_COLUMNS): a client sends it only when set, and works before and after this migration.
alter table public.protocols add column if not exists pen text;

-- Delete forever (AD-67 / DV-221): the blanking trigger also blanks the pen (same body as 20261104000000 plus pen).
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
    new.pen := null;
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;


-- ROLLBACK: run the function body of 20261104000000_unrecorded_period.sql again; then
--   alter table public.protocols drop column if exists pen;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;
