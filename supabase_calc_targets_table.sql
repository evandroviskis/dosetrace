-- calc_targets — the user's personal wellness TARGET (build 56).
-- One active target per user (weight and/or body-fat). Values are stored in
-- CANONICAL units (kg, %) so a client-side unit switch (kg<->lb) never corrupts
-- the target. start_* is the snapshot at set-time and anchors the progress bar;
-- the ETA is derived at render from the measured rate and never stored (so it
-- can't go stale). Synced, RLS-protected, tombstone-deletable like the other
-- calc tables — user-entered data must survive updates / re-auth / sync.
-- One logical row per user is enforced by the app (local upsert), NOT a UNIQUE
-- constraint — the insert-based sync engine must never hit a conflict.

create table if not exists public.calc_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date text,
  target_weight_kg real,
  target_body_fat_pct real,
  target_date text,
  start_date text,
  start_weight_kg real,
  start_body_fat_pct real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calc_targets_user on public.calc_targets(user_id);

alter table public.calc_targets enable row level security;
create policy "calc_targets select own" on public.calc_targets for select using (auth.uid() = user_id);
create policy "calc_targets insert own" on public.calc_targets for insert with check (auth.uid() = user_id);
create policy "calc_targets update own" on public.calc_targets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calc_targets delete own" on public.calc_targets for delete using (auth.uid() = user_id);
