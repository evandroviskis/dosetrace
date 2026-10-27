-- AD-95 B (founder 2026-10-26, "pode aplicar a migração"; docs/decisions.md): the curve reflects what
-- the person said they injected. Each Taken dose keeps the dose it was taken at; a protocol remembers
-- its dose changes with the moment each was saved (lib/doseStamp, lib/syncMappers OPTIONAL_COLUMNS).
-- Additive only: two nullable columns on dose_logs, one on protocols, a stamp for the Taken rows that
-- exist today, and a trigger for apps that do not send the dose yet (1.3.0 until legacy_until).

alter table public.dose_logs add column if not exists dose_amount numeric;
alter table public.dose_logs add column if not exists dose_unit text;
alter table public.protocols add column if not exists dose_history text;

-- The Taken rows of today keep their protocol's current dose — the only value known (the app stamps its
-- local rows the same way on its first start, lib/schema upgradeDoseAmounts). updated_at is left as it
-- is: the phones already hold the same stamp, nothing needs to be pulled again.
alter table public.dose_logs disable trigger set_updated_at;
update public.dose_logs d
   set dose_amount = p.dose, dose_unit = coalesce(p.dose_unit, 'mg')
  from public.protocols p
 where d.protocol_id = p.id and d.user_id = p.user_id
   and d.outcome = 'Taken' and d.dose_amount is null and p.dose > 0;
alter table public.dose_logs enable trigger set_updated_at;

-- An app that sends no dose (1.3.0 / 1.3.1 test builds): a row that is or becomes Taken without one gets
-- its protocol's current dose. A row that has one keeps it (an upsert without the column keeps it too).
create or replace function public.dt_stamp_dose() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.outcome = 'Taken' and new.dose_amount is null and new.protocol_id is not null then
    select p.dose, coalesce(p.dose_unit, 'mg') into new.dose_amount, new.dose_unit
      from public.protocols p
     where p.id = new.protocol_id and p.user_id = new.user_id and p.dose > 0;
  end if;
  return new;
end $$;
revoke all on function public.dt_stamp_dose() from public, anon, authenticated;

drop trigger if exists dt_stamp_dose on public.dose_logs;
create trigger dt_stamp_dose before insert or update on public.dose_logs
  for each row execute function public.dt_stamp_dose();
