# 1.2.5 bug fixes (from the 27 Sep outside review)

- source-spec: docs/review/findings-2026-09-27.md, docs/review/app-map.md, docs/review/features.md (scope S-01…S-15)
- purpose: fix the confirmed defects that hurt live users now, each proven by a test that failed before the fix (CLAUDE.md evolution rule 1).
- checklist-signed: 2026-09-27 by the founder ("1.2.5 scope ok, with two conditions"; order and the migration criterion are his conditions)
- work order (founder): the 5 connection tests (S-15) → S-01 new vial → S-02 mark taken → the rest.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FX-1 | Connection test: a new vial never changes the protocol start_date (app-map L-13). | built | __tests__/newVial.test.js: "newVialRecords: a new vial never changes the protocol start_date (history kept)" |  |
| FX-2 | Connection test: mark taken from Today and from the notification go through ONE function; a dose already logged is never logged twice; an auto-Missed row is turned into Taken, not duplicated; vial and oral counts move once (L-07, L-08). | missing |  | OPEN. |
| FX-3 | Connection test: food rows → 7-day run → reality-check result → Your daily plan "Measured" (L-17 → L-18). | missing |  | OPEN. |
| FX-4 | Connection test: one entitlement helper for strict and lenient checks; "store unreachable" gives the same answer everywhere (L-24 + L-34). | missing |  | OPEN. |
| FX-5 | Connection test: reality-check start/stop — Stop clears the open check and cancels both the day-21 and the 8 PM reminders (L-20, L-21, L-47). | missing |  | OPEN. |
| FX-6 | S-01: starting a new vial keeps the protocol's history; curve and adherence before the vial are unchanged on screen. | partial | __tests__/newVial.test.js: "newVialRecords: a new vial never changes the protocol start_date (history kept)" | Simulator check pending (founder OK needed to run it on his account or a test protocol). |
| FX-7 | S-02: Today and the notification use the same mark-taken code (FX-2 passes against the real function). | missing |  | OPEN. |
| FX-8 | S-03a MIGRATION: existing users keep their open reality check (start date + start weight) and calculator inputs after the update to synced tables — proven by a test that starts from the OLD storage (AsyncStorage + user_metadata) and checks every value arrives in the new table with nothing deleted; old storage is only cleared after the new rows are confirmed written. Also checked on device: update over the old version keeps the data. (Founder condition 2: "the only one of the 9 fixes that can lose data if done wrong".) | missing |  | OPEN. |
| FX-9 | S-03b: the open check and calculator inputs sync; Stop on one device ends the check (alert + reminders) on the other. | missing |  | OPEN. |
| FX-10 | S-04: profile sex / birth year is the only source for the BMR; changing it in Settings changes the calculation; age follows the birth year. | missing |  | OPEN. |
| FX-11 | S-05: one supply-low rule for the Today alert and the push (derived capacity included). | missing |  | OPEN. |
| FX-12 | S-07: exports include food logs, reality checks, snapshots and targets. | missing |  | OPEN. |
| FX-13 | S-08: the curve disclaimer says "planned schedule" in all 6 languages. | missing |  | OPEN. |
| FX-14 | S-09: new-vial water amount accepts comma decimals ("2,5" = 2.5). | missing |  | OPEN. |
| FX-15 | Weigh-ins are the user's own data and are never paywalled: free users (during and after their free days) can always save a weigh-in — Progress snapshots, "add a past weigh-in" and the reality-check weigh-in. The paywall only blocks the RESULT (measured maintenance, target ETA). (Founder 2026-09-27.) | missing |  | Current code: Progress snapshots are strict-Premium (CalculatorSection.js ~1250) and the reality-check weigh-in needs rcAllowed. OPEN. |
