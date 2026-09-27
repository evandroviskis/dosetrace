# Food log (AI nutrition logger)

- source-spec: docs/nutrition-logger-conversation-spec.md (locked 2026-09-10, founder role-play validated; amended 2026-09-24)
- purpose: find out what the person really eats, week by week, between weigh-ins (founder 2026-09-27), so the reality check can compute real maintenance. Not a diet diary; never advice.
- checklist-signed: 2026-09-27 by the founder (in chat: "Signed"); FL-18 revised by the founder the same day
- last-audit: 2026-09-27 spec-auditor — REJECT (5 rows had been recorded better than reality: FL-4, 12, 15, 18, 19; FL-20 data-loss bug)
- committed-to: next build (founder "approved → next build" rule; gaps found 2026-09-27)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FL-1 | The log can be opened any time; the composer invites the user in friendly words ("So, what have you eaten? Earlier days count too."). | built | sim 2026-09-27: composer with nutri_intro visible on Journey |  |
| FL-2 | Food from an earlier time ("an ice cream 3 days ago") is logged on the day it was eaten; the app never asks when. | built | __tests__/nutrition.test.js: "entryDateFor: \"3 days ago\" moves the entry back"; "splitByDay: a multi-day catch-up becomes one entry per day eaten" |  |
| FL-3 | Intake = everything logged in the window ÷ the days recorded. A day the user marks "not recorded" is left out of the average; an unlogged, unmarked day counts as zero. The UI shows its working and "X of Y days recorded". (Founder 2026-09-27: "not recorded".) | partial | __tests__/nutrition.test.js: "checkIntake: completed days of the check ÷ elapsed days (same window as the TDEE)" | "Not recorded" days not built yet. OPEN. |
| FL-4 | After each entry the app asks ONE friendly question about anything else eaten today (meals, snacks, drinks, supplements), in time-aware wording, one at a time until the user says done. No strict breakfast/lunch/dinner slot tracking. (Founder 2026-09-27: separating time is not important; the goal is total intake.) PROPOSED WORDING — awaiting founder OK. | missing |  | Shipped: a fixed lunch→dinner→snacks→drinks sequence shown only after a log. OPEN. |
| FL-5 | Question wording matches the time of day (past tense for a meal already past, forward for one still ahead). | built | __tests__/nutrition.test.js: "pickNudge: time-aware tense — at 8pm lunch and dinner are past tense" |  |
| FL-6 | One question per gap; when the user says they're done ("that's it") or goes quiet, the app stops asking and closes the day kindly. | missing |  | "that's it"/done handling was never built. OPEN. |
| FL-7 | After logging, a neutral echo names what was logged — item names only, never a comment about the food. | built | code: NutritionLogger.js nutri_echo |  |
| FL-8 | The echo and the entry list always show the quantity ("2 × BUILT Puff · ~280 kcal"). | missing |  | Only the food name is shown, so "2 puff bars" looked like one (founder report 2026-09-27). OPEN. |
| FL-9 | A vague amount ("some rice") is estimated anyway and the item is visibly flagged so the user can correct it with tap-to-fix. | partial |  | Tap-to-fix exists; the flag was never shown (confidence unused). OPEN. |
| FL-10 | When the parser needs one detail (amount, brand, size or preparation), the app asks ONE follow-up in app-written wording with quick answers plus free text; the answer updates the SAME entry. | missing |  | The parser's clarify hint is returned but never shown. OPEN. |
| FL-11 | Brands are kept as typed and estimated as that product ("2 built puff bars" → 2 × BUILT Puff, ~17 g protein each). | missing |  | Logged a generic "Puff Bar" with 2 g protein total (2026-09-27). OPEN. |
| FL-12 | Calories and macros stored for an item are totals for the whole quantity, never per unit. | missing |  | Audit 2026-09-27: nothing in prompt, code or tests requires whole-quantity totals. OPEN. |
| FL-13 | Everything typed is read as food or drink the user consumed; an ambiguous name triggers a question, never a guess at a non-food product (e.g. 0 kcal with high confidence). | missing |  | "another puff bar" → 0 kcal vape, confidence high (2026-09-27). OPEN. |
| FL-14 | "Another one" / "same as breakfast" uses what the user logged earlier that day (the last item for "another"); if nothing was logged that day, the app asks instead of guessing. | missing |  | Each message is parsed alone. OPEN. |
| FL-15 | Any advice-shaped request shows the fixed deflection card (all 6 languages), never model text. | partial | code: parse-food refusal rule + NutritionLogger.js deflect card (online path) | Audit 2026-09-27: an advice question typed OFFLINE is deleted on reparse and the deflection card never shows. OPEN. |
| FL-16 | The AI never writes sentences shown to the user; only food/unit names (length-capped) reach the screen. | built | code: parse-food caps food 60 / unit 16 chars; clarify not rendered |  |
| FL-17 | Calories, carbs and protein are shown; fat is captured but not shown. | built | code: NutritionLogger.js entry rows + macro() |  |
| FL-18 | While a reality check runs, once a day at 20:00 — unless the user already closed the day — ask: "Anything you ate today that isn't logged yet, and will you eat again today?" Quick answers: Log it · Nothing else today (closes the day) · I'll eat later (day stays open). Tapping the reminder opens this question. Off switch next to it. (Founder 2026-09-27.) | partial |  | Shipped: any single log cancels that night's reminder and it backs off to every other day (2e3885f); generic text. OPEN. |
| FL-19 | An entry typed offline is saved and parsed later; a health entry is never silently deleted. | partial |  | Audit 2026-09-27: reparse() silently deletes an offline entry that comes back as a refusal (NutritionLogger.js ~182-186). OPEN. |
| FL-20 | A daily cap of 25 AI parses per user; hitting it shows a clear message and keeps nothing half-saved. | partial | code: parse-food DAILY_FOOD_LIMIT + NutritionLogger.js quota branch | Audit 2026-09-27 BUG: on the daily limit the row is deleted and the typed text is NOT restored — the user loses what they wrote (never-lose-data rule). OPEN. |
| FL-21 | Answering a follow-up never uses one of the 25 daily AI reads. | missing |  | New 2026-09-27 (founder: ok). OPEN. |
| FL-22 | The 25-per-day AI limit resets at the user's local midnight, not UTC. | missing |  | Resets at UTC midnight today (parse-food). OPEN. |
| FL-23 | Each item is categorised by the AI as meal, snack (protein bar, nuts…) or supplement; the user can change it. | missing |  | New 2026-09-27 (founder decision). OPEN. |
| FL-24 | A day runs midnight to midnight in the user's time zone; totals are per day, week and whole window. | partial | code: entries dated by local typed day + days_ago | Week and window totals shown; no explicit test for the local-midnight boundary. OPEN. |
| FL-25 | Food for an earlier day typed today goes to that day and never counts as eaten today. | missing |  | Journey review 2026-09-27. OPEN. |
| FL-26 | In a message with several foods, the clear ones save immediately; a follow-up is about the unclear one only and changes only that item and the entry total. | missing |  | Journey review 2026-09-27. OPEN. |
| FL-27 | Typing a new meal while a follow-up is open creates a new entry; the earlier item stays flagged as an estimate. | missing |  | Journey review 2026-09-27. OPEN. |
| FL-28 | A follow-up answered offline or after midnight still updates the same entry and keeps its date; if that entry was edited or deleted meanwhile, the answer is dropped. | missing |  | Journey review 2026-09-27. OPEN. |
| FL-29 | Every question offers "That's all for today"; typing "that's it" (all 6 languages) also closes the day — no AI read, no empty entry, no fix hint. A closed day is not asked again after reopening the app. | missing |  | Journey review 2026-09-27. OPEN. |
