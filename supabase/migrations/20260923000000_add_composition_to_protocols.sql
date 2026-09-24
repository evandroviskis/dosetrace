-- Per-vial blend composition: a free-text journaling label of what's in the vial
-- (e.g. "50 GHK / 10 KPV / 10 TB / 10 BPC"). Never parsed; never feeds the curve.
-- Applied to the live project (mqfvnqfusqyhqhowfweh) as "add_composition_to_protocols".
alter table public.protocols add column if not exists composition text;
