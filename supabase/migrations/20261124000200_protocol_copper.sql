-- Copper this cycle (founder 2026-11-24 13:19 EST, picture docs/design/ghk-cu-cobre-ciclo.html 661070b8;
-- docs/specs/ghk-cu-copper.md CU-11, CU-12). Additive only: two nullable columns, no default, no data change.
-- STATUS: NOT APPLIED (written 2026-11-24; needs the founder's "pode aplicar"). The app works before and after:
-- both are regular columns sent on every protocol push, NULL included (lib/syncMappers CLEARABLE_COLUMNS); while
-- the cloud lacks one it answers PGRST204 and the write is retried without it (a value stays on the phone,
-- optional_pending, and is re-sent once the column exists; a NULL is never re-sent). A pull from a cloud without
-- the column leaves the phone's value.
--
-- 1. protocols.copper_form — the form of GHK-Cu on the label: 'complex' (C14H22CuN6O4, 15,8% copper),
--    'acetate' (C14H22CuN6O4·C2H4O2, 13,8%), 'bis' (two GHK per copper, C32H54CuN12O12, 7,4%); NULL = "Não sei"
--    (the app shows the range). For GHK-Cu and the blends GLOW / KLOW. Covered by the existing protocols policies
--    ((select auth.uid()) = user_id, 20261103120000).
alter table public.protocols add column if not exists copper_form text;
alter table public.protocols drop constraint if exists protocols_copper_form_check;
alter table public.protocols add constraint protocols_copper_form_check
  check (copper_form is null or copper_form in ('complex', 'acetate', 'bis'));

-- 2. protocols.ghk_cu_mg — a blend's GHK-Cu in the vial, in mg (≤ the vial total, checked by the app); NULL = "Não sei"
--    (no copper is calculated; never a recipe default).
alter table public.protocols add column if not exists ghk_cu_mg numeric;
alter table public.protocols drop constraint if exists protocols_ghk_cu_mg_check;
alter table public.protocols add constraint protocols_ghk_cu_mg_check check (ghk_cu_mg is null or ghk_cu_mg > 0);

-- 3. Delete forever (AD-67 / DV-221): the blanking trigger also blanks the two new columns (same body as
--    20261124000000_dose_observation, i.e. 20261104000000_unrecorded_period plus repeat_dose_context /
--    repeat_dose_note, plus copper_form and ghk_cu_mg); old tombstones are blanked again.
--    ORDER (integration 2026-11-24): apply AFTER 20261124000000_dose_observation.sql (this body names its
--    columns, and it is the newest definition, so it keeps that migration's blanks).
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
    new.copper_form := null;
    new.ghk_cu_mg := null;
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;

-- ROLLBACK (in this order): run the function body of 20261124000000_dose_observation.sql (section 3) again;
--   alter table public.protocols drop constraint if exists protocols_ghk_cu_mg_check;
--   alter table public.protocols drop constraint if exists protocols_copper_form_check;
--   alter table public.protocols drop column if exists ghk_cu_mg;
--   alter table public.protocols drop column if exists copper_form;
