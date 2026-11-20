# "Para que você usa {produto}?" — the protocol goal as a prominent question

- source: founder 2026-11-20 10:47 EST, "Aprovo o desenho do \"Para que você usa?\", pode construir" (Second Brain/dosetrace/02-decisoes.md). Only step 1 is built now; screens 2-5 (Apple Saúde / Health Connect, sleep in Meu corpo) wait for a native build and the privacy-policy change (A-179).
- picture: docs/design/sleep-purpose.html, screen 1 (claude.ai/artifact/FZL3CTmTZKbF4nXuRh81V9).
- ordering principle (founder 2026-11-09): the order only saves taps, like the preloaded product names. It never says what she should use a product for.
- decided by logic:
  - the Portuguese question has no article ("Para que você usa Melatonina?"), because the gender changes with the product (o BPC-157, a Creatina, o Zinco). The other languages also use the product name without an article, in their natural form;
  - the curated product table leaves out peptides without an approved use and anabolic steroids. This follows the council note on the picture: no ordering by product for peptides without an approved use;
  - a goal key from the table, or one she chose before for the same product, that is outside the type's list (melatonin capsule → "Suporte circadiano") is added to the tiles. A key whose label is already on screen is not added twice.
- checklist-signed: founder 2026-11-20 10:47 EST, approval of the picture and of the build brief these rows come from ("Aprovo o desenho do \"Para que você usa?\", pode construir").
- committed-to: next delivery after sign-off. JS only, so it ships as an EAS Update, after being checked on the simulator and the Fold.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| PQ-1 | In the manual add / edit protocol form, the question "Para que você usa {produto}?" sits on step 1 right after the product name, and shows as soon as a product is chosen (a list name or her own typed name). It has the sub-line "Opcional. Escolha um ou mais." Next never requires it. | missing | | |
| PQ-2 | The goals are equal tiles, 2 per row, with the onboarding tile look (tileStyles of components/CompoundPills.js), not a pill cloud. 6 tiles are visible, then a link "Ver todos os objetivos (N)" shows all N. | missing | | |
| PQ-3 | No new string, in any language, says "recomendado" or anything that implies advice. | missing | | |
| PQ-4 | The old "Objetivo de bem-estar" row of pills under the schedule (step 4) is deleted, with its string. | missing | | |
| PQ-5 | Order, group a: the goals she already chose for the same product (same compound_id, or the same typed name) in her other protocols, ended ones included. Goals chosen in more protocols come first. | missing | | |
| PQ-6 | Order, group b: the goals typical for that product, from a small curated table compound_id → wt_* keys. The table holds wellness keys only and no disease words. Melatonin → sleep and circadian; vitamin C → immune and antioxidant, never sleep. A product with no entry falls through to group c. | missing | | |
| PQ-7 | Order, group c: the rest, alphabetical in the app language. | missing | | |
| PQ-8 | Tie-breaker: when a dose time is at night (18:00 to 04:00), a sleep key moves up within its group. | missing | | |
| PQ-9 | The ordering is a pure lib function (lib/protocolPurpose.js) with its own tests. | missing | | |
| PQ-10 | A selected tile always stays visible, even when it is beyond the first 6. | missing | | |
| PQ-11 | Edit shows the saved goals selected. A stored key that is not in the current list stays visible and selected, so it can be kept or removed. | missing | | |
| PQ-12 | Storage stays exactly as today: protocols.goal holds comma-separated keys. No migration and no sync change. | missing | | |
| PQ-13 | The protocol assistant shows the same tiles, in the same order, right before its summary / review card when it has a product. What she picks there is saved with the protocol. | missing | | |
| PQ-14 | Onboarding "Protocolo pronto" shows "Para: …" from her profile goals when they map to a protocol goal (a small pure table with tests), and the protocol it creates is saved with those goals. No new onboarding question. | missing | | |
| PQ-15 | Every new string exists in the 6 languages, written naturally (formal Portuguese; fr vous; es / de / it tu / du), and the parity tests pass. | missing | | |
| PQ-16 | Colors come only from theme tokens. The form for melatonin (capsule) and for an injectable, "Ver todos", Edit with saved goals and the assistant step are checked in light and dark. | missing | | |
