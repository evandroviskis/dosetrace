-- push_tokens — one row per device, holds the Expo push token used by the
-- scheduled reminder sender (server push, delivers even under Android battery
-- saver / Doze). Owner-scoped: a user manages only their own device tokens; the
-- sender edge function reads all rows via the service role (bypasses RLS).
-- Applied live 2026-09-23 (migration create_push_tokens_table); committed here so
-- the schema + RLS are version-controlled and reproducible.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (user_id, expo_token)
);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;
create policy "push_tokens select own" on public.push_tokens for select using (auth.uid() = user_id);
create policy "push_tokens insert own" on public.push_tokens for insert with check (auth.uid() = user_id);
create policy "push_tokens update own" on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_tokens delete own" on public.push_tokens for delete using (auth.uid() = user_id);
