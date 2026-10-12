# R2-06 — Independent verification of `docs/product/DIVERGENCES.md`

- Verified 2026-10-12 against HEAD `19e4ebc` (branch `redesign/graduated`). Read-only: no code, doc, build, migration or network write. The only file written is this report.
- Method: every S1 row, every new row DV-196…DV-221, the three closed rows, a sample of 58 S2 rows and 43 S3/S4 rows covering all nine areas, each checked against the code (file:line). Where possible the check ran the real lib functions with node fixtures, or ran `lib/syncCore.js` on the stock `__tests__/helpers/syncHarness.js` (scratch scripts are outside the repo). Six independent checkers each took one area and the coordinator re-ran the key findings. The new sync S1 (M-1) and DV-182 were reproduced again.
- Authority for "intended": `docs/decisions.md` founder lines (not coordinator or "by logic" lines), signed `docs/specs/*.md`, `docs/design/prototype.html`.
- Severity scale used: the file's own legend (`DIVERGENCES.md:17-22`). S1 = data loss, wrong health record, or privacy. S2 = wrong or contradictory information shown. S3 = approved behaviour missing or unprovable. S4 = cosmetic, docs, hygiene.

## 1. Counts

| Source | S1 | S2 | S3 | S4 | Total | Verdict |
|---|---|---|---|---|---|---|
| Rows in the tables (recounted by script, closed section excluded) | 15 | 94 | 37 | 72 | 218 | — |
| DIVERGENCES.md Summary (`:43-54`), per area too | 15 | 94 | 37 | 72 | 218 | MATCH (every area cell matches) |
| Portuguese message (`OPEN-DECISIONS.md:641`) | 15 | 94 | 37 | 72 | 218 | MATCH |
| OPEN-16 context (`OPEN-DECISIONS.md:22`) | 14 | 94 | 37 | 71 | **216** | **STALE.** It still shows the counts before DV-221 and DV-201 / DV-214…220 were added; correct to 218 (15 / 94 / 37 / 72). |

Other mechanical checks:
- The IDs run DV-001…DV-221. DV-100, DV-142 and DV-194 appear only in the Closed section. There are no duplicate IDs and every row sits in the section of its own severity.
- "Rows that need a founder answer: 43, 13 through OPEN-21" (`:66`): recounted, 43 and 13. MATCH.
- The SUSPECTED list (`:68`) matches the Confidence column, except DV-021: its Confidence cell says CONFIRMED plus a code-read-only half, and it never says SUSPECTED. This is a minor wording mismatch.
- Every AD / DL / OPEN id cited in the "Founder decision" column exists in OPEN-DECISIONS.md. Section 4 lists the links that point to the wrong kind of decision.

**If the corrections in section 3 are applied** (DV-206 merged into DV-003, DV-221 → S3, DV-005 → S2, DV-208 / DV-212 / DV-189 merged, M-1 added), the register reads about **S1 13**, S2 ≈ 93, S3 ≈ 41, S4 ≈ 67. Treat these as an estimate: the founder's answer to OPEN-08 can move DV-004 too.

## 2. Verdict tally (rows checked: 138 active + 3 closed)

| Verdict | Rows |
|---|---|
| CONFIRMED as written, no flag (listed at the end of each sub-section of 3) | 57 |
| CONFIRMED, line-number nit only (DV-198, DV-214, DV-216, DV-220) | 4 |
| Rows with at least one material flag below | 77 |
| PARTLY (core defect real; a material detail of description or impact is wrong) | 25 |
| WRONG (the claimed defect is not there) | 1 (DV-218: the PRD already says it) |
| NOT-REPRODUCIBLE from code | 0 (SUSPECTED rows stay SUSPECTED; none was disproved) |
| MIS-SEVERITY | 15 (12 clear + 3 arguable: DV-002, DV-126, DV-190) |
| BAD-TEST (fails for the wrong reason, passes today, or cannot be written as stated) | 20 |
| FIX incomplete or wrong (the proposed fix would not make the test pass, or misses a caller / server mirror) | 17 |
| DUPLICATE | 4 hard (DV-206, DV-208, DV-212, DV-189) + 13 merge-at-fix-time groups |
| Bad founder link | 18 |
| Closed rows: closing reason holds | 3 of 3 |
| Missing rows | 1 new S1 (M-1), 5 new rows, 17 extensions of existing rows, 6 crosswalk / severity fixes in PRD and TRD |

A row can carry several verdicts, so the verdict counts overlap. 57 + 4 + 77 = 138.

## 3. Rows with a problem

V = verdict: C = confirmed, P = partly, W = wrong, SEV = mis-severity, T = bad test, F = fix incomplete or wrong, D = duplicate, L = founder link, N = line/number nit.

### 3.1 S1 rows (all 15 checked)

| DV | V | Evidence | Correction |
|---|---|---|---|
| DV-003 | C | `FoodEntryEditor.js:91` `remove()` → `deleteFoodLog` (`database.js:528` tombstones); no undo; the chat's own `confirmRemove` (`FoodChatScreen.js:463`) shows the confirm pattern the editor skips | Keep S1. Absorb DV-206 (same sheet, same test file). |
| DV-004 | P, SEV (conditional) | Stop → `clearRealityChecks` (`database.js:579-583`, every row of the user); the result-view Stop link is at `CalculatorSection.js:1541`, **not :1531**; the locked view is :1475 | The row leaves out that Stop **already asks first** (`CalculatorSection.js:936-951`), and the confirm text says "This clears your reality-check numbers" (`translations.js:1041`, ×6). The loss follows a warned, confirmed action that the code comment (`:933`) calls founder-requested; decisions.md:239 says only "clears the open check". This is a real conflict, but S1 "data loss" applies only if OPEN-08 is answered A. Until then it is S2 (the copy does not say the history goes). Rewrite the description to include the warning. |
| DV-005 | SEV | `serumModel.js:95-130`: `expectedDosesOn(p, day)` and the current `p.dose` are used for every past day | The defect is real, but it rewrites a *derived estimate*, not a stored record (Dose log rows are intact). By the legend it is S2 (wrong information shown). It is also a design question (OPEN-10): if the founder keeps "planned schedule = current plan", it is not a defect. Move it to S2 and keep it blocked on OPEN-10. |
| DV-006 | C | `BodyScreen.js:411-418` (`toggleFavorite(display label)`), `:285` (isFav when ANY variant is starred), `:416` and `:425` (whole-array `updateUser`, `.catch` only; supabase-js resolves `{error}` and never rejects) | Holds. The fix for DV-075 lives inside this row's fix (`bodyPrefs`, labels by card key); merge them or sequence them together. |
| DV-007 | C, L | `lib/aiConsent.js:19-35` (one AsyncStorage key, no user id, version or date, no revoke); `signedOut.js runWipeSteps` and the App.js wipe deps never remove it | The defect holds. Founder link: the fix adds a **new Settings row** (withdraw), which the founder never approved. OPEN-16 (`OPEN-DECISIONS.md:22`) admits DL-55 adds unapproved UI, so this row must point to an OPEN item for the visible part. |
| DV-008 | C | `SettingsScreen.js:298-301` and `:320-337` never read `{ error }` | Holds. TRD R-38 rates it P2; align the two documents. |
| DV-009 | C (lost-response half SUSPECTED) | No `user_not_found` / revoked handling outside the recovery flow (`recoveryFlow.js:77` is used for reset links only); `accountActions.js:56-58` maps a fetch reject to `{offline:true}` | Holds. |
| DV-010 | C, F | `syncCore.js:620` (a pending local row ignores the cloud row); the harness replaces the whole payload, so the test fails today | **The fix is wrong:** `mergeCalcInputs(cloud, local)` (`realityCheckStore.js:139`) lets every key of B's full local payload win, including stale keys. B must push only its pending patch, or keys need per-key stamps. Second path to add: a second phone's first save upserts `onConflict user_id` (`sync.js:133-136`) and replaces the whole JSON payload. The "any row edited on two devices" clause duplicates DV-183; drop it. |
| DV-182 | C, N | Reproduced on the stock harness: A deletes X → still on B; B edits X → the cloud has it again → "X back on A 1". Hard delete at `syncCore.js:648-655`, reinsert at `:692-698` | Correction: `fullImport` never absence-deletes `dose_logs`, `vials` or `protocols` (`NO_ABSENCE_DELETE`, `syncCore.js:817`). A deleted dose stays on B even after a full import, and only a wipe clears it. |
| DV-183 | C, T (minor) | Reproduced: both phones at 3, each logs one dose → cloud 4, not 5. `syncMappers.js:87`, `:109`; `sync.js:92-93` (push before pull) | The second test ("note reverted by a dose push") needs an **oral** protocol: injectable doses write `vials`, not `protocols` (`doseActions.js:81-96`). TRD R-05 rates it P1; align. |
| DV-184 | P | `notificationActions.js:31-36` (`dbReady` is set after a failed init); claim before write (`:160` then `:161`) | Wrong detail: the dose write does not read the user (`recordDoseTaken` uses `protocol.user_id`, `doseActions.js:54`). `getSession` is reached only *after* the write (`notifications.js:372`, `:995`). The real defect is broader: any throw in markTaken is swallowed (`:179`), the key is already claimed and the Android banner is dismissed (`:182`), so the user believes the dose was logged. The test must make the **write** throw, not only `initDatabase`. TRD R-32 rates it P2; align. |
| DV-206 | SEV, D | `FoodEntryEditor.js:86` | Reaching it takes × on every item, then Save. `editedItems` (`nutrition.js:491-507`) never drops an item on its own, and the editor has **no add-item**, so the stated impact ("clearing the items to retype them") is impossible. Merge into DV-003 as a second assertion; on its own it would be S3 (an AD-01 gap). |
| DV-209 | C, T, F, L | `supabase_food_logs_table.sql:37-40`; `migrations/20260928000000_…:6-7` (`now()`); `sync.js:147` `.gt('updated_at', since)` | The stock harness stamps from one synchronous counter and cannot express "starts first, commits last" without a deferred-visibility extension, so the test cannot be written as stated. `clock_timestamp()` alone does not fix it (the stamp is still taken before commit); only an overlap re-read covering the longest transaction, or a commit-ordered cursor, does. Founder link: production SQL, and OPEN-16 (b) names DV-209, so the row must cite OPEN-16 (b), not "No (bug)". TRD R-51 says "none yet". |
| DV-210 | C, T, L | `sync.js:140-157`, `pageSize = 500` (`:141`), no `id` tie-break | The stock harness `fetchSince` never pages, and `cloud.fetchSince` is private inside `sync.js` (imports NetInfo and supabase), so the test as written cannot run. Extract the pager into a pure module and test it with a fake query builder. Extend it: ties on `updated_at` skip rows with no concurrent edit, and `fetchAll` (`sync.js:216-232`) has the same offset paging, feeding `fullImport`'s absence-delete (`syncCore.js:828-841`), which can delete a live local row. Founder link → OPEN-16 (b). TRD R-53 rates it P2 and says "none yet". |
| DV-221 | P, SEV, T, L | Trigger at `20261004010000_protocol_delete_guard.sql:32-41`; the header (`:8-9`) keeps type and colour **on purpose** | Severity **S1 → S3**: name, `compound_id`, dose, unit, notes and dates are all blanked. The leftovers (type, colour, `interval_days`, `doses_per_day`, `concentration_unit`, `divisible`) do not identify a compound or a dose: this is an approved rule not fully delivered, not a privacy leak. `deleted_at` is a timestamp, which decisions.md:540 allows. Bad test: the core CREATE TABLE is not in the repo (DV-119), so NOT NULL constraints are unknown and "every other column null" may be impossible; assert blanked or default values. Bad link: "founder 3 sim" is not a decision id, and decisions.md:540 sits under "decided by the ledger / logic (coordinator) … no question to the founder" (`decisions.md:533`). The founder's "3 sim" approved applying A-88 as built, so the stricter blanking rule → OPEN-21. |

S1 rows CONFIRMED with no material flag: DV-003, DV-006, DV-008, DV-009 (their notes are merge or alignment notes only). The S1 tier holds for 8 of 15 rows as written (003, 006, 007, 008, 009, 182, 183, 184 — 007 needs only a founder-link fix, 182, 183 and 184 detail fixes). It is conditional for DV-004 and DV-010 (the defect is real, the fix is wrong), and wrong for DV-005, DV-206 and DV-221. DV-209 and DV-210 are real S1 mechanisms whose tests cannot be written as stated.

### 3.2 New rows DV-196…DV-220 (non-S1)

| DV | V | Evidence | Correction |
|---|---|---|---|
| DV-196 | C, T, N | `LanguageContext.js:33-39`; `notifications.js:18-24`; `notificationActions.js:138` (not :139) | **Bad test:** the fix stores the language in the context, but `getT()` is unchanged and not exported, so "no stored language + device pt → `getT()` returns pt" still fails after the fix. Either `getT` falls back to the device language through one shared helper, or test that the provider stores the resolved language. Side effect to state: storing the device default freezes it, so a later phone-language change is no longer followed. Merge the work with DV-050 and DV-141 (one language-change hook). |
| DV-198 | C, N | `unitsOk` `ProtocolsScreen.js:1793-1795`, `:1804`; `doseStepBlocked` is at **:1812**, not :1810 | — |
| DV-199 | C, D (fix) | `refillVial` `:2103-2109`; node `vialLowToSend({lowIds:[5],activeIds:[5],sent:{5:true}})` → `send:[]` | Keep the test, but schedule it with DV-027 (one fix, DL-22). |
| DV-200 | C, D (fix) | `ProtocolsScreen.js:194` (`ceil` → −0, ≤ 0 true at `:547`) | The impact is wider: the Today alert has the same `ceil` (`TodayScreen.js:1559`) and says "{name} — expired" on the expiry day (`:1568`). Add a Today assertion. Merge with DV-018 (one days-left owner). |
| DV-201 | C | `ProtocolsScreen.js:1681`; `translations.js:1981` | The lab-photo path shows the same "PDF" text (`BodyScreen.js:514`, `bodyScan.js:71`); DV-160 item 5 already covers labs, so cross-reference it. |
| DV-203 | C, N | The 30-day read is at `TodayScreen.js:1007-1010`, not 1000-1003 | The same read is in `LogScreen.js:196-198` (Dose-log site editor), and `fetchLastSites` (`TodayScreen.js:571-574`) also reads only 30 days. The fix must cover all three. |
| DV-204 | P, L | Fallback at `LogScreen.js:146`, not 145; documented as deliberate (`:137`) | "Paused" does not exist and "deleted" is unreachable (the Dose log hides rows of deleted protocols, `protocolEnd.js:31`). That leaves ended protocols: the vial impact is moot (`endInactiveProtocol` deactivates vials, `TodayScreen.js:546`), while the oral bottle count and the cap bypass are real. `recordDoseTaken` refuses inactive protocols on purpose, so the fix needs an explicit flag. Link: the cap is OPEN-19 (b); cite it. |
| DV-208 | D | Script: New York 2026-11-06 11:30 → tile 0.125 vs curve ≈ 0 | Same root cause and fix as DV-068 (`serumModel.js:113` snap; 14-day vs 3-day grid origin). Merge into DV-068 with both test instants. |
| DV-211 | P, SEV, T | `STATE.md:17` (2027-04-04) | "No product doc names the date" is false: PRD-AUTH-7a (`PRD.md:411`), G-138, `TRD.md:264` and R-52 all name it. "The probe hides the button" is wrong: `appleWebCheck.js:7-12` checks only the /authorize 302, and an expired secret fails at token exchange, so the button shows and the flow errors. Not S2 (nothing wrong is shown today): this is a dated ops/release item for the release checklist, not a sweep row. The test cannot fail first, because 174 days remain and the expiry is not stored in the repo. |
| DV-212 | D, T, P | `PaywallScreen.js:278`, `SettingsScreen.js:642` | Duplicate of DV-071 (same AD-19, same copy fix). "PRD-PREM-1 quotes the paywall line as required copy" is stale: PRD.md:1046 and PRD-CURVE-33 (`:920`) already flag the contradiction. The English-only test ("your own log") misses "registro", "journal" and "Einträgen"; use per-language stems. |
| DV-214 | C, N | `reminderHealth.js:57` (not :56) | `SETUP_COUNTED` treats 'open' as not counted (`:140`); state the effect on the setup bar. |
| DV-215 | C, P | `translations.js:5144` ("avisos de dose"), `:5131` ("garantidos") | Incomplete: ES has the same split (`:2833` "Los avisos de dosis" under the `:2832` "recordatorios" title). Add ES to the fix and the test. |
| DV-216 | C, N | Lines are really `ProtocolsScreen.js:1230-1247` and `2005-2027` | The Ended-row trash also skips `closeProtocol` and the Analytics call. |
| DV-218 | W | `PRD.md:728` (PRD-REM-110) already says "Check-in reminders (… does not gate the day-21 weigh-in)" | Only flow 06 §7.4 (`06-reminders-reliability.md:195`) lacks it. Shrink the row to that one doc line. |
| DV-219 | C, L | `delete-user/index.ts` has no RevenueCat call; `purchases.js:68` `appUserID: userId` | AD-51's counsel list (A-95 consent proof, Art. 9 wording, DPA, crisis policy, ePrivacy analytics) does **not** include RevenueCat deletion. Add it to AD-51 or open a counsel line. |
| DV-220 | C, N | Immediate call at `TodayScreen.js:887`, not 885 | `fetchProtocolStreaks()` at `:888` is also immediate, so the card's streak jumps too. |

Clean CONFIRMED: DV-197, DV-202, DV-205, DV-207 (also reachable through bloodwork-date chips, `SerumCurveScreen.js:332-334`; extend), DV-213, DV-217.

### 3.3 S2 sample (58 rows)

| DV | V | Evidence | Correction |
|---|---|---|---|
| DV-001 | C, F | `syncMappers.js:101-103`; `updateLocalFromCloud` `syncCore.js:401-408` | The residual is worse than written. In the harness, the cloud `created_at` flips SERVER → T0 after A's edit, then back to SERVER after B's edit, because B re-pushes its stale value on every protocol update. "Adopt a differing cloud value" would keep flipping; keep the earliest value, or stop sending `created_at` on updates. |
| DV-002 | C, SEV (arguable), T | `notifications.js:997-1010` (`vial_expiry` is not re-bodied), `:903` CHANNEL_FOR lacks it, so `:945` falls back to `checkin-reminders` | The legend files privacy under S1, and a compound name on the lock screen after "names off" is a privacy leak, however narrow. State which rule lowers it. The test must assert `trigger.channelId` (moved out of content, `notificationPlan.js:314-321`). Split the channel half into DV-098 (channel per kind). |
| DV-012 | C, F | `schedule.js:31-61` vs `notificationPlan.js:35-52`; node: course of 3 from 10-01 → `expectedDosesOn(10-12)=1` | The fix must also cover the server mirror `supabase/functions/send-reminders/plan.ts:60-78` (parity test). |
| DV-013 | C, F | Stored `name` at `TodayScreen.js:1183`, `:2298`, `:2312`; `notifications.js:253`, `:498`, `:517`; `notificationPlan.js:77`; `SettingsScreen.js:407`; `LogScreen.js:202`, `:578` | The server push also uses the stored name (`send-reminders/index.ts:236`, `plan.ts:130`), and its select (`index.ts:118`) does not fetch `compound_id`. A client-only `displayName` does not fix server pushes. |
| DV-014 | C, F | `schedule.js:41-46`; `notificationPlan.js:38` | Same server mirror (`plan.ts:63`); its select lacks `created_at`, which the shared anchor needs. |
| DV-019 | P | Wizard `ProtocolsScreen.js:1507-1515` | The wizard cannot produce a date more than about 1 year back, and maps a future date to last year exactly like Today. So "older than 365 days" and "future" are not real differences; only the Feb 31 clamp (and the assistant refusing future dates) is. Extra bug for the same fix: `lastDay` uses the current year after switching to year−1, so a Feb 29 typed in a leap year saves an impossible date ("2027-02-29"). |
| DV-028 | C, F | `notificationPlan.js:57-63`, `notifications.js:1163`, `schedule.js:84`, `adherenceRings.js:31` | The fix must include the server copy `send-reminders/plan.ts:81-88` (same 08:00 default). Not in the row: a protocol with no time shows "12:00 AM" and sorts first in Tomorrow / Next 5 days (`schedule.js:175-182` → `TodayScreen.js:2006-2009`). |
| DV-029 | P | Fixture: created 21:00, slot 08:00 → card due, header "0 of 1", ring null | The header and the tracker streak *also* apply the creation-day floor (`schedule.js:57-61`); only the ring disagrees. The description says only the card has the floor. |
| DV-031 | T | `doseActions.js:186` (`getActiveProtocols`) | `computeMissedDoses` already writes Missed rows for an ended protocol up to its end (fixture: 1 row), so a test at that level passes today. Target the protocol list that `scanMissedDoses` passes in. |
| DV-032 | C, F | `SettingsScreen.js:390-401` | `report_streak_line` says "{days} days" ×6; switching to `doseStreak` without the label prints doses as days. The report reads only 30 days (`:364-369`). The logic is inline, so it must be extracted to be tested. |
| DV-034 | C, F | `TodayScreen.js:798` loop; logs read for 30 days only (`:756-760`) | The fix must widen the log read too. The unit is still OPEN-17. |
| DV-035 | C, T, F | `skipDose` `TodayScreen.js:1163-1186`; `doseSlotResolved` `notifications.js:922-931` | `scheduleDoseReminder` skips only slots below the Taken count (`notifications.js:244-248`, `:260`), so every resync re-arms a skipped slot; the server push also ignores Skipped (`send-reminders/index.ts:129-135`). A cancel-only fix passes the stated test, and the bug returns at the next foreground. Add "resync after skip keeps t1 cancelled". Merge mechanism with DV-040 (reminder state keyed on the Taken count, not on each slot's row). |
| DV-037 | C, T (minor) | `TodayScreen.js:2001` | The fixture must use a protocol whose next dose is tomorrow (a daily protocol open today never appears under Tomorrow). |
| DV-038 | C, F | `LogScreen.js:138-151` | The fix cites `planTakeFollowups`, **which does not exist anywhere** (grep). The vial prompt lives only in TodayScreen (`showVialPromptFor`, `:1215`), and the Log tab has no prompt UI, so the fix needs a named owner. Do it together with DV-204 (same function). |
| DV-040 | P | `applyUndo` `TodayScreen.js:1098-1155`; `LogScreen.applyDelete` `:313-337` | The reminder is re-armed at the next `syncAllNotifications` (foreground, at most once a minute, `App.js:564-575`; cold start; Android refresh). The impact is "none until the app next comes to the foreground", not "no reminder". |
| DV-042 | P | `reminderHealth.js:105-108`; `TodayScreen.js:186`, `:1582`, `:1605` | The Today/Silent half is real (the test fails today). The Settings half matches the signed SP-1 / RC-1 today, so it is not a defect until OPEN-20 (a) is answered; keep it out of the sweep. |
| DV-043 | C, F | `reminderHealth.js:96` | The fix must compare presence per protocol (at least 1 due → at least 1 scheduled), never counts, or the iPhone floor of 2 per protocol (`notificationPlan.js:308`) gives false blocks. |
| DV-045 | C, F | `reminderHealth.js:41-50`, `:73-78` | No registration time is stored anywhere (`backgroundTasks.js:75-81`), so the fix must persist one first. Every app open writes FG_SYNC_KEY (`notifications.js:849`), so in practice nobody can see the stale state. |
| DV-049 | T | `translations.js:643` and ×6; `notifications.js:185` `[5,10]` | The test "no 'until acknowledged' in any language" checks only English; the other five say "hasta confirmar", "até confirmar", and so on. Use per-language phrases. |
| DV-053 | P | `notificationPlan.js:301-309` vs `:262-283` | Node: 23 protocols and 21 protocols with 3+ vials hold. The vial threshold is wrong: 13 vials when the protocol count divides 32, 15 otherwise. All thresholds assume an open reality check plus 4 snoozes; without them it is 29 protocols / 25 vials. The test (25 + 10 → ≤ 64) fails today. |
| DV-054 | SEV | `App.js:650`, `:730`; `notifications.js:153-164` | An OS permission prompt is not "wrong information": S3 (approved behaviour per SP-5, pending OPEN-20 b). The fix must also cover `registerPushToken` (`notifications.js:1033`), which calls the request itself. |
| DV-057 | C, F | `notifications.js:609-640` | Narrow window: only a weigh-in on the due day before 10:00. The fix must cover every weigh-in path, including `applyWeightEdit` (`CalculatorSection.js:522`). |
| DV-058 | C | `realityCheckRules.js:126-132`; `TodayScreen.js:1487-1491` | Overlaps DV-104 (a non-ok check never closes); fix them together. |
| DV-060 | C, F, T | Predicate `CalculatorSection.js:853` | The **same predicate** guards `completeRealityCheck` at `:963`, so changing only `checkSaved` leaves "reaching ready → it finishes" red. `journeyProgress.test.js` pins both (`:190`, `:193`). |
| DV-063 | P | `progressTile.js:29`, `:44`, `:55-57` | Transient: once Progress is opened on that device, A-101e adopts the weigh-in (`CalculatorSection.js:390-398`). The numbers in the row depend on its fixture (2780 / 2680 here 2770 / 2670). The tile also returns null at `:42` before reading checks (the DV-149 class). |
| DV-065 | P | `weighInEdit.js:11`, `:31-45`; `CalculatorSection.js:569`, `:653`, `:882-897` | Misses a fourth path: the Your numbers weight field → `commitWeightField` / `applyWeightEdit` (`:488-534`) writes a weigh-in with no range check. |
| DV-066 | C, F | `foodLogActions.js:76-77`; `parse-food/index.ts:161-171` | The server cannot know "the user's local day of the request" today; the client must send a new field (e.g. `local_day`). |
| DV-067 | C, F, T | `JourneyScreen.js:109`, `BodyScreen.js:402` pass `getActiveProtocols` | Changing only `serumModel.defaultCurveLevel` fixes nothing while both callers still pass the active-only list. A pure test that feeds the history list already passes today, so pin the callers' data source. |
| DV-069 | C | `serumModel.js:28`, `:123-127` | The fix interacts with DV-068 (real dose times must not be re-snapped, `:113`); sequence the two together. `curve_disclaimer` does say "planned schedule"; what is undisclosed is the fixed hours. |
| DV-070 | SEV | `SerumCurveScreen.js:948`, `:1028`; `halfLives.js:49` | A raw key on screen is a cosmetic or i18n defect (S4), not wrong information. (TRD R-50 argues the opposite way: P1.) Pick one scale. |
| DV-071 | T, D | `curve_empty_sub` "log doses" / "registre doses"; `curve_combined_hint` ×6 | The test "no 'logged' in curve_*" passes today for `curve_empty_sub` and for all five non-English languages. Use per-language stems (log / regist / enregistr / erfass / eintrag). Absorb DV-212. |
| DV-078 | P | `extract-bloodwork/index.ts:369`, `:321-342` | Also counted: scans whose markers are all dropped on the client (`bodyScan.js:19-23`) and vial scans with all fields null. A server-only empty check misses these. |
| DV-081 | P | `signedOut.js:158-163`, `App.js:377-399` | The list is incomplete: `dosetrace_food_asked` (`FoodChatScreen.js:54`), `dosetrace_food_local_pending` (`foodLogActions.js:20`, keyed by local id), `dosetrace_paywall_views` and `dosetrace_snoozes` (`notifications.js:902`) also survive. `dosetrace_entitlement_last_uid` is also in DV-082; keep it in one row. |
| DV-084 | P, T | `supabase.js:335-340`; Google `:174-178`; `appleWeb.js:70` | Apple returns a name only on first authorization, and the stash fills missing fields only (`pendingProfile.js:30`), so "a name typed in onboarding is replaced" is rarer than stated. "Google users are asked again" holds only without a fresh onboarding stash. GoTrue already stores `full_name` from Google. `lib/supabase.js` cannot run under node, so the test needs a pure helper. |
| DV-186 | T | `paywallPlans.js:175`, `:182` | "No 'progress' in any language" misses "progreso" (ES) and "Fortschritt" (DE). |
| DV-088 | C, N, T | `upsertRealityCheck` at `database.js:555-575` (not -577) | The test depends on `supabase/schema.snapshot.json`, which does not exist yet (it comes from the DV-119 fix); say so in the test column. Absorb DV-189. |

Clean CONFIRMED in the S2 sample: DV-015, DV-016 (impact SUSPECTED, as stated; the real source is likely a sync insert, `syncCore.js:515`, so the `syncVialAlerts` half is the one that matters), DV-017 (`insertVial` stores `total_doses || 0`, so the report prints −3; must be extracted to test), DV-018, DV-020, DV-022, DV-026, DV-030, DV-046, DV-050, DV-051, DV-052, DV-056, DV-062, DV-064, DV-073, DV-076, DV-077, DV-079, DV-085, DV-086 (arguably S1: GDPR Art. 20 portability), DV-087.

### 3.4 S3 / S4 sample (43 rows)

| DV | V | Evidence | Correction |
|---|---|---|---|
| DV-011 | SEV | `delete-user/index.ts:112-140` | Naming `ai_assistant_usage` in delete-user is an explicit ledger line (decisions.md:545) not built: S3, not S4. Its test needs the DV-119 snapshot. |
| DV-095 | T | Checks at `ProtocolsScreen.js:1290`, `:1309`, `:1880`, `:2053`; nothing in `supabase/` | "(per answer)" is a placeholder, not a test (acceptable while OPEN-05 is open; mark it). |
| DV-099 | P | expo-background-task 1.0.10 `BackgroundTaskScheduler.kt:93-95`, `:106-127` | On API ≥ 26 it is a chain of OneTimeWork, not a periodic work, and it waits for the network rather than being lost. The test can only be a source pin. |
| DV-101 | P | `foodThread.js:259-263` → `CalculatorSection.js:220` → `weighInAccess.js:9-11` | Seeing the result in grace is real. "Start a NEW check" works only in a stale window (rcFree is re-read on focus). |
| DV-105 | P | `JourneyScreen.js:203-208` (no Analytics call) | Only Premium taps go unmeasured (free taps reach the Paywall with source `journey_serum`). `Analytics.viewed(feature)` (`analytics.js:94`) takes no source, so the fix needs an API change. |
| DV-126 | SEV (arguable) | `ProtocolsScreen.js:2035-2044`; `translations.js:1931-1932` | Promising a trial the user cannot get is wrong information shown (S2 by the legend). Stale "up to 5 active protocols" comment at `:2032`. |
| DV-135 | SEV | `TodayScreen.js:588-589`, `:1930` | "Today" for yesterday's injection is wrong information shown (S2 by the legend); the same math shows "1d ago" at 47 h. |
| DV-149 | P, SEV | `CalculatorSection.js:1189`, `:359`; `progressTile.js:42` | The measured burn still prints on the result view (`:1520`); it is hidden only in the hero and the Journey tile. An approved line not delivered (decisions.md:240) is S3; the fix must cover the tile. |
| DV-150 | SEV | node `realityCheckTDEE({avg 0, Δ 1, 21})` → too_short | A wrong reason shown is S2 by the legend (low reach). |
| DV-152 | SEV | `BodyScreen.js:377` (focus only, no `data_changed` or sync listener) | Card and curve contradicting each other on one Fold screen is S2. |
| DV-158 | P, F | `wheelPick.js:16` (shared by Protocols, Calculator, Assistant) | "Wheel min = today − 365" needs a curve-only option or a new day-level API; bloodwork chips older than 365 days still reach the dash. |
| DV-160 | T | 5 sub-defects confirmed (`VaccinesSection.js:197-198`, `:297-312`, `:576`, `:246`/`:232`; `blood_error_*` copy) | The single test proves only item 3. Each sub-item needs its own failing test (or split the row). |
| DV-170 | P | ErrorBoundary is in `App.js:54-88`, not `components/`; FeatureIcon's `#000000` default is never used (all 93 call sites pass `color`); settingsLegacy colours sit on the `c.accent` premium card (allowed) | Only the ErrorBoundary remains. |
| DV-173 | P, N | 255 test files; 184 use `readFileSync` + 23 read source through helpers | A process item with no failing test: not a sweep row. |
| DV-187 | P | `syncRunner.js:23` | Wrong claim: the sign-out check calls `forceSync` first (`signOutCore.js:60`), so it does not count the row as unsynced. Extend: a `requestSync` during `runExclusive` (the full import) shares the import promise (`:34-37`). The existing test `syncRunner.test.js:23` asserts the current sharing and must change in the same session. |
| DV-188 | C | decisions.md:513; STATE.md:7 | A dashboard delete (ops), not a code-sweep item with a failing repo test; take it off the sweep list. |
| DV-189 | D | `syncHarness.js:67-68` | With the delete half corrected away, what remains is only DV-088's test infrastructure. Merge into DV-088 / DV-119. |
| DV-190 | SEV (arguable), T | `consent_right_3`, `consent_analytics_toggle`, `settings_analytics_sub` ×6 | Privacy copy that overstates anonymity is wrong information (S2). The in-app policy `settings_privacy_body` also says "anonymous". The test needs an "anon" stem per language. |
| DV-192 | P | `translations.js:1091` | `cal_tgt_below_range` already states the range ("({min}–{max} {unit})"); only the "healthy range" wording remains. `ap_fit_fact_powder` "supplier" is confirmed ×6. |
| DV-119 | C | 12 migrations + 15 root `supabase_*.sql`; "NOT APPLIED" headers; vaccines DDL lacks 5 columns | Split DR-7 (a type mismatch leaves a row pending forever, SUSPECTED) into its own S2 row; the rest is S4-like drift. |

Clean CONFIRMED in the S3/S4 sample: DV-089, DV-090 (`endProtocol` is imported in `TodayScreen.js:29` but never called), DV-092, DV-098, DV-102, DV-103 (`quota.ts` is `extract-bloodwork/quota.ts`), DV-108 (signed MB-16, `my-body.md:30`, has no gate; amend it with the fix), DV-109, DV-113, DV-120 (fix it only after DV-182 and M-1: today the cold-start full import is the only repair for food-only users), DV-121, DV-123, DV-128, DV-131, DV-134, DV-140, DV-141, DV-143, DV-162, DV-169, DV-171 (≈ 22 copies by single-line grep), DV-172, DV-193 (`log_title` "Registro de doses" should follow).

### 3.5 Closed rows

| DV | Closing reason | Verdict |
|---|---|---|
| DV-100 | `__tests__/updateRestore.test.js:25-26` and `:49-52` pin `BackgroundTaskWork` / `appScopeKey` against `node_modules`; the test passes | HOLDS. (TRD R-33 and PRD G-91 still point at the closed DV-100; repoint them to DV-118 / A-111.) |
| DV-142 | `OnboardingFlowScreen.js:306-310` shows the setup step after any answer; SP-4 (`reminder-setup-placement.md:18`) says "right after … is answered"; "Not now" skips it (`:622`) | HOLDS. (PRD G-88 still says "DV-142 (to close)".) |
| DV-194 | `wheelPick.js:16` `y0 = min(now−10, y)`; the past-weigh-in sheet uses DTWheel with clampPast (`CalculatorSection.js:1808-1811`) | HOLDS. |

## 4. Founder-decision column problems (18)

Rule applied: the cited id must exist and cover the defect. A fix that adds visible UI or copy the founder never approved must point to an OPEN item, not a DL.

| DV | Cites | Problem | Should be |
|---|---|---|---|
| DV-221 | "founder 3 sim" | Not a decision id. The blanking-scope rule (decisions.md:540) is a coordinator line (`:533` "no question to the founder"); the founder approved applying A-88 as built. | OPEN-21 (add as item 11) |
| DV-209, DV-210 | No (bug) | Production SQL / sync semantics; OPEN-16 (b) explicitly decides when they ship (`OPEN-DECISIONS.md:23`) | OPEN-16 (b) |
| DV-204 | No (bug) | The fix applies the daily cap, which is OPEN-19 (b) | OPEN-19 (b) |
| DV-219 | AD-51 | AD-51's counsel list does not include RevenueCat customer deletion | A new counsel line in AD-51, or OPEN |
| DV-126 | AD-49 | A coordinator line (marked in OPEN-DECISIONS) | OPEN-21 (to match the standard applied to AD-04 / 10 / 29 / 35 / 46 / 50 / 54) |
| DV-190 | AD-57 | A coordinator line "applied by logic within '4 anônima'" (decisions.md:570); it changes visible copy ×6 | OPEN-21 |
| DV-007 | DL-55 | Adds a Settings withdraw row (new UI); OPEN-16 itself says DL-55 is unapproved UI | OPEN for the UI part (DL keeps the per-account key) |
| DV-080 | DL-43 | New chart series design (picture first) | OPEN |
| DV-098 | DL-49 | New Reminder-check rows (picture first) | OPEN |
| DV-113 | DL-58 | New "what you track" editor in Edit profile | OPEN |
| DV-146 | DL-30 | New labels on Progress counts | OPEN |
| DV-036 | DL-10 | Adds "a short message when the dose is already logged" (new copy) | OPEN for the copy |
| DV-058 | DL-26 | New `locked` / `no_result` alert texts | OPEN-09 (already partly) |
| DV-066 | DL-28 | New row state "not read yet — daily limit reached" plus a notice (new copy) | OPEN for the copy |
| DV-087 | DL-60 | New billing line and store link ×6 | OPEN for the wording (the store rule makes the line itself defensible) |
| DV-164 | DL-61 | Visible copy rename to "free days" | OPEN for the wording |
| DV-027 | DL-22 | The rtu "New vial" asks for a box date (new question in the flow) | OPEN-01 or picture-first OPEN |

Note: OPEN-21 item 4 (`OPEN-DECISIONS.md:280`) names only A-85, A-86b and A-87b, but DV-096 (A-96) and DV-105 (A-98) also point to OPEN-21 through AD-11. Add A-96 and A-98 to the item text.

## 5. Duplicates and merge candidates

Hard duplicates (one defect, one fix, one test file; merge the rows):
1. DV-206 → DV-003 (FoodEntryEditor delete without a sheet).
2. DV-208 → DV-068 (DST grid gap, two directions).
3. DV-212 → DV-071 (curve "from your log" copy; one ×6 stem test).
4. DV-189 → DV-088 (only the harness trigger part is left).

Merge at fix time (separate symptoms, one owner or one session):
- DV-199 + DV-027 (rtu new vial = new row, DL-22).
- DV-200 + DV-018 (one days-left owner, AD-65). `expiryColor` is also listed in DV-018, DV-170 / R-46 and DV-181: one row owns it.
- DV-035 + DV-040 (reminder state keyed on the Taken count).
- DV-038 + DV-204 (`LogScreen.markRowTaken`).
- DV-050 + DV-196 + DV-141 (one language-change hook and language source).
- DV-006 + DV-075 (labels by card key is already inside DV-006's fix).
- DV-073 + DV-001 (biomarker `created_at` on push appears in both fixes).
- DV-010's "any row on two devices" clause = DV-183.
- DV-081 + DV-082 (`dosetrace_entitlement_last_uid` in both).
- DV-033 / DV-132 / DV-181 (`monthConsistency` and ring shared values deleted in three rows).
- DV-209 + DV-210 + M-1 (one watermark-correctness item: per-table pull cursor, keyset `(updated_at, id)`, overlap re-read; three tests).
- DV-012 + DV-014 + DV-028 (one schedule owner, plus the `send-reminders/plan.ts` mirror).
- DV-058 + DV-104; DV-062 + DV-063 + DV-149 (AD-13 / tile at `progressTile.js:42`).

## 6. Missing rows

### 6.1 New S1 (most important finding of this round)

**M-1 — a phone's own push hides another phone's earlier rows for good.** Severity S1 (a dose, meal, weigh-in or lab value saved on one phone never reaches another). CONFIRMED by harness, re-run by the coordinator.
- **Mechanism:**
  - The pull watermark is the newest `updated_at` among this phone's synced rows (`lib/syncCore.js:729-733`).
  - `markSynced` stamps this phone's own pushed rows with the cloud's `updated_at` (`:47-65`).
  - Every pass pushes before it pulls (`lib/sync.js:92-93`), and the pull uses `.gt('updated_at', since)` (`lib/sync.js:147`).
  - So once B pushes any row of a table, every row another phone pushed earlier into that table, and that B has not yet pulled, is skipped permanently.
- **Harness:** A logs X and syncs; B logs Y and syncs → cloud 2 doses, B 1; still 1 after two more passes.
- **Reachable:** offline logging on either phone, an Android headless "Mark complete" (it syncs push-first on the next foreground), or any write before the first pull.
- **What protects against it:** only `reality_check_open` (FULL_PULL) and missing protocol ids (`selfHealProtocols`) are protected. `fullImport` repairs it only for users with no protocol, and never for `dose_logs` / `vials` / `protocols` absence.
- **Not covered elsewhere:** not in the TRD (H-1…H-12, F-1…F-12, R-01…R-53) or in DV-209 / DV-210, which have different mechanisms.
- **Fix:** a stored per-table pull cursor advanced only by pull results (part of OPEN-16 b).
- **Test (fails today):** the two-phone repro above.

### 6.2 New rows

| # | Area | Sev | Defect | Evidence | Test |
|---|---|---|---|---|---|
| N-1 | PROT | S2 | Editing an rtu protocol's dose recomputes `total_doses = vial ÷ new dose` and ignores doses already taken. A 10 mg vial at 1 mg with 4 taken, edited to 0.5 mg, gives remaining 16 instead of 12. DV-015 calls the rtu side "recomputed" as if correct. | `protocolForm.js:172-187` (`rtuVialPatch` / `rtuVialFields`) | rtu 10 mg / 1 mg, 4 taken, edit to 0.5 → remaining 12 |
| N-2 | REM | S3 | Snoozing a persistent dose reminder does not stop its +5 / +10 repeats once a resync runs inside the 10 minutes. The snooze cancels the `-f` ids, but `scheduleDoseReminder` re-adds follow-ups of a past slot and never reads the snooze list. On iOS, Snooze opens the app, so a foreground resync follows. Breaks PRD-REM-14. | `notifications.js:969-973` vs `:269`, `:289-307`; `App.js:564-575` | stored snooze for t0 + resync at slot+1 min → no `-t0-f*` scheduled |
| N-3 | REM | S3 | Turning off "Vial alerts" or "Check-in reminders" does not cancel already-snoozed copies (`snz-vial-…`, `snz-checkin-…`, `snz-reality-check-weigh`). | `notifications.js:482`, `:573`, `:996-998` | switch off + stored vial_low snooze → copy cancelled, record dropped |
| N-4 | FOOD | as DV-003 (S1, or S3 if DV-003 is lowered) | The chat's own `removeRow` deletes a refused / too-old row (the user's typed text) without asking (AD-01). | `FoodChatScreen.js:470`, pills at `:549`, `:559` | tap remove → nothing deleted before the sheet's Remove |
| N-5 | TODAY | S2 | Dose log "Missed → Complete" does nothing, with no message, when `recordDoseTaken` returns `{alreadyLogged}` (daily cap); Today shows `showTakeRefused` in the same case. | `LogScreen.js:143-146`; `doseActions.js:69` | capped day → a refusal message is shown |

### 6.3 Extensions of existing rows (the defect is real; the row is incomplete)

- **DV-001:** protocol `created_at` flips between phones on every update (see 3.3).
- **DV-010:** the first-save upsert `onConflict user_id` replaces the whole `calc_inputs` payload (`sync.js:133-136`).
- **DV-012 / DV-013 / DV-014 / DV-028:** the server mirror `send-reminders/plan.ts` and its select (`index.ts:118`).
- **DV-019:** leap-year Feb 29 → impossible saved date.
- **DV-028:** a no-time protocol shows "12:00 AM" in Tomorrow / Next 5 days.
- **DV-035:** a resync re-arms a skipped slot; the server push ignores Skipped.
- **DV-065:** the Your numbers weight path.
- **DV-078:** client-dropped scan results still use up a free scan.
- **DV-081:** `dosetrace_food_asked`, `dosetrace_food_local_pending`, `dosetrace_paywall_views`, `dosetrace_snoozes`.
- **DV-108:** amend the signed MB-16.
- **DV-158 / DV-207:** bloodwork-date chips older than 365 days.
- **DV-187:** `requestSync` during `runExclusive`.
- **DV-200:** the Today alert says "expired" on the expiry day.
- **DV-210:** `fetchAll` offset paging plus the `fullImport` absence-delete can delete a live local row; `updated_at` ties.
- **DV-215:** ES.
- **DV-119:** split DR-7 into its own row.
- Hygiene, not counted: stale "up to 5 active protocols" comment at `ProtocolsScreen.js:2032`.

### 6.4 PRD §6 / TRD §9 crosswalk

- Every PRD gap G-1…G-155 has a DV id except G-117, which is excluded with a reason (correct).
- Every TRD risk R-01…R-50 has a DV id.
- **TRD R-51, R-52, R-53 say "none yet"** (`TRD.md:1042-1044`), but DV-209, DV-211 and DV-210 exist. Fill them in.
- TRD R-33 and PRD G-91 point at closed DV-100; PRD G-88 at closed DV-142 ("to close"). Update them.
- PRD G-72 points only to DV-158, but its "Combined row" half is DV-207.
- Severity disagreements between TRD and DV that a reader will hit: R-05 P1 / DV-183 S1; R-32 P2 / DV-184 S1; R-38 P2 / DV-008 S1; R-41 P2 / DV-003 S1; R-51 P1 / DV-209 S1; R-53 P2 / DV-210 S1; R-50 P1 / DV-070 S2. Pick one scale per defect.
- No defect described in a PRD §6 row or a TRD risk was found without a DV row. The only uncovered defects are the code findings in 6.1–6.3, which neither document has.
