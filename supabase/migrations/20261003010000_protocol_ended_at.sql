-- A-83 (2026-10-03): "Yes, it's finished" ENDS a protocol instead of deleting it.
-- An ended protocol: active = false, deleted_at IS NULL, ended_at = when it was ended.
-- Additive and nullable: no existing row is rewritten (NULL = not ended, or ended on a device
-- before this column existed — the app then reads the end from updated_at).
-- The client works before and after this is applied: it sends ended_at only when set and, if
-- the column is missing (PGRST204), retries the write without it (lib/syncCore).
-- NOT APPLIED by the builder: the founder / coordinator applies it.
alter table public.protocols add column if not exists ended_at timestamptz;
