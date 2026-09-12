-- reality_checks — the calculator's saved reality-check history (build 55).
-- Moved out of Supabase auth user_metadata into a synced, RLS-protected table so
-- appends are one-row INSERTs (a stale read can't truncate the whole list).
-- One row per entry_date is enforced by the app (local upsert + read dedupe), NOT
-- a UNIQUE constraint — the insert-based sync engine must never hit a conflict.

create table if not exists public.reality_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date text not null,
  tdee real,
  rate_per_week_kg real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reality_checks_user_date on public.reality_checks(user_id, entry_date);

alter table public.reality_checks enable row level security;
create policy "reality_checks select own" on public.reality_checks for select using (auth.uid() = user_id);
create policy "reality_checks insert own" on public.reality_checks for insert with check (auth.uid() = user_id);
create policy "reality_checks update own" on public.reality_checks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reality_checks delete own" on public.reality_checks for delete using (auth.uid() = user_id);
