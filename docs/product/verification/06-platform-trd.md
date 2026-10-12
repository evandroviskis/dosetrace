# 06 — Independent verification of the TRD (platform), dossier 08 and the PLAT / DOCS divergence rows

- Verified 2026-10-12 on branch `redesign/graduated`, HEAD `897f01d`. No code differs from the TRD's stated HEAD `976ef9e` (`git diff --stat 976ef9e HEAD -- . ':!docs'` is empty), so every line reference was checked against the same code the TRD read.
- Method: every claim was re-read in the code. I re-ran the sync claims with the repo's own harness (`__tests__/helpers/syncHarness.js` + real `lib/syncCore.js`); the script is in the session scratchpad, not in the repo. Live claims were checked read-only on Supabase project `mqfvnqfusqyhqhowfweh`, using metadata only and no user rows: `list_migrations`, `list_edge_functions`, `information_schema.columns`, `information_schema.triggers`, `pg_policies`, `pg_constraint`, `pg_proc`, `pg_trigger` on `auth.users`, `cron.job`, and `pg_get_functiondef` for `handle_new_user` / `set_updated_at`. I also ran `node --test`, `node scripts/spec-audit.cjs` and a classification script over `__tests__/`.
- Three helper verifiers worked in parallel on §1, on §5 + §6 and on §9. I spot-checked their findings, and their evidence is quoted. Nothing in the product docs or code was changed.
- Verdicts: **VERIFIED** = the code (or live DB) says exactly this. **PARTLY** = the core is right but a detail, count, path or scope is wrong. **WRONG** = the claim is false. **UNVERIFIABLE** = it needs a device, memory or another person.

## Totals

| Area | Claims | VERIFIED | PARTLY | WRONG | UNVERIFIABLE |
|---|---|---|---|---|---|
| §1 Architecture (incl. §1.6 live) | 120 | 110 | 6 | 2 | 2 |
| §2 Data model (incl. live columns, drift, storage) | 42 | 38 | 3 | 0 | 1 |
| §3 Sync engine | 46 | 40 | 2 | 4 | 0 |
| §5 Invariants | 38 | 19 | 11 | 0 | 8 |
| §6 Time and dates | 24 | 18 | 4 | 2 | 0 |
| §7 Testing | 12 | 9 | 2 | 1 | 0 |
| §9 Risks R-01…R-50 | 50 | 45 | 5 | 0 | 0 |
| PLAT + DOCS divergence rows | 28 | 19 | 7 | 1 | 1 |
| **Total** | **360** | **298** | **40** | **10** | **12** |
| "Missing files" (00-mechanical, 28 refs) | 28 | 10 PROPOSED + labelled · 6 labelled only at first use · 5 PROPOSED never labelled · 5 WRONG PATH · 2 not file refs | | | |

## The most important errors

1. **H-1 / DV-182 understates the delete hole.** A deleted dose does not just "stay on B". If B later edits that dose, `pushPending` finds 0 rows, sees a live parent protocol and **re-inserts the row into the cloud** (`lib/syncCore.js:692-698`, `reinsertRow`). A's next pull then brings the deleted dose **back on the deleting phone** too. Reproduced with the harness: "H-1b A after sync: doses back on A = 1". The TRD says B's edit "deletes it locally (deletions win) or re-inserts it (`calc_snapshots`)". It leaves out `dose_logs` and `vials`, which are the health-record case.
2. **DV-189 / H-12 / R-26 is wrong about the harness.** The harness *does* model delete invisibility: `delete()` removes the row from the in-memory store, and `fetchSince` only returns rows that exist. A two-device delete test written today with the stock harness **fails**, as my reproduction shows ("H-1 RESULT B after sync: biomarkers 1 doses 1"). So "DV-182 cannot fail a test today" is false. The only reason the suite is green is that **no test asserts it**. The harness blind spot is real only for H-2 (the `updated_at` trigger on every table): the stock harness gives B 2700 while a no-trigger cloud gives B 2500.
3. **F-11 is labelled "benign", but it can lose a row permanently.** `fetchSince` pages by **offset** over `updated_at > since ORDER BY updated_at` (`lib/sync.js:140-157`). If a row on an earlier page is updated mid-pull, it moves to the end, and the row at the page boundary is skipped. The moved row is newer, so it is fetched and merged, and the watermark (max synced `updated_at`) passes the skipped row. Every later pull uses `gt(watermark)`, so **the skipped row is never fetched again** (only a full import recovers it). The TRD says it is "picked up next pass", which is wrong. It only happens with more than 500 changed rows in one pull, so it is rare, but it is not benign.
4. **The live `updated_at` watermark has an uncommitted-transaction race the TRD does not list.** `set_updated_at()` is `NEW.updated_at = now()` (live `pg_get_functiondef`), and `now()` is the **transaction start time**. Take a write whose transaction starts at t1 and commits after another write that started at t2 > t1. A device that pulled in between has watermark ≥ t2 and never fetches the t1 row (`gt`). This applies to every synced table, both concurrent devices and a single slow request. Not in §3.8 or §3.9.
5. **The test-kind figure "184 of 255 test files read source text" (§7.1, R-27, DV-173) is right as a count but wrong as a description.** 184 files call `readFileSync`, but only **45** are pure source-text tests. **139** mix regex checks with tests that execute real code (`require('../lib/…')`, `extractFn`, which runs the real extracted function, or the sync harness). **68** are behaviour-only and 3 are other. "184 source-text test files" overstates the problem by about 4×.

Runners-up: `created_at` is unsent for **8** tables, not 7 (`calc_inputs` is missing from headline #4 and DV-001). `wake_refresh_runs` has no `user_id` and no FK, but the TRD lists it as "→ auth.users CASCADE". DV-171 says "about 18 files", but the real figure is 24 inline copies in 21 files. INV-44 cites the wrong code (missedDoses.js:186-208 is the A-49 watermark guard; the per-day zone logic is `zoneSlots` at :54-66, tested by `zoneSafeSlots.test.js`). INV-01's cited test does not test `App.js`. INV-24 has no test at all. The 3 migrations in the repo that still say "NOT APPLIED" are applied live. The repo migration *versions* differ from live (e.g. `20261003010000_protocol_ended_at` vs live `20261004035607`), so "same name" in §8.3 is not enough for `supabase db push`.

---

## §1 System architecture

The §1.1–§1.5 and §1.7 rows (T1-1…T1-108) were checked by a helper verifier against the files and lines. I re-checked a sample (index.js order, `ensureDb`, the claim key, the Paywall sources and the 20-table delete list) and agree. Rows that are not VERIFIED are listed individually; the VERIFIED rows are grouped with their evidence.

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| T1-1…T1-10, T1-12…T1-14 | Stack table: Expo ~54.0.33, RN 0.81.5 / React 19.1.0, newArch (app.json:10), react-navigation 7, expo-sqlite / WAL / FK pragma, supabase-js ^2.101.1, SecureStore chunking, RevenueCat `DoseTrace Pro`, notifications / task-manager / background-task, svg / reanimated / worklets, fonts, iOS and Android app.json, `node --test` + better-sqlite3 | VERIFIED | package.json:20-72; app.json:10, 16-37, 38-49, 72-83; database.js:24, 33-34; secureStore.js:28-96; purchases.js:19; fonts.js; App.js:39 | — |
| T1-11 | Native code row cites "§1.6" | WRONG | The native module is described in §1.5 | §1.5 |
| T1-15 | Local iOS native build blocked (CocoaPods / Ruby) | UNVERIFIABLE | Comes from memory only | — |
| T1-16, T1-17, T1-19, T1-20 | index.js order: notificationActions import (:4), defineReminderRefreshTask (:7-8 → backgroundTasks.js:56-72), registerRootComponent (:15); Android defineTask + registerTaskAsync (notificationActions.js:197-210) | VERIFIED | as cited | — |
| T1-18 / T1-88 | The notificationActions AppState listener "runs a deferred sync on every return to the foreground" | PARTLY | notificationActions.js:211-218 always drains, but syncs only if `syncWhenActive` was set by a background action (:110, :129, :217) | "…and syncs if an action was handled while the app was not active" |
| T1-21…T1-27, T1-29…T1-38, T1-40 | Render tree, loading gate, ErrorBoundary outside ThemeProvider with hard-coded `#fff`, startup effect App.js:521-767, every step line reference (±2), cross-account guard, isLocalDBEmpty → fullImport else requestSync, migration → permissions → resync → push token, SIGNED_IN order, Apple revoke = local sign-out | VERIFIED | App.js:69-88, 285-338, 521-767, 785-799 | — |
| T1-28 | Mermaid: `NOTIF: … registerReminderRefresh()` | PARTLY | registerReminderRefresh lives in lib/backgroundTasks (App.js:28) | Attribute it to BG |
| T1-39 | SIGNED_OUT → `onSignedOutNow` "(pure ref writes)" | PARTLY | signedOut.js:15-26 also calls `endStashFreshness`, `consumeIntentionalSignOut`, and on an intended sign-out `discardStashNow`, `clearAuthDraft`, `setSeenOnboarding(false)` | "synchronous local calls, no supabase, no await". INV-01 still holds |
| T1-41…T1-50 | Root stack conditions and order, PROFILE_GATE_SINCE 2020 with 8 fields, adult gate, MainStack has exactly 8 routes, 5 tabs with label keys | VERIFIED | App.js:178-241, 288-337; supabase.js:207, 230-236; adultGate.js:19-24 | — |
| T1-51…T1-60, T1-62…T1-71 | Route params table (every file:line), Paywall: 11 sources + exactly 2 calls without a source (CalculatorSection.js:1148, FoodChatScreen.js:720), tap routing (`dosetrace_nav_handled` last 30, 12 h), deep links (`dosetrace_links_handled` last 20), Gate B allow-list lacks auth-callback | VERIFIED | as cited; also no caller passes `onSuccess` | Minor: MARK_TAKEN / morning_summary open Today without `focusDose`; Today:1498 sends no `nonce` |
| T1-61 | FoodChat opened from "Journey (JourneyScreen.js:75)" | PARTLY | JourneyScreen.js:75 is a comment; both Journey and Today open FoodChat through `FoodLogHero` (JourneyScreen:153/158, TodayScreen:2174) | Cite FoodLogHero on Today and Journey |
| T1-72 | Two pages at ≥700×560 pt | PARTLY | bookLayout.js:7-20 also needs the Android posture rule | Add the posture condition |
| T1-73…T1-87, T1-89…T1-93 | Fold push / unfold, headless table (task name, claim key `id\|action\|date` last 60, `ensureDb` sets `dbReady=true` on throw (:31-36) vs refresh task retry, `getCachedUser → getSession` may refresh, no sync while inactive, wake push, minimumInterval 360 + CONNECTED constraint, `readStoredUser`), RefreshOnUpdateReceiver class-name enqueue, iOS has no background mode, dt-exact-alarm functions | VERIFIED | notificationActions.js:27-60, 147-219; backgroundTasks.js:22-79; reminderRefresh.js:12-40; RefreshOnUpdateReceiver.kt:18-33; DtExactAlarmModule.kt:15-28; node_modules/expo-background-task/…/BackgroundTaskScheduler.kt:93-94 | — |
| T1-94 | R8 keep rules list | PARTLY | app.json:82 also keeps `serialPersistentFields` | Add it |
| T1-95…T1-108 | delete-user = 20 tables + referrals; quotas 3/20 (UTC month), 25+25 per entry_date and 60 per 24 h, 10 per 7 days; models; SERVER_PUSH_ACTIVE=false (notifications.js:1079); send-reminders "NOT ACTIVE YET"; third parties | VERIFIED | delete-user/index.ts:112-139; quota.ts; parse-food/index.ts:28-30; budget.ts:8-9; send-reminders/index.ts:3 | delete-user names neither `profiles` nor `ai_assistant_usage` (cascade) |
| L1-1 | All public tables have RLS enabled | VERIFIED | live `pg_class.relrowsecurity` true on all 22 tables | — |
| L1-2 | Policies per table (protocols INSERT/SELECT/UPDATE, no DELETE; vials incl. DELETE; dose_logs / biomarkers / profiles / reminders ALL; calc_*, food_logs, reality_*, vaccines, push_tokens per command; analytics INSERT ×2 + SELECT; server ledgers none) | VERIFIED | live `pg_policies` | — |
| L1-3 | `updated_at` triggers live; **none on `reality_checks`**; other triggers (`protocols_blank_purged`, `protocols_purge_children`, `vials/dose_logs_refuse_purged_parent`, `reality_check_open_keep_stop`, `analytics_events_anonymize`) | VERIFIED | live `information_schema.triggers` (16 triggers) | — |
| L1-4 | FK / delete rules (profiles → auth.users CASCADE; core tables → profiles; vials / dose_logs → protocols CASCADE; others → auth.users CASCADE) | VERIFIED | live `pg_constraint` | — |
| L1-5 | `wake_refresh_runs` "→ auth.users CASCADE" | **WRONG** | live columns: `id bigint, ran_at timestamptz`; no user_id, no FK | It is a global run ledger, not per user |
| L1-6 | Server functions list; `handle_new_user` "body not in repo" | VERIFIED (and closes an UNVERIFIED) | live `pg_proc`: all listed exist, plus an unlisted `moddatetime`. `handle_new_user` = `insert into public.profiles (id, email) values (new.id, new.email)`, trigger `on_auth_user_created` on auth.users | §2.2 "UNVERIFIED" on profile creation can be closed |
| L1-7 | Cron `dosetrace-wake-refresh` `0 8 * * *` active → net.http_post wake-refresh | VERIFIED | live `cron.job` | — |
| L1-8 | Edge functions and versions: delete-user v17, extract-bloodwork v20, parse-food v10, parse-food-next v2 ACTIVE, protocol-assistant v1, apple-link v2, wake-refresh v2 verify_jwt off; send-reminders not deployed | VERIFIED | live `list_edge_functions` (7 functions) | — |
| L1-9 | Deployed code equals git | UNVERIFIABLE | the TRD says UNVERIFIED, and that is correct | — |
| L1-10 | "29 applied migrations" | VERIFIED | live `list_migrations` = 29 | — |
| L1-11 | Deep-link / Gate B / revoke paragraphs (deep links, Fold, mermaid flowchart) | VERIFIED | T1-67…T1-75 | — |
| L1-12 | iOS reminders renewed only on open (10-day window) | VERIFIED | notificationPlan.js:308; plugin strips `fetch` | — |

**§1 counts:** 108 helper rows (100 VERIFIED, 6 PARTLY, 1 WRONG, 1 UNVERIFIABLE) + 12 live/extra rows (10 VERIFIED, 1 WRONG, 1 UNVERIFIABLE) = **120: 110 VERIFIED, 6 PARTLY, 2 WRONG, 2 UNVERIFIABLE**.

---

## §2 Data model

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| D2-1 | Common columns `id AUTOINCREMENT`, `remote_id`, `user_id`, `updated_at DEFAULT datetime('now')`, `sync_status DEFAULT 'pending'` | VERIFIED | lib/schema.js, all 11 tables | — |
| D2-2 | No FOREIGN KEY declared, so `PRAGMA foreign_keys=ON` (database.js:35) enforces nothing | VERIFIED | 0 `REFERENCES` in schema.js; database.js:35 | — |
| D2-3 | Migrations = ALTER in try/catch, no version table (database.js:31-89); one-time watermark rewind when `composition` is added (:52-60) | VERIFIED | database.js:31-89, 52-58 | — |
| D2-4 | `addStatusAtColumn` backfills `status_at` (protocolEnd.js:37-43) | VERIFIED | protocolEnd.js:37-43 | — |
| D2-5 | protocols columns | VERIFIED | schema.js:9-55 | — |
| D2-6 | protocols synced fields; status only with `status_at`, first insert or re-send (A-87, syncMappers.js:89-99) | VERIFIED | syncMappers.js:89-100 | — |
| D2-7 | protocols send `created_at` (:101-103) | VERIFIED | syncMappers.js:103 | — |
| D2-8 | vials columns, synced fields, `created_at` not sent, tombstone only via Delete forever | VERIFIED | schema.js:57-73; syncMappers.js:104-111; protocolEnd.js:84-86 | — |
| D2-9 | dose_logs: no local `created_at`; live has one (default now) | VERIFIED | schema.js:75-87; live `dose_logs.created_at` | — |
| D2-10 | biomarkers columns / `created_at` not sent | VERIFIED | schema.js:89-101; syncMappers.js:116-120 | — |
| D2-11 | vaccines: 9 content fields synced | VERIFIED | syncMappers.js:121-131 | — |
| D2-12 | food_logs: 9 fields, `created_at` not sent, read by thread grouping and free-days anchor | VERIFIED | syncMappers.js:132-141; database.js:441 `getFoodLogTypedDays` | — |
| D2-13 | reality_checks: `upsertRealityCheck` UPDATEs an existing row for that date; `clearRealityChecks` tombstones all | VERIFIED | database.js:555-583 | — |
| D2-14 | calc_snapshots: an edited row deleted elsewhere is re-inserted (A-92, syncCore.js:699-702) | VERIFIED | syncCore.js:699-702 | — |
| D2-15 | calc_targets: 7 fields | VERIFIED | syncMappers.js:150-158 | — |
| D2-16 | reality_check_open: sends `created_at` (:166), `stopped_at` only when set, FULL_PULL | VERIFIED | syncMappers.js:162-166; syncCore.js:30 | — |
| D2-17 | calc_inputs: `created_at` not sent; insert = upsert on user_id (sync.js:135-137) | VERIFIED | sync.js:135-137 | — |
| D2-18 | Indexes (schema.js:238-261) | VERIFIED | schema.js:238-260 | — |
| D2-19 | Integrity gaps: no unique `(user_id, entry_date)`, read dedupe (database.js:539-552); no unique dose slot key | VERIFIED | database.js:539-552; schema.js; live `pg_constraint` (only calc_inputs, push_tokens and referrals have UNIQUE) | — |
| D2-20 | §2.2 live column lists for all 13 tables | VERIFIED | live `information_schema.columns`; every listed column, type and default matches | — |
| D2-21 | Local TEXT `amount` / `water` / `dose` vs cloud numeric; `syringe_size` integer, consistent | VERIFIED | schema.js (TEXT; `syringe_size REAL` locally); live numeric / integer | Note: local REAL vs cloud integer would also reject a fractional value |
| D2-22 | `vials.expiry_alert_days` never read or written | VERIFIED | 0 hits in lib/, screens/, components/ | — |
| D2-23 | LogScreen still renders `log.notes` / `log.pre_tags` | VERIFIED | LogScreen.js:560, 586-589 | — |
| D2-24 | `profiles` row created by `handle_new_user` "(body not in repo, UNVERIFIED)" | VERIFIED (live) | see L1-6 | Close the UNVERIFIED |
| D2-25 | DR-1: 29 live vs 12 files + 15 root `supabase_*.sql`; the listed live-only names | VERIFIED | live `list_migrations`; `ls` | **Addition:** the 12 repo files carry different version stamps from live (e.g. `20261003010000` vs `20261004035607`), so `supabase db push` / migration diffing would treat them as unapplied |
| D2-26 | DR-2: no core DDL in git | VERIFIED | no CREATE TABLE for the six tables; `supabase_core_tables_rls.sql:1-5` says so | — |
| D2-27 | DR-3: `notification_sends` (and `notification_preferences`) absent live, listed by delete-user | VERIFIED | live table list; delete-user/index.ts:128, 139 | — |
| D2-28 | DR-4: parse-food-next v2 ACTIVE; RL-1 said remove | VERIFIED | live; decisions.md:513 | — |
| D2-29 | DR-5: repo vaccines DDL lacks the 5 detail columns | VERIFIED | supabase_vaccines_table.sql:9-18 | — |
| D2-30 | DR-6: unused live columns | VERIFIED | live columns; no client reference | — |
| D2-31 | DR-7: type mismatch → pending forever on a bad value (SUSPECTED) | VERIFIED as code path | push errors are swallowed per row (syncCore.js:717-719) | — |
| D2-32 | DR-8 / DR-9 | VERIFIED | live triggers; `list_edge_functions` | — |
| D2-33 | §2.4: every listed AsyncStorage key exists where stated | PARTLY | all 36 keys found; curve view key is built in `lib/curveView.js:12`, not `lib/curveViewStore.js`; `dosetrace_time_format` / `dosetrace_language` live in `i18n/LanguageContext.js` | Fix the owner paths |
| D2-34 | §2.4 wipe columns: the intended sign-out removes only stash / seen / rc_start / rc flags / site questions / snoozes (via `cancelAllNotifications`); the cross-account guard removes rc_start / rc flags / site questions / snoozes; all other keys survive | VERIFIED | signedOut.js:158-170 `runWipeSteps`; App.js:376-399, 623-635, 705-716; notifications.js:877-886 | — |
| D2-35 | §2.5 SecureStore keys and chunking | VERIFIED | secureStore.js; recoveryLink.js `dosetrace_pending_recovery` | — |
| D2-36 | §2.5 iOS Keychain survives uninstall → session back with empty AsyncStorage | UNVERIFIABLE | device behaviour (marked SUSPECTED, correctly) | — |
| D2-37 | §2.6 `user_metadata` writers | PARTLY | Writers found: onboardingStore.js:85, OnboardingFlowScreen.js:274, AgeConfirmScreen.js:70, SettingsScreen.js:288/300/321, CalculatorSection.js:258/262/411/462, NutritionLogger.js:101, BodyScreen.js:416/425, realityCheck.js:77/122/147/201, supabase.js:339 | The list omits `lib/onboardingStore.js:85`, `OnboardingFlowScreen.js:274` and `AgeConfirmScreen.js:70`; it cites `lib/pendingProfile.js` / `onboardingSteps.js accountPatch` (patch builders, not the writers) |
| D2-38 | `favorite_markers` / `report_tags` whole-value writes from cached copy, errors swallowed | VERIFIED | BodyScreen.js:416, 425 (`.catch(() => {})`) | — |
| D2-39 | Settings `saveProfile` / analytics toggle ignore `{error}` | VERIFIED | SettingsScreen.js:300, 321 (no error read); :288 reads it | — |
| D2-40 | §2.7 in-memory stores | VERIFIED | draftStore, bookSelection, authDraft, authIntent, onboardingStore exist | — |
| D2-41 | §2.8 survival matrix row "Row deleted on A, B holds it → B keeps it except protocols" | PARTLY | true, but B's edit of a deleted dose / vial **resurrects it on A** (see S3-14) | Add the resurrection |
| D2-42 | §2.8 other rows (update, spurious sign-out, intended sign-out, cross-account discard of pending rows, delete, reinstall) | VERIFIED by code (device rows SUSPECTED as stated) | App.js guard calls `clearLocalDatabase()` with pending rows; signOutCore.js:59-92 | — |

**§2 counts:** 42 → **38 VERIFIED, 3 PARTLY (D2-33, D2-37, D2-41), 0 WRONG, 1 UNVERIFIABLE (D2-36)**. D2-25 is VERIFIED with an addition (migration version stamps differ from live).

---

## §3 Sync engine

Reproduction (repo harness + real `lib/syncCore.js`, two devices A and B, one fake cloud). Output, verbatim:

```
H-1 setup: B biomarkers 1 B doses 1
H-1 cloud after A delete: biomarkers 0 doses 0
H-1 RESULT B after sync: biomarkers 1 doses 1          <- deletes never reach B
H-1b B edits deleted dose: cloud doses 1 B doses 1    <- B re-inserts the deleted dose in the cloud
H-1b A after sync: doses back on A = 1                <- the deleted dose comes back on A
H-1c B edits deleted biomarker: B biomarkers 0 cloud 0 <- non-child table: deletions win on B
H-3 RESULT doses_taken A 4 B 4 cloud 4 (expected 5)
H-3 RESULT units_taken A 4 cloud 4 (expected 5)
H-3 RESULT note after B dose push: cloud orig A orig   <- A's note edit reverted by B's dose push
H-2 setup B tdee 2500
H-2 RESULT cloud tdee 2700 B tdee 2500                 <- cloud without a reality_checks trigger: edit never reaches B
H-2 CONTROL (stock harness) B tdee 2700                <- stock harness stamps every table: masks H-2
created_at A 2026-10-01T00:00:00Z B 000001             <- B inherits the cloud's insert time
```

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S3-1 | Files and roles; "SQLite is the source of truth; queue = pending/deleted rows" | VERIFIED | sync.js, syncCore.js:40-45, syncMappers.js, syncRunner.js | — |
| S3-2 | §3.1 trigger table: debounce 1.5 s (sync.js:82-85); requestSync counts Today 11, Protocols 11, Log 4, Body 4, VaccinesSection 3, realityCheck 4; notificationActions foreground only; CalculatorSection, FoodChat, foodLogActions | VERIFIED | grep: 11 / 11 / 4 / 4 / 3 / 4; CalculatorSection.js:256, 529; FoodChatScreen.js:327, 377-392; foodLogActions.js:157-197 | — |
| S3-3 | Cold start / SIGNED_IN: fullImport if `isLocalDBEmpty` else requestSync (App.js:637-642, 719-723) | VERIFIED | App.js:637-643, 719-723 | — |
| S3-4 | Foreground ≤1/min: requestSync and syncAllNotifications concurrently | VERIFIED | App.js:565-576 | — |
| S3-5 | NetInfo offline → online (sync.js:57-67), `_isOnline` starts true | VERIFIED | sync.js:25, 57-67 | — |
| S3-6 | Today focus implicit sync through `cleanupOldDeletedProtocols` | VERIFIED | TodayScreen.js:323, 597-602 | — |
| S3-7 | `forceSync` waits, then a fresh pass (sync.js:106-109) | VERIFIED | sync.js:106-109; syncRunner.js:24-28 | — |
| S3-8 | `pullRealityCheckTable` (sync.js:250-255) | VERIFIED | — | — |
| S3-9 | One pass = push then pull, then `sync_complete` | VERIFIED | sync.js:88-99 | — |
| S3-10 | TABLES order (syncCore.js:25) | VERIFIED | — | — |
| S3-11 | Single flight: `run()` returns the running pass; `runExclusive`; a job clears `running` only if it is still its own promise | VERIFIED | syncRunner.js:12-38 | — |
| S3-12 | Exceptions swallowed per row and per table (:717-719, :742-744) | VERIFIED | — | — |
| S3-13 | Push: deleted → cloud DELETE (skipped without remote_id) → local hard delete | VERIFIED | syncCore.js:648-655 | — |
| S3-14 | Push 0 rows (same session): protocols revive; vials / dose_logs with live parent → `reinsertRow`; calc_snapshots → reinsert; every other table → local delete | VERIFIED (code) | syncCore.js:688-704 | The **consequence** is missing everywhere in the TRD: the re-insert resurrects a row another device deleted (see S3-31) |
| S3-15 | `pushPurge` (:289-312), legacy path `optional_pending='purged_at'` | VERIFIED | — | — |
| S3-16 | Children wait for `protocol_remote_id` / purged parent | VERIFIED | syncCore.js:662-665 | — |
| S3-17 | UPDATE via `writeWithOptionalRetry` (drops a missing optional column up to 4×) | VERIFIED | syncCore.js:388-399 | — |
| S3-18 | protocols after UPDATE: clear `restored_at` / `status_at`, adopt the cloud status if no `status_at` (:676-686) | VERIFIED | — | — |
| S3-19 | INSERT path; calc_inputs upsert; protocols `updateChildRemoteIds` | VERIFIED | syncCore.js:706-715; sync.js:135-138 | — |
| S3-20 | `markSynced` only if local `updated_at` unchanged; stamps the cloud `updated_at` | VERIFIED | syncCore.js:47-65 | — |
| S3-21 | Pull rule table (none → import with childGate; synced → overwrite + optional merge + purge; Stop wins; pending protocol + purged_at; pending protocol without status_at takes the status; other pending → local wins) | VERIFIED | syncCore.js:586-636 | — |
| S3-22 | `enforceSingleOpenCheck` (:789-799), `selfHealProtocols` (:755-783) under a verified same-user session (sync.js:167-195) | VERIFIED | — | — |
| S3-23 | Full import: 500 per page ordered by `created_at`, existing rows skipped (never updated), absence delete except `NO_ABSENCE_DELETE`, runs when no protocol row, also AgeConfirmScreen.js:85 | VERIFIED | sync.js:216-232; syncCore.js:603-610, 817-850; AgeConfirmScreen.js:85 | — |
| S3-24 | Protocol-less users full-import on every cold start / sign-in (08 G5) | VERIFIED | syncCore.js:847-850 | — |
| S3-25 | §3.6 base rule: row-level, device first, later push overwrites the whole row | VERIFIED | reproduced (H-3) | — |
| S3-26 | §3.6 per-table extra rules | VERIFIED | as cited | — |
| S3-27 | `calc_inputs` whole-payload LWW (04 §7, SUSPECTED) | VERIFIED (code) | B's pending row ignores the cloud on pull (mergeCloudRow :627 branch → "local wins"); push upserts B's payload (sync.js:136); `mergeCalcInputs` only merges onto the local copy | — |
| S3-28 | §3.7 tombstones; AUTO_PURGE_PAUSED = true (protocolEnd.js:188) | VERIFIED | — | — |
| S3-29 | F-1…F-6, F-9, F-12 | VERIFIED | offlineAlert.js; syncCore.js as cited; realityCheckSync.test.js:175 todo | — |
| S3-30 | F-7 / H-6 / DV-187: a write during a running pass waits for the next trigger | VERIFIED, with a scope note | sync.js:82-85, 102; syncRunner.js:23 | Happens only if the pass is still running when the 1.5 s debounce fires **and** the row's table was already read by `getPendingChanges` (it is read per table at loop time, :640). A write into a not-yet-pushed table goes up in the same pass |
| S3-31 | **H-1 / DV-182: deletes of non-protocol rows never reach a device that holds the row** | PARTLY | Core reproduced (B keeps the biomarker and the dose) | (a) For `dose_logs` / `vials` the delete hole is worse: B's later edit **re-inserts** the row into the cloud and A gets it back (reproduced). (b) Vials are listed as affected, but a vial is only ever tombstoned by Delete forever (protocolEnd.js:84-86 → purge), which **does** propagate through the protocol tombstone (`finishLocalPurge` drops synced children). The real vial exposure is only the resurrection path. (c) "Effect: B's next edit … deletes it locally or re-inserts (`calc_snapshots`)" omits the dose_logs / vials re-insert |
| S3-32 | **H-2 / DV-088: reality_checks edits do not propagate**; the client never sends `updated_at` | VERIFIED | live: no trigger on reality_checks; no `updated_at` in any payload (`toCloudPayload`, `pushPending` adds only `user_id`, `reinsertRow` adds `id`, `writeTombstone` / `resendOptional` neither); reproduced (B stays at 2500) | Note: even if the client sent it, `set_updated_at` overwrites it with `now()` on the other tables, so the trigger is the only fix (as proposed) |
| S3-33 | **H-3 / DV-183: absolute counters, whole-row LWW** | VERIFIED | syncMappers.js:87, 109; reproduced: doses_taken / units_taken end at 4, not 5; A's note reverted by B's dose push | — |
| S3-34 | **H-4 / DV-001: `created_at` not sent for biomarkers, food_logs, calc_*, reality_checks, vaccines, vials** | PARTLY | Not sent for 8 tables that have a local `created_at`: vials, biomarkers, vaccines, food_logs, reality_checks, calc_snapshots, calc_targets, **calc_inputs**. Reproduced: B gets the cloud insert time | Headline #4 and DV-001 list 7 (omit calc_inputs); H-4's "calc_*" covers it. Use 8 everywhere |
| S3-35 | H-5 / DV-120 | VERIFIED | syncCore.js:847-850 | — |
| S3-36 | H-7 duplicate Missed rows; H-8 vial status has no device rule; H-9 sync completion re-plans only food + day-21 | VERIFIED | schema (no unique key); syncMappers.js:104-111 (vial `active` always sent); App.js:586-598 | — |
| S3-37 | H-10 `getLocalDataUserId` skips vials (database.js:820-829) | VERIFIED | database.js:822 list | — |
| S3-38 | H-11 / F-8 / DV-185: first INSERT has no client id | VERIFIED (code); duplicate on a lost response SUSPECTED | syncCore.js:707 payload has no `id`; the harness insert mints an id | — |
| S3-39 | **H-12 / DV-189: "the harness … never models delete propagation", "H-1 … cannot fail a test today"** | **WRONG** (half) | The harness's `delete` removes the row and `fetchSince` returns only live rows, which is exactly production. A two-device delete test fails today (reproduced) | Keep the trigger half (true for H-2). Replace the delete half with "no test asserts cross-device delete; the stock harness can express it today" |
| S3-40 | F-10 clock skew path (:58, :62-63) | VERIFIED | syncCore.js:57-63 | — |
| S3-41 | **F-11: offset paging "a row … can be skipped this pass (picked up next pass since its updated_at is newer)", "benign"** | **WRONG** | The row that is skipped is not the updated one but the row shifted across the page boundary. The watermark then passes it, and it is never fetched by incremental pulls again (sync.js:140-157; syncCore.js:731-735) | "Can lose a row on this device until a full import; needs keyset paging (`updated_at, id`) or a rewind". Rare (>500 changed rows per pull), not benign |
| S3-42 | §3.9 "Guaranteed today (with tests)" list | VERIFIED | sync.test.js (fix #3/#4/#5, full-import absence delete :160), realityCheckSync, purge*.test.js | — |
| S3-43 | §3.10 steps 1-5 | VERIFIED | syncMappers.js:142-145; syncCore.js:667-668, 675; database.js:555-577; sync.js:147 | — |
| S3-44 | §3.10 "insert sets `updated_at = now()` by default" | VERIFIED | live default `now()` | — |
| S3-45 | (missing) watermark vs `now()` = transaction start | **WRONG by omission** (counted here as a missed risk) | live `set_updated_at`: `NEW.updated_at = now()`; pull uses `gt(watermark)` | Add F-13: a row committed after a later-started transaction can sit below an already-advanced watermark; fix with a small rewind (e.g. watermark − 2 min, dedupe by id) or `clock_timestamp()` plus a rewind |
| S3-46 | (missing) `fullImport` never updates existing rows and pulls with `gt` only, so the H-1 absence delete is the **only** convergence path, and only for protocol-less users | **WRONG by omission** | syncCore.js:603-610, 832 | State it in §3.5: a device that has ever imported a protocol never runs an absence delete again |

**§3 counts:** 46 → **40 VERIFIED, 2 PARTLY (S3-31, S3-34), 4 WRONG (S3-39, S3-41, and the two omissions S3-45, S3-46), 0 UNVERIFIABLE**. S3-14 and S3-30 are VERIFIED with a scope note.

---

## §5 Invariants

Checked by a helper verifier, who ran all 34 cited test files (192 pass, 0 fail, 1 todo). I spot-checked INV-01, INV-23 and INV-44.

| ID | Verdict | Evidence | Correction |
|---|---|---|---|
| INV-01 | PARTLY | Code is true: App.js:664-736 is not async, has no inline `await` or `supabase.` call. signedOutHandler.test.js:40 only tests `lib/signedOut.onSignedOutNow`; the App check is a regex (:102) | "Tested now" overstated; `onSignedOutNow` / `bumpSignInGeneration` run inline by design |
| INV-02 | VERIFIED | 6 tests exist, mostly behaviour | No test for "Apple revoke" |
| INV-03 | VERIFIED | signOutCore.js:59-92; 3 test files | — |
| INV-04 | VERIFIED ("partial") | foldAndAccountGuards.test.js:32 is source-only and checks drafts / selections / questions only | — |
| INV-05 | VERIFIED | signedOut.js:72-116; wipePending, deletionTeardown | — |
| INV-06 | VERIFIED | supabase.js:26 `autoRefreshToken:false`; headlessAuthRefresh | — |
| INV-07 | VERIFIED | all 11 TABLES in delete-user list; deleteUserCoverage (source) | — |
| INV-08 | UNVERIFIABLE | device | — |
| INV-10 | PARTLY | BodyScreen.js:416 still writes user data to metadata | as the TRD says (A-14) |
| INV-11 | VERIFIED | purge* tests, behaviour | — |
| INV-12 | VERIFIED | syncCore.js:617-636 | Name the A-87 tests (endDeleteWins, syncMappers) |
| INV-13 | VERIFIED (partial) | — | — |
| INV-14 | UNVERIFIABLE | device | — |
| INV-15 | VERIFIED "violated" | reproduced in §3 (S3-31) | — |
| INV-16 | PARTLY | sync.test.js exists; harness masks H-2 (reproduced) | — |
| INV-20 | VERIFIED | notifications.js:228-231, 311-318, 390-399; nonDestructiveSchedule (9 tests) | — |
| INV-21 | VERIFIED | notifications.js:837-857; reminderRefresh AC6 behaviour | — |
| INV-22 | VERIFIED | notificationSwitches (7 behaviour) | `notifyNothingLogged` is in notificationActions.js:134 |
| INV-23 | PARTLY | AC5 (:91) and AC7 (:85) are source-only; `ensureDb` gap confirmed | — |
| INV-24 | PARTLY | Code right (claim :51-60, inFlight :147-167) | **No test** of response de-duplication exists |
| INV-25 | VERIFIED | package.json:70; plugin; AC11 (config) | — |
| INV-26 | VERIFIED | androidKeepRules (3) | — |
| INV-27 | UNVERIFIABLE | no named test | — |
| INV-30 | VERIFIED | i18n.test.js 5 tests; `substance_boldenone` missing ×6 confirmed | — |
| INV-31 | UNVERIFIABLE | human | — |
| INV-32 | PARTLY | offenders at cited lines; `lib/vialExpiry.js:30-35` exists; LIGHT / DARK keys equal (37/37) but no test checks it | BodyMapModal.js:96 is commented as a declared fixed surface |
| INV-33 | UNVERIFIABLE | manual | — |
| INV-34 | UNVERIFIABLE | "partial grep tests" not named | Name them |
| INV-35 | PARTLY | serverPrivacyLogs covers only extract-bloodwork; **scanCopy is quota copy, not the AI line** | Correct "Tested now" |
| INV-36 | UNVERIFIABLE | no named test | — |
| INV-40 | PARTLY | localToday.test.js:60 exists (source walk) | Source cite localDate.js:1-7 is the comment; function :8-13 |
| INV-41 | PARTLY | curveDstDoses guards the curve only | Fixed-ms day windows remain: missedDoses.js:110, pendingYesterday.js:97, schedule.js:207, doseActions.js:189 |
| INV-42 | VERIFIED | schedule.js:41-42; CalculatorSection.js:94-97; notificationPlan.js:29-31 | — |
| INV-43 | UNVERIFIABLE | no test (as stated) | — |
| INV-44 | PARTLY | missedDoses.js:186-208 is the A-49 watermark guard | Cite `zoneSlots` missedDoses.js:54-66 + zoneHistory.js; test zoneSafeSlots.test.js |
| INV-45 | PARTLY | mechanism confirmed (serumModel.js:84-88 snaps relative to the window) | script not re-run |
| INV-50 | VERIFIED | entitlementGuard.test.js:42 | — |
| INV-51 | VERIFIED | serverPlanParity (behaviour) | — |

**§5 counts (38 rows):** VERIFIED 19, PARTLY 11, WRONG 0, UNVERIFIABLE 8. (The helper scored INV-15 UNVERIFIABLE and INV-45 PARTLY-pending; I reproduced H-1, so INV-15 "violated" is VERIFIED.)

---

## §6 Time and dates

| ID | Claim | Verdict | Evidence / correction |
|---|---|---|---|
| T6-1 | Scan quota UTC month (extract-bloodwork :159-160); food quota by client `entry_date` | VERIFIED | — |
| T6-2a…d, g, h, i | `localISO` exists; dayKeyAt / parseDayKey / startOfLocalDay / wallTimeOn / msUntilNextLocalMidnight / sameLocalDay "replaces" cites | VERIFIED | missedDoses:162-165 is end of day |
| T6-2e | addLocalDays cites | PARTLY | Missing nutrition.js:146-154, foodEntryDay.js:17-31 |
| T6-2f | daysBetween cites | PARTLY | protocolEnd:124-128 is a same-day check; ProtocolsScreen:2218 is elapsed days. Missing schedule.js:41-42, foodEntryDay.js:26 |
| T6-3a | 21 formatter cites in §6.3 | VERIFIED | each a padded getFullYear / getMonth+1 / getDate formatter |
| T6-3b | LogScreen.js:379 unpadded 0-based key | VERIFIED | — |
| T6-3c | CalculatorSection.js:92-97 is a formatter copy | **WRONG** | :92 already calls `localISO()`; :94-97 is daysBetween |
| T6-3d | protocolAssistant:36-38, protocolForm:21-23 | VERIFIED | — |
| T6-3e | ProtocolsScreen.js:1503, 1514 | PARTLY | key built from picker parts; same pattern missed at schedule.js:152, protocolForm.js:174 |
| T6-3f | toDateString list (9 sites, 4 files) | VERIFIED | complete |
| T6-3g | "Formulas identical (08:D7)" | VERIFIED | except LogScreen:379 and the UTC variant in foodEntryDay |
| T6-4 | Rule 4: TodayScreen.js:356-381 + dayChange.js; others don't re-date | VERIFIED | only TodayScreen imports dayChange |
| T6-5 | Rule 5 server buckets | VERIFIED | — |
| T6-6 | S-78 "~25 copies" | PARTLY | measured: 24 copies in 21 files (+4 from-parts, +1 UTC, +9 toDateString) |
| T6-7 | DV-171 "about 18 files" | **WRONG** | 21 files (24 with variants). PRD G-124 "~15 places" also low |
| T6-8…T6-10 | §6.1 concept table; DST rule (calendar stepping); travel rule refs | VERIFIED | — |

**§6 counts (24 claims, grouped rows expanded):** VERIFIED 18, PARTLY 4, WRONG 2, UNVERIFIABLE 0.

---

## §7 Testing

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| T7-1 | `node --test` 1,872 / 1,871 pass / 0 fail / 1 todo (realityCheckSync.test.js:175), ~1.7 s | VERIFIED | my run: tests 1872, pass 1871, fail 0, todo 1, 1672 ms | — |
| T7-2 | Runner picks up `docs/research/bmr-calculator/reference/energy.test.ts` | VERIFIED | present in output | — |
| T7-3 | 256 entries = 255 test files + helpers (extractFn, syncHarness, modalStacking, localISO.cjs) | VERIFIED | `ls __tests__` | — |
| T7-4 | "184 of 255 files read app source text … many assert code shape" | PARTLY | 184 files call `readFileSync`, but: **45 pure source-text**, **139 mixed** (also require app modules / run extracted functions / use the harness), **68 behaviour only**, 3 other | Report 45 / 139 / 68 / 3; "184 source-text test files" (R-27, DV-173) overstates |
| T7-5 | 28 use the sync harness | VERIFIED | grep `syncHarness` = 28 files | — |
| T7-6 | Guard-style tests listed exist | VERIFIED | entitlementGuard, deleteUserCoverage, localToday, i18n, androidKeepRules, serverPlanParity | — |
| T7-7 | Harness blind spots: stamps every table (syncHarness.js:67-68) | VERIFIED | reproduced | — |
| T7-8 | Harness "never models … hard delete invisible to another device" | **WRONG** | see S3-39 | — |
| T7-9 | spec-audit FAIL, 31 blocking, 2 warnings; BK 22 partial, BR-9/10, EA-7, FR-6, RL-1, SP-9, RG-6/7/8; admin-panel and premium-and-auth unsigned | VERIFIED | my run, identical | — |
| T7-10 | No test renders a screen | VERIFIED | no react-test-renderer / testing-library / render( in __tests__ | — |
| T7-11 | `scripts/sim-load-main.sh`; agent-device 0.21.24; no repo script uses agent-device | VERIFIED | `agent-device --version` 0.21.24; no hit in scripts/ | — |
| T7-12 | §7.2 / §7.3 target layers and gates (PROPOSED items) | PARTLY | content fine, but L2/L3/L4 cite PROPOSED files without the label (see Missing files) | Label them |

**§7 counts (12):** VERIFIED 9, PARTLY 2, WRONG 1.

---

## PLAT and DOCS divergence rows (28)

| DV | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-010 | calc_inputs: B's pending payload overwrites A's keys | VERIFIED (code; device SUSPECTED as stated) | S3-27 | — |
| DV-182 | Non-protocol deletes never reach B | PARTLY | S3-31 | Add the dose / vial resurrection on A; vial deletes via purge do propagate; "no test covers it (the harness never models it)" → the harness can, no test asserts it |
| DV-183 | Absolute counters + whole-row push | VERIFIED | reproduced | — |
| DV-184 | Headless action: `getSession` may refresh; `ensureDb` sets ready on throw; claim stored before the write | VERIFIED | notificationActions.js:31-36, 155-161 (`claim` before `runAction`); doseActions.js:178 `getCachedUser` | — |
| DV-001 | created_at not sent for 7 tables; protocols fixed; pull never updates a local created_at (:408) | PARTLY | 8 tables (calc_inputs omitted); :408 confirmed | Say 8 |
| DV-088 | reality_checks: no trigger live + client never sends updated_at | VERIFIED | live + code + reproduction | — |
| DV-185 | First INSERT has no client id | VERIFIED (code) | S3-38 | — |
| DV-117 | Fold: tap targets land on the left page; Progress focus dropped | VERIFIED (code) | TodayScreen.js:171-175 handles focusDose in the list only; ProgressScreen.js:44, 65-66 drop params when embedded | — |
| DV-118 | spec-audit 31 blocking; premium-and-auth unsigned | VERIFIED | my run | — |
| DV-119 | 29 / 12 / 15; no core DDL; vaccines DDL short; unused columns; type mismatch; "several migrations say NOT APPLIED" | VERIFIED | live + repo | Add: those 3 "NOT APPLIED" headers (protocol_ended_at, _history_from, _purged_at) are applied live; repo versions differ from live versions |
| DV-120 | `isLocalDBEmpty` = no protocols | VERIFIED | syncCore.js:847-850 | — |
| DV-187 | Write during a pass waits | VERIFIED | S3-30 | Add the scope note |
| DV-188 | parse-food-next v2 ACTIVE; decision to remove (decisions.md:513) | VERIFIED | live; decisions.md:513 | — |
| DV-189 | Harness stamps every table; never models delete propagation; DV-182 cannot fail a test | PARTLY | first half true; second half wrong (S3-39) | Fix the delete half |
| DV-169 | getLocalDataUserId skips vials | VERIFIED | database.js:822 | — |
| DV-170 | Hard-coded colours: ErrorBoundary, FeatureIcon `#000000`, settingsLegacy, BodyMapModal palette | PARTLY | all at the cited places; BodyMapModal.js:96 is commented as a deliberately fixed light surface (an allowed case) | Drop or justify BodyMapModal |
| DV-171 | Day-key formula in "about 18 files" | **WRONG** | 24 copies in 21 files | "21 files (24 with variants)" |
| DV-172 | Today focus syncs only through the purge cleanup | VERIFIED | TodayScreen.js:323, 597-602 | — |
| DV-173 | 184 of 255 test files read source text | PARTLY | T7-4 | 45 pure / 139 mixed |
| DV-174 | STATE.md tracked; no secret found | VERIFIED | `git ls-files STATE.md`; 0 hits for sk-ant / service_role / eyJhbGci / private key | — |
| DV-011 | delete-user omits profiles / ai_assistant_usage, lists two absent tables | VERIFIED | delete-user/index.ts:112-139; live table list; cascades live | — |
| DV-175 | decisions.md:459 "let go after 7 days" vs code | VERIFIED | decisions.md:459 text | — |
| DV-176 | features.md statuses stale (A-86 / A-87 / A-89 "Not started") | VERIFIED (sample) | features.md:225, 227, 230 say "Not started"; A-87 logic is in syncMappers.js:89-99 | — |
| DV-177 | app-map stale rows (L-12 "≤2 doses", L-13 start_date overwrite, L-21 AsyncStorage) | VERIFIED (sample) | app-map.md:80, 81, 89 | — |
| DV-178 | APP-HANDOFF outdated | UNVERIFIABLE (not read in full) | docs/APP-HANDOFF.md exists | — |
| DV-179 | Spec rows superseded but not amended | PARTLY | not re-checked row by row; spec-audit parses | — |
| DV-180 | decisions.md :459, :144, :546 ("~10 half-lives", code 30), :214 out of step | VERIFIED | decisions.md:459, :144, :546, :214 contain the quoted text; the code bound is 30 half-lives (lib/curveSampling.js:3, :8 `30 * entry.hours`); serumModel.js:93 is the separate 6-half-life lookback | — |
| DV-181 | Dead code / stale strings | PARTLY | see the §9 helper rows (R-47) | — |

**PLAT/DOCS counts (28):** VERIFIED 19, PARTLY 7, WRONG 1, UNVERIFIABLE 1.

---

## "Missing files" from 00-mechanical.md (28 references; the brief said 40, but the report lists 28)

| # | Doc | Reference | Class | Right path / note |
|---|---|---|---|---|
| 1 | DIVERGENCES | `lib/bodyPrefs.js` | PROPOSED, labelled ("New owner `lib/bodyPrefs.js`", DV-006 fix) | — |
| 2 | DIVERGENCES | `lib/protocolName.js` | PROPOSED, labelled ("New `lib/protocolName.js`", DV-013) | — |
| 3 | DIVERGENCES | `supabase/schema.snapshot.js` | PROPOSED, **unlabelled** (the checker cut `.json`) | `supabase/schema.snapshot.json`, label PROPOSED in DV-119 / DV-088 / DV-189 |
| 4 | TRD | `modules/dt-exact-alarm/android/.../RefreshOnUpdateReceiver.kt` | WRONG PATH (elided) | `modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/RefreshOnUpdateReceiver.kt` |
| 5 | TRD | `lib/deviceKeys.js` | PROPOSED: labelled at L394, **unlabelled** at L868 | label L868 |
| 6 | TRD | `lib/accountMeta.js` | PROPOSED: labelled L417, unlabelled L868 | label L868 |
| 7 | TRD | `lib/doseDay.js` | PROPOSED, labelled (L624) | — |
| 8 | TRD | `lib/todayModel.js` | PROPOSED: labelled L626 / L634, unlabelled L870 | label L870 |
| 9 | TRD | `lib/trackerStreak.js` | PROPOSED, labelled (L630) | — |
| 10 | TRD | `lib/vialState.js` | PROPOSED: labelled L646, unlabelled L868 | label L868 |
| 11 | TRD | `lib/freeLimit.js` | PROPOSED, labelled (L654) | — |
| 12 | TRD | `lib/protocolName.js` | PROPOSED: labelled L657, unlabelled L868 | label L868 |
| 13 | TRD | `lib/progressModel.js` | PROPOSED: labelled L681, unlabelled L870 | label L870 |
| 14 | TRD | `__tests__/ownershipGuard.test.js` | PROPOSED, **unlabelled** (L804 "Must be tested by", L868) | add "PROPOSED" |
| 15 | TRD | `lib/useLocalDay.js` | PROPOSED, labelled (L845) | — |
| 16 | TRD | `i18n.test.js` | not missing: bare name; file is `__tests__/i18n.test.js` (L857) | checker false positive; write `__tests__/i18n.test.js` |
| 17 | TRD | `docs/product/ownership.js` | PROPOSED, labelled (L868, `ownership.json`, cut by the checker) | — |
| 18 | TRD | `lib/x.js` | not a file reference: a placeholder in the example JSON shape (L868) | — |
| 19 | TRD | `supabase/schema.snapshot.js` | PROPOSED, **unlabelled** (L869, L872, L928; `.json`) | label PROPOSED |
| 20 | TRD | `lib/journeyModel.js` | PROPOSED, **unlabelled** (L870) | label |
| 21 | TRD | `lib/bodyModel.js` | PROPOSED, **unlabelled** (L870) | label |
| 22 | TRD | `scripts/run-journeys.cjs` | PROPOSED, labelled (L871) | — |
| 23 | TRD | `scripts/schema-check.cjs` | PROPOSED, labelled (L872) | — |
| 24 | TRD | `__tests__/themeContrast.test.js` | PROPOSED, labelled (L891) | — |
| 25 | 03-reminders | `modules/dt-exact-alarm/android/.../RefreshOnUpdateReceiver.kt` | WRONG PATH (elided) | as #4 |
| 26 | 03-reminders | `modules/dt-exact-alarm/.../DtExactAlarmModule.kt` | WRONG PATH (elided) | `modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt` |
| 27 | 03-reminders | `modules/expo-background-task/android/.../BackgroundTaskScheduler.kt` | WRONG PATH (wrong root) | `node_modules/expo-background-task/android/src/main/java/expo/modules/backgroundtask/BackgroundTaskScheduler.kt` |
| 28 | 08-platform | `modules/dt-exact-alarm/android/.../RefreshOnUpdateReceiver.kt` | WRONG PATH (elided) | as #4 |

**Counts (28 refs):** PROPOSED and labelled at every use **10** (#1, 2, 7, 9, 11, 15, 17, 22, 23, 24) · PROPOSED, labelled at first use but **unlabelled** at a later use **6** (#5, 6, 8, 10, 12, 13; all at TRD L868 / L870) · PROPOSED and **never labelled** **5** (#3, 14, 19, 20, 21) · WRONG PATH **5** (#4, 25, 26, 28 elided `.../`; #27 wrong root `modules/` instead of `node_modules/`) · not a file reference **2** (#16 bare name of an existing test, #18 placeholder).

---

## §9 Risk register (R-01…R-50)

A helper verifier checked R-02…R-50 against the code. I checked the sync rows (R-01, R-05, R-06, R-26, R-28, R-29) and the live rows (R-24, R-25) myself.

| ID | Verdict | Evidence | Correction |
|---|---|---|---|
| R-01 | PARTLY | reproduced (S3-31) | Add the dose / vial resurrection on the deleting phone |
| R-02 | VERIFIED | aiConsent.js:19, 25-35; not in `runWipeSteps` (signedOut.js:158-163) or either guard | — |
| R-03 | VERIFIED | notificationPlan.js:35-58; schedule.js:40-45; protocolForm.js:143 (`schedule_total` always null); TodayScreen.js:1675-1683; adherenceRings.js:30 (12:00); serumModel.js:28, 126 | — |
| R-04 | VERIFIED | spec-audit: 31 blocking, 2 warnings | — |
| R-05 | VERIFIED | reproduced (S3-33) | — |
| R-06 | VERIFIED | live + reproduced (S3-32) | — |
| R-07 | VERIFIED | CalculatorSection.js:299, 569-592, 853, 1439; notifications.js:609-640; realityCheckRules.js:126-132 | — |
| R-08 | VERIFIED | adherenceRings.js:45-66: the matching pool holds every Taken log, not only logs inside each slot's window | The code follows AD-06's "± half interval" wording; the defect is the unbounded pool |
| R-09 | VERIFIED | SettingsScreen.js:390-401; TodayScreen.js:626, 796-805 | — |
| R-10 | VERIFIED | syncMappers.js:117-121; syncCore.js:527-531; BodyScreen.js:824; reproduced (created_at row) | — |
| R-11 | VERIFIED | progressTile.js:43-57; CalculatorSection.js:689-710 | "5 rules" not recounted |
| R-12 | VERIFIED | SerumCurveScreen.js:316 vs JourneyScreen.js:109, BodyScreen.js:402 | DST half not re-run |
| R-13 | VERIFIED | ProtocolsScreen.js:584, 1317-1318; markTaken.js:229-234; database.js:251-257; protocolForm.js:166-181 | — |
| R-14 | VERIFIED | reminderHealth.js:71-78, 90-97, 105-108; SettingsScreen.js:237 | — |
| R-15 | VERIFIED | notificationPlan.js:307-308; backgroundTasks.js:76; notifications.js:1079 | — |
| R-16 | VERIFIED | parse-food/index.ts:160-171 (quota only); no limit trigger live (live triggers list) | — |
| R-17 | VERIFIED | TodayScreen.js:1163-1184; notifications.js:247, 929, 1166 (Taken only) | — |
| R-18 | VERIFIED | App.js:586-598, 574 | — |
| R-19 | VERIFIED | BodyScreen.js:410-439, 286, 1044, 1215 | Lines 410-439 |
| R-20 | VERIFIED | keys absent from every wipe path | Nuance: the entitlement cache and food draft are keyed by uid (they outlive sign-out but don't leak); the cross-account risk is in the global keys (`missed_since`, `vial_low_sent`, `alert_snooze`, `entitlement_last_uid`) |
| R-21 | VERIFIED | BodyScreen.js:609, 1067-1068 | — |
| R-22 | VERIFIED | TodayScreen.js:1544, 1576 (no `openProtocolId`) | — |
| R-23 | PARTLY | notifications.js:253; SettingsScreen.js:407; notifications.js:543 | Evidence 05:D4 belongs to DV-153, which is missing from the DV column |
| R-24 | VERIFIED | live 29; 12 repo names all present live → 17 live-only; no core DDL | Add: repo version stamps differ from live |
| R-25 | VERIFIED | live `list_edge_functions`: parse-food-next v2 ACTIVE | — |
| R-26 | PARTLY | harness stamps every table (syncHarness.js:67-68; the helper's "66-67" is wrong) | The "delete propagation" half is wrong (S3-39) |
| R-27 | PARTLY | 184 `readFileSync` files, but only 45 are pure source-text (T7-4); no renderer | Restate the figure |
| R-28 | VERIFIED | S3-30 | Scope note |
| R-29 | VERIFIED (code; duplicate SUSPECTED) | S3-38 | — |
| R-30 | VERIFIED | syncCore.js:847-850 | — |
| R-31 | VERIFIED | TodayScreen.js:323, 597-603; protocolEnd.js:188, 202-203 | — |
| R-32 | VERIFIED | notificationActions.js:31-36; supabase.js:20-25, 42 | — |
| R-33 | VERIFIED | RefreshOnUpdateReceiver.kt:24-25 `Class.forName(...)` | — |
| R-34 | VERIFIED | BackgroundTaskScheduler.kt:94 `NetworkType.CONNECTED` | — |
| R-35 | VERIFIED | doseActions.js:186 `getActiveProtocols` | duplicates SUSPECTED |
| R-36 | VERIFIED | no day-change hook in CalculatorSection / SerumCurveScreen | — |
| R-37 | VERIFIED (as SUSPECTED) | auth-js returns `session:null` on failed refresh; App.js `setSession` | device proof owed |
| R-38 | VERIFIED | SettingsScreen.js:298-301, 320-342 | Severity mismatch: TRD P2 vs DV-008 S1 |
| R-39 | VERIFIED | AgeConfirmScreen.js:62-77, 152; OnboardingFlowScreen.js:295 | — |
| R-40 | VERIFIED | CalculatorSection.js:569-575, 692 | — |
| R-41 | VERIFIED | FoodEntryEditor.js:86, 91, 158 | Severity mismatch: TRD P2 vs DV-003 S1 |
| R-42 | VERIFIED | oralMath.js:119-125; ProtocolsScreen.js:483 | — |
| R-43 | VERIFIED | extract-bloodwork/index.ts:85; exportRecords.js:71, 133 | — |
| R-44 | VERIFIED (structure) | SettingsScreen.js:809 in-app; legalLinks.js:6 web | text difference not compared |
| R-45 | VERIFIED | App.js:73, 75, 80 | — |
| R-46 | PARTLY | BodyMapModal.js:96 is a declared fixed surface; `settingsLegacy` sits on a solid accent card; every FeatureIcon caller passes `color`; `expiryColor` is never called | Only R-45 is a visible bug; move `expiryColor` to R-47 |
| R-47 | VERIFIED | every symbol grep-checked as unused (dosePageState.js:103; TodayScreen.js:29, 296, 460, 1425-1447; database.js:425; nutrition.js:27, 127, 511; ProtocolsScreen.js:1060, 1419; App.js:364; SettingsScreen.js:68-70; 4 strings only in translations.js) | — |
| R-48 | VERIFIED (spot-check) | app-map.md L-13, L-20, L-21 stale | — |
| R-49 | VERIFIED | database.js:820-829 | — |
| R-50 | VERIFIED | 0 hits for `substance_boldenone`; SerumCurveScreen.js:948, 1028; notifications.js:90 | A raw key on screen is P1 by the TRD's own definition (TRD P3, DV-070 S2) |

Cross-references: every DV / AD / DL / OPEN ID in §9 exists and matches its topic, except R-23 (missing DV-153).

**§9 counts (50):** VERIFIED 45, PARTLY 5 (R-01, R-23, R-26, R-27, R-46), WRONG 0, UNVERIFIABLE 0. Severity mismatches with DIVERGENCES: R-38, R-41, R-50.

---

## Grand total

360 claims checked: **298 VERIFIED · 40 PARTLY · 10 WRONG · 12 UNVERIFIABLE**. Separately, the 28 "missing file" references break down as 10 labelled PROPOSED, 6 labelled only at first use, 5 never labelled, 5 wrong paths and 2 not file references.

None of the TRD's headline findings is false. H-1, H-2 and H-3 reproduce exactly with the repo's own harness, and the live schema matches §1.6 / §2.2. The errors are in scope, mechanism and test claims:
- the delete hole also resurrects deleted doses;
- the harness *can* catch H-1 today;
- offset paging is not benign;
- a transaction-time watermark race is missing;
- the test-kind figure is overstated;
- several counts and paths are wrong.
