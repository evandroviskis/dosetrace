# Food log: fiber and the food week on Journey (FW)

- source: founder 2026-11-08 23:15 EST, on the Fiuza video ideas: fiber as a number only, no target, shown per day and in the week; the week's calories beside the person's plan, "sem aprofundar"; the daily average of protein and carbs, informing and never recommending; a line telling the person to talk to the trainer or health professional who follows them about raising or lowering carbs/protein. 2026-11-09 02:1x EST: "Pode fazer o que tiver que fazer para a gente contabilizar as fibras" (covers the parse-food server change and its publication).
- picture: docs/design/food-week-fiber-pace.html (columns 2, 3 and 4). Column 5 (weight pace in % per week) and the plan line of column 2 are NOT in this checklist yet (see FW-8, FW-9).
- registry: docs/review/features.md (food week / fiber, 2026-11-09).
- code: supabase/functions/parse-food/index.ts, lib/nutrition.js (itemsFiber, applyFollowup), lib/foodThread.js (buildThread entry, weekSummary), screens/FoodChatScreen.js, screens/components/FoodLogHero.js, i18n ×6.
- tests: __tests__/foodFiberWeek.test.js
- checklist-signed: founder 2026-11-09 02:1x EST ("Pode fazer o que tiver que fazer para a gente contabilizar as fibras")
- committed-to: EAS Update (JS) + parse-food deploy

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FW-1 | The food AI returns fiber_g per item (total for the whole amount, 0 for foods without fiber) in the parse and the follow-up, and in the totals; a number only, never negative, no target or advice. | built | __tests__/foodFiberWeek.test.js "FW-1" |  |
| FW-2 | Fiber is stored in each item (parsed_items, synced with the row; no new column). An entry's fiber sums only the items that have it; with none it is unknown, never a false "0 g". | built | __tests__/foodFiberWeek.test.js "FW-2" |  |
| FW-3 | A follow-up answer keeps fiber (its own number, else the stored one scaled with the kcal); an edit of the entry never drops it. | built | __tests__/foodFiberWeek.test.js "FW-3" |  |
| FW-4 | The food chat's entry line shows "… · N g fibra" after carbs and protein, only when the entry has fiber. | built | __tests__/foodFiberWeek.test.js "FW-4" |  |
| FW-5 | The week (last 7 local days): total kcal; daily average of protein and carbs over the days with food; daily average of fiber over the days that have a fiber number (with "· N dias" when fewer than the days with food); no fiber number in the week → no fiber well. | built | __tests__/foodFiberWeek.test.js "FW-5", "FW-6" |  |
| FW-6 | Journey's food card shows the week block under the day line: "Últimos 7 dias · comida em N dias", "~N kcal", "Média por dia" (or "Média por dia com comida" with fewer than 7 days), wells for protein, carbs and fiber, and the line "Para mudar proteína, carboidrato ou calorias, converse com o treinador ou o profissional de saúde que acompanha você. O DoseTrace só mostra os seus números." Today keeps its one week line. Theme tokens only. | built | __tests__/foodFiberWeek.test.js "FW-6" |  |
| FW-7 | Texts in en, es, pt, fr, de, it, natural; never "muito/pouco", a target or advice. | built | __tests__/foodFiberWeek.test.js "FW-7"; __tests__/i18nGrammar.test.js |  |
| FW-8 | The week's calories beside the person's plan ("seu plano: 15.400 (2.200 × 7)"; for fewer days "plano desses N dias"), from Your goal. | missing |  | pending — founder: not built in this round; the plan is computed live in the calculator from many inputs and needs one shared reader first |
| FW-9 | A day total in the food chat ("Hoje ~1.650 kcal · … · 16 g fibra"). | missing |  | pending — founder: the chat shows fiber per message; a day row in the chat is not built in this round |
| FW-10 | Checked on the simulator in light and dark (Journey card with fiber, partial fiber days, old entries without fiber; chat entry line). | partial |  |  |
