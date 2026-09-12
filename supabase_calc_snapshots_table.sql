-- calc_snapshots — the calculator's saved daily snapshots (build 55).
-- Moved out of Supabase auth user_metadata into a synced, RLS-protected table so
-- appends are one-row INSERTs (a stale read can't truncate the whole list).
-- One row per entry_date is enforced by the app (local upsert + read dedupe), NOT
-- a UNIQUE constraint — the insert-based sync engine must never hit a conflict.

create table if not exists public.calc_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date text not null,
  weight_kg real,
  waist_cm real,
  body_fat_pct real,
  lbm real,
  bmr real,
  tdee real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calc_snapshots_user_date on public.calc_snapshots(user_id, entry_date);

alter table public.calc_snapshots enable row level security;
create policy "calc_snapshots select own" on public.calc_snapshots for select using (auth.uid() = user_id);
create policy "calc_snapshots insert own" on public.calc_snapshots for insert with check (auth.uid() = user_id);
create policy "calc_snapshots update own" on public.calc_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calc_snapshots delete own" on public.calc_snapshots for delete using (auth.uid() = user_id);
