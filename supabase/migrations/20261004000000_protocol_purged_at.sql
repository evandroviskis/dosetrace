-- Delete forever, as a POSITIVE tombstone (2026-10-04, decided by the ledger: never destroy on a
-- maybe). "Delete forever" sets purged_at on the protocol row and keeps the row in the cloud (its
-- other fields untouched); its dose logs and vials are deleted. Other devices remove the protocol
-- when a pull brings purged_at — never because a row is merely missing (an old 1.2.x build's
-- 7-day auto-purge, an incomplete list or an RLS slip must never erase anyone's history).
-- The column is additive and nullable: no existing row is rewritten (NULL = not purged). Two
-- triggers follow (see below): a purge deletes the children server side, and a child can never be
-- written onto a purged protocol.
-- The client works before and after this is applied: before, it hard-deletes the protocol row as
-- 1.3.0 did and writes the tombstone once the column exists (OPTIONAL_COLUMNS + PGRST204 retry).
-- NOT APPLIED by the builder: the founder / coordinator applies it.
alter table public.protocols add column if not exists purged_at timestamptz;

-- (a) Final Gate B 2026-10-04: a protocol deleted forever (purged_at set) loses its dose logs and
-- vials server side too, whichever client wrote the tombstone. Same user's rows only.
-- SECURITY INVOKER: runs as the caller, so RLS (auth.uid() = user_id) still applies.
create or replace function public.protocols_purge_children()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.dose_logs where protocol_id = new.id and user_id = new.user_id;
  delete from public.vials where protocol_id = new.id and user_id = new.user_id;
  return null;
end;
$$;

drop trigger if exists protocols_purge_children on public.protocols;
create trigger protocols_purge_children
  after update of purged_at on public.protocols
  for each row
  when (new.purged_at is not null)
  execute function public.protocols_purge_children();

-- (b) A dose log or vial can never be written onto a protocol deleted forever: the insert or update
-- fails, and the 1.3.0 client keeps that row pending (never deleted: R-A). Same user's protocol
-- only; SECURITY INVOKER, so the lookup sees only rows RLS lets the caller see.
create or replace function public.refuse_child_of_purged_protocol()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.protocol_id is not null and exists (
    select 1 from public.protocols p
    where p.id = new.protocol_id and p.user_id = new.user_id and p.purged_at is not null
  ) then
    raise exception 'protocol % was deleted forever', new.protocol_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists dose_logs_refuse_purged_parent on public.dose_logs;
create trigger dose_logs_refuse_purged_parent
  before insert or update on public.dose_logs
  for each row
  execute function public.refuse_child_of_purged_protocol();

drop trigger if exists vials_refuse_purged_parent on public.vials;
create trigger vials_refuse_purged_parent
  before insert or update on public.vials
  for each row
  execute function public.refuse_child_of_purged_protocol();
