# R2-04 — Round-2 verification of the TRD and the 8 dossiers

- Checked 2026-10-12 on branch `redesign/graduated`, HEAD `19e4ebc`. Code is the same as the code round 1 read: `git diff --stat 976ef9e HEAD -- . ':!docs'` is empty.
- Targets: `docs/product/TRD.md` (1,086 lines) and `docs/product/research/01..08-*.md`. Round-1 inputs: `verification/06-platform-trd.md` (all of it), plus the TRD and dossier rows of `verification/01`–`05` and `07`.
- Authority order: founder lines in `docs/decisions.md`, then the signed `docs/specs/*.md`, then code. Coordinator lines and "by logic" lines are not founder answers.
- Method: everything was read-only. I re-read the code at every file:line cited below. I did not run the test suite. I did not query production: every live claim is **UNVERIFIABLE-HERE**, and I checked it against the repo migrations and SQL instead. The scripts I wrote are in the session scratchpad, not in the repo:
  - `classify.cjs`: recounts the test kinds.
  - `budget.cjs`: recomputes the iPhone 64-notification cap from the real `doseBudget`.
  - `paths.cjs`: checks that every path the TRD cites exists.
  - `ids.cjs`: resolves every OPEN / AD / DL / DV ID against the registers.
- Verdicts:
  - **Part A:** APPLIED-CORRECTLY / APPLIED-BUT-STILL-WRONG / NOT-APPLIED / OVER-CORRECTED.
  - **Part B:** VERIFIED / PARTLY / WRONG / UNSUPPORTED (no source in the repo).
  - **Part C:** OK / STALE (the ID exists but no longer means what the TRD says) / MISSING-LINK.

## Summary counts

| Part | Items checked | Correct | Not correct |
|---|---|---|---|
| A. Corrections from round 1 | 81. These are 21 items from WRONG rows (9 TRD WRONG rows of 06; 8 TRD/dossier WRONG rows of 02, 03, 05, 01; 4 dossier WRONG items of 01, 02, 04). The other 60 come from PARTLY rows: all 40 PARTLY rows of 06, 14 TRD PARTLY rows of 01–04, and 6 TRD/dossier items from 03 / 06 / 07 X-10 | **72 APPLIED-CORRECTLY** | **6 APPLIED-BUT-STILL-WRONG · 1 NOT-APPLIED · 2 OVER-CORRECTED** |
| B. Fresh claims (S-xx, INV-xx, R-xx and other sections round 1 did not evidence line by line) | 97 | **89 VERIFIED** | **6 PARTLY · 1 UNSUPPORTED · 1 WRONG (new, see B-7)** |
| C. Cross-references | 153 distinct IDs: 23 AD, 31 DL, 12 OPEN, 87 DV; 256 citations. Every one exists. All 12 OPEN IDs (38 citations) were topic-checked, plus 41 others | 139 OK | **14 STALE / MISSING-LINK** |

Recount of the sync-specific items the brief asked for:

| Item | Result |
|---|---|
| Delete hole + edit-resurrects-delete (`lib/syncCore.js:688-703`) | Mechanism confirmed in the code. `pushPending` UPDATE finds 0 rows → `sameSession` → `liveParent` → `reinsertRow` with the same `remote_id`, at `:697`. On A, `mergeCloudRow` → no local row → `childAllowed` (A knows the protocol) → import. The TRD and dossier 08 state this correctly. The vial half is **over-stated**: see A-OC-2 below. |
| Offset paging (`lib/sync.js:140-157`) | Confirmed: `.order('updated_at').range(offset, …)` with no tie-break. F-11 / H-13 / TR-SYNC-11 are correct. F-11 misses a second trigger (B-6). |
| Watermark vs transaction time | Mechanism confirmed. Watermark = max local `updated_at` of synced rows (`syncCore.js:730-735`). Pull = `gt('updated_at', since)` (`sync.js:147`). The repo `set_updated_at()` is `NEW.updated_at = now()` (`supabase_vaccines_table.sql:24-30`, `supabase_food_logs_table.sql:37`). The live body is UNVERIFIABLE-HERE. F-13 / H-14 / TR-SYNC-12 are correct. Its register link and severity are stale (C-1, B-5). |
| `created_at` not sent | Confirmed for **8** tables. `lib/schema.js` gives a local `created_at` to vials (:69), biomarkers (:97), vaccines (:116), food_logs (:142), reality_checks (:160), calc_snapshots (:177), calc_targets (:202) and calc_inputs (:232). `toCloudPayload` sends it only for protocols (`syncMappers.js:103`) and reality_check_open (`:166`). |
| `reality_checks` has no `updated_at` trigger | Live: **UNVERIFIABLE-HERE**. Repo: `supabase_reality_checks_table.sql` creates the table, RLS and four policies, and **no trigger**. Every other synced table has one in repo SQL or migrations (vaccines, food_logs, calc_snapshots, calc_targets, reality_check_open, calc_inputs). For the four core tables there is no repo DDL (DR-2). So the repo matches the TRD claim. |
| Test kinds 45 / 139 / 68 / 3 | **Reproduced exactly**, with 255 `*.test.*` files and 184 that call `readFileSync`. Method: a file is "executes app code" when it `require`s / imports `../lib|screens|components|i18n|supabase|modules|plugins|scripts…`, or uses `extractFn`, or uses `syncHarness`. Then pure = readFileSync and not executes (45); mixed = both (139); behaviour = executes only (68); other = neither (3: `adm`, `androidKeepRules`, `iosLanguages`). 28 files use the harness. Caveat on the *label*: 27 of the 45 "pure source-text" files evaluate data or parse an AST. 19 run `i18n/translations.js` through `new Function`; 8 use `@babel/parser`. So "assert code shape, pass when the text exists" does not fit all 45. The count is right; the label is approximate. |
| Android update / boot receiver | Confirmed. The receiver is at `modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/RefreshOnUpdateReceiver.kt:18-33`, and the manifest registers `MY_PACKAGE_REPLACED` and `BOOT_COMPLETED` with `RECEIVE_BOOT_COMPLETED`. It enqueues the work as follows:<br>• it loads `expo.modules.backgroundtask.BackgroundTaskWork` by class name;<br>• it sets the input key `appScopeKey` to the package name;<br>• it uses unique work `DOSETRACE_REFRESH_AFTER_UPDATE` with `REPLACE` and no network constraint.<br>New check: the key's *value* (package name) is the same one expo uses (`node_modules/expo-background-task/android/src/main/java/expo/modules/backgroundtask/BackgroundTaskModule.kt:30`). The guard test `__tests__/updateRestore.test.js:45-53` pins the class name and key name, not the value. |
| iPhone 64-notification cap | **Recomputed. The TRD / dossier 03 / DV-053 thresholds are only partly right.** See A-ABSW-3. |

## Part A — corrections that are not correct

| # | Doc:line | Quoted text (short) | Verdict | Evidence | Correct statement |
|---|---|---|---|---|---|
| A-OC-1 | TRD.md:523 (§3.5, from 06 S3-46) | "this absence delete is the **only** path by which a device ever converges on a deletion … A device that has ever imported a protocol never runs an absence delete again" | OVER-CORRECTED | There are other convergence paths:<br>(1) B's own later edit of a deleted biomarker, vaccine, food_logs, calc_targets or reality_checks row → push finds 0 rows → `deleteLocalRow` (`syncCore.js:703`). The TRD's own H-1 row (:573) says this.<br>(2) An intended sign-out wipes the DB, and the next sign-in runs `fullImport`. A reinstall does the same.<br>(3) The protocol tombstone carries purged children.<br>The second sentence holds only as long as the device keeps its DB (the check is `isLocalDBEmpty`, `:847-850`). | "The incremental pull never sees a delete. Without TR-SYNC-2, a device converges on another device's delete only through: a full import (protocol-less users on every launch, or after a wipe / reinstall); its own later edit of a non-child row (deletions win locally); or the protocol tombstone for purged children." |
| A-OC-2 | TRD.md:22 (headline 1), :320 (§2.1 vials), :442 (§2.8), :573 (H-1), :992 (R-01); 08-platform.md:6, :340 | "doses **and vials** … a vial deleted elsewhere and edited here is re-inserted" / "Vials are exposed only through this resurrection path" | OVER-CORRECTED (vial half only; the dose half is right) | Resurrection needs the cloud vial row gone while its protocol is live. In 1.3.0 a vial is removed in the cloud only by a purge:<br>• tombstone in `protocolEnd.js:86` (purge) and `:212` (auto-purge, which `AUTO_PURGE_PAUSED = true` at `:188` disables);<br>• `pushPurge` / `protocols_purge_children`;<br>• no other vial delete path exists (grep `DELETE FROM vials` → only `clearLocalDatabase`, `database.js:733`).<br>After a purge, B's `reinsertRow` is refused by `refuse_child_of_purged_protocol` and returns `{refused}` (`syncCore.js:116-117, 697-698`). | "The vial re-insert path exists in code. It is reachable only if a cloud vial was removed while its protocol was live, which no 1.3.0 path does (older builds could). The live exposure is dose_logs, including Missed rows tombstoned by an inactivity End (`protocolEnd.js:67`)." |
| A-NA-1 | TRD.md:1037 (R-46, Decision column) | "AD-41, **DL-16**" | NOT-APPLIED (verification/01 DL-16 WRONG) | OPEN-DECISIONS.md:571: "DL-16 **→ AD-65**, corrected 2026-10-12". AD-65 (:548) is the founder's Q9 = B coloured days. | "AD-41, AD-65" |
| A-ABSW-1 | TRD.md:676 (S-40, Owner cell) | "PROPOSED `lib/reminderHealth.js hasReminderTime(p)` = `sortedDoseTimes(p).length > 0`" | APPLIED-BUT-STILL-WRONG (verification/03 S-40) | The correction was appended to the Sweep cell, but the Owner cell keeps the rejected definition. `sortedDoseTimes` (`lib/schedule.js:23-25`) returns `[]` for a null `reminder_time`, which is exactly the "real times only" rule the correction says contradicts DL-06. The row now contradicts itself. | "Owner = `hasReminderTime(p)` = the protocol has a slot under S-01's single slot list (a no-time protocol counts once DL-06 / OPEN-19 (c) fixes the default)." |
| A-ABSW-2 | TRD.md:634 (S-01, Sweep) | "decided: **DL-06** — no-time protocols use **the form's default slot list** everywhere; verification/07 X-10" | APPLIED-BUT-STILL-WRONG (07 X-10 applied, then overtaken by the reclassification) | OPEN-DECISIONS.md:561 says DL-06 is narrowed: "which default (08:00, what the phone does, or the form's defaults) → **OPEN-19 (c)**". The recommendation there is 08:00. The TRD contradicts itself: S-40 (:676) says "08:00 default slots". | "one slot list everywhere (DL-06); which default — 08:00 or the form's defaults — is **OPEN-19 (c)**." |
| A-ABSW-3 | TRD.md:198 (§1.4 iOS row); 03-reminders.md:790, :819; also DV-053 | "the budget overflows at ≥ 23 protocols with no vials, ≥ 21 protocols with ≥ 3 vials, or **≥ 14–15 active vials**" | APPLIED-BUT-STILL-WRONG | I recomputed with the real `doseBudget` (`notificationPlan.js:301-310`): total = 40 − min(V, 8), share = min(24, max(2, ⌊total/n⌋)). Daily protocols with enough slots in the window were assumed; follow-ups count against the share (`notifications.js:288-305`). On top of that come:<br>• V expiry alerts (one each, `vialExpiryPlan`);<br>• up to 7 morning summaries;<br>• 1 weekly check-in;<br>• 1 day-21 alert;<br>• up to 7 food nudges;<br>• ≤ 4 snoozes;<br>so extras are 20 at worst.<br>Minimum vial counts that overflow 64: 13 with 2, 4, 8 or 16 protocols (share × n = 32); 15 with 3, 5 or 10 protocols; 21 with 1 protocol. "≥ 14–15" is true only for some protocol counts. Also: 19 protocols with 8 vials overflow. **All these thresholds assume a reality check is open (7 food nudges + day-21) and 4 snoozes are live.** Without them (extras = 8) the thresholds are 29 protocols / 25 vials. | "64 is exceeded when 2·n + V + extras > 64 (for n > (40 − min(V,8))/2), or 32 + V + extras > 64 with ≥ 9 vials. Here extras = 8 (summary + check-in), up to 20 during an open reality check with 4 snoozes. Worst case: ≥ 23 protocols (no vials), ≥ 21 with 3 vials, ≥ 19 with 8 vials, or ≥ 13 active vials (12 with the test reminder)." |
| A-ABSW-4 | 08-platform.md:459 (§7, R8 rules) | "keep Serializable members (`serialVersionUID`, `writeObject`, `readObject`, `writeReplace`, `readResolve`)" | APPLIED-BUT-STILL-WRONG (06 T1-94, dossier side) | The header (note 6, :11) adds `serialPersistentFields`, and `app.json:82` contains it. But the line in place is unchanged and unmarked, although the header says every correction is "marked where it sits". The TRD (:209) is fixed. | Add `serialPersistentFields` at :459 with the "[Corrected 2026-10-12]" mark. |
| A-ABSW-5 | 03-reminders.md:771 | "Fold check 2026-10-07: **238/248** restored without opening [Corrected 2026-10-12: that was expo's own restore …]" | APPLIED-BUT-STILL-WRONG (minor) | The cited ledger line `docs/decisions.md:591` says "248 alarms scheduled after opening; **all 248 back** after a reboot without opening the app". The correction attributes the restore but keeps a count the source does not give. | "248 / 248 back after a reboot (decisions.md:591), via expo's own restore; the update path is unproven (A-111)." |
| A-ABSW-6 | TRD.md:264 (§1.7 Apple row), :10; 07-onboarding-account-premium.md:6, :592 | "founder signed in with Apple on the Fold 2026-10-07, build 47" | APPLIED-BUT-STILL-WRONG (05 AUTH-7 was applied; this sub-claim is unsupported) | Nothing in the repo records this sign-in. grep finds "build 47" only in verification/05 and the docs derived from it, and grok has no such record. `STATE.md:17` ends with: "Redirect allow-list and the real Android sign-in: **founder device test**", i.e. still pending. The rest of the correction is supported: server setup done 2026-10-03, client secret expires 2027-04-04, auth-callback redirect added. The "probe 302" is live and UNVERIFIABLE-HERE. | "Server side configured 2026-10-03 (`STATE.md:17`); the probe returns 302 (verification/05, 2026-10-12); a real Android Apple sign-in is not recorded in the repo — it is still a founder device test." |

All other Part A items are **APPLIED-CORRECTLY**. I re-checked each in the code:
- 06 WRONG rows:
  - T1-11 → §1.5.
  - L1-5 → `wake_refresh_runs` is global (the repo migration `20261007000000_wake_refresh_schedule.sql:5-25` agrees: no `user_id`).
  - S3-39 → TRD :584, :871, R-26, TR-SYNC-10. The harness `delete()` / `fetchSince` behave as stated.
  - S3-41 → F-11.
  - S3-45 → F-13.
  - T6-3c → `CalculatorSection.js:92` calls `localISO()`.
  - T6-7 / S-78 → my recount: **24 copies in 21 files**, the same files the TRD lists. Also the 4 keys built from picker parts, 1 UTC variant and **9** `toDateString` sites match.
  - T7-8.
- WRONG rows of other reports:
  - 02 S-77 → `recoveryFlow.js:89-95`, `TodayScreen.js:389`, `accountActions.js:127`.
  - 03 R-34 (TRD R-34; dossier 03:769).
  - 03 R-33 / DV-100 text → `updateRestore.test.js:45-53`.
  - 03 DL-45 in S-42.
  - 05 AUTH-7 (apart from A-ABSW-6).
  - Dossier 07 §8 and §9 item 13.
  - Dossier 04:97: 10-year wheel floor, `lib/wheelPick.js:16`.
  - Dossier 01:191: restart order is duplicate → container → limit (`ProtocolsScreen.js:1253-1292`).
  - Dossier 01:698: offline assistant stays open (`ProtocolAssistant.js:111-120`).
  - Dossier 02 note 6: today's slot logs the tap time (`markTaken.js:101-103`).
- 06 PARTLY rows: T1-18, T1-28, T1-39, T1-61, T1-72 (`bookLayout.js:17-22` posture rule), T1-94 (TRD side), D2-25 addition, D2-33 (`curveView.js:12`), D2-37 (the writer list is complete; grep finds 19 `auth.updateUser(` calls, all accounted for, plus `recoveryLink.js:113` for the password), D2-41, S3-14 consequence, S3-30 scope, S3-31 (dose half), S3-34, INV-01, INV-16, INV-23 (source-only note), INV-24, INV-32 (LIGHT / DARK = 37 / 37 keys), INV-35, INV-40, INV-41 (the four fixed-ms sites exist), INV-44, T6-2e, T6-2f, T6-3e, T6-6, T7-4, T7-12 (mostly; see B-8), R-01, R-23, R-26, R-27, R-46 text, and all 28 "missing file" fixes. Every PROPOSED file is absent; the elided Kotlin paths in 03 and 08 are now full.
- TRD PARTLY rows of 01–04: S-20 (+ `SettingsScreen.js:415`), S-30, S-32, S-05, S-07, S-08, S-10, S-16, S-41, S-42, §1.4 refresh row, R-33, S-58.
- Of 07: X-03, X-07, X-09 (deviation noted), X-10 (§4.9, §6.4), D-03, D-08, D-09, D-10, A-04, K-08.

## Part B — fresh claims that are not correct

| # | Doc:line | Quoted text | Verdict | Evidence | Correct statement |
|---|---|---|---|---|---|
| B-1 | TRD.md:784 (INV-23) | "A headless run … **sends no immediate notification** … `lib/notificationActions.js:99-113`" | PARTLY | The headless Android action path calls `notifyNothingLogged()` (`notificationActions.js:134-146`). That is `N.scheduleNotificationAsync({… trigger: null})`, an **immediate** notification, posted directly and bypassing `scheduleReq` and Silent mode. The invariant holds for the refresh task (BR-7 / BR-8), not for the action path it also cites. | "…the refresh task sends no immediate notification; the action path may post one 'nothing logged' notice (Android), which must go through `scheduleReq` (INV-22 / 03:D-13)." |
| B-2 | TRD.md:326 (§2.1 calc_snapshots writers) | "`upsertCalcSnapshot`, `correctCalcSnapshot`, `deleteCalcSnapshot` (`lib/weighInEdit.js`)" | PARTLY (minor) | All three are exported from `lib/database.js:596-603`. `lib/weighInEdit.js:60, :74, :82` holds `correctWeighIn` / `deleteWeighIn`, which the database functions delegate to. | "`upsertCalcSnapshot`, `correctCalcSnapshot`, `deleteCalcSnapshot` (`lib/database.js`, logic in `lib/weighInEdit.js correctWeighIn / deleteWeighIn`)" |
| B-3 | TRD.md:264, :1043 (R-52); 07-onboarding-account-premium.md:592 | "founder signed in with Apple on the Fold 2026-10-07, build 47" | UNSUPPORTED | See A-ABSW-6. `STATE.md:17` lists it as a pending device test. | as A-ABSW-6 |
| B-4 | TRD.md:1039 (R-48) | "verification/07 D-07 **re-classifies** DL-01 as already decided" | PARTLY (minor) | 07 D-07 only *suggests* it ("it is really AD"). The canonical register still has DL-01 as a DL (OPEN-DECISIONS.md:556), and the "Reclassified" table (:296-330) has no DL-01 row. | "verification/07 D-07 argues DL-01 is really AD (founder line :379); OPEN-DECISIONS still lists it as DL-01." |
| B-5 | TRD.md:586 (H-14 "P1"), :1042 (R-51 P1), :585 (H-13 "P2"), :1044 (R-53 P2) | severities | PARTLY | The TRD's own scale (:988) says "**P0** = can silently corrupt or **lose a health record**". Both holes make a synced row (a dose, a weigh-in) permanently missing on a device, silently. The register rates both S1 (DV-209 S1 "SUSPECTED timing", DV-210 S1). | R-51 / H-14 and R-53 / H-13 → P0 (rare or timing-dependent noted), or state why they sit below the P0 definition. |
| B-6 | TRD.md:561 (F-11) | "If a row on an earlier page is updated mid-pull … the row at the page boundary … is skipped" | PARTLY (incomplete) | `fetchSince` orders by `updated_at` only (`sync.js:148-150`), with no tie-break. Rows that share one `updated_at` are one transaction (`now()` = transaction start), e.g. a bulk or trigger-driven update such as `protocols_purge_children`. If such rows straddle a 500-row page boundary, Postgres may return them in a different order per page query, so some can be skipped or duplicated **without any mid-pull update**. The watermark then equals that timestamp, and `gt` never returns the skipped ones. TR-SYNC-11 (keyset on `(updated_at, id)`) fixes both triggers; the failure text names only one. | Add: "…or when > 500 rows share one `updated_at` (one transaction), because the order has no tie-break." |
| B-7 | TRD.md:198 (§1.4 iOS row) | "(… DV-053's 'above 20 protocols / 8 vials' is wrong)" | WRONG (stale) | DV-053 (DIVERGENCES.md:156) was already rewritten to the 23 / 21 / 14–15 thresholds, so the sentence describes text that no longer exists. Both are also partly wrong (A-ABSW-3). | Drop the DV-053 remark, or point to A-ABSW-3's corrected thresholds in both places. |
| B-8 | TRD.md:880, :883 (§7.2 L1, L4) | "`__tests__/owners/*.test.js`", "`__tests__/viewModels/*.test.js`" | PARTLY (minor) | Neither directory exists, and neither is labelled PROPOSED (the L4 libs are; their test directory is not). `scripts/journeys/*.yaml` (L5) gets the "(PROPOSED)" only after the runner. | Label the three target locations PROPOSED. |

The 89 claims I VERIFIED in Part B are grouped below; each was read at the line given.
- **§1 stack:** expo ~54.0.33; RN 0.81.5 / React 19.1.0; expo-sqlite ~16.0.10 + WAL + FK (`database.js:25,34,35`); supabase-js ^2.101.1; purchases ^9.15.2 and `'DoseTrace Pro'` (`purchases.js:19`); notifications ~0.32.16; background-task ~1.0.10; svg 15.12.1 / reanimated ~4.1.1 / worklets 0.5.1; iOS 16.0 / static frameworks / 6 localizations; SCHEDULE_EXACT_ALARM; autolinking `ios.exclude: ["expo-background-task"]`; the three plugins (backup off; the 4 configChanges; `fetch` stripped).
- **§1.2–1.3:**
  - ErrorBoundary `#fff`, outside ThemeProvider; the loading tree has no ErrorBoundary (`App.js:73, 786-798, 800-846`).
  - MainStack 8 routes + vertical FoodChat (`:224-241`).
  - `:579-581`, `:605-607`, `:563-576` (60 s throttle, auto-refresh only while active), `:586-596` (food + day-21 only, 30 s).
  - nav dedupe `slice(-30)` (`:427`); links `slice(-20)` (`:470`).
  - Route params at `ProtocolsScreen.js:1083`, `BodyScreen.js:231-237`, `FoodChatScreen.js:178-180`, `ReminderCheckScreen.js:32`, `PaywallScreen.js:73-74`, `ProgressScreen.js:65-66`; `reminderSetup.js:18-21`; Settings → FAQ `:878`.
- **§1.4–1.5:**
  - Task name + claim key `slice(-60)` (`notificationActions.js:27-28, 56`).
  - `ensureDb` ready on throw (`:31-35`) vs retry (`backgroundTasks.js:25-29`); `REFRESH_MINUTES` 360 (`:79`); wake → `isWakePayload` → `refreshNow` (`notificationActions.js:203-206`, `reminderRefresh.js:45-58`); `getCachedUser` → `getSession` unless `storedSessionOnly` (`supabase.js:40-44`).
  - The receiver and the CONNECTED constraint (`BackgroundTaskScheduler.kt:94`); the appScopeKey value matches.
  - `DtExactAlarmModule.kt:15-20, 24-28`; JS wrapper `null` off Android (`index.js:14-17`).
- **§1.6 repo side:**
  - `claim_wake_refresh` is SECURITY DEFINER with an advisory lock, a 20 h guard and 30-day retention, granted to service_role only, cron `0 8 * * *` (`20261007000000_…sql`).
  - delete-user: 20 tables + referrals.
  - Quotas: 3 / 20 (`quota.ts:10-11`) by UTC month (`extract-bloodwork/index.ts:160`); parse-food 25 / 25 / 60 (`index.ts:28-30`); assistant 10 / 7 days (`budget.ts:8-9`); `FREE_SCANS_PER_MONTH = 3` (`paywallPlans.js:13`).
- **§2:**
  - Every §2.4 key and owner (`aiConsent.js:19`, `entitlement.js:43-44`, `FoodChatScreen.js:54-55`, `foodLogActions.js:20`, `CalculatorSection.js:66`, `doseActions.js:123-129`, `notifications.js:474/608/902`, `TodayScreen.js:155, 526-559`, `theme.js:108`, `orphanedPending.js:47-48` keyed by uid).
  - SecureStore: AFTER_FIRST_UNLOCK, 2000 B chunks, `.__meta`, AsyncStorage fallback.
  - The `user_metadata` writer list is complete; `toggleNotificationPref` and `NutritionLogger` revert on error; `favorite_markers` / `report_tags` swallow errors (`BodyScreen.js:416, 425`).
  - The 8 local `created_at` columns; three repo migrations headed "NOT APPLIED".
- **§3:**
  - `syncRunner` semantics (`:6-40`); Stop wins in `updateLocalFromCloud` (`:470-474`); PGRST204 retry (`:380-399`); `AUTO_PURGE_PAUSED` (`protocolEnd.js:188`); `offlinePendingAlert` (`offlineAlert.js:4-6`); `markSynced` clock-skew branch (`:58, 62-63`).
  - `fetchAll` ordered by `created_at` (`sync.js:224`); AgeConfirm import only when the local DB is empty (`:85`); harness stamps at `:67-68`; `realityCheckSync.test.js:175` todo.
- **§4 divergence lines:**
  - Today header `:1280-1286`; report streak `SettingsScreen.js:390-401` (also capped at 31 days, `i <= 30`); tracker loops `TodayScreen.js:798, 810`.
  - Capacity copies (`TodayScreen.js:1941-1945`, `markTaken.js:121-126`, `deleteDose.js:60-66`, `SettingsScreen.js:415`); vial days-left (`ProtocolsScreen.js:191-195`, `TodayScreen.js:1553-1560`); free limit (`ProtocolsScreen.js:1879-1885, 2046-2050`); `Math.ceil` (`:2218`).
  - 21 duplicated (`FoodLogHero.js:27`, `foodThread.js:297, 307`); 182 days (`TodayScreen.js:153, 1512-1514`); per-batch count (`BodyScreen.js:824`, `bodyHub.js:8, 30`) vs `reportCards` (`BodyScreen.js:99`); `snoozeUntil` (`todayFormat.js:35-39`); `hasSession` (`signOutCore.js:14-18`) vs `App.js:609-617`.
  - `markTaken.js:52-53` cap; `notifications.js:243-248, 922-932`; `notificationActions.js:99-103`; `adherenceRings.js:28-30` noon; `reminderTimes` 08:00 (`notificationPlan.js:57-58`); `TodayScreen.js:770-776, 891`; the Undo bar after "Didn't take" (`:710-717`).
  - 63 named owner functions exist in the cited files (one location nuance, B-2). 23 PROPOSED new function names are absent where proposed. All 18 PROPOSED files are absent (`lib/deviceKeys.js`, `accountMeta.js`, `doseDay.js`, `todayModel.js`, `trackerStreak.js`, `vialState.js`, `freeLimit.js`, `protocolName.js`, `progressModel.js`, `journeyModel.js`, `bodyModel.js`, `useLocalDay.js`, `__tests__/ownershipGuard.test.js`, `__tests__/themeContrast.test.js`, `scripts/run-journeys.cjs`, `scripts/schema-check.cjs`, `supabase/schema.snapshot.json`, `docs/product/ownership.json`). Every non-PROPOSED path the TRD cites exists (wildcards and templates excepted).
- **§5:**
  - INV-20 (`notifications.js:311-318, 390-399`); INV-21 (`:837-840`); INV-22 (`notifyNothingLogged` bypasses `scheduleReq`).
  - INV-24: in-flight set + claim before the action (`:147-160`); no action-dedupe test exists — `responseKey` in `notificationPlan.test.js:132` covers navigation only.
  - INV-32 offenders and 37 / 37 keys; INV-41 sites; INV-42 (`schedule.js:40-43`); INV-44 (`missedDoses.js:54`); INV-45 (`serumModel.js:84-88`); every test file named in §5 exists (40 checked).
- **§6:** the 24 / 21 copies and the 9 `toDateString` sites; `localDate.js` exports only `localISO` / `localDaysAgoISO` (so the rest of the API is PROPOSED, as stated); `dayKeyAt` / `msUntilNextLocalMidnight` live in `dayChange.js:5-14`, as §6.2 says.
- **§7–8:**
  - 256 entries / 255 tests / 4 helpers; `energy.test.ts` exists; agent-device present.
  - `eas.json`: 5 profiles, CLI ≥ 18.5.0, remote version source, autoIncrement, ascAppId `6761788157`, Play tracks `production` / `internal`; the 6 release scripts + `sim-load-main.sh` exist; `app.json` 1.3.0 / `package.json` 1.0.0.
  - Ship-check stale text: Gate C (`SKILL.md:106, 126`), Gate R (`:73`), Gate B allow-list without auth-callback (`:96-97`).
  - decisions.md cites :85, :144, :251, :275, :379, :381, :509, :513, :520, :556, :564, :565, :634, :638-639 all say what the TRD quotes.
- **§9:** R-52's `STATE.md:17` expiry 2027-04-04 + PA-123.

## Part C — cross-references that are not correct

All 153 IDs the TRD cites exist in `DIVERGENCES.md` / `OPEN-DECISIONS.md`. The dossiers cite only DL-15, OPEN-01, AD-44, DL-03, OPEN-17, DV-047, AD-14, DV-101, AD-19; all exist and are on topic. The 12 OPEN IDs (01, 02, 03, 05, 06, 09, 12, 13, 14, 16, 17, 19) match their topics wherever cited. The problems are IDs whose status changed in the 2026-10-12 reclassification after the TRD cited them, and new register rows the TRD does not know.

| # | Doc:line | Cited | Verdict | Evidence | Fix |
|---|---|---|---|---|---|
| C-1 | TRD.md:585, :586, :1042, :1044 | H-13 / H-14 / R-51 / R-53: "no DV row yet" / "none yet" | MISSING-LINK | DV-210 = offset paging (DIVERGENCES.md:89); DV-209 = watermark race (:88). The register in turn says the race is "(not in the TRD)" (:381), but the TRD has F-13. The two docs are stale toward each other. | H-13 / R-53 → DV-210; H-14 / R-51 → DV-209; fix the DIVERGENCES crosswalk line. |
| C-2 | TRD.md:1043 (R-52) | "none yet (verification/05 suggests a new ACCT row)" | MISSING-LINK | DV-211 (DIVERGENCES.md:218) = Apple client secret expiry. | R-52 → DV-211. |
| C-3 | TRD.md:605, :606, :992, :996, :1052, :1062 | "DL-72 principle" / "DL-74 principle" / "Production changes that follow from a DL (… tombstones … DL-72)" | STALE | OPEN-DECISIONS.md:627, :629: "**Withdrawn** 2026-10-12 → OPEN-16 (b) … the principle … is restated in OPEN-16". A withdrawn DL is cited as a standing decision. | "principle restated in OPEN-16 (DL-72 / DL-74 withdrawn)". Drop DL-72 from the "follows from a DL" sentence at :1062. |
| C-4 | TRD.md:1030 (R-39) | "AD-29" | STALE | OPEN-DECISIONS.md:512: "AD-29 **→ OPEN-21 (5)**, coordinator line". | OPEN-21 (5) |
| C-5 | TRD.md:1037 (R-46) | "DL-16" | STALE | → AD-65 (see A-NA-1) | AD-65 |
| C-6 | TRD.md:634 (S-01), :994 (R-03), :1053 (§9.1 Q2) | "DL-06" only | MISSING-LINK | DL-06 is narrowed; the default is OPEN-19 (c). OPEN-DECISIONS' own TRD map (:424) says "DL-06 · OPEN-19 (c)". | add OPEN-19 (c) |
| C-7 | TRD.md:640 (S-07), :999 (R-08) | "AD-06" only | MISSING-LINK | OPEN-19 (a) reopens which day a late dose counts for (DV-030 → OPEN-19 (a)). Its context: ":144 does not reach 13 h". | add OPEN-19 (a) |
| C-8 | TRD.md:678 (S-42), :1005 (R-14) | "DL-45 (Silent half only …)" | MISSING-LINK | The Settings half is now OPEN-20 (a) (OPEN-DECISIONS.md:600). | add OPEN-20 (a) |
| C-9 | TRD.md:1004 (R-13) | "AD-11" | STALE (partly) | AD-11 is narrowed: the rules inside A-85…A-98 (incl. A-87b vial status, H-8 / TR-SYNC-8) → OPEN-21 (4). | "AD-11 (in 1.3.0); rules OPEN-21 (4)" |
| C-10 | TRD.md:995 (R-04) | "AD-42, AD-52 … signing them is a separate founder item" | MISSING-LINK | OPEN-18 item 8 is that item ("Replaces … the AD-52 note on unsigned checklists"). | add OPEN-18 (8) |
| C-11 | TRD.md:1024 (R-33) | "DV-100" | STALE | DV-100 is in "Closed by the verification" (DIVERGENCES.md:355); the open part (device proof) is DV-118. | DV-118 (DV-100 closed) |
| C-12 | TRD.md:246 (§1.6 parse-food), :739 (§4.9) | "a deviation to list (verification/07 X-09)" | MISSING-LINK | The deviation is now OPEN-18 item 3 / DV-213. | add OPEN-18 (3) · DV-213 |
| C-13 | TRD.md:544 (§3.7) | "Automatic 7-day purge … paused … registry A-84" | MISSING-LINK | The pause is OPEN-21 (8) (AD-50 moved); what comes after is OPEN-04. | add OPEN-21 (8) / OPEN-04 |
| C-14 | TRD.md:198, :1039 | DV-053 "is wrong"; DL-01 "re-classified" | STALE | See B-7, B-4. | as B-7, B-4 |

## Notes

1. **Live claims are not re-proven here.** No live claim was re-checked: the `reality_checks` trigger, 29 migrations, edge function versions, `wake_refresh_runs` columns, the `handle_new_user` body, cron, and the Apple probe. For each, the repo is consistent with the TRD: `supabase_reality_checks_table.sql` has no trigger; the wake ledger has no `user_id`; the three migrations are headed "NOT APPLIED"; the version stamps differ from the names round 1 listed as live.
2. **The headline sync findings stand.** H-1 dose resurrection, H-2, H-3, F-11 and F-13 are all real in the code. The problems are scope (A-OC-1, A-OC-2), a missing second trigger for F-11 (B-6), and severity / register links (B-5, C-1).
3. **The reclassification broke TRD links.** The TRD was corrected from verification/07, but the "Reclassified on 2026-10-12" table in OPEN-DECISIONS (AD-29, DL-06, DL-16, DL-45, DL-72, DL-74, AD-11, AD-52, DV-100 closed, DV-209…211 added) was not propagated back into the TRD's Decision / DV columns. C-3…C-13 are all this one process gap. A mechanical cross-check (every TRD ID against the "Reclassified" and "Closed" tables) would catch them all.
4. **The test-kind figure is reproducible but method-dependent.** Under a stricter definition (a file that evaluates translations or parses an AST is not "code shape"), the pure source-text count falls to about 18 to 26. The TRD should state the method next to the number.
5. **Part B is new; Part C is wider than round 1.** Nothing in Part B was in round 1. B-1 (INV-23 vs `notifyNothingLogged`) and B-6 (no tie-break in paging) are new defects in the TRD's reasoning, not doc drift. Round 1 also did not cover the Part C reclassification drift in the TRD; it checked the §9 IDs only for existence and topic.
