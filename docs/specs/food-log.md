# Food log (AI nutrition logger)

- source-spec: docs/nutrition-logger-conversation-spec.md (locked 2026-09-10, founder role-play validated; amended 2026-09-24)
- purpose: capture intake across the reality-check window so the check can compute real maintenance. Not a diet diary; never advice.
- checklist-signed: pending
- committed-to: next build (founder "approved → next build" rule; gaps found 2026-09-27)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FL-1 | The log can be opened any time; the composer invites the user in friendly words ("So, what have you eaten? Earlier days count too."). | built | sim 2026-09-27: composer with nutri_intro visible on Journey |  |
| FL-2 | Food from an earlier time ("an ice cream 3 days ago") is logged on the day it was eaten; the app never asks when. | built | __tests__/nutrition.test.js: "entryDateFor: \"3 days ago\" moves the entry back"; "splitByDay: a multi-day catch-up becomes one entry per day eaten" |  |
| FL-3 | Intake for the reality check = everything logged in the check window ÷ elapsed days; unlogged days count as zero and the UI says so, showing its working. | built | __tests__/nutrition.test.js: "checkIntake: completed days of the check ÷ elapsed days (same window as the TDEE)" |  |
| FL-4 | After each entry the app asks about ONE part of the day that is still empty in today's log (breakfast, lunch, dinner, snacks, drinks) — never about a part already logged. | partial |  | Shipped a fixed lunch→dinner→snacks→drinks order that ignores what was logged and never asks about breakfast. OPEN — must be built. |
| FL-5 | Question wording matches the time of day (past tense for a meal already past, forward for one still ahead). | built | __tests__/nutrition.test.js: "pickNudge: time-aware tense — at 8pm lunch and dinner are past tense" |  |
| FL-6 | One question per gap; when the user says they're done ("that's it") or goes quiet, the app stops asking and closes the day kindly. | missing |  | "that's it"/done handling was never built. OPEN. |
| FL-7 | After logging, a neutral echo names what was logged — item names only, never a comment about the food. | built | code: NutritionLogger.js nutri_echo |  |
| FL-8 | The echo and the entry list always show the quantity ("2 × BUILT Puff · ~280 kcal"). | missing |  | Only the food name is shown, so "2 puff bars" looked like one (founder report 2026-09-27). OPEN. |
| FL-9 | A vague amount ("some rice") is estimated anyway and the item is visibly flagged so the user can correct it with tap-to-fix. | partial |  | Tap-to-fix exists; the flag was never shown (confidence unused). OPEN. |
| FL-10 | When the parser needs one detail (amount, brand, size or preparation), the app asks ONE follow-up in app-written wording with quick answers plus free text; the answer updates the SAME entry. | missing |  | The parser's clarify hint is returned but never shown. OPEN. |
| FL-11 | Brands are kept as typed and estimated as that product ("2 built puff bars" → 2 × BUILT Puff, ~17 g protein each). | missing |  | Logged a generic "Puff Bar" with 2 g protein total (2026-09-27). OPEN. |
| FL-12 | Calories and macros stored for an item are totals for the whole quantity, never per unit. | partial | code: parse-food contract does not state it | Right in the one observed case by chance; the prompt does not require it. OPEN. |
| FL-13 | Everything typed is read as food or drink the user consumed; an ambiguous name triggers a question, never a guess at a non-food product (e.g. 0 kcal with high confidence). | missing |  | "another puff bar" → 0 kcal vape, confidence high (2026-09-27). OPEN. |
| FL-14 | "Another one" / "same as breakfast" resolves against what the user logged earlier that day. | missing |  | Each message is parsed alone. OPEN. |
| FL-15 | Any advice-shaped request shows the fixed deflection card (all 6 languages), never model text. | built | code: parse-food refusal rule + NutritionLogger.js deflect card |  |
| FL-16 | The AI never writes sentences shown to the user; only food/unit names (length-capped) reach the screen. | built | code: parse-food caps food 60 / unit 16 chars; clarify not rendered |  |
| FL-17 | Calories, carbs and protein are shown; fat is captured but not shown. | built | code: NutritionLogger.js entry rows + macro() |  |
| FL-18 | One daily reminder at about 20:00 while a reality check runs, with an off switch next to it. | built | __tests__/notificationPlan.test.js: "food nudge: daily inside the check window, none before the start or after day 21" |  |
| FL-19 | An entry typed offline is saved and parsed later; a health entry is never silently deleted. | built | code: NutritionLogger.js reparse() marks unparsed instead of deleting (b9ca102) |  |
| FL-20 | A daily cap of 25 AI parses per user; hitting it shows a clear message and keeps nothing half-saved. | built | code: parse-food DAILY_FOOD_LIMIT + NutritionLogger.js quota branch |  |
