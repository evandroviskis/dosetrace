# Today — real-world journey review (2026-09-29)

Input to the Today redesign (`today-dashboard.md`). Reviewer: journey-reviewer agent, read-only
on main @ 57b6910; it ran `schedule`, `missedDoses`, `pendingYesterday` in Node on scratch
scenarios; no app run, so every "how it looks" claim is unverified. Two findings (F2, F4b) were
re-checked by hand in the code (marked ✔).

## What the redesign must handle (ranked)

1. **Due now comes first.** Open doses above everything else; overdue visibly different from
   "later today" (`isDoseDue` is computed but never shown, `TodayScreen.js:1161-1177,1205`); a
   morning stack of several protocols in few taps. On main the dose list is 6th in scroll order.
2. **Unresolved past doses stay visible, with a way to fix them.** "Pending from yesterday"
   disappears at scheduled time + 12 h (`lib/pendingYesterday.js:71`); Missed rows waiting for
   review are never shown on Today; a weekly shot taken a day late has no truthful path.
3. **Nothing-due days tell the truth.** ✔ On a rest day the header says "No protocols yet" and
   the Protocols stat shows 0, because both count only protocols due today
   (`TodayScreen.js:873-875,1356-1357,1415`; `today_no_protocols` = "No protocols yet").
4. **Skipped and partial days read correctly.** After skipping 08:00 of a twice-daily protocol
   the button still says "Take 08:00", and the skip does not cancel that dose's reminders.
5. **Supply and end states are visible and never destroy history** (vial/pen/bottle empty or
   expired; paused or finished protocol).

Prerequisite whatever the layout: Today re-dates itself on app resume and at midnight
(no resume listener in TodayScreen today; `FoodChatScreen.js:180` has one).

## Findings that are logic, not layout (need registry entries on main — founder routes)

| # | Finding | Class | Evidence (main) |
|---|---|---|---|
| F1 | A same-day dose logged > 12 h after its time gets a false Missed row (07:00 dose logged 20:30 → Missed + Taken on one day) | defect | `lib/missedDoses.js:27-28,81`, `pendingYesterday.js:68-71` (library run) |
| F2 | ✔ "No protocols yet" / "0 Protocols" on days with nothing due | defect | `TodayScreen.js:873-875,1356-1357,1415` |
| F3 | A late or early weekly dose can't be recorded truthfully | product decision | `TodayScreen.js:1321`, `LogScreen.js:70-75` |
| F4a | Vial prompt "Protocol finished" only closes the window; protocol stays active, reminders continue | defect | `TodayScreen.js:1761-1766` |
| F4b | ✔ "Yes, it's finished" soft-deletes the protocol: its dose history leaves the Log at once (`getAllLogs` joins active protocols only), restorable 7 days, then marked deleted | defect vs the NEVER-lose-data rule | `TodayScreen.js:333-340`, `lib/database.js:88-95,138-145,167-183,273-279` |
| F5 | Skipping one dose of a multi-dose day: wrong next-dose label, reminders not cancelled | defect + decision | `TodayScreen.js:805-810,1149-1158,1225-1229`, `lib/notifications.js:211-230` |
| F6 | Today does not re-date on resume or at midnight | plausible (device unverified) | `TodayScreen.js:179-235`, `App.js:440-448` |
| F7 | Missed→Taken in the Log doesn't update vial/oral counts; RTU/oral end-of-supply has no prompt | defect | `LogScreen.js:70-75` vs `doseActions.js:61-76`; `TodayScreen.js:635,1307,1083` |
| F8 | Twice weekly, every 3.5 days, weekday/on-off cycles and as-needed can't be represented | product decision | `ProtocolsScreen.js:2251-2296`, `schedule.js:23-28` |
| F9 | Backfill writes today's dose as Taken; "past start" uses the UTC date | confirmed; replaced by A-30/A-32 (1.2.6) | `schedule.js:159-165`, `ProtocolsScreen.js:1406` |
| F10 | Layout inputs: empty state has no call to action; "N more scheduled later" has no date; "Day X of Y" can never show (`schedule_total` saved as null) | layout | `TodayScreen.js:1040,1606-1643`, `ProtocolsScreen.js:1293,1358` |

Already registered and touching Today: A-35, A-36, A-37/A-50, A-38(b), A-39/S-20, A-40/S-17,
A-43/S-18, A-44, A-47, A-49/S-19/A-51, A-30/A-32, F5/F7 (vials). Registry note to correct: F-026's
"start_date overwrite still present" was fixed by 57f4110.

This design session does not touch main; the founder decides whether these get registry entries
now and which build they target.
