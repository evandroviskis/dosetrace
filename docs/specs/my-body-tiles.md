# My Body in Evolução's layout — A-125

- source: founder 2026-10-15 — "os exames e as vacinas já iniciam todos abertos… quanto mais exames eu tenho, mais eu tenho que enrolar… fazer alguma coisa parecida com o Journey… Vaccine Journal e o Lab Test Journal em cima, os dois retângulos… Dose Accumulation embaixo… um pequeno resumo"; pick "Meu corpo: A". Pictures: docs/design/a125-mybody-closed.html (captures docs/design/a125-telas/). Ledger: docs/decisions.md 2026-10-15. Includes the lab-cards bug found the same day (one upload shown as many cards).
- code (expected): screens/BodyScreen.js (hub layout, reportCards), screens/JourneyScreen.js tile component (reused), screens/components/VaccinesSection.js, i18n ×6.
- checklist-signed:
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| MB2-1 | My Body opens with two tiles side by side — "Diário de exames" (left) and "Diário de vacinas" (right) — using Evolução's tile exactly, and "Acúmulo de doses" full width below, then the footnote; as in picture A, light and dark, phone and the unfolded Fold. | missing | | |
| MB2-2 | Labs tile (option A): the number of tests, "último em {date}" (app date format) and "{n} marcadores" of the latest test. Vaccines tile: the number of vaccines and the latest one's name and date. No value, no colour, no high/low. | missing | | |
| MB2-3 | Empty tiles show "Nada registrado ainda" and the existing description of each journal. | missing | | |
| MB2-4 | Tapping a tile opens its journal as today (phone); on the unfolded Fold it opens on the right page, the tile shows the "open" outline, and the right page defaults to the lab journal so it is never blank. Dose accumulation keeps opening the curve as today. | missing | | |
| MB2-5 | One upload is one card: values saved together from one scan or one manual entry show as a single report card even when a marker repeats in it or each value has its own created_at (test with the real shapes: 3 reports of 19/18/20 values → 3 cards; 46 values with 5 repeated markers → 1 card). | missing | | |
| MB2-6 | Premium gating unchanged (lab charts stay Premium; tiles are not charts). New strings ×6 written natively and approved; both themes checked. | missing | | |
