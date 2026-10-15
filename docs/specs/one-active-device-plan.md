# A-119 one active device — implementation plan (2026-10-15)

Read-only plan by the Plan agent over the signed checklist docs/specs/one-active-device.md (OD-1..OD-18), DL-102..DL-108 and the 2026-10-15 amendment (sign-out never blocked). Nothing here is built. Founder items are at the end.

## 0. Gaps before code
- Texts not in the approved picture (OD-12 needs approval): (1) a phone taking over that had its own unsent records (DL-104/OD-15; 2b's "log it again on the other device" is wrong for this phone); (2) account deleted on another phone (OD-10/DL-85); (3) update required (DL-105/OD-17 — the check ships in 1.3.0, so its text does too); (4) kind plurals beyond doses/weigh-ins (food entry, lab value, vaccine, protocol change, vial, goal, result, calculator) ×6; (5) sheet 3 edge cases (omit "Last full backup" with no date; omit the count line when unreadable — by logic).
- Device id: Android `Application.getAndroidId()` (expo-application 7.0.8 already compiled via expo-notifications; add `"expo-application": "~7.0.8"` to package.json); iOS keychain id via expo-secure-store `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Label: `Platform.constants.Model` on Android, 'iPhone'/'iPad' on iOS.
- iOS has no background run (lib/backgroundTasks.js:6-10): a replaced iPhone keeps firing already-scheduled local reminders until it is opened. Only Android meets OD-16's background part.
- Old 1.2.x phones: once a 1.3.0 phone registers on the account, a 1.2.x phone on that account stops backing up silently (rows pending forever, no message — it has no code for one). DL-105 as decided.

## 1. Server
Synced tables (lib/syncCore.js:25): protocols, vials, dose_logs, biomarkers, vaccines, food_logs, reality_checks, calc_snapshots, calc_targets, reality_check_open, calc_inputs; plus push_tokens (insert/update guarded). user_metadata cannot be refused by the database → guarded on the phone.
- Header `x-dt-device` on every request (global fetch wrapper in lib/supabase.js:13), read with `current_setting('request.headers', true)::json->>'x-dt-device'`.
- PostgREST pre-request hook `pgrst.db_pre_request` on the 11 table paths raises SQLSTATE DT001 (not active) / DT002 (device id required) before any query — never a silent empty result (today a 0-row update deletes the local row, syncCore.js:688-703).
- Statement-level BEFORE INSERT/UPDATE/DELETE triggers on every synced table (fire even with 0 rows).
- OD-3: guarded writes take FOR SHARE on account_devices; claim_device takes FOR UPDATE (read-only GETs skip the lock).
- Exempt: service role and no-user requests. Old clients without a device id pass only while the account has no account_devices row.
- Last sign-in wins: claim records auth.sessions.created_at; an older delayed `signin` claim → `superseded` (server-confirmed replaced).
- Background check without a token refresh: claim returns a random secret (phone keeps it in the keychain, server keeps sha256); anon `device_status_by_secret`.
- Server keeps per device whether a rebuild is owed and which takeover notice is pending.
- Migration supabase/migrations/20261016000000_one_active_device.sql (additive): tables account_devices, user_devices, app_config(min_version); RLS on, no policies, revoke from anon/authenticated (RPC only); push_tokens.device_id; functions dt_header, dt_require_active_device, dt_device_guard (12 explicit triggers), dt_pre_request (+ `alter role authenticator set pgrst.db_pre_request`), claim_device(p_device, p_label, p_platform, p_app_version, p_mode signin|use_here|silent), device_status, release_device, device_mark_sent, device_ack, device_status_by_secret; grants; rollback steps in the header (not applied). Full SQL draft: see the Plan agent report of 2026-10-15 (grok/306).
- delete-user: add user_devices/account_devices to userDataTables; 409 device_not_active when the header names a non-active device (no header → allowed, old builds); x-dt-device in CORS. Needs a deploy (founder go). send-reminders / wake-refresh unchanged (claim deletes other devices' tokens).

## 2. Phone
1. lib/deviceIdentity.js — getDeviceId (never regenerate on a throwing read; never cleared by sign-out/wipe), deviceLabel.
2. lib/supabase.js — deviceFetch header; updateUser wrapper (item 10); mark explicit sign-in around :174 (Google), :327 (Apple), lib/appleWeb.js:81; the Apple name write (:339) allowed while the claim is pending.
3. lib/activeDeviceRules.js (pure) — isDeviceRefusal (DT001/DT002 only); decide({status, claimPending, context}); anything unknown (network, timeout, 5xx, 401, PGRST202) → continue, never wipe; versionBelow.
4. lib/explicitSignIn.js — begin/consume (sync, safe in onAuthStateChange)/end; callers AuthScreen.js:247, :267, social() :182-205, recoveryLink.js:121 (switch account only), App.js :494, :503.
5. lib/syncCore.js rebuildFromCloud — fetch all first (any failure → untouched), then one transaction delete+importFromCloud.
6. lib/unsentSummary.js — {count, byKind, from, to, refused} equal to pendingForSignOut (lib/recoveryFlow.js:101); summaryText; key date_at_time.
7. lib/deviceVerdict.js — verdict + takeover notice outside wiped stores; secret in SecureStore (wiped).
8. lib/deviceFlow.js — afterExplicitSignIn (claim → summary → rebuild → ack → notice), beforeSync (pending claim first; no push while a rebuild is owed), onReplaced (summary → verdict → stop sync → cancel/dismiss notifications → screen 2/2b; never pulls; Continue → finishReplacedCore = finishDeletionCore generalised), onAccountGone, startup.
9. lib/sync.js — beforeSync first; refused pass short-circuits; device_mark_sent after a push that leaves 0 pending (sheet 3 "Last full backup").
10. user_metadata writes guarded by status (call sites listed in the report).
11. App.js — only `consumeExplicitSignIn()` added inline in onAuthStateChange; deferred SIGNED_IN: explicit → afterExplicitSignIn, otherwise status only; cold start: deviceFlow.startup before import/notifications; foreground: device check first; ThemedRoot deviceSheet (2/2b and 4 locked on any route; 1/1b only on Main after the gates); reset-link switch uses the one sheet.
12. One sign-out sheet (screens 3/3b) at Settings, 18+ sheet, profile gate, reset-link switch: signOutCore never blocked; release on 0 unsent; lib/signOutSheet.js builder; old blocked/notbacked copy and keys removed (rebuild = replace); requestAccountDeletion sends the header, 409 → replaced flow.
13. notifications.js:1050 upsert includes device_id.
14. Background run (Android) checks device_status_by_secret; replaced/gone → verdict, cancel all, skip resync.
15. DTSheet `locked` option (screens 2 and 4).
16. i18n ×6 (keys listed in the report); pt/en as drawn.

## 3. Tests (failing first)
Harness device model in __tests__/helpers/syncHarness.js (guard off by default; `cloud.as(deviceId)`, holdWrites, deferVisibility, phone helper). Two-device cases H1–H13 (OD-7 old-client characterization; DV-182, DV-183, DV-222, DV-209; OD-3 lock order; OD-15 rebuild; OD-10 update/ask/delete; OD-2 notices; OD-14 cold start; OD-17; OD-5 superseded). Unit tests: deviceIdentity, activeDeviceRules, explicitSignIn, unsentSummary, signOutNeverBlocked (rewrites the old blocked-sign-out pins), deviceVerdict, replacedFlow, backgroundDeviceCheck, activeDeviceMigration (SQL text), deleteUserCoverage, metadataGuard, pushTokenDevice, minVersion, a119Copy.

## 4. Order
1 harness + H1 · 2 rules + minVersion · 3 rebuild + H2/H7 · 4 pass logic + beforeSync + H3–H6/H12/H13 · 5 deviceIdentity + header · 6 migration file + text test (not applied) · 7 delete-user · 8 unsentSummary · 9 verdict/replaced flow/locked sheet/App startup + H11 · 10 explicit sign-in + notice + H10 · 11 screen 4 + H8 · 12 one sign-out sheet + release + mark-sent · 13 metadata guard · 14 background check + push token device · 15 account-gone + update prompt + H9 · 16 i18n ×6 + both themes + export · 17 Gate B + code review + dt-council + ship-check.

## Risks
Auth deadlock (nothing awaited inline); wipe only on a JSON replaced/superseded/account_gone; old clients never see a 0-row result; the pre-request hook is project-wide — rehearse on a Supabase branch (cost, founder OK) or a local stack, check `select rolconfig from pg_roles where rolname='authenticator'` first, keep the rollback ready; restored iPhone gets a new device id → screen 4; iOS keychain after reinstall must be proven on device.

## Needs the founder
"Pode aplicar" (migration, before any 1.3.0 build reaches testers); "pode publicar" (delete-user deploy); text approvals for gaps 1–5 and the other 4 languages; App Review notes / QA rule (OD-11); a Supabase branch for rehearsal (cost) or a local stack; device proof on two phones (OD-13/OD-18).
