-- AI scan usage log — enforces a per-user monthly cap on the extract-bloodwork
-- edge function (lab / vaccine / vial scans share one budget). Written ONLY by
-- the edge function via the service role; RLS is enabled with NO policies, so
-- anon/authenticated clients can neither read nor tamper with it. FK cascade
-- reaps a user's rows when their auth account is deleted.
--
-- Applied to prod 2026-09-09 (migration: create_ai_scan_usage). This file is the
-- source of truth for the DDL — git is the only backup on this machine.
create table if not exists public.ai_scan_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'bloodwork',
  created_at timestamptz not null default now()
);

create index if not exists ai_scan_usage_user_month_idx
  on public.ai_scan_usage (user_id, created_at);

alter table public.ai_scan_usage enable row level security;
-- Intentionally NO policies: clients have zero access; the service role bypasses RLS.
