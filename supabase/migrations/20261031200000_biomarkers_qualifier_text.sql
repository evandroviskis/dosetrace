-- A-203 option C (founder 2026-10-31: "Assino o checklist do A-203, pode aplicar a migração").
-- A lab result that is not an exact number keeps what the report wrote:
--   qualifier  '<', '>', '≤' or '≥' before the number ("> 2.000", "inferior a 0,01")
--   value_text the result in words when there is no number ("Não reagente", "Negativo")
-- value becomes nullable for word results. Store 1.3.0 reads a null value as an empty line
-- (formatNumber returns '') and never crashes (checked in its code before applying, NN-6).
alter table public.biomarkers add column if not exists qualifier text;
alter table public.biomarkers add column if not exists value_text text;
alter table public.biomarkers alter column value drop not null;
alter table public.biomarkers drop constraint if exists biomarkers_qualifier_check;
alter table public.biomarkers add constraint biomarkers_qualifier_check
  check (qualifier is null or qualifier in ('<', '>', '≤', '≥'));
alter table public.biomarkers drop constraint if exists biomarkers_value_or_text_check;
alter table public.biomarkers add constraint biomarkers_value_or_text_check
  check (value is not null or (value_text is not null and length(btrim(value_text)) > 0));
