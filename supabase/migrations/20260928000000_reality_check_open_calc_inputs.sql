-- S-03 (docs/specs/fixes-1.2.5.md FX-8 / FX-9): the open reality check and the
-- calculator inputs move off user_metadata into durable synced tables.
-- NOT YET APPLIED to production — founder's final ok required (2026-09-28).
-- Re-runnable: one transaction; tables/indexes "if not exists"; policies and
-- triggers dropped-if-exists before create; functions "create or replace".
-- Depends on public.set_updated_at() (exists in production, checked read-only
-- 2026-09-28: BEGIN NEW.updated_at = now(); RETURN NEW; END).
--
-- reality_check_open: one row per check. stopped_at is set on Stop and can never
-- be cleared again (Stop wins across devices — enforced here by a trigger AND in
-- the client: lib/syncMappers.js never sends stopped_at = null, lib/syncCore.js
-- keeps a local stop on pull and leaves at most one open row per account).
-- NO deleted_at column, on purpose: a check is never deleted, it is STOPPED
-- (history kept, Stop replaces delete); account deletion removes the rows via
-- ON DELETE CASCADE and supabase/functions/delete-user.
-- calc_inputs: one row per user (unique user_id; the client upserts on
-- conflict), payload JSONB, last writer wins.
-- RLS and the updated_at trigger mirror calc_targets.

begin;

create table if not exists public.reality_check_open (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date text,
  start_weight_kg double precision, -- not real: a 4-byte float would round the user's number
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reality_check_open_user_idx on public.reality_check_open (user_id);

create table if not exists public.calc_inputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb,
  constraint calc_inputs_one_per_user unique (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calc_inputs_user_idx on public.calc_inputs (user_id);

alter table public.reality_check_open enable row level security;
alter table public.calc_inputs enable row level security;

drop policy if exists "reality_check_open select own" on public.reality_check_open;
drop policy if exists "reality_check_open insert own" on public.reality_check_open;
drop policy if exists "reality_check_open update own" on public.reality_check_open;
drop policy if exists "reality_check_open delete own" on public.reality_check_open;
create policy "reality_check_open select own" on public.reality_check_open for select using (auth.uid() = user_id);
create policy "reality_check_open insert own" on public.reality_check_open for insert with check (auth.uid() = user_id);
create policy "reality_check_open update own" on public.reality_check_open for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reality_check_open delete own" on public.reality_check_open for delete using (auth.uid() = user_id);

drop policy if exists "calc_inputs select own" on public.calc_inputs;
drop policy if exists "calc_inputs insert own" on public.calc_inputs;
drop policy if exists "calc_inputs update own" on public.calc_inputs;
drop policy if exists "calc_inputs delete own" on public.calc_inputs;
create policy "calc_inputs select own" on public.calc_inputs for select using (auth.uid() = user_id);
create policy "calc_inputs insert own" on public.calc_inputs for insert with check (auth.uid() = user_id);
create policy "calc_inputs update own" on public.calc_inputs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calc_inputs delete own" on public.calc_inputs for delete using (auth.uid() = user_id);

drop trigger if exists reality_check_open_set_updated_at on public.reality_check_open;
create trigger reality_check_open_set_updated_at before update on public.reality_check_open
  for each row execute function public.set_updated_at();
drop trigger if exists calc_inputs_set_updated_at on public.calc_inputs;
create trigger calc_inputs_set_updated_at before update on public.calc_inputs
  for each row execute function public.set_updated_at();

-- Stop wins: once stopped, a row stays stopped (a stale open edit from another
-- device can change nothing about that).
create or replace function public.reality_check_open_keep_stop()
returns trigger language plpgsql as $$
begin
  if old.stopped_at is not null then
    new.stopped_at := old.stopped_at;
  end if;
  return new;
end;
$$;
drop trigger if exists reality_check_open_keep_stop on public.reality_check_open;
create trigger reality_check_open_keep_stop before update on public.reality_check_open
  for each row execute function public.reality_check_open_keep_stop();

commit;
