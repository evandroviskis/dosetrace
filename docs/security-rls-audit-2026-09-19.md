# RLS audit — DoseTrace (Supabase project `mqfvnqfusqyhqhowfweh`)

**Date:** 2026-09-19 · **Author:** Claude Code (Grok security handoff P0)
**Method:** live queries against `pg_class` / `pg_policies`, plus a cross-user
enforcement test impersonating the `authenticated` role.

The client ships only the anon key (`EXPO_PUBLIC_*`), so **RLS is the entire
perimeter**. Every `public` table that holds user data must be owner-scoped.

## 1. RLS enabled — all 17 public tables

RLS is **ON** for every table in `public`:

| Table | RLS | Policies | Model |
|---|---|---|---|
| profiles | ✅ | 1 (ALL) | owner `auth.uid() = id` |
| protocols | ✅ | 1 (ALL) | owner `auth.uid() = user_id` |
| vials | ✅ | 1 (ALL) | owner |
| dose_logs | ✅ | 1 (ALL) | owner |
| biomarkers | ✅ | 1 (ALL) | owner |
| reminders | ✅ | 1 (ALL) | owner |
| vaccines | ✅ | 4 (per-cmd) | owner |
| food_logs | ✅ | 4 (per-cmd) | owner |
| reality_checks | ✅ | 4 (per-cmd) | owner |
| calc_snapshots | ✅ | 4 (per-cmd) | owner |
| calc_targets | ✅ | 4 (per-cmd) | owner |
| analytics_events | ✅ | 2 (SELECT/INSERT) | owner |
| referral_codes | ✅ | 3 (owner-only after fix) | owner |
| referrals | ✅ | 3 | referrer/referred scoped |
| apple_tokens | ✅ | **0** | service-role only (grants revoked) |
| ai_food_usage | ✅ | **0** | service-role only |
| ai_scan_usage | ✅ | **0** | service-role only |

**Note on single `ALL` policies:** a permissive `ALL` policy with
`USING (auth.uid() = user_id)` and no `WITH CHECK` is safe — PostgreSQL uses the
`USING` expression as the `WITH CHECK` for INSERT/UPDATE when the latter is
omitted, so a user cannot insert or reassign a row to another user's id.

**Service-role-only tables** (`apple_tokens`, `ai_food_usage`, `ai_scan_usage`):
RLS ON with **zero** policies **and** table grants revoked from `anon` /
`authenticated`. Default-deny RLS + no grant = double-locked; only the service
role (edge functions) can touch them.

## 2. Gaps found and fixed (live + versioned)

Applied live via migration `rls_harden_referral_and_vaccines` and captured in
`supabase_core_tables_rls.sql`:

1. **referral_codes — public UPDATE hole (fixed).** A policy
   `"Anyone can increment code usage"` allowed `UPDATE ... USING (true) WITH
   CHECK (true)` to `public` — any caller could modify **any** code row
   (inflate counters, reassign). **Dropped.** Redemption runs through the
   `redeem_referral_code(text)` **SECURITY DEFINER** function (verified present
   live), which bypasses RLS, so no public UPDATE policy is needed. Owner-only
   `"Users can update own code stats"` remains. (No client code references
   referrals today — the feature is unwired — so the drop is non-breaking.)
2. **vaccines UPDATE — explicit `WITH CHECK` added.** The UPDATE policy relied on
   the omitted-check fallback; recreated with an explicit
   `WITH CHECK (auth.uid() = user_id)` to match the other per-command tables.

**Old audit item confirmed NOT present live:** the world-readable referral SELECT
policy `"Anyone can look up a code for redemption" USING (true)` (from
`supabase_security_fixes.sql`) does **not** exist live — SELECT is already
owner-only. No action needed.

## 3. Cross-user enforcement test (live evidence)

Impersonating the `authenticated` role with user A's JWT
(`sub = 52b1cbad-…`), against user B (`e5e4f1c3-…`):

| Check | Result |
|---|---|
| protocols A can see (total) | 2 |
| …of which A's own | 2 |
| **B's protocols visible to A** | **0** |
| **B's biomarkers visible to A** | **0** |
| referral_codes A can enumerate | 0 |
| **`select` on `apple_tokens` as authenticated** | **permission denied** |

Read isolation is enforced: A sees only A's rows and cannot enumerate B's data
or the service-role tables. Write isolation follows from the policy definitions —
every `ALL`/`UPDATE`/`DELETE` policy filters on `auth.uid() = user_id`, so a
non-owner's rows are never visible to modify, and the `WITH CHECK` clauses block
reassigning a row to another user. (A live mutating write test was intentionally
not executed against the shared production DB.)

## 4. Reproduce

```sql
-- RLS on/off + policy counts
select c.relname, c.relrowsecurity,
  (select count(*) from pg_policies p where p.tablename=c.relname) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;

-- Full policy detail
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies where schemaname='public' order by tablename, cmd;

-- Cross-user test (run in one transaction)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"<USER_A>","role":"authenticated"}', true);
select count(*) from protocols where user_id='<USER_B>'; -- expect 0
```
