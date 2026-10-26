-- DV-006, 1.3.2 part (founder 2026-10-20, docs/decisions.md: "lab stars and labels stay in
-- user_metadata ... in 1.3.1; the synced table ships in 1.3.2"). Spec docs/specs/dv006-lab-table.md.
--
-- NOT APPLIED. Apply only with the founder's "pode aplicar". A 1.3.2 build WITHOUT this table keeps
-- working: the app reads "table not found" (PGRST205 / 42P01) as "not there yet" — the stars and
-- labels stay in user_metadata exactly as 1.3.1 (lib/labPrefsStore), and every other table, the full
-- import and the A-119 rebuild go on as before (lib/syncCore LATE_TABLES; __tests__/dv006LabPrefsTable
-- "LT-4"). After it is applied, each phone copies the account's user_metadata stars and labels into
-- this table once (merge-only, on the phone; user_metadata is never changed or deleted).
--
-- Order: after 20261021010000_one_active_device.sql when that one is applied (the device guard below
-- is added only when its functions exist). If A-119 is applied AFTER this file, run this file again
-- (it is re-runnable) so lab_prefs gets the guard too.
--
-- Re-runnable: one transaction; table and indexes "if not exists"; policies and triggers dropped if
-- they exist before they are created; the guard function replaced with the same body plus lab_prefs.
-- Depends on public.set_updated_at() (exists in production; the reality_check_open migration uses it).
--
-- public.lab_prefs: one row per starred marker (kind 'star', test_key '') or per label of a test
-- (kind 'label', test_key = the report date). Removing one is a TOMBSTONE: removed_at is set and the
-- row stays (so the one-time copy can never bring a removed star back); starring again clears
-- removed_at on the same row. The app never deletes a row; account deletion removes them by
-- ON DELETE CASCADE and supabase/functions/delete-user. No unique key on purpose: a second row for the
-- same marker (made offline before a first pull) must be accepted, never refused forever — the app
-- reads the group as one and every change updates all its rows.
-- RLS and the updated_at trigger mirror reality_check_open / calc_inputs.
--
-- ROLLBACK (only before any phone wrote here; the rows are user data):
--   drop table if exists public.lab_prefs;
--   and run the dt_pre_request body of 20261021010000_one_active_device.sql again (without lab_prefs).

begin;

create table if not exists public.lab_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('star', 'label')),
  test_key text not null default '',
  item_key text not null,
  value text not null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_prefs_user_idx on public.lab_prefs (user_id);
create index if not exists lab_prefs_user_updated_idx on public.lab_prefs (user_id, updated_at, id);

alter table public.lab_prefs enable row level security;

drop policy if exists "lab_prefs select own" on public.lab_prefs;
drop policy if exists "lab_prefs insert own" on public.lab_prefs;
drop policy if exists "lab_prefs update own" on public.lab_prefs;
drop policy if exists "lab_prefs delete own" on public.lab_prefs;
create policy "lab_prefs select own" on public.lab_prefs for select using (auth.uid() = user_id);
create policy "lab_prefs insert own" on public.lab_prefs for insert with check (auth.uid() = user_id);
create policy "lab_prefs update own" on public.lab_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lab_prefs delete own" on public.lab_prefs for delete using (auth.uid() = user_id);

drop trigger if exists lab_prefs_set_updated_at on public.lab_prefs;
create trigger lab_prefs_set_updated_at before update on public.lab_prefs
  for each row execute function public.set_updated_at();

-- A-119 device guard (20261021010000_one_active_device.sql), only when it is installed: the
-- statement-level write guard, and the pre-request check of reads and writes (the same body, with
-- lab_prefs added to the synced tables).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_device_guard') then
    execute 'drop trigger if exists dt_device_guard on public.lab_prefs';
    execute 'create trigger dt_device_guard before insert or update or delete on public.lab_prefs for each statement execute function public.dt_device_guard()';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_pre_request')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dt_require_active_device') then
    execute $fn$
create or replace function public.dt_pre_request()
returns void language plpgsql security definer set search_path = public, pg_temp as $body$
declare
  v_path text := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/+', '');
  v_method text := upper(coalesce(nullif(current_setting('request.method', true), ''), 'GET'));
  v_table text := split_part(split_part(v_path, '?', 1), '/', 1);
begin
  if v_table = any (array['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'lab_prefs']) then
    perform public.dt_require_active_device(v_method not in ('GET', 'HEAD'));
  elsif v_table = 'push_tokens' and v_method in ('POST', 'PATCH', 'PUT') then
    perform public.dt_require_active_device(true);
  end if;
end;
$body$;
$fn$;
    execute 'revoke all on function public.dt_pre_request() from public';
    execute 'grant execute on function public.dt_pre_request() to anon, authenticated, service_role';
  end if;
end;
$$;

commit;

-- PostgREST picks up the new table (and the replaced pre-request body) on a schema reload.
notify pgrst, 'reload schema';
