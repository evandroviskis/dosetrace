# Lab journal: add a value the AI missed, inside an uploaded test — A-202 (replaces AD-68)

- source: founder 2026-10-31, on the A-202 picture: a lab report has dozens of markers and, beside the result, the low and high limits, flags and earlier results, so typing whole reports invites the wrong number in the chart; nobody will type 40 markers; the lab journal is a history to check, not something the app runs on. "Se tiver algum valor que a IA não conseguiu ler, ou que a pessoa olhando o próprio exame entende que um número está incorreto, aí eu acredito que a pessoa possa editar os valores. Ou editar até um nome. Na verdade, editar qualquer coisa do exame que foi uploaded." So: no lab test is ever created by hand (AD-68 "typed by hand" no longer applies); everything of an uploaded test can be edited; a value the AI could not read is added inside that test (decided by logic: a missing value cannot be edited, only added).
- picture: docs/design/a202-manual-lab-entry.html frames 6.6 and 6.7 ("+ Adicionar valor" inside a test, the same window with the date held to the test). Options A, B, C of that picture (typing whole reports) are NOT built.
- registry: A-202 (docs/review/features.md); A-203 (non-numeric results) stays separate.
- code (planned): screens/BodyScreen.js (the test page, phone and the Fold's right page; the Edit value sheet reused), lib/database.js insertBiomarkers, i18n ×6, components/FeatureExplainers.js (copy only).
- tests (planned): __tests__/a202AddLabValue.test.js
- checklist-signed: (waiting for the founder)
- committed-to: next build whose scope is open

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| AV-1 | No lab test is ever created by hand: the journal's only way to add a test stays the scan ("+ Upload": photo, image or PDF). | missing |  |  |
| AV-2 | On an uploaded test's page (phone, and the Fold's right page) "+ Adicionar valor" sits under the test's values, above "Mudar a data deste exame". | missing |  |  |
| AV-3 | It opens the app's existing "Editar valor" window, titled "Adicionar valor", empty: Marcador, Valor, Unidade; the date is the test's date and is not changed there. Cancelar / Salvar. | missing |  |  |
| AV-4 | Salvar adds one value to the SAME test: same date and the test's own stamp (created_at), so it joins that card (count +1) and never makes a second card on that date; it syncs as a new row like any value. | missing |  |  |
| AV-5 | An empty marker or a value that is not a number is refused with the window's existing message; the value reads the decimal comma by the app language, as "Editar valor" does. | missing |  |  |
| AV-6 | Cancelar or a tap outside with nothing typed closes; with something typed it asks "Descartar este valor?" before closing (never lose what the person typed). | missing |  |  |
| AV-7 | Free for every plan; it is not a scan (the "N de 3 leituras" count does not move) and asks no AI consent (nothing leaves the phone except the normal sync). | missing |  |  |
| AV-8 | No reference range, flag, colour, arrow or verdict anywhere in the window or the test. | missing |  |  |
| AV-9 | Everything of an uploaded test stays editable as today: a value's marker name, value, unit and date, the test's date (AD-100), its labels, deleting a value, deleting the test. | missing |  |  |
| AV-10 | The lab explainer stops promising to type reports. New body ×6 (pt: "Envie o seu exame e a IA lê os valores. Você pode corrigir qualquer um ou acrescentar o que faltou, tudo guardado por data." / en: "Upload your lab report and the AI reads the values. You can fix any of them or add one it missed, all kept by date."); its "Try it" opens the upload choice. | missing |  |  |
| AV-11 | New texts in en, es, pt, fr, de, it, natural and formal in Portuguese ("+ Adicionar valor", "Adicionar valor", "Descartar este valor?"); theme tokens only; checked in light and dark on the iPhone and the Fold (folded and unfolded). | missing |  |  |
