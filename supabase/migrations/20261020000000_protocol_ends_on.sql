-- A-121 (founder 2026-10-15, docs/specs/still-going-end-date.md) + A-148 (Fold test 2026-10-17).
-- 1) ends_on: the protocol's PLANNED end, a local calendar day chosen by the person ("Continua até
--    uma data…" / "Termina em" on the protocol page). NULL = no end date. Not ended_at (the moment a
--    protocol was ended). A regular column for the app (DL-115): always sent, NULL included.
-- 2) still_going_at: the moment the person last answered that the protocol continues ("Continua",
--    "Continuar", "Sem data de fim"); the "Still going?" span restarts from it (DL-113). It was kept
--    only on the phone and came back after every sign-in (A-148).
-- Additive and nullable: no existing row is rewritten. The client works before and after this is
-- applied: a push the cloud refuses for a missing column (PGRST204) is retried without it and the
-- value is re-sent once the column exists (lib/syncCore). Apply BEFORE uploading the 1.3.1 build
-- (DL-115) and check through the API that both columns exist.
-- 3) Delete forever stays forever: the purge trigger also blanks both columns (SG-21). The function
--    below is the 20261004010000 one with the two new lines; everything else is unchanged.
-- NOT APPLIED by the builder: the founder ("pode aplicar") / coordinator applies it.

alter table public.protocols add column if not exists ends_on date;
alter table public.protocols add column if not exists still_going_at timestamptz;

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
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;
drop trigger if exists protocols_blank_purged on public.protocols;
create trigger protocols_blank_purged before insert or update on public.protocols
  for each row execute function public.protocols_blank_purged();

-- 4) A-148 (Gate B 2 / 3): the "Still going?" answer only moves forward and never ahead of the server
--    clock — a phone whose answer is older (pushed late, offline) never moves it back, and a phone
--    whose clock was ahead never stores a moment from the future. A purge is left to the blanking
--    trigger above (this one runs after it: triggers fire in name order).
create or replace function public.protocols_still_going_forward()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.purged_at is not null then return new; end if;
  if new.still_going_at is not null then new.still_going_at := least(new.still_going_at, now()); end if;
  if tg_op = 'UPDATE' then new.still_going_at := greatest(old.still_going_at, new.still_going_at); end if;
  return new;
end;
$$;
drop trigger if exists protocols_still_going_forward on public.protocols;
create trigger protocols_still_going_forward before insert or update on public.protocols
  for each row execute function public.protocols_still_going_forward();
