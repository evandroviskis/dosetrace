-- A-119 rehearsal fixture (scripts/a119-pg-rehearsal.cjs): the minimum of a Supabase project the
-- migration touches, on the supabase/postgres image — auth.sessions and auth.jwt() as GoTrue has them,
-- auth.uid()/auth.role() reading PostgREST 12's request.jwt.claims, the 11 synced tables (minimal
-- shapes, RLS "own rows"), push_tokens as in production, two users and their sessions. Test data only.

-- GoTrue's sessions and auth.jwt().
create table if not exists auth.sessions (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now());
alter table auth.sessions owner to supabase_auth_admin;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
alter function auth.jwt() owner to supabase_auth_admin;
grant select on auth.sessions to postgres;
grant execute on function auth.jwt() to anon, authenticated, service_role, postgres;

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;

-- The synced tables (minimal shapes).
do $$ declare t text; begin
  foreach t in array array['protocols','vials','dose_logs','biomarkers','vaccines','food_logs','reality_checks','calc_snapshots','calc_targets','reality_check_open','calc_inputs'] loop
    execute format('create table public.%I (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, val text, created_at timestamptz default now(), updated_at timestamptz default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop; end $$;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_token text not null, platform text, timezone text,
  updated_at timestamptz not null default now(), unique (user_id, expo_token));
alter table public.push_tokens enable row level security;
create policy "push_tokens select own" on public.push_tokens for select using (auth.uid() = user_id);
create policy "push_tokens insert own" on public.push_tokens for insert with check (auth.uid() = user_id);
create policy "push_tokens update own" on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_tokens delete own" on public.push_tokens for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.push_tokens to authenticated, service_role;

-- A table the guard must never touch.
create table public.analytics (id bigserial primary key, user_id uuid, ev text);
alter table public.analytics enable row level security;
create policy ins on public.analytics for insert with check (true);
grant insert on public.analytics to anon, authenticated;
grant usage on sequence public.analytics_id_seq to anon, authenticated;

insert into auth.users (id, email, aud, role) values
 ('11111111-1111-1111-1111-111111111111', 'u1@x', 'authenticated', 'authenticated'),
 ('22222222-2222-2222-2222-222222222222', 'u2@x', 'authenticated', 'authenticated');
insert into auth.sessions (id, user_id, created_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now() - interval '2 hours'),
 ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', now() - interval '1 hour'),
 ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', now() - interval '3 hours'),
 ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', now());
alter role authenticator with password 'authpass';

-- As in production, the app's tables belong to postgres (the role that runs migrations).
do $$ declare t text; begin
  foreach t in array array['protocols','vials','dose_logs','biomarkers','vaccines','food_logs','reality_checks','calc_snapshots','calc_targets','reality_check_open','calc_inputs','push_tokens','analytics'] loop
    execute format('alter table public.%I owner to postgres', t);
  end loop; end $$;
