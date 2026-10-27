-- Founder 2026-10-27 ("Assino os dois, opção A"; docs/decisions.md): the mark that a dose's amount was set by
-- hand ("Alterar dose") syncs, so after a reinstall a protocol correction ("Desde o início" / "A partir de
-- uma dose") never rewrites it (lib/database doseCtx atOld). Additive, nullable smallint (1 / 0), sent only
-- when known (lib/syncMappers OPTIONAL_COLUMNS); older apps never send it. RLS is the table's own.
alter table public.dose_logs add column if not exists dose_edited smallint;
