-- A-30, option C (2026-10-03): when a protocol is added with a past start date the app asks
-- "Same dose for the last N weeks?". "No" stores history_from = the day it was added: the curve
-- then draws nothing before it. NULL = draw from the start date (the answer "Yes", every older row).
-- Additive and nullable: no existing row is rewritten. The client works before and after this is
-- applied: it sends history_from only when set and, if the column is missing (PGRST204), retries
-- the write without it (lib/syncCore).
-- NOT APPLIED by the builder: the founder / coordinator applies it.
alter table public.protocols add column if not exists history_from date;
