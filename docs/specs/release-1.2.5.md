# 1.2.5 release items (non-bug scope)

- source-spec: docs/review/features.md scope S-11…S-14
- purpose: release steps committed to 1.2.5 that are not code bugs, tracked with proof so nothing falls through.
- checklist-signed: 2026-09-27 by the founder ("1.2.5 scope ok")

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| RL-1 | S-11: the app calls the live parse-food, and parse-food runs v9 (FOOD_FN switched back; v9 deployed as parse-food; parse-food-next removed after). Proof: a live parse through the release build logs a v9-shaped row (category field present). | missing |  | OPEN (lib/nutritionClient.js still FOOD_FN = 'parse-food-next'). |
| RL-2 | S-12: supabase/functions/send-reminders/plan.ts matches the client for EVERY mirrored function — dueDateKeys, reminderSlots, morningSummaryPlan, foodNudgeDays (food rule: FL-18, FL-41, FL-42 — daily 20:00 while a check is open, skipped for a closed day, no day-21 cut-off, no backoff, none for locked users). Proof: a parity test that imports the REAL plan.ts (not a copy) and runs the same cases through both implementations. | missing |  | OPEN. |
| RL-3 | S-13: the iOS build declares its 6 languages (CFBundleLocalizations en, es, pt, fr, de, it). Proof: expo prebuild/introspect output shows the key; App Store listing shows 6 languages after release. | missing |  | OPEN. |
| RL-4 | S-14: App Store 1.2.5 version has the new screenshot 01 (serum curve) and the order 01…07. Proof: ASC API readback of the set order. | missing |  | OPEN (possible only once the 1.2.5 version exists in ASC). |
