-- A-88 (dt-council 2026-10-04, founder go "3 sim"):
-- 1) Signed-in apps can no longer hard-delete protocol rows. A 1.2.x app's 7-day purge sends
--    DELETE on protocols, and the dose_logs -> protocols cascade erased dose history. With no
--    DELETE policy the request silently affects 0 rows (no error, so old apps never loop).
--    Account deletion uses the service role and is unaffected; 1.3.0 deletes forever via purged_at.
-- 2) A vial of a soft-deleted (not purged) protocol cannot be deleted by an app either (the same
--    1.2.x purge deletes those vials first). The purge trigger still removes them once purged_at is set.
-- 3) "Delete forever" is forever: a purged protocol keeps only its identity (id, user_id, type,
--    colour, timestamps, deleted_at, purged_at); every content column is blanked, now and on write.
-- 4) redeem_referral_code is not used by the app: no one may call it. 5) Pin search_path on 3 functions.

drop policy if exists "Users can manage own protocols" on public.protocols;
create policy "Users read own protocols" on public.protocols for select using (auth.uid() = user_id);
create policy "Users insert own protocols" on public.protocols for insert with check (auth.uid() = user_id);
create policy "Users update own protocols" on public.protocols for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can manage own vials" on public.vials;
create policy "Users read own vials" on public.vials for select using (auth.uid() = user_id);
create policy "Users insert own vials" on public.vials for insert with check (auth.uid() = user_id);
create policy "Users update own vials" on public.vials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own vials of live or purged protocols" on public.vials for delete using (
  auth.uid() = user_id
  and not exists (
    select 1 from public.protocols p
    where p.id = vials.protocol_id and p.deleted_at is not null and p.purged_at is null
  )
);

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
    new.deleted_at := coalesce(new.deleted_at, new.purged_at);
  end if;
  return new;
end;
$$;
drop trigger if exists protocols_blank_purged on public.protocols;
create trigger protocols_blank_purged before insert or update on public.protocols
  for each row execute function public.protocols_blank_purged();

-- Tombstones written before this migration.
update public.protocols set name = name where purged_at is not null;

revoke execute on function public.redeem_referral_code(text) from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.reality_check_open_keep_stop() set search_path = public, pg_temp;
