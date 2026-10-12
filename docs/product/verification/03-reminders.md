# Verification 03 — Reminders & notifications (REM)

- Independent check, 2026-10-12, branch `redesign/graduated`. Nothing in PRD/TRD/flows/registers was trusted; every claim below was checked against the code, `docs/decisions.md`, the five reminder specs and the i18n file.
- Scope: PRD §4.4 (PRD-REM-*) + L-8 + the edge-case paragraph; every REM row of `DIVERGENCES.md` (27); the AD/DL/OPEN items of this domain; TRD §4.4 (S-40…S-47) plus the reminder rows of TRD §1.4, §5.3 and §9; flow 06 in full and the notification parts of flows 03, 07, 08.
- Evidence methods: code read; node reproduction on the pure libs (`lib/reminderHealth.js`, `lib/notificationPlan.js`, script in the session scratchpad `rem.cjs`); the 14 reminder test files run (`node --test …`: **130 pass, 0 fail**); `node scripts/spec-audit.cjs` (REM rows failing: BR-9, BR-10, EA-7, RG-6, RG-7, RG-8, SP-9 — matches PRD §0.3); i18n strings read EN/PT from `i18n/translations.js`; library sources in `node_modules` (expo-background-task 1.0.10, expo-notifications 0.32.16).
- Verdicts: **VERIFIED** (claim matches) · **WRONG** (claim is false or its decision/citation does not hold) · **PARTLY** (true in part; correction given) · **UNVERIFIABLE** (device / live / OS behaviour).

## Node reproductions (S1/S2 rows on pure functions)

| Case | Result |
|---|---|
| DV-042: dose reminders off + permission denied | `setupRowState` → `block`; iPhone `blockingCount` → 1; `shouldWarnToday` → false |
| DV-042: no protocol + permission denied | `setupRowState` → `block` |
| DV-042: Silent on + permission denied | `shouldWarnToday` → **true** and `shouldWarnSilent` → true (both cards) |
| Permission unreadable (`null`) | notifications row → `block` (see NEW-3) |
| DV-043: 2 timed protocols, 40 due, 1 scheduled | `scheduleState` → `ok`; Settings `setupRowState` → `ok` ("All set") |
| DV-044: 0 scheduled, every row OK | `scheduleState` → `block`; `setupSteps` → 4/4 done; Settings row → `block` |
| DV-045: never ran | refresh row `ok` + `pending:true`; `staleRefreshDays` → 0 |
| DV-045: last OK 10 days ago, foreground resync 1 h ago | refresh row `ok` (masked); without the foreground resync → `warn`, 10 days |
| Counts | Samsung all OK 5/5; Pixel 4/4; exact alarms unknown + battery unknown → 2/2 |
| DV-053 iPhone budget (dose share + vials + 7 summary + 7 food + weekly + day-21 + 4 snoozes) | 20 protocols/0 vials = 60; 21/0 = 62; 22/0 = 64; **23/0 = 66**; 21/3 vials = 65; 3 protocols/8 vials = 58; 9 vials = 59; 12 vials = 62; 13 vials = 63 (64 cap breached only at ≥ 14 vials with the 1 test reminder, ≥ 15 without) |
| `snoozeFireAt('tomorrow')` at 21:30 / 06:30 | next day 09:00 / same day 09:00 |
| `notifTapTarget` per type | dose → Today focusDose; vial_low/expiry → Protocols openProtocolId; checkin → Progress weighin; reality_check → Progress reality; morning → Today; reminder_test → ReminderCheck; `info` → null; SNOOZE_* → null |
| `dueDateKeys` with `schedule_total` 3, started 11 days ago | `[]` (BR-12 course end honoured) |

## A. PRD §4.4 requirements vs sources

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| PRD-REM-1 | Local one-shot dated notifications; server push OFF, not deployed | VERIFIED | `lib/notifications.js:1079` `SERVER_PUSH_ACTIVE = false`; decisions.md:564, :589 | — |
| PRD-REM-2 | iPhone 10 d / 40 − ≤8 vials; Android 21 d / 400; ≥2 per protocol; mains+follow-ups count; G-83 ">20 protocols or 8 vials overflow" | PARTLY | `notificationPlan.js doseBudget`; node table above | Per-protocol caps (24 iPhone, 60 Android) are omitted. The vial deduction counts **all active vials** (`getActiveVials().length`), not vials with an expiry. Overflow of 64 happens at ≥ 23 protocols (no vials) or ≥ 21 protocols with ≥ 3 vials, or ≥ 14–15 vials — not ">20 / >8". |
| PRD-REM-3 | Top-up on open, foreground (60 s), Settings, sign-in, Android refresh/receiver/wake | VERIFIED | `App.js:565-576, 650, 730`; `SettingsScreen.js:295`; `backgroundTasks.js`; `notificationActions.js:203-206` | — |
| PRD-REM-4 | Non-destructive; unknown state cancels nothing; one resync at a time | VERIFIED | `scheduleDoseReminder` wanted-set then cancel; `syncFoodLogReminder` `if (!user) return`; `syncAllNotifications` `_rerun`; tests `nonDestructiveSchedule`, `reminderRefresh` AC6 pass | — |
| PRD-REM-5 | Resync order | VERIFIED | `syncAllNotificationsNow` `notifications.js:859-875` | — |
| PRD-REM-6 | Notification language = app language at schedule time (gap only: no re-plan on change) | WRONG | `getT()` reads `dosetrace_language` or **'en'** (`notifications.js:18-24`, `notificationActions.js:139`); `LanguageContext.js:33-39` shows the **device** language when nothing is stored but never stores it | A user who never picks a language explicitly sees the app in Portuguese (device) and gets every notification, action button and channel-independent text in **English**. Unregistered S2 (NEW-1); add to G-77/DV-050. |
| PRD-REM-7 | No advice, no emoji in titles | VERIFIED | all titles read (protocol name, "Dose reminder", "Good morning", "Vial running low", "Vial expiring soon", "Weekly check-in", "Reality-check weigh-in", "Anything else today?", "DoseTrace", "Nothing new logged") | — |
| PRD-REM-8 | Channels dose MAX / vial HIGH / check-in DEFAULT, English names | VERIFIED | `initNotifications` `notifications.js:89-102` | — |
| PRD-REM-10 | One per slot; title name / "Dose reminder"; body "Time for your {dose} {unit} dose", locale decimal | VERIFIED | `scheduleDoseReminder:239-284`; EN/PT strings match | Title uses stored `p.name` (DL-13 / DV-013). |
| PRD-REM-11 | Skip past slots and first N Taken slots today; Skipped keeps its reminder | VERIFIED | `takenToday` counts `outcome === 'Taken'` only (`:244-248`) | — |
| PRD-REM-12 | No time → 08:00; form always writes a time | VERIFIED | `reminderTimes` (`notificationPlan.js:57-63`); `lib/protocolForm.js:52,140` default time | — |
| PRD-REM-13 | Buttons per interval; snoozed copy Mark complete only; foreground rules | VERIFIED | `syncNotificationCategories` `notifications.js:114-150` | Vial, weekly check-in and day-21 notifications also carry In 1 hour / Tomorrow (`general-reminder`) — not mentioned. |
| PRD-REM-14 | Follow-ups +5/+10, body string, kept after slot, cancelled with slot/snooze | VERIFIED | `FOLLOWUP_DELAYS`, `:288-310`; snooze cancels `-f` ids `:968-972` | — |
| PRD-REM-15 | Cancel triggers | VERIFIED | `cancelTodaysDoseReminders`, `cancelDoseReminder` (Protocols :1241, :1348, :2018; Today :547), orphan sweep, switches, Silent, sign-out/guard (`App.js:629,711`, `signedOut.js:160`) | — |
| PRD-REM-16 | Renewed until ended/deleted; total ends course | VERIFIED | `dueDateKeys` honours `schedule_total` (node: `[]`); decisions.md:594, :601, :620 | — |
| PRD-REM-17 | Tap → Today on dose; launch tap once, > 12 h ignored; waits for Main; sign-out drops queued tap | VERIFIED | `App.js:402-432, 549-550`; `signedOut.js:19` | — |
| PRD-REM-20 | Morning summary 07:00 × 7, strings, no buttons, tap → Today | VERIFIED | `syncMorningSummary`; strings EN/PT; node plan | Days with nothing due within 45 days get no summary (kind `none`) — unstated. |
| PRD-REM-21 | Protocol create/edit/delete re-plans summary + vial alerts (gap G-78) | VERIFIED | ProtocolsScreen calls only `scheduleDoseReminder` / `cancelDoseReminder` | — |
| PRD-REM-30 | Mark complete oral: own slot within slot+12 h; snoozed copy tapped later logs at tap time; cancels up to tapped slot | PARTLY | `markTaken.js:204-208`, `notificationActions.js:72-103` | `atNow` only when the copy is snoozed **and** its slot day is before today **and** > 12 h; a non-snoozed reminder tapped after 12 h still logs to its slot; the cancel runs only when the logged day and the slot day are today. |
| PRD-REM-31 | Injectable: site question, opens app, Android keeps banner when not active | VERIFIED | `notificationActions.js:81-90, 177` | — |
| PRD-REM-32 | At most once; "Nothing new logged"; no channel, bypasses Silent | VERIFIED | `claim`, `inFlight`; `notifyNothingLogged` calls `N.scheduleNotificationAsync` directly (`:133-145`) | — |
| PRD-REM-33 | Snooze rules, 4 max, re-title with names off; G-84 | VERIFIED | `snoozeFireAt`, `pruneSnoozes`, `restoreSnoozesLocked:989-1026`; node | — |
| PRD-REM-40 | Vial low / expiry rules, switch, tap, G-76, G-15 | VERIFIED | `syncVialAlerts:476-563`; `vialExpiryPlan` | Expiry title is "Vial expiring soon". |
| PRD-REM-50 | Weekly check-in Sunday 10:00, tap → Progress "Log today's weight" [#132] | PARTLY | `syncCheckinReminder` weekday 1; tap → Progress focus `weighin` | decisions.md:132 says "the tap opens Body"; the Progress target comes from A-44 (features.md), cite that. |
| PRD-REM-51 | Day-21 weigh-in 10:00, synced open check, strings, tap, cancel | VERIFIED | `syncRealityCheckReminder:609-652`; strings EN/PT | No switch gates it (not "Check-in reminders"), only Silent — undocumented. Stale comment ":603-606 reads AsyncStorage". |
| PRD-REM-52 | Cancel once weigh-in exists = AD-12 | PARTLY | A-118 (features.md:258) names the Today alert and food card only | It is a logical extension of A-118, not "already decided" for notifications — call it DL. |
| PRD-REM-60 | 20:00 food question rules | VERIFIED | `syncFoodLogReminder`, `foodNudgeDays`, `remindersForAccess`, `closeFoodDayFromNotification`; sync listener `App.js:586-596` | Body quote uses "—" not ","; switch label is "Food-log reminder". |
| PRD-REM-70 | Test reminder 10 s, dose channel, passes Silent, no dose, tap → screen | VERIFIED | `sendTestReminder`; `scheduleReq` exemption; tap target | — |
| PRD-REM-80 | Settings row states (Android) / iPhone row | VERIFIED | `SettingsScreen.js:241-251, 676-695, 785-800`; `setupRowState` | — |
| PRD-REM-81 | One screen: bar, items, refresh, next + count, test; no setup mode | VERIFIED | `ReminderCheckScreen.js`, `ReminderSetupList.js` | — |
| PRD-REM-82 | Row rules; unreadable no OK; only readable can block; 5/4 items | PARTLY | `reminderChecks` | Permission read failure (`null`) is `block` — an unreadable value blocks (NEW-3). "4 elsewhere" only when all four are readable (node: 2/2 when two are unknown). |
| PRD-REM-83 | Return from Android settings re-reads; exact alarms on → reschedule + re-arm | VERIFIED | AppState listener `ReminderCheckScreen.js:42-44`; `watchExactAlarms` | — |
| PRD-REM-84 | One owner; G-89 / DL-45 notes | VERIFIED | all surfaces call `reminderHealth` | — |
| PRD-REM-90 | Today cards, conditions, combined, deep sleep never, each opens at its item; G-3 | PARTLY | `TodayScreen.js:1580-1660` | Blocked, combined and Silent cards open the screen with no focus. The G-3 note is wrong for this surface: a null-time protocol IS reminded at 08:00 (PRD-REM-12, DL-06), so counting it for warnings is correct. |
| PRD-REM-100 | Background refresh rules | VERIFIED | `reminderRefresh.js`, `backgroundTasks.js`; tests AC1-AC11 pass | Implementation is a chain of one-time WorkManager jobs (initial delay 360 min), re-queued 60 min later when the app is in front. |
| PRD-REM-101 | Other-device changes reach on open/wake | VERIFIED | decisions.md:605; BR-5 | — |
| PRD-REM-102 | Update/reboot rebuild [A-111; #565] | PARTLY | receiver `RefreshOnUpdateReceiver.kt`; tests pass | #565 is the R8 keep-rule incident, not the receiver; update-path device proof still missing. |
| PRD-REM-103 | Daily wake-up cron 08:00 UTC, ≥ 20 h, data-only, Android | VERIFIED | `wake-refresh/index.ts`, `plan.js` (no title/body); decisions.md:611 | — |
| PRD-REM-104 | Refresh needs network, receiver does not; G-80 | VERIFIED | `BackgroundTaskScheduler.kt:93-95`; receiver has no constraint | — |
| PRD-REM-105 | iPhone no renewal, 10/7 days, no warning | VERIFIED | `doseBudget` ios 10; summary/food 7; no iOS task | — |
| PRD-REM-110 | 7 switches, user_metadata, re-plan, revert on failure | VERIFIED | `toggleNotificationPref:282-296` | — |
| PRD-REM-111 | Silent cancels all, test only, own state, snoozes survive | VERIFIED | `syncAllNotificationsNow:861-866`; `scheduleReq`; records kept | — |
| PRD-REM-112 | Apple review account Silent off | UNVERIFIABLE | live account | decisions.md:606 records it. |
| PRD-REM-120 | iOS asks at Enable; "asks again at every signed-in cold start" | PARTLY | `App.js:650, 730`; `registerPushToken` also calls it (`:1033`); `OnboardingFlowScreen.js:306-309` | The call runs at every cold start/sign-in, but the OS dialog appears only while the status is undetermined (iOS once). Onboarding asks on Android too, not only iOS. |
| L-8 | Reliability loop steps | VERIFIED | as rows 80-105 | — |
| §4.4 edge cases | list | VERIFIED | spot-checked: never opened, receiver, sign-out, cross-account, TZ (absolute triggers), 5th snooze, snooze in Silent | Language-change item misses NEW-1. |

## B. DIVERGENCES.md — every REM row

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-002 (S1) | Snoozed vial-expiry copy keeps name with names off; moved to check-in channel | PARTLY | `CHANNEL_FOR` has no `vial_expiry` → `checkin-reminders` (`:903, 945`); re-body only for `vial_low` (`:1003-1006`) | True, but only when names were ON at snooze time and switched off within the snooze window (≤ 1 day); a copy snoozed with names off already has "Your vial". S1 is generous; S2 fits. |
| DV-042 | Settings red whenever a row blocks; Today Blocked ignores Silent | PARTLY | node: reproduced both | Facts VERIFIED. The proposed fix (DL-45) is wrong for Settings — see DL-45. |
| DV-043 | "ok" with one reminder; two counts | VERIFIED | node: 1 of 40 → `ok` / "All set" | — |
| DV-044 | Bar ignores schedule | VERIFIED | node: 4/4 done while `block` | — |
| DV-045 | Never-succeeded = pending forever; foreground masks | VERIFIED | node | — |
| DV-046 | `ok:true` whenever sync does not throw; count dropped | VERIFIED | `reminderRefresh.js:37-39`; `saveLastRun` stores `{at, ok, reason, lastOkAt}` only; `ensureDb` failure swallowed (`backgroundTasks.js:25-29`) | — |
| DV-047 | Standalone schedulers use cached Silent | PARTLY | `_silent` reset only in the full resync (`:61-66, 862`) | Also the source itself is stale: `getCachedUser` = `getSession().user`, whose metadata changes only on a token refresh — even a full resync may not see another device's change. Keep SUSPECTED. |
| DV-048 | "Nothing new logged" no channel, bypasses Silent | VERIFIED | `notificationActions.js:133-145` | — |
| DV-049 | Copy "every 5 min until acknowledged" vs two repeats | VERIFIED | EN/PT `settings_persistent_sub`; `FOLLOWUP_DELAYS [5,10]` | — |
| DV-050 | Language change does not re-plan | PARTLY | `LanguageContext.setLanguage` only stores | Incomplete: the default device language is never stored, so notifications are English for those users regardless of any change (NEW-1). |
| DV-051 | Protocol writes re-plan only dose reminders | VERIFIED | ProtocolsScreen imports only `scheduleDoseReminder`, `cancelDoseReminder`, `dismissDeliveredDoseReminders` | — |
| DV-052 | Pull re-plans only food + weigh-in; resume concurrent | VERIFIED | `App.js:574, 586-596` | — |
| DV-053 | iPhone overflow above 20 protocols / 8 vials | PARTLY | node table | Thresholds wrong: ≥ 23 protocols (no vials), ≥ 21 with ≥ 3 vials, or ≥ 14-15 vials. The test "25 protocols + 10 vials → ≤ 64" still fails today and is a fine test. |
| DV-054 | Permission request at every cold start / SIGNED_IN | VERIFIED | `App.js:650, 730`; also inside `registerPushToken` | Citation of its decision is wrong (AD-27 below). |
| DV-055 | Weekly check-in repeating trigger | VERIFIED | `trigger: {type:'weekly'}` `:589-594`; the file's own food comment `:647-656` | — |
| DV-097 | iPhone no background refresh | VERIFIED | no iOS task; windows 10/7/7 | — |
| DV-098 | Only dose channel checked | VERIFIED | `readReminderHealth` reads `dose-reminders` only (`:1137`) | — |
| DV-099 | Network constraint on the 6-hourly run | VERIFIED | `BackgroundTaskScheduler.kt:93-95` (1.0.10) | — |
| DV-100 | Receiver depends on class name; needs a guard test | WRONG | `__tests__/updateRestore.test.js` "expo-background-task still has the worker class and the input key the receiver uses" already pins `BackgroundTaskWork` + `appScopeKey` against `node_modules` (passes) | Close the test half; what remains is the device proof (A-111 / DV-118). |
| DV-138 | `shouldWarnLate` re-implements `remindersMatter` | VERIFIED | `reminderHealth.js:113-115` | — |
| DV-139 | "Next reminder" ignores snoozes etc. | VERIFIED | `readReminderHealth:1146-1155` uses `slotMs` (original slot) of `dose_reminder` only | Snoozed dose copies ARE counted in `scheduledCount`, just never "next". |
| DV-140 | "Vial expiry alerts" also silences low | PARTLY | `syncVialAlerts:483` | Fact VERIFIED; AD-26 citation does not decide a rename (see AD-26). |
| DV-141 | Channel names English | VERIFIED | `:89-102`; PT row `rc_channel` shows 'Categoria "Dose Reminders"' | — |
| DV-142 | Setup step shown after a denied dialog | WRONG | `OnboardingFlowScreen.js:306-309` ignores the result; SP-4 says "right after … is answered" | Not a divergence — code = signed SP-4. PRD G-88 even types it "bug". Drop the row (DL-50 keeps the behaviour). |
| DV-143 | Legacy `shouldShowAlert`; banners might not show | PARTLY | 0.32.16: iOS maps `shouldShowAlert` to `.alert` (`HandlerModule.swift:79-82`), Android counts it (`NotificationBehaviorRecord.kt:24`) | Banners do show; only a deprecation `console.warn`. S4 hygiene, not SUSPECTED behaviour. |
| DV-144 | A-24 still open | VERIFIED | features.md:164 | — |
| DV-145 | Dormant send-reminders lacks features; iPhone tokens unused | VERIFIED | `send-reminders/index.ts:30-35` old food copy, no silent/show-names; `wakeMessages` Android only | — |

## C. AD / DL / OPEN items of this domain

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-03 | Names off = never a name on the lock screen (decisions.md:311) | VERIFIED | line 311 | — |
| AD-04 | Cancel reminders on confirmed deletion/revocation (decisions.md:599) | VERIFIED | line 599 | Not built (DV-009). |
| AD-12 | A-118: every reality-check message follows the real state (features.md:258) | PARTLY | A-118 text covers Today alert + food card | Notification part is logic (DL), not ledger. |
| AD-25 | Silent own state, never blocked (BR-4, A-108) | VERIFIED | BR-4 text | — |
| AD-26 | One "Vial alerts" switch covers low + expiry (A-45) | PARTLY | A-45: the existing switch covers both, "making the current 'Vial expiry alerts' copy true" | The ledger keeps the label; renaming to "Vial alerts" (DV-140) is a new copy decision (logic + founder wording), not AD. |
| AD-27 | "Not now" users are not asked for more (decisions.md:623) | WRONG | line 623 has no such rule; the phrase is in `reminder-setup-placement.md` header and concerns only the onboarding setup step; decisions.md:626 + SP-5 explicitly re-open the screen for "Not now" users once they have a reminder time | Re-cite: SP header (setup step only). DV-054's fix (ask at the first timed protocol) is new design consistent with SP-5's spirit → DL, not AD. |
| AD-37 | Server push OFF until A-62 (decisions.md:350, :589) | VERIFIED | both lines | — |
| DL-06 | No-time protocols use the form's default slot list everywhere | VERIFIED (logic) | — | Contradicted by flow 06 D06-5, PRD G-3 for warnings, TRD S-40 (see D, E). |
| DL-08 | Skip cancels the slot's reminders; no Undo bar | VERIFIED (logic) | decisions.md:653 recorded | TRD S-05 still says "founder decision needed". |
| DL-09 | Undo / Dose-log delete re-arm | VERIFIED (logic) | A-36 open "founder to set target" | — |
| DL-13 | Re-plan on language change | VERIFIED (logic) | — | Must also persist the device-language default (NEW-1). |
| DL-45 | Settings "blocked" uses Today's order (Silent, off, nothing needed first) | WRONG | Permission denied / category off blocks the food question, weekly check-in, day-21 weigh-in and vial alerts even when dose reminders are off or no protocol exists; RC-1/SP-1 (signed) define Settings by blocks, not by "dose reminders matter" | Keep only the Silent half (BR-4 / AD-25). For "off / no protocol", Settings stays red while any switched-on kind is blocked; any change to RC-1/SP-1 wording is a founder-signed spec amendment, not DL. |
| DL-46 | OK only when every timed protocol due in the window has reminders; bar shows None scheduled | VERIFIED (logic) | SP-1 "All set only when … nothing blocks" | — |
| DL-47 | Never-ran warns after 2 days; OK only when rebuilt; keep count | VERIFIED (logic) | RG-4 literally: attention "when it has not run for more than 2 days" — code's "never ran = OK" deviates from RG-4 | Foreground masking was an agent council choice (code comments), not a ledger line. |
| DL-48 | Persistent copy describes +5/+10 | VERIFIED (logic) | iPhone's 64 cap makes "until acknowledged" impossible locally | — |
| DL-49 | Check the channel of every switched-on kind (picture first) | VERIFIED (logic) | — | — |
| DL-50 | Step after a denied dialog stays; amend SP-4 | PARTLY | SP-4 already says "answered" | Nothing to amend; drop DV-142. |
| DL-51 | A-24 closed | VERIFIED (logic) | reminder follows the open check | — |
| OPEN-03 | Course end | VERIFIED (real preference) | BR-12 vs no UI (`dueDateKeys`) | — |
| OPEN-06 | iPhone without opening | VERIFIED (real preference) | BR-11; no iOS task | — |

## D. TRD ownership and reminder rows

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S-40 | Proposed `hasReminderTime(p)` = real times only | PARTLY | `readReminderHealth:1162` | Contradicts DL-06: a null-time protocol is reminded at 08:00, so it must count as "with a reminder time" for warnings. |
| S-41 | scheduleState owner; "per-protocol coverage (founder line)" | PARTLY | owner correct | Already DL-46, not a founder line. |
| S-42 | Rows/warnings owner; divergences; "founder lines for D-1/D-2" | PARTLY | owner and divergence list correct | D-1/D-2 are DL-45/AD-25 (and DL-45 is itself wrong, §C). |
| S-43 | Bar owner; ignores schedule | VERIFIED | node | — |
| S-44 | Count / next / until from one queue read; two counts; snooze never next | VERIFIED | `readReminderHealth`; `refreshNow.countScheduled` | — |
| S-45 | Slot resolved Taken-only | VERIFIED | `doseSlotResolved:922-932` | — |
| S-46 | Tap target single owner | VERIFIED | only `App.js routeTap` + `foodTapParams` | — |
| S-47 | Food/day-21 plan owners | VERIFIED | `foodNudgeDays`, `remindersForAccess`, `syncRealityCheckReminder` | — |
| S-05 | Skip resolves reminder: "founder decision needed" | PARTLY | — | Decided by DL-08. |
| TRD §1.4 action task row | ensureDb marks ready even on failure; getCachedUser may refresh | VERIFIED | `notificationActions.js:31-35`; `supabase.js:40-44` | — |
| TRD §1.4 refresh task row | "Periodic", 360 min, CONNECTED | PARTLY | `BackgroundTaskScheduler.kt:76-130, 207-214` | Chained one-time works with initial delay; when the app is in front a run is re-queued in 60 min. |
| TRD §1.4 receiver row | class name + key, no constraint | VERIFIED | Kotlin source | — |
| TRD §1.4 iOS row | no background mode | VERIFIED | BR-11 test passes | — |
| INV-20…INV-27 | scheduling/headless invariants + tests | VERIFIED | 14 reminder test files: 130 pass | — |
| H-9 | Pull does not re-plan doses | VERIFIED | `App.js:586-596` | — |
| R-33 | Needs a version-pinned test | PARTLY | test exists (`updateRestore.test.js:45-53`) | Only the device proof is open. |
| R-34 | Refresh needs network; "wake push covers" | WRONG | the wake push travels over FCM — an offline phone receives neither | Offline Android is covered only by the update/reboot receiver and the 21-day window; no mitigation exists today. |

## E. Flow 06 (diagrams, divergence notes, acceptance texts EN/PT)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| §2 Actors | 9 actors and roles | VERIFIED | code | — |
| §4 P1-P3 | once-per-phone opening | VERIFIED | `reminderSetup.js`, `TodayScreen.js:187-191` | — |
| §4 P8 | Receiver rebuilds; "Fold check 238/248 restored" | PARTLY | decisions.md (Fold build 47: reboot); A-111 row | 238/248 was a **reboot handled by expo's own restore before the receiver existed**; the update path is unproven. |
| §4 P11, P14 | R8 incident; spurious sign-out → `signed_out` | VERIFIED | decisions.md:565; `reminderRefresh.js:29` | — |
| §4 P13 | Language change keeps old language | PARTLY | — | Add NEW-1 (default device language never reaches notifications). |
| §5 happy path | steps and windows | VERIFIED | `SETUP_IDS` order; budget | — |
| §6.1 schedule state | order and conditions | VERIFIED | `scheduleState` | — |
| §6.2 row states | open/ok/warn/block | VERIFIED | `reminderChecks` | Unknown permission also goes to block (NEW-3). |
| §6.3 Silent | transitions | VERIFIED | `syncAllNotificationsNow`, `restoreSnoozes` | — |
| §6.4 refresh run | states | VERIFIED | `reminderRefresh.js` | — |
| §6.5 freshness | intended LateNeverRan marked | VERIFIED | node | — |
| §6.6 setup seen | transitions | VERIFIED | `markSetupSeen` before navigate | — |
| §7.1 budget | "40 − min(active vials with expiry, 8)"; G18 ">20 / 8" | PARTLY | node | All active vials; thresholds as in DV-053. |
| §7.3 table | read / state / fix per item | PARTLY | `ReminderSetupList.ROW`, `openReminderFix` | The refresh row's Adjust opens the app's Android page (`fix:'battery'`), not "screen at the refresh row" (that is the Today card). |
| D06-3 / D06-4 | Silent + Blocked; two rules | VERIFIED | node | The intended "one rule" must not be DL-45 as written. |
| D06-5 | Intended: "protocol with a reminder time" = a real time | WRONG | DL-06; `reminderTimes` | The null-time protocol is reminded at 08:00; warnings for it are correct. Drop the note or re-scope to Today (rings/Due). |
| D06-6…D06-15 | divergences | VERIFIED | code (each matched to DV rows above) | D06-10: add NEW-1. |
| D06-16 | Device proofs missing | VERIFIED | spec-audit: BR-9/10, EA-7, RG-6/7/8, SP-9 FAIL | — |
| §7.6 / §7.7 | account events; second device | VERIFIED | `signOutCore.js:67`; `App.js:586-596` | — |
| §7.9 | Today cards open "at their item" | PARTLY | `TodayScreen.js:1587, 1599, 1610` | Silent, Blocked and combined cards open with no focus. |
| §8 table | surface strings per state | VERIFIED | EN/PT i18n | "≥ 2 warnings → Settings N of M ready" is "Something is blocking…" when one of them is a block. |
| §9 data | ids and keys | VERIFIED | code | — |
| §12 | only OPEN-06 open | VERIFIED | OPEN-DECISIONS | — |
| F06-01 | Settings row EN/PT | VERIFIED | `settings_setup_title`, `rc_setup_progress`, `settings_setup_all_next` | — |
| F06-02 | iPhone row EN/PT | VERIFIED | `settings_rc_*` | — |
| F06-03 | Screen contents | PARTLY | `setupSteps` filters the channel row when OK; deep sleep only on Samsung | Category "Dose Reminders" row appears only when that category is off; strings EN/PT otherwise correct. |
| F06-04 | Test reminder | VERIFIED | `rc_test_sent`, `rc_test_body` EN/PT; tap target | — |
| F06-05 | Exact alarms off → late, Turn on, card gone | VERIFIED | `rc_alarms_*`, `today_alert_late_*`; EA-4 listener | — |
| F06-06 | Battery | VERIFIED | strings; `openBatteryOptimizationSettings` | — |
| F06-07 | Hibernation | VERIFIED | strings | — |
| F06-08 | Combined card EN/PT | VERIFIED | `today_alert_combined_*` ("{n} ajustes para seus lembretes") | — |
| F06-09 | Samsung deep sleep | VERIFIED | strings; SP-10 | — |
| F06-10 | Permission revoked | VERIFIED | strings | — |
| F06-11 | Silent mode | VERIFIED | strings; queue cleared | — |
| F06-12 | Dose reminders off | VERIFIED | `cancelAllDoseReminders`, summary cancel; `rc_reminders_off` | — |
| F06-13 | Once-per-phone opening | VERIFIED | 600 ms timer, `isFocused` | — |
| F06-14 / F06-15 | 7 days unopened; update/reboot | UNVERIFIABLE | device | — |
| F06-16 | Late card on opening with network off | PARTLY | `syncAllNotifications` sets `dosetrace_fg_sync_at` whenever a user is known; `staleRefreshDays` returns 0 then | Reproducible only if the offline open yields no session; if the stored session is returned the open itself counts as fresh and the card never shows. Use a forced `dosetrace_refresh_last` + cleared `dosetrace_fg_sync_at` instead. |
| F06-17 | iPhone 10-day window | VERIFIED (logic) | budget | — |
| F06-18 | Names off strings EN/PT | VERIFIED | `notif_dose_title_private`, `notif_morning_due_private*`, `notif_vial_fallback` | — |
| F06-19 | Both themes | UNVERIFIABLE | device/sim | — |

## F. Notification parts of flows 03, 07, 08

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| 03 §2 / §5 | Buttons, headless oral, injectable opens, body tap "From your reminder" | VERIFIED | categories; `today_notif_focus_title` | — |
| 03 P1 | Second tap: "Nothing new logged" with "That dose was already logged … It now shows on Today." | PARTLY | that is Today's in-app text (`markTaken.js:259`) | The Android notification button shows "That dose is already recorded, or the protocol is paused. Open DoseTrace to check." |
| 03 P7, P8, §6.4, line 217 | Snoozed copy, site question, slot states, headless | VERIFIED | `notificationTakeTarget`, `saveQuestion`, `pruneSnoozes` | — |
| 07 §6.4 / §7.7 | Notification **Log it** → chat "logging onto that day" | WRONG | `foodTapParams` returns `{ logIt: nowMs }` with no day (`notificationPlan.js:153`); `FoodChatScreen.js:185-189` only focuses the composer | After midnight, "Log it" on last night's question logs onto **today**; only the body tap carries `eveningDay`. Register as a divergence (NEW-2) — FL-40's "Log it for an earlier day" is the in-chat bubble. |
| 07 F07-13 / F07-14 / P6 | 20:00 strings EN/PT, headless close, none without a check, next-morning body tap | VERIFIED | strings; `closeFoodDayFromNotification`; `foodNudgeDays` | — |
| 08 line 13 | "every reminder follows the real state (A-118)" | PARTLY | A-118 covers Today alert + food card | As AD-12. |
| 08 §6.3, lines 157, 165 | Day-21 10:00 armed, not scheduled when past, fires after an earlier weigh-in | VERIFIED | `syncRealityCheckReminder` | — |

## G. Findings not in any register (new)

| ID | Finding | Severity | Evidence | Test that must fail first |
|---|---|---|---|---|
| NEW-1 | The default (device) language is never stored, and every notification reads the stored language or English: a Portuguese phone that never chose a language in onboarding/Settings gets English reminders, buttons and "Nothing new logged". | S2 | `LanguageContext.js:33-39`; `notifications.js:18-24`; `notificationActions.js:139` | No `dosetrace_language`, device pt → `getT()` returns pt strings. |
| NEW-2 | Notification "Log it" carries no day (see §F). | S2 | `notificationPlan.js:153` | `foodTapParams(FOOD_LOG_IT on food-log-2026-10-11)` includes that day. |
| NEW-3 | An unreadable permission (`null`) is a block — red "blocked" from a failed read, against "only what the app can read can block". | S4 | `reminderHealth.js:56` | `permission: null` → state `open`. |
| NEW-4 | The day-21 weigh-in reminder has no switch of its own (Check-in reminders does not gate it); only Silent stops it. Undocumented in PRD-REM-110 / flow 06 §7.4. | S4 (doc) | `syncRealityCheckReminder` reads no switch | — (document or decide) |
| NEW-5 | PT copy: `today_alert_reminders_body` says "avisos de dose" while the title and every other string say "lembretes" (one term per concept); `rc_refresh_until` PT "lembretes **garantidos** até" promises what EN "scheduled until" does not. | S4 | i18n PT | i18n term check. |
| NEW-6 | TRD R-34 mitigation is false (wake push needs network). | S4 (doc) | §D | — |

## Counts

| Section | Items | VERIFIED | WRONG | PARTLY | UNVERIFIABLE |
|---|---|---|---|---|---|
| A. PRD | 46 | 36 | 1 | 8 | 1 |
| B. DIVERGENCES REM rows | 27 | 18 | 2 | 7 | 0 |
| C. AD/DL/OPEN | 20 | 15 | 2 | 3 | 0 |
| D. TRD | 17 | 10 | 1 | 6 | 0 |
| E. Flow 06 | 41 | 31 | 1 | 7 | 2 |
| F. Flows 03/07/08 | 7 | 4 | 1 | 2 | 0 |
| **Total** | **158** | **114** | **8** | **33** | **3** |

Plus 6 new findings (NEW-1…NEW-6) missing from every register. REM register summary (1/14/4/8 = 27) is arithmetically correct; after this check DV-100 and DV-142 should close, DV-002 and DV-143 move down a severity, and NEW-1 / NEW-2 enter as S2.
