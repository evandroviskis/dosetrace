# AI food log emphasis on Today and Evolução — A-124

- source: founder 2026-10-15 — "o registro de comida com IA… não se destaca… tudo da mesma cor… não consigo olhar para a tela e lembrar: preciso marcar o que eu comi hoje"; picks: option A ("mantenha ele abaixo dos anéis… botão azul… uma borda azul") and A1 ("Comida: A1"). Pictures: docs/design/a124-food-log-emphasis.html (captures docs/design/a124-telas/). Ledger: docs/decisions.md 2026-10-15.
- code (expected): screens/components/FoodLogHero.js, screens/TodayScreen.js, screens/JourneyScreen.js, lib/theme.js (emph / onEmph tokens = the existing Cobalt values in both palettes).
- checklist-signed:
- committed-to: 1.3.0 (approved → next build)

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| FE-1 | On Today the AI food log card stays in its place (below the rings / progress block) and, while the food log is active (a reality check running), shows: the sparkle icon in a round well, the existing title and state lines, a full-width "Registrar comida" button (existing string nutri_hero_cta ×6) and a 2 pt border, both in the emphasis colour — as in picture A1, light and dark. | missing | | |
| FE-2 | The same card treatment on Evolução (Journey), as in the picture. | missing | | |
| FE-3 | The button opens the same AI food chat the card opens today (no new flow); the card tap keeps working. | missing | | |
| FE-4 | When the food log is not active, the card looks and behaves as today (no border, no blue button). | missing | | |
| FE-5 | Colours come only from theme tokens: new tokens emph / onEmph defined in BOTH palettes (light #2350D8 on #FFFFFF, dark #8AA8FF on #0F1114); no hardcoded colour; no shadow. | missing | | |
| FE-6 | Both themes checked on Today and Evolução, phone and the unfolded Fold; the button's text and the border have readable contrast in both. | missing | | |
