# Pen path (CP-1): pens as a fourth form of a protocol

- source: founder idea 2026-11-09 02:00 EST ("Ready to use? Peptides? Vitamins? Or pens? Se for pen… muda completamente a tela do aplicativo"; "Isso tudo poderia ser construído sem mexer no aplicativo agora, e quando estiver pronto, a gente pergunta"). Founder choices 2026-11-09 in this chat: types A/B/C first and D later; a short list of known pens plus "other pen"; old ready-to-use protocols get "turn into pen"; picture screens 1-5 "Aprovo como está"; P1 ask the dose steps; P3 stock only of the current dose; P4 days out of the fridge now; screens 6-7 "Aprovo as telas 6 e 7, pode seguir".
- picture: docs/design/pen-path.html (screens 1-7, light and dark).
- research: Second Brain/dosetrace/conversas/canetas-pesquisa.md (label facts; never a recommended dose).
- journey review: 2026-11-09 (12 situations, 15 criteria, folded in below).
- code: built on branch feat/pen-path, behind a switch (lib/penPath.js PEN_PATH_ENABLED), merged and turned on only when every row is built.
- tests: __tests__/penPath.test.js
- checklist-signed: founder 2026-11-09 ("Aprovo as telas 6 e 7, pode seguir", after "Aprovo como está" for screens 1-5)
- committed-to: when ready (founder: built apart, turned on only when ready)

## Rules that never bend
- Only the doses printed on the pen are accepted. The app never counts clicks, fractions, "extra doses" or the leftover, and never turns a pen dose into syringe units.
- The app never recommends a dose, never says whether a pen can still be used; it shows the person's own numbers and the label's numbers as suggestions they can change.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| PN-1 | The first form question offers four answers: powder you mix, ready to use, pen, pill (assistant chips and form pills), in the 6 languages; the other three paths are unchanged. | missing |  |  |
| PN-2 | Choosing pen asks which pen, from a short list (Mounjaro KwikPen, Mounjaro single-dose, Zepbound KwikPen, Zepbound single-dose, Ozempic, Wegovy, Saxenda, Victoza, Trulicity, Xyosted) plus "Other pen". The list gives the pen type, the printed doses, doses per pen and the label's validity after opening (and days out of the fridge for single-dose pens), all editable. | missing |  |  |
| PN-3 | Type B (several equal doses): the dose is one of the pen's printed doses; doses per pen come from the list or the box, never from mg arithmetic. | missing |  |  |
| PN-4 | Type C (dial with printed doses): only the printed doses can be chosen; doses per pen for the chosen dose come from the label number in the list (Saxenda 3 mg → 6), never total ÷ dose; "Other pen" asks the number on the box. | missing |  |  |
| PN-5 | Type A (one dose per pen): each taken dose takes 1 pen from the stock, with no "vial finished" window. | missing |  |  |
| PN-6 | "Other pen" asks how the pen works (one dose per pen / several equal doses / dial with printed doses), how many doses of how much, and the validity after opening ("I don't know" leaves it without a countdown). | missing |  |  |
| PN-7 | No pen screen shows dilution, concentration, ml, syringe or syringe units. | missing |  |  |
| PN-8 | What already happened: the setup asks whether this pen was already started; if so, how many doses are left (0 up to the printed number) and when it was opened ("I don't remember" stores no date and shows no countdown, never an invented date). | missing |  |  |
| PN-9 | A new pen's opening date is the day of the first dose taken from it, and it can be edited. | missing |  |  |
| PN-10 | Dose steps (P1): the setup asks "Since when on X?" and "Before that, another dose?" until "No" or "I don't remember"; the scheduled doses in each period are recorded as taken with that period's dose, so the curve uses each step's dose; "I don't remember" stops there and nothing is invented before it. The review card lists each step with its dates and dose count. | missing |  |  |
| PN-11 | The review card shows: compound, form Pen, pen (name · doses per pen), each dose, left in this pen, opened on · valid until, closed pens, frequency (and the steps of PN-10). | missing |  |  |
| PN-12 | Stock (P3) counts closed pens of the current dose only, is stored in synced storage (never AsyncStorage alone) and survives an app update and a re-sign-in. | missing |  |  |
| PN-13 | Protocol page, types B/C: the block "Pen" shows "N of M doses left in this pen", "Opened on … · valid until … · N days", the closed pens, and "New pen" + "Edit pen" side by side, plus "Discard this pen". | missing |  |  |
| PN-14 | Pen-low alert follows the existing rule (7 days of use or the last dose), counting the pen in use plus the closed pens; tags "Last dose in this pen" / "No closed pens". | missing |  |  |
| PN-15 | Validity alert uses the opening date plus the validity the person gave (label value as suggestion); after it passes, what is left shows as to discard, never as doses available. | missing |  |  |
| PN-16 | Changing the dose of a type A/B pen asks for a new pen of the new dose ("Switch to 7.5 mg?"), asks how many pens of the new dose the person has, and moves the old pen to the history with what was left; pen capacity is never recalculated from mg (a 4×10 mg KwikPen changed to 5 mg stays 4). | missing |  |  |
| PN-17 | Editing a past dose never changes a pen's capacity. | missing |  |  |
| PN-18 | "Discard this pen" works even before the first dose: keeps what was left in the history, takes 1 from the stock, never creates a dose. | missing |  |  |
| PN-19 | A skipped dose does not take from the pen. | missing |  |  |
| PN-20 | "Edit pen" corrects the opening date, doses left, validity and stock without recreating the protocol. | missing |  |  |
| PN-21 | Type A page: block "Pens" shows "N pens left", "Each pen is one dose of X mg", "+ Pens" and "Edit". | missing |  |  |
| PN-22 | Days out of the fridge (P4, single-dose pens): "Took it out of the fridge" asks how many pens, when (today / yesterday / other date) and the limit (label suggestion, editable); the block shows "N out of the fridge since … · until … (N days)" and "Back in the fridge". | missing |  |  |
| PN-23 | Two days before the out-of-fridge limit an alert arrives; after the limit the tag says it passed and offers "Back in the fridge" and "Discard"; the app never says whether the pen can still be used. | missing |  |  |
| PN-24 | "Turn into pen" on an old ready-to-use protocol: a link on the Vial block, a confirmation that keeps the history, then the pen questions (which pen, printed dose, doses left, opening date); no dose log, dose history or curve point changes; the old ml count is not copied. | missing |  |  |
| PN-25 | No branch that tests the type 'rtu' or 'recon' lets a pen fall into the powder path or the box-expiry path: one test per function that branches on the type. | missing |  |  |
| PN-26 | Reminders, injection-site rotation, Today, the curve and the report behave the same for a pen and for a ready-to-use vial with the same dose and schedule. | missing |  |  |
| PN-27 | Texts in en, es, pt, fr, de, it, natural; formal Portuguese; no emoji; theme tokens only, checked in light and dark on the simulator. | missing |  |  |
| PN-28 | Behind the switch: with PEN_PATH_ENABLED off, the app is exactly as today (no "Pen" answer, no link on ready-to-use protocols). | missing |  |  |
