-- Admin panel — "Decisões": which Claude session posted each decision (founder 2026-11-24). Three sessions write
-- there: the app session ('app', "App"), the admin panel session ('adm', "Painel admin") and the marketing session
-- ('ads', "Publicidade"). The tab is segmented by it; the pending badge stays the total of 'pendente'.
--
-- STATUS: APPLIED 2026-11-24 by the coordinating session (verified live the same day: column text not null
-- default 'app', constraint founder_decisions_origem_check, index founder_decisions_origem (origem, status)).
-- This file records it; it is idempotent and matches production exactly, so running it again changes nothing.
-- Rollback (one transaction): drop index if exists public.founder_decisions_origem;
--   alter table public.founder_decisions drop column if exists origem;

begin;

alter table public.founder_decisions add column if not exists origem text not null default 'app'
  check (origem in ('app', 'adm', 'ads'));
create index if not exists founder_decisions_origem on public.founder_decisions (origem, status);

commit;
