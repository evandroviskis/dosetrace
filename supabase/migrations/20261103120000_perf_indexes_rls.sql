-- Performance: indexes for the sync path + RLS policies that read the user id once per statement.
-- Load test 2026-11-03 (docs/review/load-test-2026-11-03.md; rig scripts/load-test/run.cjs on a local
-- copy of production; test __tests__/perfIndexesRls.test.js against the production policies captured
-- that day, __tests__/fixtures/prodPolicies-2026-11-03.json).
--
-- 1. Indexes. Every foreign key the Supabase advisor listed without a covering index, and the keyset
--    the sync pull reads: user_id = U and updated_at > W order by updated_at, id limit 500
--    (lib/syncPager fetchByUpdated). Without them a pull of dose_logs reads the whole table, and
--    purging a protocol / deleting an account scans every child table once per parent row.
--    Plain create index (not concurrently): the tables are small today, the lock is milliseconds.
-- 2. RLS. auth.uid() written bare is evaluated for every row; (select auth.uid()) is evaluated once
--    per statement (an initPlan). ALTER POLICY changes only the expressions: roles, command and the
--    permissive flag stay exactly as they are, and each expression is production's text with only the
--    call wrapped.
-- 3. referrals had two permissive SELECT policies for the same role (public); Postgres ORs permissive
--    policies, so one policy with the OR of the two is the same rule, evaluated once.
--    analytics_events keeps its two INSERT policies: they are for different roles (authenticated vs
--    public), so one policy could not say the same thing.
-- Nothing is dropped except the referrals policy folded into the merge. Unused indexes stay.
--
-- ROLLBACK (run in this order): drop the 9 indexes below (drop index if exists public.<name>);
-- re-create the policies from __tests__/fixtures/prodPolicies-2026-11-03.json (alter policy ... using
-- (auth.uid() = ...)); for referrals: alter policy "Users can see referrals they made or received" on
-- public.referrals rename to "Users can see referrals they made", alter it to using ((auth.uid() =
-- referrer_id)), and create policy "Users can see their own referral record" on public.referrals for
-- select using ((auth.uid() = referred_id)).

-- ── 1. Indexes ───────────────────────────────────────────────────────────────
create index if not exists dose_logs_user_updated_idx on public.dose_logs (user_id, updated_at, id);
create index if not exists dose_logs_protocol_idx on public.dose_logs (protocol_id);
create index if not exists protocols_user_updated_idx on public.protocols (user_id, updated_at, id);
create index if not exists vials_user_updated_idx on public.vials (user_id, updated_at, id);
create index if not exists vials_protocol_idx on public.vials (protocol_id);
create index if not exists biomarkers_user_updated_idx on public.biomarkers (user_id, updated_at, id);
create index if not exists reminders_user_idx on public.reminders (user_id);
create index if not exists reminders_protocol_idx on public.reminders (protocol_id);
create index if not exists admin_devices_user_idx on public.admin_devices (user_id);

-- ── 2. Policies: (select auth.uid()) ─────────────────────────────────────────
alter policy "Users can insert own events" on public.analytics_events
  with check ((select auth.uid()) = user_id);
alter policy "Users can read own events" on public.analytics_events
  using ((select auth.uid()) = user_id);

alter policy "Users can manage own biomarkers" on public.biomarkers
  using ((select auth.uid()) = user_id);

alter policy "calc_inputs delete own" on public.calc_inputs
  using ((select auth.uid()) = user_id);
alter policy "calc_inputs insert own" on public.calc_inputs
  with check ((select auth.uid()) = user_id);
alter policy "calc_inputs select own" on public.calc_inputs
  using ((select auth.uid()) = user_id);
alter policy "calc_inputs update own" on public.calc_inputs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "calc_snapshots delete own" on public.calc_snapshots
  using ((select auth.uid()) = user_id);
alter policy "calc_snapshots insert own" on public.calc_snapshots
  with check ((select auth.uid()) = user_id);
alter policy "calc_snapshots select own" on public.calc_snapshots
  using ((select auth.uid()) = user_id);
alter policy "calc_snapshots update own" on public.calc_snapshots
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "calc_targets delete own" on public.calc_targets
  using ((select auth.uid()) = user_id);
alter policy "calc_targets insert own" on public.calc_targets
  with check ((select auth.uid()) = user_id);
alter policy "calc_targets select own" on public.calc_targets
  using ((select auth.uid()) = user_id);
alter policy "calc_targets update own" on public.calc_targets
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can manage own logs" on public.dose_logs
  using ((select auth.uid()) = user_id);

alter policy "Users can delete own food_logs" on public.food_logs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own food_logs" on public.food_logs
  with check ((select auth.uid()) = user_id);
alter policy "Users can read own food_logs" on public.food_logs
  using ((select auth.uid()) = user_id);
alter policy "Users can update own food_logs" on public.food_logs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "lab_prefs delete own" on public.lab_prefs
  using ((select auth.uid()) = user_id);
alter policy "lab_prefs insert own" on public.lab_prefs
  with check ((select auth.uid()) = user_id);
alter policy "lab_prefs select own" on public.lab_prefs
  using ((select auth.uid()) = user_id);
alter policy "lab_prefs update own" on public.lab_prefs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can manage own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users insert own protocols" on public.protocols
  with check ((select auth.uid()) = user_id);
alter policy "Users read own protocols" on public.protocols
  using ((select auth.uid()) = user_id);
alter policy "Users update own protocols" on public.protocols
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "push_tokens delete own" on public.push_tokens
  using ((select auth.uid()) = user_id);
alter policy "push_tokens insert own" on public.push_tokens
  with check ((select auth.uid()) = user_id);
alter policy "push_tokens select own" on public.push_tokens
  using ((select auth.uid()) = user_id);
alter policy "push_tokens update own" on public.push_tokens
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "reality_check_open delete own" on public.reality_check_open
  using ((select auth.uid()) = user_id);
alter policy "reality_check_open insert own" on public.reality_check_open
  with check ((select auth.uid()) = user_id);
alter policy "reality_check_open select own" on public.reality_check_open
  using ((select auth.uid()) = user_id);
alter policy "reality_check_open update own" on public.reality_check_open
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "reality_checks delete own" on public.reality_checks
  using ((select auth.uid()) = user_id);
alter policy "reality_checks insert own" on public.reality_checks
  with check ((select auth.uid()) = user_id);
alter policy "reality_checks select own" on public.reality_checks
  using ((select auth.uid()) = user_id);
alter policy "reality_checks update own" on public.reality_checks
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can insert own referral code" on public.referral_codes
  with check ((select auth.uid()) = user_id);
alter policy "Users can read own referral code" on public.referral_codes
  using ((select auth.uid()) = user_id);
alter policy "Users can update own code stats" on public.referral_codes
  using ((select auth.uid()) = user_id);

alter policy "Users can insert referral records" on public.referrals
  with check ((select auth.uid()) = referred_id);
-- 3. The two permissive SELECT policies of referrals, as one (their OR).
alter policy "Users can see referrals they made" on public.referrals
  rename to "Users can see referrals they made or received";
alter policy "Users can see referrals they made or received" on public.referrals
  using (((select auth.uid()) = referrer_id) or ((select auth.uid()) = referred_id));
drop policy if exists "Users can see their own referral record" on public.referrals;

alter policy "Users can manage own reminders" on public.reminders
  using ((select auth.uid()) = user_id);

alter policy "team_messages select own" on public.team_messages
  using (((select auth.uid()) = user_id) and (withdrawn_at is null));

alter policy "Users can delete own vaccines" on public.vaccines
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own vaccines" on public.vaccines
  with check ((select auth.uid()) = user_id);
alter policy "Users can read own vaccines" on public.vaccines
  using ((select auth.uid()) = user_id);
alter policy "Users can update own vaccines" on public.vaccines
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users delete own vials of live or purged protocols" on public.vials
  using (((select auth.uid()) = user_id) and (not (exists (select 1 from protocols p where ((p.id = vials.protocol_id) and (p.deleted_at is not null) and (p.purged_at is null))))));
alter policy "Users insert own vials" on public.vials
  with check ((select auth.uid()) = user_id);
alter policy "Users read own vials" on public.vials
  using ((select auth.uid()) = user_id);
alter policy "Users update own vials" on public.vials
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
