# Fold: the right page adds, never repeats — A-115

- source: founder 2026-10-07 — "Sempre o lado direito acrescentar o que está ao lado esquerdo"; "ao clicar numa dose que eu tenho que tomar hoje, abre do lado direito… com o máximo de informação possível dentro do que a gente já oferece, sem inventar nada"; picture docs/design/a115-fold-dose-right-page.html (claude.ai/artifact/C4USEspUDPd9uj476ekSAL) — "o seu desenho foi aprovado, pode construir"; the syringe must be the app's standard one.
- supersedes: docs/specs/book-layout.md BK-3's dose page (the dose page with Mark taken / Skip on the right) and the BK-16 rows about actions on that page. Rebuild = replace: screens/components/DosePage.js is deleted.
- decided by logic (docs/decisions.md 2026-10-07 night, item 5): Skip / Mark taken / Undo stay on the left card; "Delete protocol" is not offered on Today's right page; Edit and the refill / zoom sheets open in My Protocols.
- code: screens/TodayScreen.js (renderRightPage, saveProtocolNote), screens/ProtocolsScreen.js (ProtocolDetail and noteDraftKey exported; Delete optional), i18n.
- checklist-signed:
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FR-1 | Unfolded Fold, Today: tapping a dose card (today's, yesterday's pending or an upcoming row) opens that protocol's page on the right — the same page My Protocols shows (name, dose, tags, the app's standard syringe with the draw, the vial block, the oral serving block, Schedule & reminders, Dose details, Notes). Nothing tapped: the Dose log, as before. | built | __tests__/foldDoseRightPage.test.js: "A-115: a tapped dose opens the protocol page"; __tests__/foldDoseRightPage.test.js: "A-115: the syringe is the app"; __tests__/bookToday.test.js: "BK-3: the right page is the Dose log by default" |  |
| FR-2 | The right page never repeats the card: no Mark taken, Skip or Undo there (they stay on the left card); no Delete protocol; an Edit button and the vial / bottle refill and syringe zoom open the protocol in My Protocols. | built | __tests__/foldDoseRightPage.test.js: "A-115: the right page never repeats the card"; __tests__/foldDoseRightPage.test.js: "A-115: a tapped dose opens the protocol page" |  |
| FR-3 | A lyophilized protocol with no mixed vial: the right page starts with "No mixed vial right now", why the syringe and the supply are missing, and "+ Add vial" (Today's own vial prompt). 6 languages, natural. | built | __tests__/foldDoseRightPage.test.js: "A-115: no mixed vial" |  |
| FR-4 | A note typed on the right page is kept per protocol (same draft as My Protocols, survives fold/unfold) and Save writes it like My Protocols. | built | __tests__/foldDoseRightPage.test.js: "A-115: a note typed on the right page saves" |  |
| FR-5 | Theme tokens only, light and dark; no emoji. | built | __tests__/foldDoseRightPage.test.js: "A-115: no mixed vial"; static sweep of the diff (no raw colors) |  |
| FR-6 | Device proof on the Fold, light and dark: a dose with a vial, the MOTS-c without one (+ Add vial works), a pending and an upcoming row, a note saved, fold/unfold keeps the page. | missing |  |  |
