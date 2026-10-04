-- Delete forever, as a POSITIVE tombstone (2026-10-04, decided by the ledger: never destroy on a
-- maybe). "Delete forever" sets purged_at on the protocol row and keeps the row in the cloud (its
-- other fields untouched); its dose logs and vials are deleted. Other devices remove the protocol
-- when a pull brings purged_at — never because a row is merely missing (an old 1.2.x build's
-- 7-day auto-purge, an incomplete list or an RLS slip must never erase anyone's history).
-- Additive and nullable: no existing row is rewritten (NULL = not purged).
-- The client works before and after this is applied: before, it hard-deletes the protocol row as
-- 1.3.0 did and writes the tombstone once the column exists (OPTIONAL_COLUMNS + PGRST204 retry).
-- NOT APPLIED by the builder: the founder / coordinator applies it.
alter table public.protocols add column if not exists purged_at timestamptz;
