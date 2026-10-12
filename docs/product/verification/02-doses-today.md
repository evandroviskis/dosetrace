# Verification 02 — Doses and the Today screen (TODAY · flow 03 · dossier 02)

- Verifier: independent pass, 2026-10-12, branch `redesign/graduated` @ 897f01d. Read-only on code and product docs.
- Sources checked: `screens/TodayScreen.js`, `screens/LogScreen.js`, `screens/SettingsScreen.js` (report), `screens/components/TodayTracker.js`, `screens/components/BodyMapModal.js`, `lib/{schedule,adherenceRings,adherenceReport,doseStreak,declared,dosePageState,protocolTake,markTaken,doseActions,missedDoses,pendingYesterday,siteQuestion,sitePickerActions,notificationActions,notifications,notificationPlan,todayFormat,offlineAlert,undoBar,supplyLow,vialExpiry,protocolEnd,protocolForm,bodySites,recoveryFlow,reminderSetup}.js`, `i18n/translations.js` (EN/PT), `docs/decisions.md`, `docs/specs/fixes-1.2.5.md`, `docs/design/prototype.html`, `STATE.md`, `docs/review/features.md`.
- Runs: the pure libs were executed under `TZ=America/New_York node` (scripts in the session scratchpad, `repro1.cjs`, `repro2.cjs`); the 21 dose/Today test files were run with `node --test` → **218 pass, 0 fail**.
- Verdicts: VERIFIED = the claim matches code/ledger; PARTLY = true in part, or true but mis-stated; WRONG = the claim is false; UNVERIFIABLE = needs a device, a second phone or runtime timing.

## Script output used as evidence

```
R1  DV-030  daily 08:00, Taken yesterday 21:00, now 07:00 -> today {taken:1,due:1}  week {taken:0,due:6}
           control: Taken yesterday 19:00 (11 h late)      -> today {taken:0,due:1}  week {taken:1,due:6}
           card at 07:00: next open = true, taken 0
R2  DV-029  created today 21:00, time 08:00: expectedDosesOn 1, expectedSlotTimesOn [] ;
           card due=true (slot 08:00) ; rings.today null before AND after a take at 21:05
R3  DV-028  no time: reminderTimes [08:00]; expectedDosesOn 1; slots []; rings 0/1 today, 0/7, 0/30 (noon slots);
           Missed rows in 14 days: 0 ; card next.slotMs null, due false
           dpd 2 + one time 08:00: expectedDosesOn 2, slots [08:00], reminders 1, ring today due 1, Missed rows 14 days: 14
R4  notification "Mark complete", oral, today's 08:00 slot tapped 08:07 -> logged_at 08:07 (TAP time, not the slot)
           yesterday 20:00 slot tapped 00:30 -> logged_at yesterday 20:00 (slot)
R5  DL-67   weekly protocol, Monday slot snoozed to Tuesday, tapped Tue 09:05: target {atNow:true};
           expectedDosesOn(Tuesday) = 0; today's code logs it at 09:05 -> with "cap = expected that day" it would be refused
R6  doseStreak weekly, 4 consecutive weekly doses -> 4
R7  DV-033  10 Taken in 30 days, no Missed rows (watermark): 30-day ring {10/30} = 33 %; report adherence 100 %
```

---

## A. PRD — chapter 4.2 "Today, doses, Dose log" + loop L-1

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| L-1 (1,2,4,5,6) | Daily loop: Due tag 5 min before, reminder with Mark complete / In 1 hour (+Tomorrow < daily), follow-ups +5/+10, everything that reacts, midnight → pending → Missed | VERIFIED | `lib/dosePageState.js:33,168`; `lib/notifications.js:131-139,185`; `TodayScreen.js:1093-1155` | — |
| L-1 step 3 | "From the notification button: an oral dose is logged in the background **at the slot**" | WRONG | R4; `lib/markTaken.js:101-104` (today → `nowMs`); `lib/notificationActions.js:91-93` passes no tap time; PRD-DOSE-3 itself says today's Complete = tap time | For today's slot the notification button logs the **tap time**; only a slot of a previous day (inside slot + 12 h) is logged at the slot time. |
| PRD-TODAY-1 | Order header → From your reminder → Alerts → Pending → tracker → food hero → empty → Doses (+Complete fold) → Tomorrow/Next 5 → disclaimer | VERIFIED | `TodayScreen.js:2066-2213` | — |
| PRD-TODAY-2 | Keep all features; layout changes only via approved picture | VERIFIED | `docs/decisions.md:139` | — |
| PRD-TODAY-3 | One popup at a time; queued items open 450 ms after | PARTLY | Queue + 450 ms: `TodayScreen.js:951-956,1188-1192`. But `checkTreatmentStillActive` (`:530`) only checks the site picker, queue and Log editor — not the vial prompt, the Skip sheet or the Today sheet; `checkOrphans` (`:932`) runs in the same focus, so the orphan sheet and "Still going?" can open together | Add: the inactivity prompt does not check `vialPromptOpenRef / skipSheetOpenRef / todaySheetOpenRef` (new defect, not in the register). |
| PRD-TODAY-4 | Re-date on foreground and at midnight + 1 s | VERIFIED | `TodayScreen.js:351-375` | — |
| PRD-TODAY-5 | Refresh on focus and on `import_complete` / `sync_complete` / `data_changed` | VERIFIED | `TodayScreen.js:409-424` | — |
| PRD-TODAY-6 | Empty state; button opens the Protocols tab (→ DL-23) | VERIFIED | `TodayScreen.js:2165-2174` | — |
| PRD-TODAY-7 | Disclaimer at the bottom of Today | PARTLY | `TodayScreen.js:2241` renders it only when `protocols.length > 0` | "…at the bottom of Today when at least one active protocol exists (hidden in the empty state)". |
| PRD-TODAY-8 | "From your reminder"; pending highlight; logged dose → nothing; focus slot ignored (G-10) | VERIFIED | `TodayScreen.js:1693-1704`, `focusCard` uses `cardPlan().next` | — |
| PRD-TODAY-20 | On Today when next dose moment (Complete only) ≤ today; Tomorrow / Next 5 / later; G-17 | VERIFIED | `TodayScreen.js:1454-1470`; `lib/schedule.js:163-183`; `doseCountLabel(items.length)` `:2001` | — |
| PRD-TODAY-21 | Whole card opens the protocol (phone: Protocols detail; Fold: right page) | VERIFIED | `TodayScreen.js:1863-1868`, `:1765-1806` | — |
| PRD-TODAY-22 | Card content incl. "Draw to {n} units" + syringe **for injectables** | PARTLY | `doseDraw` (`TodayScreen.js:1810-1817`) computes a draw only for `recon` with a mixed vial; rtu cards never show it (the prototype also draws only recon, `prototype.html:975`) | "…'Draw to {n} units' with the syringe for a **powder (recon) dose with a mixed vial**". |
| PRD-TODAY-23 | Slot open = no row or Missed; ±60 s ownership; other rows fill earliest; Skipped = filled; card offers earliest open slot | VERIFIED | `lib/dosePageState.js:65-87,160-173` | — |
| PRD-TODAY-24 | Due ≤ 5 min; no time never Due; grey "reminder" tag (AD-38); no timer (G-6) | VERIFIED | `dosePageState.js:168`; `TodayScreen.js:1878-1882`; no interval for cards (only the Fold dose page, `:443-447`) | — |
| PRD-TODAY-25 | "Skipped — you can still log it" + Mark complete while Complete < slots | VERIFIED | `dosePageState.js:169-171`; `TodayScreen.js:1886-1907` | — |
| PRD-TODAY-26 | "All caught up" when no card left and ≥1 due; never with a skip `[code]` | VERIFIED | `TodayScreen.js:1473,2182-2188`; list placement uses Taken-only `takenCounts` | — |
| PRD-TODAY-27 | Header Σ min(Taken, expected) ÷ Σ expected over active due today | VERIFIED | `TodayScreen.js:1280-1286` | — |
| PRD-TODAY-28 | "Last: {site} · {n}d ago"; "0d ago" counts elapsed 24 h (G-18, SUSPECTED wording) | PARTLY | `TodayScreen.js:588-590` (`floor(elapsed/24 h)`), `:1930` shows `today_last_site_today` when 0; test `todayCopy.test.js` "never '0d ago'" | The UI never says "0d ago": a dose logged 23:00 yesterday reads **"Last: {site} · today"** the next morning. CONFIRMED by code, not suspected. |
| PRD-TODAY-29 | One display name; Skip sheet, site picker, vial prompt, Dose log use stored name (G-15) | VERIFIED | `TodayScreen.js:1182` (`protocol.name`), `:2274`, `:2296`; `LogScreen.js:578` | — |
| PRD-TODAY-30 | Tracker three windows, week circles, flame + streak, "View history ›"; only with an active protocol | VERIFIED | `TodayTracker.js:98-140`; `TodayScreen.js:2158-2160` | — |
| PRD-TODAY-31 | Ring rule; "a late dose is credited to the NEXT slot when it is nearer (daily 08:00 taken yesterday 21:00 shows today 100 %)" → G-1 | PARTLY | R1 reproduces 100 %. But 21:00 is **13 h** after the 08:00 slot — outside the ledger's "± half the interval" (12 h, `decisions.md:144`), so it cannot "match its own slot" under :144; the code applies :144 literally (nearest slot within ± half). The real conflict is with the Missed scan's same-day rule (`lib/missedDoses.js:149-155`, F1: a later log the same day covers the slot), which counts that dose for yesterday | State the contradiction as "rings vs the Missed scan's same-local-day rule"; the fix needs an explicit rule (a log on the slot's own local day belongs to that day) — it extends :144, it is not just :144. |
| PRD-TODAY-32 | Rings include active + ended; deleted excluded | VERIFIED | `adherenceRings.js:70-71`; `TodayScreen.js:747` (`getHistoryProtocols`) | — |
| PRD-TODAY-33 | "Day streak: consecutive days…"; 31-day cap → DL-03 (365 days, **doses in a row**) | PARTLY | Code counts days (`TodayScreen.js:796-805`, label `today_streak_days` "days without a miss", `TodayTracker.js:136`). The requirement says "Day streak" and cites DL-03, which changes the unit to doses — the two halves of the same requirement disagree | Pick one: keep "days" (prototype `prototype.html:970`, approved Today v2.1) and fix only the cap, or put the unit change to the founder (see C, DL-03). |
| PRD-TODAY-34 | Week circles rest / complete / partial / missed | VERIFIED | `TodayScreen.js:777-830` | — |
| PRD-TODAY-35 | Protocol streak = doses in a row, 365 days, logged rows only | VERIFIED | `lib/doseStreak.js:8-28`; `TodayScreen.js:606-628`; R6 | — |
| PRD-TODAY-36 | Drop lands in 360 ms; card **and tracker** update exactly at landing | PARTLY | 60 + 300 ms (`TodayScreen.js:1395-1400`); card and rings deferred (`applyTaken`), but `fetchStreakData()` runs at once (`:885`), so streak and week circles change before the landing | "…the card and the rings update at the landing; the streak and week circles update at once". |
| PRD-TODAY-40 | Pending until slot + 12 h; created − 1 h; Complete count; zone guard | VERIFIED | `lib/pendingYesterday.js:35-87` | — |
| PRD-TODAY-41 | Complete at yesterday's slot; injectables ask first; Skipped at slot | VERIFIED | `TodayScreen.js:688-728`; `markTaken.js:156-173` | — |
| PRD-TODAY-42 | "Yesterday or today" prompt; one commit; Undo removes both | VERIFIED | `TodayScreen.js:1365-1384`; `siteQuestion.js:73-79`; `markTaken.js:221` | — |
| PRD-TODAY-43 | Notification tap after midnight inside slot + 12 h → yesterday's slot; later snoozed copy → now | VERIFIED | `markTaken.js:204-208`; R4 | — |
| PRD-TODAY-44 | Pending rows on the Fold open the protocol page, no actions | VERIFIED | `TodayScreen.js:2124-2133,1765-1806` | — |
| PRD-TODAY-50 | Alerts box with count; snooze round → Tomorrow / In 3 days (09:00); no Remove / X / Later today | VERIFIED | `TodayScreen.js:2076-2118`; `todayFormat.js:34-39` | — |
| PRD-TODAY-51 | One-protocol alert opens that protocol; supply/expiry open Protocols heroes (G-5) | VERIFIED | `TodayScreen.js:1541,1577` (`navigate('Protocols')` without id) | — |
| PRD-TODAY-52 | Snoozes per device, 09:00; reappear only after refresh (G-7); survive sign-out (G-87) | VERIFIED | `TodayScreen.js:155,478-495`; no removal of `dosetrace_alert_snooze` in `App.js:383-396,627-632` | — |
| PRD-TODAY-53 | Reality-check alert follows check state; copy; tap → Progress | VERIFIED | `TodayScreen.js:1478-1500`; i18n `today_alert_rc_*` | — |
| PRD-TODAY-54 | Offline alert only offline + unsynced; tap = sync; snooze ignored (G-8) | VERIFIED | `lib/offlineAlert.js:4-6`; `TodayScreen.js:1503-1511` (no snooze test) | — |
| PRD-TODAY-55 | Supply low 1–3 doses; singular/French forms; orals not covered | VERIFIED | `lib/supplyLow.js:7,18-23`; `TodayScreen.js:1527-1543` | — |
| PRD-TODAY-56 | Vial expiring ≤ 7 days (recon mix + validity; rtu box date) | VERIFIED | `TodayScreen.js:1545-1579` | — |
| PRD-TODAY-57 | Bloodwork ≥ 182 days; months = max(6, round(days/30)); none without labs | VERIFIED | `TodayScreen.js:153,1512-1524` | — |
| PRD-TODAY-58 | Reminder alerts; ≥2 → one card; "**each** opens the reminder screen at its item" | PARTLY | `TodayScreen.js:1581-1659`: late/battery/stop/stale pass `focus`; blocked, silent and the combined card open `ReminderCheck` with no item | "…late, battery, stop and stale open at their item; blocked, silent and the combined card open the top of the screen". |
| PRD-TODAY-59 | Android once per phone, 600 ms after focus | VERIFIED | `TodayScreen.js:184-188`; `lib/reminderSetup.js:14-22` (note: `activeWithTime` counts no-time protocols, DV-028) | — |
| PRD-TODAY-60 | Food hero only while a check is open | VERIFIED (scope) | `lib/foodThread.js:297-304` (copy belongs to the food verifier) | — |
| PRD-DOSE-1 | **Every** place that marks complete writes through one function | PARTLY | Today, pending, notification, Protocols, Dose log use `recordDoseTaken`; but `LogScreen.js:145` falls back to a plain `writeOutcome` flip when the protocol is paused/deleted (no cap, no supply) | Add the exception (inactive protocol in the Dose log) or remove the fallback. |
| PRD-DOSE-2 | Never more Complete rows than dpd; refused tap → "Nothing new logged" sheet | VERIFIED | `markTaken.js:52-53`; `TodayScreen.js:841-851` | — |
| PRD-DOSE-3 | Tap time today; slot / noon for past days; flipped Skipped today = tap time | VERIFIED | `markTaken.js:88-113`; FX-24 test green | — |
| PRD-DOSE-4 | Early same-day dose covers its slot | VERIFIED | `missedDoses.js:38-48` | — |
| PRD-DOSE-10 | Oral written at once + 4 s Undo bar | VERIFIED | `TodayScreen.js:1389-1395,159,313-317` | — |
| PRD-DOSE-11 | Injectable: site first; Save/Skip/Cancel; notice 6 s; Android back asks | VERIFIED | `lib/sitePickerActions.js:17-28`; `TodayScreen.js:1042-1090` | — |
| PRD-DOSE-12 | Question saved before shown; re-asked after kill; dropped only when logged/gone; never for age | VERIFIED | `siteQuestion.js:47-51`; `siteBeforeTaken.test.js:109` | — |
| PRD-DOSE-13 | Site picker rules incl. "Longest unused in your log" | PARTLY | Picker built as described (`BodyMapModal.js`, i18n `bodymap_*`); but Today passes only the **last 30 days** of logs (`TodayScreen.js:1000-1003`) and `siteLongest` treats an unseen site as never used (`lib/bodySites.js:155-170`), so a site used 40 days ago reads "not in your log yet" | New defect (not in the register): the recall window is 30 days; the label claims the whole log. |
| PRD-DOSE-14 | Empty save never erases; "Remove site" | VERIFIED | `sitePickerKeepsSite.test.js`, `sitePickerUndo.test.js` green | — |
| PRD-DOSE-15 | Toast "Site saved · {site}" 17 pt 4 s; Undo only | VERIFIED | `TodayScreen.js:1013-1014,2724,2263-2271` | — |
| PRD-DOSE-16 | No "dose logged / Undo dose" header in the site sheet | VERIFIED | `decisions.md:154`; FX-29 test green | — |
| PRD-DOSE-17 | Pre-install sites deferred | VERIFIED | `decisions.md:196` | — |
| PRD-DOSE-20 | Skip sheet; Skipped at the slot; nothing if row; no supply | VERIFIED | `markTaken.js:181-197`; `TodayScreen.js:1162-1183,2039-2043` | — |
| PRD-DOSE-21 | Skipped → Complete same row; Undo restores | VERIFIED | `markTaken.js:55-100,240-245` | — |
| PRD-DOSE-22 | No Undo bar after Skip; reminder not cancelled `[code]` | VERIFIED | `TodayScreen.js:1162-1183` (no cancel, no `setUndoData`) | — |
| PRD-DOSE-30 | Undo bar rules (pause, replace, never after delete) | VERIFIED | `lib/undoBar.js`; `TodayScreen.js:313-317,1103-1106,1748` | — |
| PRD-DOSE-31 | Undo restores rows, supply once, reopens vial; G-30 | VERIFIED | `markTaken.js:218-252`; `TodayScreen.js:1103-1155` (reopens any inactive vial with no other active — G-30 stands) | — |
| PRD-DOSE-32 | Undo does not re-arm reminders | VERIFIED | `applyUndo` has no `scheduleDoseReminder` | — |
| PRD-DOSE-40 | Vial-finished prompt after the write, 450 ms; "Protocol finished" only closes | VERIFIED | `TodayScreen.js:893,1221-1234,2382-2391` | — |
| PRD-DOSE-41 | "Still going?" rules; end at last Complete; Missed after end removed; G-34 | VERIFIED | `TodayScreen.js:501-560`; `lib/protocolEnd.js:57-69` | — |
| PRD-DOSE-50 | Missed scan rule | VERIFIED | `missedDoses.js:83-159`; `doseActions.js:174-212`; Settings `:369`, Log `:102` | — |
| PRD-DOSE-51 | Watermark / zone history | VERIFIED | `doseActions.js:139-160`; `missedDoses.js:198-208` | — |
| PRD-DOSE-52 | Ended / deleted not scanned (G-11) | VERIFIED | `doseActions.js:186` → `SQL_ACTIVE` (`protocolEnd.js:24`) | — |
| PRD-DOSE-53 | Test03 rows untouched; DL-71 | VERIFIED | `decisions.md:197,387,716` | — |
| PRD-LOG-1 | Header, explainer, counts, SegmentedBar, Curve button | VERIFIED | `LogScreen.js:440-522` | — |
| PRD-LOG-2 | Day sections; status words | VERIFIED | i18n `log_status_*` | — |
| PRD-LOG-3 | Missed → "Update this dose"; site first; no delete | VERIFIED | `LogScreen.js:111-133` | — |
| PRD-LOG-4 | Dose sheet (Status, When, Site, Change site, Mark complete, Delete) | VERIFIED | `LogScreen.js:245-251`; keys `log_sheet_*`, `log_change_site`, `log_delete_dose` | — |
| PRD-LOG-5 | Delete → tombstone, supply back, Undo disabled | VERIFIED | `LogScreen.js:310-337`; `lib/deleteDose.js:85-110` | — |
| PRD-LOG-6 | Change site: Save writes, Cancel closes, empty never erases | UNVERIFIABLE | Edit mode in `sitePickerActions.js:26-27`; the empty-save path inside `BodyMapModal` not traced in this pass | — |
| PRD-LOG-7 | Deleted hidden, ended/unknown visible, declared visible not counted | VERIFIED | `protocolEnd.js:31`; `declared.js:28-35` | — |
| PRD-LOG-8 | Dose-log Missed → Complete emptying a vial must prompt (G-9) | VERIFIED | `LogScreen.js:138-151` ignores `res.vialFinished` | — |
| PRD-LOG-9 | Fold: Dose log default right page; both pages update | VERIFIED | `TodayScreen.js:1766-1770,1749-1758` | — |
| 4.2 edge cases | Creation-day, no-time, skip-before-slot, delete today's Complete… | VERIFIED | R2, R3; `TodayScreen.js:1162-1183` | — |

## B. DIVERGENCES.md — every TODAY row (both sides read)

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| Summary | TODAY = 0 S1 / 14 S2 / 0 S3 / 11 S4 / 25 | VERIFIED | DV-028…041 (14 S2) + DV-128…137, DV-193 (11 S4) | — |
| DV-028 | No / fewer reminder times: 08:00 reminders, no Due, no pending/Missed, rings at noon, header dpd, all "with a time" | VERIFIED | R3; `notificationPlan.js:56-63`; `adherenceRings.js:29-30`; `notifications.js:1163` | — |
| DV-029 | Creation-day: card Due, header "0 of 1", tracker "Nothing due" even after the take | VERIFIED | R2; `schedule.js:57-62` vs `adherenceRings.js:35-36` | — |
| DV-030 | Late dose credited to the next slot; fix test "today 0 of 1; yesterday counted in the week" | PARTLY | Symptom reproduced (R1). But a 13 h-late daily dose is outside "± half the interval" (`decisions.md:144`), so "yesterday counted in the week" is not what :144 gives; the code follows :144 literally. Only the Missed scan's same-day rule (`missedDoses.js:149-155`) counts it for yesterday | Reword: "rings and the Missed scan assign the same row to different days"; the fix needs a written same-local-day rule (founder line or DL), and AD-06 alone does not settle it. |
| DV-031 | Missed scan active-only; rings/streak include ended | VERIFIED | `doseActions.js:186`; `TodayScreen.js:747,761` | — |
| DV-032 | Report streak = calendar days with any Taken | VERIFIED | `SettingsScreen.js:389-400` | — |
| DV-033 | Three adherence numbers; two meanings of missed | VERIFIED | R7 (ring 33 % vs report 100 %); `monthConsistency` set at `TodayScreen.js:819`, never rendered | — |
| DV-034 | Tracker streak stops 30 days back (max 31) | VERIFIED | `TodayScreen.js:797-804` | — |
| DV-035 | Skip never cancels reminders; snooze resolution counts Taken only | VERIFIED | `TodayScreen.js:1162-1183`; `notifications.js:922-932` | — |
| DV-036 | Body tap logs earliest open slot and cancels `ti+1` of it; button cancels `ti+1` of the tapped slot; focus for a logged dose shows nothing | VERIFIED | `TodayScreen.js:1391,1693-1701`; `notificationActions.js:99-103`; `notifications.js:356-373` | — |
| DV-037 | Tomorrow / Next 5 show first time only and count protocols | VERIFIED | `TodayScreen.js:2001,2005-2008` | — |
| DV-038 | Dose-log Missed → Complete emptying a recon vial: no prompt | VERIFIED | `LogScreen.js:138-151` | — |
| DV-039 | Dose row and supply update are separate statements | VERIFIED (code) | `doseActions.js:71-97` (impact SUSPECTED as stated) | — |
| DV-040 | Undo / Dose-log delete never re-arm reminders | VERIFIED | `TodayScreen.js:1103-1155`; `LogScreen.js:313-337` | — |
| DV-041 | Two devices can each write a Missed row | VERIFIED (code) | `doseActions.js:123,196-205` (per-device watermark, no dedupe) | — |
| DV-128 | `cardSlot` Missed = filled, `cardPlan` Missed = open | VERIFIED | `dosePageState.js:164,181` | — |
| DV-129 | Skipped slot keeps the card; no "all caught up" | VERIFIED | `TodayScreen.js:1454-1473` | — |
| DV-130 | No Undo bar for Skip | VERIFIED | `TodayScreen.js:1170-1172` | — |
| DV-131 | Grey "reminder" tag before Due | VERIFIED | `TodayScreen.js:1878-1882` | — |
| DV-132 | Ring animation drives nothing; static gauge; no pulse | PARTLY | Code part true: `ringArcProps`/`ringPulseProps` (`:1425-1429`) are never rendered; `TodayTracker` is static. Founder column "AD-44" is not settled: `STATE.md:68` quotes the founder (2026-09-24) "ring loads from zero"; the ledger keeps it open as Conflict 40 (`decisions.md:441`) | Founder decision = "Conflict 40 (open)", not AD-44; the proposed fix ("no animation on a plain refocus") contradicts the only founder quote. |
| DV-133 | No as-needed concept | VERIFIED | no as-needed type in `lib/`, `screens/` | — |
| DV-134 | Offline alert snooze ignored | VERIFIED | `TodayScreen.js:1503-1511` | — |
| DV-135 | Last-site counts elapsed hours (SUSPECTED) | PARTLY | Confirmed by code: `TodayScreen.js:588-590,1930` → "Last: {site} · today" for yesterday 23:00 read at 08:00 | Confidence CONFIRMED; the wrong text is "· today", not "0d ago". |
| DV-136 | Launch-response race | UNVERIFIABLE | `notificationActions.js:164` clears while `App.js:550` reads; timing-dependent | — |
| DV-137 | Site question device-only | VERIFIED | `siteQuestion.js:10,81-100`; cleared `App.js:396,632,714` | — |
| DV-193 | PT `tab_log` still "Registro"; approved "Histórico" | VERIFIED | `i18n/translations.js:4713`; `grok/228-traducoes-aprovadas.md:7` | — |

## C. OPEN-DECISIONS — AD / DL items in this domain (and the 2026-10-12 ledger lines)

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-06 | Late dose ± half interval; extra never adds — decisions.md:144 | VERIFIED | `decisions.md:144` | Does not settle DV-030 by itself (see B). |
| AD-07 | Streak = doses in a row (founder 2026-10-05); doseStreak.js:2; TodayScreen.js:610; b215b32 | VERIFIED | all three citations exist; commit title: "The streak **on a protocol's card** counts doses" | Scope is the card streak. |
| AD-08 | One-protocol alert opens it — :146 | VERIFIED | `decisions.md:146` | — |
| AD-12 | A-118 — features.md:258 | VERIFIED | `docs/review/features.md:258` | — |
| AD-32 | A-48 parked — :199 | VERIFIED | `decisions.md:199` | — |
| AD-34 | Site questions device-only, kept until answered — :379 | VERIFIED | `decisions.md:379` | — |
| AD-38 | Only "Due" — :133 | VERIFIED | `decisions.md:133` | — |
| AD-39 | Taken → Complete — :99 | VERIFIED | `decisions.md:99` | — |
| AD-44 | "Count-ups only when values change; keep caught-up card and pulse" — :57, :164 | PARTLY | :57 and :164 say that, but the ledger lists the ring count-from-0 as an **open conflict** (`decisions.md:441`, Conflict 40) and `STATE.md:68` quotes the founder "ring loads from zero"; the code comment (`TodayScreen.js:1318`) calls it a "Founder rule" | Not "already decided": either move to OPEN or state explicitly that :57 (2026-09-29) supersedes the 2026-09-24 quote and close Conflict 40 in the ledger. |
| AD-48 | Vial prompt follows the write on **every** injectable take path — :152-153, FX-22 | PARTLY | :152-153 and FX-22 set the order (prompt after the write) on Today's take; neither line names the Dose-log Missed → Complete path | Coverage of the Dose log is a by-logic extension → DL, not AD. |
| AD-52 | Builder judgement calls go on one deviation list — :554 | VERIFIED | `decisions.md:554` | — |
| AD-59 | PT Dose log = "Histórico" | VERIFIED | `grok/228…:7`; `decisions.md:88,428` | — |
| DL-01 | Site questions never dropped for age | VERIFIED | `decisions.md:379` (founder) vs `:459` (by logic, "Resolved 2026-10-03 by the ledger + product logic", `:445`); code + test agree | — |
| DL-02 | Report streak = doseStreak; report adherence = rings' slots | VERIFIED (logic) | R7 shows the disagreement; no ledger line defines the report % | TRD S-08 still says "founder decision" — see D. |
| DL-03 | Tracker streak = doses in a row, 365 days | PARTLY | 365-day look-back follows from AD-07's reason (logic). Switching the tracker's **unit** from days to doses is not logic: the binding prototype shows "2 days without a miss" (`prototype.html:970`), Today v2.1 approved "the flame + streak" (`decisions.md:143`), and the founder's 2026-10-05 change was scoped to the card (commit b215b32). "Doses in a row" across several protocols is also undefined | Split: 365 days = DL; unit days → doses = picture + founder question (or keep days). |
| decisions.md:642 | Founder line "…Applies to every streak (DL-02, DL-03 below)" | PARTLY | The quoted founder sources (`doseStreak.js:1-5`, `TodayScreen.js:610`, b215b32) are about the card streak; "applies to every streak" is the reconciliation's extension written inside a "founder line" entry | Mark that sentence as by-logic, not founder. |
| DL-04 | One "due today" owner | VERIFIED (logic) | R2 | — |
| DL-05 | Missed scan covers ended protocols up to the end | VERIFIED (logic) | no ledger conflict; end rule exists in `schedule.js:13-21` | — |
| DL-06 | No / fewer times → one slot list everywhere "(the same default the form writes)"; reason "the user already receives the 08:00 reminder" | PARTLY | The form's default is not 08:00: `lib/protocolForm.js:102-105` fills `now` rounded to 5 min, then 14:00, 21:00. The decision text and its reason name two different defaults. Flow 03 P11 says the opposite ("intended: no slot, reminders none") | Name the default explicitly (08:00, what the phone does) and fix flow 03 P11. |
| DL-08 | Skip cancels that slot's reminders; no Undo bar | VERIFIED (logic) | consistent with reminder principle `decisions.md:598` ("a user who stopped… does not need reminders") | — |
| DL-09 | Undo / delete re-arm future reminders | VERIFIED (logic) | `decisions.md:598` | — |
| DL-10 | A reminder tap acts on the reminder's **own slot** | PARTLY | Conflicts with flow 03 §7.2 ("the card logs the earliest open slot … Intended: both entry points cancel every reminder of slots now covered by count") and with the card model (A-78/A-43: tap-time rows fill the earliest open slot, `dosePageState.js:79-85`); a tap-time row cannot belong to the 20:00 slot | Decide one model; DV-036's fix and flow §7.2 must say the same thing. |
| DL-11 | Tomorrow / Next 5 count doses | VERIFIED (logic) | `decisions.md:144` ("Today counts doses, not protocols") | — |
| DL-12 | Caught up when no open slot remains; skipped line stays (picture first) | VERIFIED (logic) | `decisions.md:164` | — |
| DL-13 | One display name everywhere | VERIFIED (logic) | `decisions.md:86` | — |
| DL-21 | "Still going?" uses logged Taken only | VERIFIED (logic) | A-30 option C `decisions.md:198` | — |
| DL-23 | Empty-state "Add a protocol" opens the wizard | VERIFIED (logic) | `decisions.md:133` | — |
| DL-26 | Today says what Progress will show | VERIFIED (logic) | A-118 | — |
| DL-65 | "As-needed" is a note | VERIFIED | no as-needed type in code | — |
| DL-67 | Cap = doses expected **that day** on every path; a snoozed dose tapped after slot + 12 h is logged as today | WRONG | R5: the "Tomorrow" snooze exists only for less-than-daily protocols (`notifications.js:132,255`); its copy fires on a rest day where `expectedDosesOn = 0`, so the first clause refuses exactly the dose the second clause logs "as today". It would also refuse any real dose recorded on a rest day — today it is accepted (`markTaken.js:53` caps at `doses_per_day`). Refusing to record a dose the user says they took is a risk/product choice (honest journal, `decisions.md:20`; never lose user-entered data), not logic | Withdraw or reword: keep the `doses_per_day` cap (or "expected that day, min. 1 for a snoozed/late dose"); if a stricter cap is wanted, ask the founder. |
| DL-71 | Existing false Missed rows not migrated | VERIFIED | `decisions.md:197,387`; open item in Conflict 19 (`:417`) resolved by "never destroy on a maybe" | — |

## D. TRD §4 ownership rows for this domain

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S-01 | PROPOSED `doseSlotsOn`; divergences schedule / dueDateKeys / no-time / rings noon / reminders 08:00 / creation floor / curve fixed hours | VERIFIED | `schedule.js:31-108` (no `schedule_total`); `notificationPlan.js:35-63`; `adherenceRings.js:29-30`; `serumModel.js:28` | — |
| S-02 | `dueDateKeys` + `doseBudget` | VERIFIED | `notificationPlan.js:35`; `notifications.js:224,242` | — |
| S-03 | Owner `cardPlan`; consumers incl. `protocolTake.js:9-18`; `cardSlot` vs `cardPlan`; `planDosePage` dead | VERIFIED | `dosePageState.js:103,160,177`; `planDosePage` referenced only by tests | — |
| S-04 | PROPOSED `takenOn`; copies at `markTaken.js:52`, `notifications.js:244-248,922-932,1165-1167`, `notificationActions.js:99-103`, `TodayScreen.js:722-740`; server "any Taken suppresses all" | VERIFIED | lines checked; `supabase/functions/send-reminders/index.ts:216-229` | — |
| S-05 | Skipped resolves reminders; "**founder decision needed**" | PARTLY | Divergence true (`notifications.js:922-932`) | DL-08 already decided it; the "Consumers" cell names `cancelTodaysDoseReminders` on Skip, which does not exist today (it is the target). |
| S-06 | PROPOSED `todayCounts`; inline `TodayScreen.js:1280-1286` | VERIFIED | — | — |
| S-07 | Rings; late dose credited to next slot "contradicts `docs/decisions.md:144`" | PARTLY | Owner and divergences real (R1, R2, R3) | The late-dose case is outside :144's ± half window; the contradiction is with the Missed scan's same-day rule (see A PRD-TODAY-31). |
| S-08 | Report %: "**founder decision**: rings or rows definition" | PARTLY | Owner `adherenceReport.js:24` real; rows-only and dead `monthConsistency` real | DL-02 already decided it (rings' slots). |
| S-09 | `doseStreak`; report copy at `SettingsScreen.js:390-401` | VERIFIED | `SettingsScreen.js:389-400` | — |
| S-10 | PROPOSED `trackerStreak`; inline 753-805, 821-830; cap 31; "(founder line for the cap)" | PARTLY | inline code and cap real | DL-03 already set 365; the TRD still asks for a founder line. |
| S-11 | Missed scan owner, consumers, active-only, no-time, per-device / account-surviving watermark | VERIFIED | `doseActions.js:123-212`; watermark key not uid-scoped, not in the sign-out wipe | — |
| S-12 | `pendingFromYesterday`; dead fallback `dosePageState.js:133-137` | VERIFIED | — | — |
| S-13 | `nextDoseAt` + PROPOSED `upcomingByDay`; morning summary uses `dueDateKeys` | VERIFIED | `protocolSort.js:5,19`; `notificationPlan.js:75` | — |
| S-14 | PROPOSED `caughtUp`; inline 1471-1473 | VERIFIED | — | — |
| S-15 | PROPOSED `courseState`; `getProgress` 1674-1684; no UI sets `schedule_total` | VERIFIED | `protocolForm.js:143` writes `schedule_total: null` | — |
| S-16 | `declared.js`; legacy declared rows feed the inactivity prompt "(SUSPECTED)" | PARTLY | Owner real | Code-confirmed: `TodayScreen.js:507` (`getTakenLogsSince`, no `loggedOnly`) and `protocolEnd.js:60` (`MAX(logged_at)` over all Taken) include declared rows; only the existence of such rows is data-dependent. |
| S-17 | PROPOSED `lastSiteFor`; inline 569-594 | VERIFIED | `bodySites.js` has no `lastSiteFor` | — |
| S-33 | PROPOSED `inactivityDue`; inline 497-537 | VERIFIED | `TodayScreen.js:497-537` | — |
| S-34 | PROPOSED `displayName`; stored name in Skip sheet, site picker, vial prompt, Dose log, reminder title | VERIFIED | `TodayScreen.js:1182,2274,2296`; `LogScreen.js:578`; `notifications.js:251` | — |
| S-45 | `doseSlotResolved` Taken-only | VERIFIED | `notifications.js:922-932` | — |
| S-70b | PROPOSED `labsDue`; inline 153, 1512-1524 | VERIFIED | — | — |
| S-77 | Owner "PROPOSED `lib/database.js unsyncedCount(uid)`"; "Today by its own query (`TodayScreen.js:386-397`)" | WRONG | An owner already exists: `lib/recoveryFlow.js:89-95 unsyncedCount`, and Today calls it (`TodayScreen.js:389`); sign-out uses `pendingForSignOut` (`recoveryFlow.js:101-105`), which sums the same function over owner + session user | Owner = `lib/recoveryFlow.js unsyncedCount` (real); the only divergence is owner-only (Today) vs owner + session (sign-out). |
| S-79 | `snoozeUntil` + PROPOSED `isSnoozed`; offline ignores snooze; no uid key | VERIFIED | `todayFormat.js:35-39`; `TodayScreen.js:155,1503-1511` | — |

## E. Flow 03 — diagrams, "Divergence today" notes, acceptance checks vs EN/PT strings

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| §2 | Actors; "Android orals log headless; iOS and injectables open the app" | VERIFIED | `notifications.js:122,136-139` | — |
| §3 | Preconditions | VERIFIED | — | — |
| P1 | Already-logged → sheet text "That dose was already logged…" | VERIFIED | EN `today_take_logged_body` exact | — |
| P2 | 00:30 pending, logs at 20:00 yesterday | VERIFIED | R4 | — |
| P3 | Early dose covers slot | VERIFIED | `missedDoses.js:38-48` | — |
| P4 | Skipped line; same row turns Complete | VERIFIED | `markTaken.js:55-100` | — |
| P5 | Creation-day rule, floor of 1 | VERIFIED | `schedule.js:57-62` | — |
| P6 | Declared history excluded | VERIFIED | `declared.js:13-18` | — |
| P7 | Snoozed copy inside slot + 12 h logs to the slot | VERIFIED | `markTaken.js:204-208` | — |
| P8 | Killed with a notification question: asked next focus "(never dropped while the dose window is open)" | PARTLY | `siteQuestion.js:47-51` never drops for age (DL-01) | "…never dropped for its age" (the parenthesis implies it is dropped after the window). |
| P9 | Travel: past slots in their own zone | VERIFIED | `missedDoses.js:50-66` | — |
| P10 | Last dose → recon prompt | VERIFIED | `TodayScreen.js:893` | — |
| P11 | No time: "**Intended:** no slot time → no Due, no Missed; reminders none" | WRONG | DL-06 decides the opposite (one slot list = the 08:00 the phone already uses); DV-028's fix test puts the same slot in reminders and rings | Intended per DL-06: the 08:00 default slot everywhere (Due, pending, Missed, rings, reminders). |
| P12 | Ended on another device: dropped after pull, reminders cancelled at next resync | UNVERIFIABLE | needs two devices | — |
| §5 node C | "Mark complete, oral, Android → **Headless write at the slot**" | WRONG | R4; `markTaken.js:101-104` | "Headless write at the **tap time** (yesterday's slot: at the slot)". |
| §5 node D | "Mark complete, injectable **or iOS** → App opens on Today, site question saved at the tap time" | PARTLY | iOS oral: the app opens and `notificationActions.markTaken` writes the dose directly — no site question (`notificationActions.js:83-93`) | Split: injectable → site question; iOS oral → written at the tap, app opens on Today. |
| §5 rest | Snooze, body tap, card take, Undo, supply, rings, caught up | VERIFIED | `TodayScreen.js:851-930`; `notifications.js:951-976` | — |
| §6.1 | Today slot states | VERIFIED | `dosePageState.js`; `TodayScreen.js` | — |
| §6.2 | Yesterday slot states | VERIFIED | `pendingYesterday.js`; `LogScreen.js:111-151` | — |
| §6.3 | Site question states (DL-01) | VERIFIED | `siteQuestion.js`; `TodayScreen.js:944-1090` | — |
| §6.4 | Notification slot states | VERIFIED | `notifications.js:217-310,951-1010`; `MAX_SNOOZES = 4` (`notificationPlan.js:230`) | — |
| §6.5 | Undo bar states | VERIFIED | `undoBar.js`; `TodayScreen.js:313-317,1748` | — |
| §7.1 | Time written | VERIFIED | `markTaken.js:88-113,181-197` | (contradicts §5 node C — fix node C) |
| §7.2 | Multi-dose; Divergence D12; "Intended: both entry points cancel every reminder of slots now covered by count" | PARTLY | Divergence text true (`TodayScreen.js:1391`; `notificationActions.js:102`) | The "intended" here differs from DL-10 ("acts on the reminder's own slot"); align with the chosen model. |
| §7.3 | Skip + DL-08; divergence no cancel | VERIFIED | `TodayScreen.js:1162-1183` | — |
| §7.4 | Undo; divergences A-36, 01 D-17 | VERIFIED | `TodayScreen.js:1103-1155` | — |
| §7.5 | Yesterday-or-today strings | VERIFIED | EN/PT `today_pending_prompt_*` exact | — |
| §7.6 | Missed rule; divergences D13, D15 | VERIFIED | `doseActions.js:186`; `log_missed_edit_msg` exact | — |
| §7.7 | Rings / header / "Tracker streak (days)" / report streak / circles | PARTLY | All divergences true (R1, R2, R7) | D03-1 example is outside ± half (see A PRD-TODAY-31); "Tracker streak (days)" conflicts with DL-03 (doses) cited in §12. |
| §7.8 | All caught up + DL-12 | VERIFIED | `TodayScreen.js:1473` | — |
| §7.9 | Offline + headless take | VERIFIED | `offlineAlert.js`; `notificationActions.js:99-113` | — |
| §7.10 | App killed cases | VERIFIED | `siteQuestion.js`; `doseActions.js:71-97` | — |
| §7.11 | Second device | UNVERIFIABLE | device behaviour | — |
| §7.12 | Midnight, Due re-render (SUSPECTED), DST, travel | VERIFIED | `TodayScreen.js:351-375` | — |
| §7.13 | Body tap focus; 12 h launch cutoff; morning summary | VERIFIED | `notificationPlan.js:161-187`; `App.js:550` | — |
| §7.14 | Fold right page | VERIFIED | `TodayScreen.js:1765-1806` (`deleteProtocol={null}`) | — |
| §7.15 | Free vs Premium | VERIFIED | `LogScreen.js:522` | — |
| §7.16 | "Still going?" max(7, 3×interval); strings | VERIFIED | `TodayScreen.js:518`; `today_tx_over_*` exact | — |
| §8 | Surface table | VERIFIED | strings `today_due`, `today_skipped_today`, `log_status_*`, `today_alert_offline_title` | — |
| §9 | Data written + key names | VERIFIED | keys `dosetrace_site_questions`, `dosetrace_missed_since`, `dosetrace_notif_handled`, `dosetrace_snoozes`, `snz-`, `dosetrace_tx_check_<id>` all in code | — |
| §10 | Rules list | VERIFIED | — | — |
| §11 | D03-1…D03-14 → DV rows | VERIFIED | DV-012, 013, 028-031, 032, 034-036, 038-040, 117, 132, 175 exist with matching text | — |
| §12 | DL-08, DL-12, AD-38, DL-03, DL-02 | VERIFIED (as quoted) | OPEN-DECISIONS rows | DL-03 itself is PARTLY (C). |
| F03-01 | Due/Agora; Skip/Pular; Mark complete/Concluir; "0 of N complete"/"0 de N concluídas" | VERIFIED | i18n `today_due`, `today_skip`, `today_mark_taken`, `today_doses_taken` | — |
| F03-02 | "Dose logged"/"Dose registrada"; Undo/Desfazer; Complete fold; "Dose complete"/"Dose concluída" | VERIFIED | i18n exact | — |
| F03-03 | Picker strings; notice EN/PT; toast "Site saved · Abdomen, upper left"/"Local salvo · Abdômen, superior esquerdo" | VERIFIED | `bodymap_title`, `today_take_undone`, `today_site_saved`, `site_abdomen_upper_left` exact | — |
| F03-04 | Back confirm EN/PT, Stay/Leave, Ficar/Sair | VERIFIED | `today_site_back_*` exact | — |
| F03-05 | Skip sheet EN/PT; skipped line EN/PT | VERIFIED | `today_skip_title`, `today_skip_confirm`, `today_skipped_today` exact | — |
| F03-06 | Same row turns Complete at tap time | VERIFIED | `markTaken.js:92-95` | — |
| F03-07 | Notification oral: "Zinc complete **at the slot time**" | WRONG | R4: logged at the tap time | "…complete at the tap time". |
| F03-08 | Injectable: picker; time = tap time | VERIFIED | `TodayScreen.js:2032-2035` | — |
| F03-09 | In 1 hour/Em 1 hora; Tomorrow/Amanhã only < daily; copy has only Mark complete | VERIFIED | `notifications.js:131-139,944` | — |
| F03-10 | "From your reminder"/"Do seu lembrete" | VERIFIED | i18n exact | — |
| F03-11 | Pending strings EN/PT; then "Clock 08:31 → block gone, Missed row written" | PARTLY | Strings exact. The script completes the pending slot first, so no Missed row can follow at 08:31 | Use a second, unlogged slot (or a fresh run) for the Missed step. |
| F03-12 | Yesterday-or-today strings; Undo removes both | VERIFIED | i18n exact; `markTaken.js:221` | — |
| F03-13 | "View history"/"Ver histórico"; "Update this dose"/"Atualizar esta dose" | VERIFIED | i18n exact | — |
| F03-14 | Delete strings EN/PT and body | VERIFIED | `log_delete_dose`, `log_delete_title`, `log_delete_body` exact | — |
| F03-15 | "Nothing due"/"Nada pendente" | VERIFIED | i18n exact | — |
| F03-16 | Intended: "Today ring 0 %, **7-day ring counts yesterday** as taken" | PARTLY | Today 100 % reproduced (R1); but 21:00 is 13 h after 08:00 — outside ± half the interval, so the intended week result follows only from a same-day rule not written anywhere | Make the intended result depend on the rule chosen for DV-030. |
| F03-17 | Creation-day; "1 of 1"; tracker "Nothing due" | VERIFIED | R2 | — |
| F03-18 | "You're all caught up for today" / "Tudo em dia por hoje" | PARTLY | EN string uses a typographic apostrophe: "You’re all caught up for today" (`today_all_done`) | Quote the exact string (’). |
| F03-19 | "Low · 1 left"; "All doses logged"/"Todas as doses registradas"; Log new vial / Protocol finished | VERIFIED | `protocols_low_supply_one`, `today_vial_done_title`, `today_vial_add`, `today_vial_finished` exact | — |
| F03-20 | "Waiting to back up"/"Aguardando backup" | VERIFIED | i18n exact | — |
| F03-21 | Second device: refused with the already-logged text | VERIFIED (text) | `today_take_logged_body` exact; device behaviour unverified | — |
| F03-22 | Midnight while open | VERIFIED | `TodayScreen.js:351-375` | — |
| F03-23 | Fold right page, no Mark complete/Skip/Delete | VERIFIED | `TodayScreen.js:1765-1806` | — |
| F03-24 | "Still going?"/"Ainda em andamento?"; Yes, it's finished / Still going ("Sim, terminou" / "Ainda em andamento") | VERIFIED | `today_tx_over_*` exact | — |
| F03-25 | Both themes | UNVERIFIABLE | needs simulator/device in both themes | — |

## New defects found in this pass (not in DIVERGENCES.md)

1. Notification "Mark complete" for today's slot writes the tap time, while PRD L-1, flow §5 node C and F03-07 say the slot time (the code agrees with PRD-DOSE-3, so the docs are wrong).
2. DL-67 contradicts itself for less-than-daily protocols (R5) and would block recording a real dose taken on a rest day.
3. The "Still going?" prompt can open together with another Today sheet (orphan sheet, vial prompt, Skip sheet): `TodayScreen.js:530` checks only three of the popup flags.
4. "Longest unused in your log" reads only the last 30 days (`TodayScreen.js:1000-1003`), so a site used earlier shows "not in your log yet".
5. TRD S-77 names a PROPOSED owner that already exists (`lib/recoveryFlow.js unsyncedCount`).
6. TRD S-05 / S-08 / S-10 still ask for founder decisions that OPEN-DECISIONS already settled (DL-08 / DL-02 / DL-03).

## Counts

| Section | Rows | VERIFIED | PARTLY | WRONG | UNVERIFIABLE |
|---|---|---|---|---|---|
| A. PRD 4.2 + L-1 | 77 | 65 | 10 | 1 | 1 |
| B. DIVERGENCES TODAY | 26 | 22 | 3 | 0 | 1 |
| C. AD / DL (+ ledger :642) | 31 | 24 | 6 | 1 | 0 |
| D. TRD ownership | 23 | 17 | 5 | 1 | 0 |
| E. Flow 03 | 68 | 55 | 7 | 3 | 3 |
| **Total** | **225** | **183** | **31** | **6** | **5** |
