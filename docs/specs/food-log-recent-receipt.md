# Food log: recent meals row, receipt look, human goodbye

- source: founder 2026-11-26 — repeat a past meal with one tap instead of typing and explaining it to the AI again ("Factor 75", meal prep, the same breakfast every day); "prefiro algo mais parecido com o modelo B… sem aquele hoje do lado… mostrar o mínimo de informação possível" (names only, no calories, ordered by the time of day, an "i" that explains); the screen "ficou um pouco feia" → look A (receipt), approved; "Em relação ao balão, pode retirar"; no "Por hoje é só" in the AI question; "Pode trocar, siga a sua recomendação" (the question after each entry becomes a human goodbye); no regionalisms ("Beliscou" replaced).
- pictures: docs/design/refeicoes-recentes.html (claude.ai/artifact/QSS1kvxXd4mU8VsSxUhq98, version 2 approved) and docs/design/registro-comida-visual.html (claude.ai/artifact/Sox1Sq7SYKo2ib89V2vozD, option A + goodbye approved).
- council: 7 roles 2026-11-26 (unanimous: worth doing; no AI call; never "repeat the whole day").
- amends: docs/specs/food-log.md FL-4 (the question after each entry → the goodbye) and FL-7 (the separate echo bubble → the receipt is the echo; the screen reader still announces what was logged).
- checklist-signed: founder 2026-11-26 ("Assino os dois checklists, pode seguir").
- committed-to: next build.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FR-1 | Above the field, a fixed row "Refeições recentes · toque para registrar de novo" with an "i", showing up to 10 distinct recent meals from the last 30 days as chips with NAMES ONLY (no kcal, no macros), scrolling sideways; hidden until the first meal is logged. | missing | | |
| FR-2 | Order follows the time of day: first the meals logged near the current time on earlier days (morning → breakfast first; lunchtime → lunch first), then the rest from most recent to oldest. | missing | | |
| FR-3 | A chip name is the person's meal as logged (item names joined, e.g. "2 ovos, bacon, 2 torradas"); identical meals (same items and quantities) are one chip. | missing | | |
| FR-4 | One tap logs the meal at once on the day open in the chat, as a normal entry, WITHOUT an AI call (no daily read used, works offline), copying only item values (food, qty, unit, kcal, carbs, protein, fat, fiber, confidence) with a new message id — never the old msg, ask, ask_pending or raw_text — saved already parsed. | missing | | |
| FR-5 | After the tap, a short "Desfazer" (undo) is shown for a few seconds; undo deletes the new row through the normal delete (tombstone). | missing | | |
| FR-6 | The "i" opens a short sheet: what the row is, that it saves typing and waiting for the AI, that the numbers are the same as last time, and that the order follows the time of day (6 languages, no regionalisms). | missing | | |
| FR-7 | The free 7 days and the Premium lock apply exactly as for typing; a deleted row never appears in the list. | missing | | |
| FR-8 | Look A: each entry is a receipt — names on the left, kcal in a right column (tabular), a total line (kcal + carbs + protein), an estimate shown as a dotted underline on the item plus "estimativa · toque para corrigir"; no per-item "Refeição" tag (the category is still stored). | missing | | |
| FR-9 | The separate echo bubble ("Anotado: …") is gone; the receipt is the echo; screen readers still hear what was logged. | missing | | |
| FR-10 | The day total sits fixed at the top as a small panel with a ruler (kcal large, carbs · protein, fiber), not as a line inside the thread. | missing | | |
| FR-11 | The AI follow-up question has no "Por hoje é só"; it keeps the quick answers, the typed answer and "Pular". | missing | | |
| FR-12 | After an entry (or a follow-up answer) the app does not ask right away whether more was eaten: it says "Pronto, anotado." and, only when the reminder for the next meal is on, "Até daqui a pouco: às HH:MM eu pergunto do <refeição>." (6 languages). The day question keeps coming from the meal reminders and the 20:00 question. | missing | | |
| FR-13 | The empty field reads "O que você comeu?" (6 languages); the AI notice stays, on one smaller line. | missing | | |
| FR-14 | Swipe down closes only from the title bar (fe2e7539 kept); a handle shows on top. | missing | | |
| FR-15 | Theme tokens only, no emoji; checked in light and dark on the phone, the Fold folded and open, and the iPhone simulator; 6 languages fit. | missing | | |
