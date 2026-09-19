-- Canonical, idempotent RLS for DoseTrace core tables.
-- These tables were created ad hoc (no SQL in git); this file version-controls
-- their Row Level Security so the perimeter is reproducible and never
-- "dashboard-only". Safe to re-run. It does NOT (re)create the tables — it only
-- asserts RLS + owner policies on the existing ones.
--
-- Applied live 2026-09-19 (migration rls_harden_referral_and_vaccines covers the
-- referral + vaccines fixes; the owner policies below already matched live).
--
-- Model: the client holds only the anon key, so RLS is the whole perimeter.
-- Every user-data table is owner-scoped: auth.uid() = user_id (profiles: = id).

-- ── Core owner-only tables (single ALL policy) ──
-- A permissive ALL policy with USING and no WITH CHECK is safe: PostgreSQL uses
-- the USING expression as the WITH CHECK for INSERT/UPDATE, so a row can never be
-- inserted or reassigned to another user's id.

alter table public.profiles   enable row level security;
alter table public.protocols  enable row level security;
alter table public.vials      enable row level security;
alter table public.dose_logs  enable row level security;
alter table public.biomarkers enable row level security;
alter table public.reminders  enable row level security;

drop policy if exists "Users can manage own profile"   on public.profiles;
create policy "Users can manage own profile"   on public.profiles   for all using (auth.uid() = id);

drop policy if exists "Users can manage own protocols" on public.protocols;
create policy "Users can manage own protocols" on public.protocols  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own vials"      on public.vials;
create policy "Users can manage own vials"      on public.vials      for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own logs"       on public.dose_logs;
create policy "Users can manage own logs"       on public.dose_logs  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own biomarkers" on public.biomarkers;
create policy "Users can manage own biomarkers" on public.biomarkers for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own reminders"  on public.reminders;
create policy "Users can manage own reminders"  on public.reminders  for all using (auth.uid() = user_id);

-- ── vaccines UPDATE: explicit WITH CHECK (P0 fix 2026-09-19) ──
alter table public.vaccines enable row level security;
drop policy if exists "Users can update own vaccines" on public.vaccines;
create policy "Users can update own vaccines" on public.vaccines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── referral_codes: remove the public UPDATE hole (P0 fix 2026-09-19) ──
-- Redemption runs through the SECURITY DEFINER function redeem_referral_code(text)
-- (see supabase_security_fixes.sql), which bypasses RLS, so no public UPDATE
-- policy is needed. USING(true)/WITH CHECK(true) let anyone modify any code row.
drop policy if exists "Anyone can increment code usage" on public.referral_codes;

-- ── Service-role-only tables: RLS ON, ZERO policies, grants revoked ──
-- No anon/authenticated policy may ever be added here — only edge functions
-- (service role, which bypasses RLS) may read/write. apple_tokens holds Apple
-- refresh tokens; ai_*_usage are server-managed quota rows.
alter table public.apple_tokens  enable row level security;
alter table public.ai_food_usage enable row level security;
alter table public.ai_scan_usage enable row level security;
revoke all on public.apple_tokens  from anon, authenticated;
revoke all on public.ai_food_usage from anon, authenticated;
revoke all on public.ai_scan_usage from anon, authenticated;
