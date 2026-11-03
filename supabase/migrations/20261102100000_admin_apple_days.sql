-- Admin panel — cache of Apple daily sales reports (docs/specs/admin-panel.md Phase 4, AC1–AC3; founder
-- 2026-11-02 "Go, pode preparar o SQL do cache da Apple"). Live, fetching 91 daily reports took > 9 s and
-- the Apple column fell to "timeout". A closed UTC day never changes, so the server keeps each day it has
-- already read here and asks Apple only for the days it does not have. One row per day; report=false
-- means Apple had no report for that day (zero sales) once the day was at least 3 days old.
-- Written by the panel's service role only; nothing reads it from the app. Applied live 2026-11-02 with the founder's go (see the note at the end).

create table if not exists public.admin_apple_days (
  day date primary key,
  downloads integer not null default 0,
  redownloads integer not null default 0,
  updates integer not null default 0,
  report boolean not null default true,
  fetched_at timestamptz not null default now()
);

alter table public.admin_apple_days enable row level security;
revoke all on table public.admin_apple_days from public, anon, authenticated;
grant select, insert, update on table public.admin_apple_days to service_role;

-- Applied 2026-11-02 (founder "Go, pode aplicar a migração"). The project's default privileges had given
-- service_role every right; trimmed to select/insert/update (ACL after: service_role=arw).
revoke delete, truncate, references, trigger on table public.admin_apple_days from service_role;
