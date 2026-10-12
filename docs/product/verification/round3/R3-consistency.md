# R3 — Final cross-document consistency pass (round 3)

- Date 2026-10-12. Branch `redesign/graduated`, base HEAD `897ed95`. One editor (this pass); nothing committed, built, published or written to the network. No code changed.
- Scope: `docs/product/` (PRD, TRD, DIVERGENCES, OPEN-DECISIONS, README, flows/, research/ citations, verification/round2/id-map.md), the 2026-10-12 sections of `docs/decisions.md`, and the Portuguese picture `docs/design/fluxos-dosetrace.html` (content only).
- Authority applied: founder lines in `docs/decisions.md` → founder-signed spec rows → the binding prototype → code. Coordinator / "by logic" lines were never treated as founder answers.
- Method: every count recomputed by script (node, `.cjs` in the session scratchpad, prefix `r3-`); every flow §11 D-row matched to the Sources of its DV row by script (both directions); every "OPEN-xx … Portuguese question N" pair checked against the mapping comment; every OPEN item, every round-2-closed item and every withdrawn / moved id grepped in every document and read in context; the Portuguese message compared item by item with the English OPEN list and the app's own pt strings (`i18n/translations.js`); markdown tables, file:line references, backticked paths and placeholders checked by script; all 120 mermaid blocks (105 Markdown + 15 picture) parsed with mermaid 10.9.1 in the browser pane: **120 / 120 parse**.

## 1. The six known items

| # | Item | Finding (verified) | Resolution |
|---|---|---|---|
| 1 | Restart order | No founder line or signed row sets the order of Restart's sheets: decisions.md:614 (founder, council 3) says only that the container is asked and that a same-name active protocol is warned about. The register's DV-217 (a bug, "No (bug)") says the free limit must come first; the code checks it last (`ProtocolsScreen.js:1253-1290`). PRD §3 story 4, PRD-PROT-90, C-11 and flow 05 (P8, §5 diagram, §6.2, §7.2, F05-06) and the picture still described limit-last as the intended order. | Registers win (README authority): intended = the free limit first, then the duplicate warning, then the container question; today = last (DV-217). PRD (3 places), flow 05 (P8, the §5 diagram, §6.2, §7.2 with a divergence line, new D05-17, F05-06 now expects the limit sheet first and records today's order as the divergence), the picture (P-row becomes a "Previsto / Hoje está diferente" cell) and DV-217's own description (it claimed "the PRD and flow 05 say the limit comes first") now say the same. Ledger round-3 note added. |
| 2 | DV-054 "AD-27 withdrawn" vs id-map "moved to OPEN-20 (b)" | Five places said "withdrawn" (DIVERGENCES DV-054, OPEN-20 context, flow 01 ×3, flows README #2). | One wording everywhere: "AD-27 moved to OPEN-20 (b) (round 1)". |
| 3 | DIVERGENCES Source columns ← flow D-row ids | Script: 89 (D-row → DV) links were missing from the DV Sources (all the listed ranges plus D03-3, D06-10, D08-13, D08-14, D14-2), and DV-042 still cited the closed D06-4. Two non-matches are by design (D01-5 → closed DV-142; D07-3 → DV-003, where DV-206 is merged). | 71 DV rows' Sources extended (list in §6); DV-042 → "D06-3 (D06-4 closed round 2)"; new D03-26 and D05-17 added to DV-182 / DV-222 and DV-217. Re-run: 0 missing (except the two by-design), 0 stale. |
| 4 | DV-201 source typo | The "flow 04" typo was already fixed; "(flow 02 FC-19)" read as if FC-19 were a flow-02 check, but FC-19 is a row of verification 01's claim table. | "verification 01 NEW-D (its claim-table row FC-19, flow 02 §7.4)". |
| 5 | "End = the moment tapped" for a deliberate End | Rests only on coordinator lines: decisions.md:504 (round 4, "by the ledger / logic", A-83 option a) and :535 (council synthesis); grok/251 says "Decided by logic (not asked): A-83 end = tap moment". A-85 (registry, council source) only names the End action; AD-11 schedules A-85 in 1.3.0 (founder :550) but says nothing about its date. No founder line or signed row. | Genuine logic (an honest journal records what was declared and when; only the inactivity prompt is back-dated, DL-87, because it comes after 7+ silent days; a date question would be unapproved UI) → **DL-99**. Added to OPEN-DECISIONS, the ledger's DL section, PRD-PROT-81, flow 05 (diagram labels, §6.2, §7.1, R-49, §12), DV-090's founder column, research/01 R-49 citation. |
| 6 | Stash rules PA-71…73; real-year ask PA-106…108 | Coordinator lines decisions.md:472-473 and :496 ("resolved by the ledger + product logic"); the premium-and-auth checklist is unsigned (Approvals item 7). No AD / DL id. Both are genuine logic; the year wheel is built UI that the founder sees when he signs the checklist. | **DL-100** (stash: belongs to the person who passed "Before we begin", fills only missing fields, leaves the phone once written or on a real sign-out) and **DL-101** (the 18+ confirmation asks the real birth year; one merge-only write; the calorie inputs use it). PRD-ONB-13, PRD-GATE-4, flow 01 (P10, §6.3, §7, rules 4, 5, 11, §12, F01 sources) cite them. |

## 2. Cross-document sweep

### 2.1 OPEN items (23 open) — presented as open everywhere, with the right Portuguese question
- All 157 "OPEN-xx … Portuguese question N" pairs in the Markdown set match the mapping comment (0 wrong). Every picture "Falta sua decisão (pergunta N)" tag was read against its topic: all match.
- Fixed where a document presented an open item as decided or omitted its id: PRD-TODAY-33 (tracker unit and words stated as settled → OPEN-17); flow 04 §7.3, §8, F04-13 (where the rtu "New vial" is offered, "picture first, not decided" → OPEN-01); PRD-VIAL-40 (powder New vial on the protocol page → OPEN-01); flow 02 D02-4 (server-side limit as intended → pending OPEN-05); flow 08 P10 (→ OPEN-09); flow 11 P9 and F11-16 (the "Bloodwork due" words asserted → pending OPEN-13); TRD §2.4 storage table and INV-04 (cross-account discard as "decision" → coordinator line, OPEN-21 (11)); TRD `reality_checks` row (Stop erases all → OPEN-08); flow 03 had no OPEN-16 (b) despite the Dose-log sync defects (new D03-26, P1 note, §12); the picture showed three cross-device rows as fine (flow 03 P1, flow 07 P11, flow 09 P5 → "Hoje está diferente … pergunta 1 (b)") and lacked OPEN-24 item 3 (Progress "days" labels) → pend box added in flow 07.
- DIVERGENCES: DV-080, DV-098, DV-129 cited only their DL although the fix is new UI → "· OPEN-24 item 4 / 5 / 12".
- Round-2-closed items (OPEN-12, OPEN-14 (a), OPEN-18 (5)–(8), OPEN-19 (a)–(c), OPEN-20 (a), OPEN-21 (1)–(10)): 79 mentions outside the registers, every one labelled closed / "was" / its AD-DL. Withdrawn / moved ids (DL-01, 16, 24, 32, 50, 51, 66, 67, 68, 71–75; AD-04, 10, 12, 27–29, 35, 44–46, 50, 54, 56, 57): no live use left; the ledger's 2026-10-12 header ("DL-01 supersedes…") and its DL-16 line (Protocols colouring "AD-65") got round-3 notes (AD-76; AD-65 narrowed to Today + DL-80).

### 2.2 The Portuguese message
- 1:1 with the English list: 23 questions in the same order as the OPEN headings and the mapping comment; options and recommendations match item by item (checked: Q1 (a)/(b) options A–C and the B split of the sync work; Q2 the 12 items in order; Q11 and Q15 and Q20 sub-items; Q23 (a)–(e)). Approvals 1–9 match the English "Approvals still owed" 1–9; the 18 wording approvals are all there.
- Fixed: count 84 → 87 ("pontos resolvi pela lógica"); "conferirem tudo duas vezes" → "em três rodadas"; approvals item 1 lacked "and whatever OPEN-18 (3) decides" (now "e o que você decidir na pergunta 23 (c)"); approvals item 2's last entry "o texto da animação que explica a sequência" (wrong: it is the streak explanation at the top of the Dose log, decisions.md:417, PRD-LOG-1) → "o texto que explica a sequência, no topo do Registro de doses".
- One word per concept / the app's own pt strings: "card" (×8) → "cartão" (the picture's and the app's word); "o lembrete semanal de peso" → "o check-in semanal" (`notif_checkin_title`); "os dias de validade" → "os dias restantes do frasco" (`Dias restantes`); "status" → "a situação da assinatura"; "Depois" vs "Mais tarde" for the End prompt's way out unified to "Mais tarde" (picture ×2). Jargon removed: "em todas as tabelas", "exclusão em cascata", "modelo de dados sincronizado", "citando todas as tabelas". Screen names checked against i18n: Hoje, Meus protocolos, Meu corpo, Evolução, Ajustes, Progresso, Seus números reais, Registro de comida com IA, Acúmulo de doses, Diário de exames, Registro de doses (`log_title`), Verificar lembretes, Garanta que seus lembretes cheguem, Dados e privacidade, Editar perfil, Sair mesmo assim, Exame de sangue pendente, Excluídos recentemente, Excluir para sempre, Ainda em andamento?, Protocolo concluído, Registrar novo frasco, Retomar, Restaurar, Concluir, Pular, Desfazer, Tudo em dia por hoje, Parar a medição, Começar de novo, Restaurar compras, Limite de protocolos atingido, dias grátis.

### 2.3 Mechanical
- Tables: every Markdown table row has its header's cell count (0 mismatches; pipes in code spans and `\|` handled).
- file:line: 0 references past the end of their file. Backticked paths: every one exists, or is now labelled PROPOSED (`lib/bodyPrefs.js`, `lib/protocolName.js`, `supabase/schema.snapshot.json` in DIVERGENCES) or located (`node_modules/expo-background-task …BackgroundTaskScheduler.kt`, `node_modules/expo-notifications …NotificationBehaviorRecord.kt`); runtime / scratch files are already described as such (`dosetrace_export.json`, `endeddiv.cjs`, `dstdiv.cjs`). `index.ts:NNN` references name their edge function in the same cell (line ranges checked against the longest candidate).
- No `[OPEN-PENDING`, `TODO` or `TBD` anywhere in the set.
- Mermaid blocks changed: **2** — `flows/05-protocol-end-restart-delete.md` #0 (happy-path flowchart: the Restart branch now reads Free limit → duplicate warning → container question; B2 label "(DL-99)") and #1 (state diagram: the End-protocol transition label "(…, DL-99)"). Labels with colons stay quoted; no `;` in messages; no state named Default. All 120 blocks parse.
- Picture HTML: tags balanced after the edits (td 1184/1184, tr 385/385, p 60/60, span 230/230).
- flows/README per-flow OPEN table rows reordered 01…14 (they ran 10…14, 01…09).

## 3. Topic matrix (56 cross-cutting topics)

✓ = agrees with the canonical register · **r3** = disagreed, fixed in this pass · — = the document does not cover the topic. "Dossiers" (research/) are evidence snapshots and were checked for citations only (R-49 corrected); they are not re-listed per topic. The picture column refers to `fluxos-dosetrace.html`; the ledger column to `docs/decisions.md`.

| # | Topic | Canonical | PRD | TRD | Flows | DIVERGENCES | Picture | Ledger |
|---|---|---|---|---|---|---|---|---|
| T-1 | Tracker streak unit and words | OPEN-17 (q8) | **r3** TODAY-33 | ✓ S-10, R-09 | ✓ 03 §7.7 | ✓ DV-034 | ✓ q8 | ✓ |
| T-2 | Tracker look-back 365 | DL-03 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T-3 | Report streak = card | DL-02 | ✓ | ✓ S-09 | ✓ | ✓ DV-032 | ✓ | ✓ |
| T-4 | Card streak counts doses | AD-07 | ✓ TODAY-35 | ✓ | ✓ | ✓ | ✓ | ✓ :642 |
| T-5 | Days-left colour | AD-65 (Today) + DL-80 (My Protocols, OPEN-24 item 11) | ✓ | ✓ R-46 | ✓ 04 | ✓ DV-018 | ✓ q2 item 11 | **r3** DL-16 line noted |
| T-6 | Skip cancels its reminders | DL-08 | ✓ | ✓ S-05 | ✓ | ✓ DV-035 | ✓ | ✓ |
| T-7 | Undo after Skip | OPEN-19 (d) (q9) | ✓ | ✓ R-17 | ✓ 03 | ✓ DV-130 | ✓ q9 | ✓ |
| T-8 | No-time protocol slot 08:00 | DL-77 | ✓ | ✓ S-01 | ✓ 03, 06 | ✓ DV-028 | ✓ | ✓ |
| T-9 | Mark-complete daily cap | DL-76 | ✓ DOSE-2 | — | ✓ 03 | ✓ DV-204/227 | ✓ | ✓ |
| T-10 | Late dose on its own day | AD-70 | ✓ | ✓ R-08 | ✓ 03 | ✓ DV-030 | ✓ | — |
| T-11 | Reminder body tap = button | DL-10 + OPEN-24 item 9 | ✓ | — | ✓ 03 | ✓ DV-036 | ✓ q2 item 9 | ✓ |
| T-12 | AI consent per account + withdraw | DL-55 + OPEN-24 item 1 | ✓ | ✓ R-02 | ✓ 01, 11, 12 | ✓ DV-007 | ✓ q2 item 1 | ✓ |
| T-13 | Sync deletes / counters / pull cursor timing | OPEN-16 (b) (q1) | ✓ G-155 | ✓ R-01, R-05, R-51…54 | **r3** 03 (D03-26) | ✓ DV-182/183/209/210/222 | **r3** 3 cells | ✓ |
| T-14 | Scope of 1.3.0 | OPEN-16 (a) (q1) | ✓ | ✓ | ✓ 01, 12, README | ✓ Summary | — | ✓ |
| T-15 | New UI from logic decisions | OPEN-24 (q2) | ✓ | ✓ | ✓ | **r3** DV-080/098/129 | **r3** item 3 added | — |
| T-16 | Grace week after a lapse | AD-14 | ✓ | ✓ | ✓ 07, 08, 13 | ✓ DV-101 | ✓ | ✓ |
| T-17 | Apple sign-in on Android | AD-30 (+ secret, Approvals 5) | ✓ | ✓ R-52 | ✓ 01 | ✓ DV-115, DV-211 ops | ✓ | ✓ |
| T-18 | Android Apple artwork | AD-74 (+ Approvals 4) | ✓ G-199 | — | ✓ 01 D01-11 | ✓ DV-239 | ✓ | ✓ :752 |
| T-19 | Self-finishing check, one start weight, A-24 | OPEN-07 (q12) | ✓ | — | ✓ 07, 08 | ✓ DV-061/144 | ✓ q12 | ✓ |
| T-20 | Stop erases earlier results | OPEN-08 (q13) | ✓ | **r3** reality_checks row | ✓ 08 | ✓ DV-004 | ✓ q13 | — |
| T-21 | A check with no number | OPEN-09 (q14) | ✓ | ✓ R (DL-26 / OPEN-09) | **r3** 08 P10 | ✓ DV-104/150/205 | ✓ q14 | — |
| T-22 | Measured burn, incomplete profile | OPEN-22 (a) (q15 a) | ✓ PROG-14 | — | ✓ 09 | ✓ DV-149 | ✓ q15 (a) | ✓ DL-75 withdrawn |
| T-23 | Target ETA with old weigh-ins | OPEN-22 (b) (q15 b) | ✓ | — | ✓ 09 | — (no row) | ✓ q15 (b) | ✓ DL-68 moved |
| T-24 | Free limit: server and lapse | OPEN-05 (q7) | ✓ | ✓ S-31, R-16 | **r3** 02 D02-4 | ✓ DV-095 | ✓ q7 | ✓ |
| T-25 | Restart order | DV-217 bug: limit first | **r3** ×3 | ✓ (no order stated) | **r3** 05 ×6 + D05-17 | **r3** DV-217 text | **r3** | **r3** round-3 note |
| T-26 | Bloodwork due | OPEN-13 (q19) | ✓ | ✓ S-70b | **r3** 11 P9, F11-16 | ✓ DV-111 | ✓ q19 | — |
| T-27 | Blend component lines | OPEN-18 (1) (q23 a) | ✓ | — | ✓ 10 | ✓ DV-156 | ✓ | ✓ :205 |
| T-28 | "Not recorded" food day | OPEN-18 (2) (q23 b) | ✓ | — | ✓ 07, 08 | ✓ DV-151 | ✓ | ✓ |
| T-29 | Builder AI caps (food + assistant) | OPEN-18 (3) (q23 c) | ✓ | ✓ | ✓ 02, 07, 13 | ✓ DV-213/240 | ✓ | ✓ |
| T-30 | Ring / curve intro animation | OPEN-18 (4) (q23 d) | ✓ | — | ✓ 03, 10 | ✓ DV-132 | ✓ | ✓ :441 |
| T-31 | Week / whole-check food totals | OPEN-18 (9) (q23 e) | ✓ | — | ✓ 07 | ✓ DV-232 | ✓ | ✓ |
| T-32 | Food quota bucket | DL-28 (rewritten) + OPEN-24 item 8 | ✓ | ✓ | ✓ 07 | ✓ DV-066 | ✓ q2 item 8 | ✓ |
| T-33 | Premium scan number in copy | AD-69 | ✓ | ✓ | ✓ 11, 13 | ✓ DV-110/237 | ✓ | ✓ :757 |
| T-34 | Scans used / change a test date | OPEN-14 (b), (c) (q20) | ✓ | ✓ | ✓ 11, 13 | ✓ DV-110 | ✓ q20 | — |
| T-35 | Manual lab entry | AD-68 (+ Approvals 3) | ✓ | ✓ | ✓ 11 | ✓ DV-107 | ✓ | — |
| T-36 | Lab charts Premium | AD-24 (+ Approvals 3) | ✓ | ✓ R-21 | ✓ 11, 13, 14 | ✓ DV-108 | ✓ | ✓ |
| T-37 | Purge paused / after 1.3.0 | DL-94 / OPEN-04 (q6) | ✓ | ✓ | ✓ 05 | ✓ DV-125 | ✓ q6 | ✓ |
| T-38 | Course total reached | OPEN-03 (q5) | ✓ | ✓ R-03 | ✓ 03, 05 | ✓ DV-012 | ✓ q5 | ✓ :620 |
| T-39 | OS permission after "Not now" | OPEN-20 (b) (q11 a) | ✓ | — | **r3** wording 01; ✓ 06 | **r3** DV-054 wording | ✓ q11 (a) | — |
| T-40 | Settings red on any block | AD-71 | ✓ | ✓ | ✓ 06 | ✓ DV-042 (**r3** D06-4 note) | ✓ | ✓ |
| T-41 | Vial-expiry lead time and words | OPEN-20 (c) (q11 b) | ✓ VIAL-31 | — | ✓ 04, 06 | — | ✓ q11 (b) | ✓ :417 |
| T-42 | Supply push at 3 | AD-60 | ✓ | — | ✓ 04, 06 | — | ✓ | ✓ |
| T-43 | Site questions never dropped | AD-76 | ✓ | ✓ | ✓ 03 | ✓ DV-175 | — | **r3** :645 note |
| T-44 | Gates answerable offline | DL-92 + OPEN-24 item 10 | ✓ | ✓ R-39 | ✓ 01, 12 | ✓ DV-114 | ✓ q2 item 10 | ✓ |
| T-45 | Confirmed delete cancels reminders | DL-85 | ✓ | — | ✓ 06, 12 | ✓ DV-009 | ✓ | ✓ |
| T-46 | Recon New vial / correct vial / box date | OPEN-01 (q3) | **r3** VIAL-40 | ✓ R-13 | **r3** 04 ×3 | ✓ DV-027/093/094 | ✓ q3 | ✓ |
| T-47 | Deliberate End + its date | AD-11 + DL-99 (+ Approvals 3) | **r3** PROT-81 | — | **r3** 05 | **r3** DV-090 | ✓ (item 3) | **r3** DL-99 |
| T-48 | Onboarding stash / real birth year | DL-100 / DL-101 (+ Approvals 7) | **r3** ONB-13, GATE-4 | — | **r3** 01 | — | — | **r3** DL-100/101 |
| T-49 | Cross-account guard | OPEN-21 (11) (q22) | ✓ | **r3** §2.4 table, INV-04 | ✓ 01, 06, 12 | ✓ DV-081/169 | ✓ q22 | ✓ :508 noted |
| T-50 | Oral low supply | OPEN-02 (q4) | ✓ VIAL-43 | ✓ | ✓ 04 | ✓ DV-092 | ✓ q4 | — |
| T-51 | iPhone reminders without opening | OPEN-06 (q10) | ✓ | ✓ INV-27 | ✓ 06 | ✓ DV-097 | ✓ q10 | ✓ |
| T-52 | Dose edit rewrites the past curve | OPEN-10 (q16) | ✓ | — | ✓ 10, 02 | ✓ DV-005 | ✓ q16 | ✓ |
| T-53 | Skipped / missed and the curve | OPEN-11 (q17) | ✓ | — | ✓ 03, 10 | ✓ DV-072 | ✓ q17 | ✓ |
| T-54 | False Missed rows | OPEN-23 (q18) | ✓ | — | ✓ 03 | — (no row) | ✓ q18 | ✓ |
| T-55 | Manage the subscription | OPEN-15 (q21) | ✓ | — | ✓ 12, 13 | ✓ DV-112 | ✓ q21 | — |
| T-56 | Interval: Every day / Custom, 1–365 | AD-66 + DL-19 | ✓ | — | ✓ 02 | ✓ DV-123/230 | ✓ | ✓ :750 |

## 4. Counts — stated vs recounted

Recount (session-scratchpad scripts `r3-count.cjs`, `r3-count2.cjs`, `r3-dvopen.cjs`, not repo files): OPEN headings in the OPEN section; AD / DL rows in their own tables, "in force" = not marked "→" / "Withdrawn"; DV rows by section and the Sev column (section and Sev agree on every row); PRD `| G-n |` rows and `- **PRD-…-n**` bullets and `### C-n`; flow `**Fnn-mm — ` headers; ```` ```mermaid ```` blocks and the picture's `<pre class="mermaid">`.

| Place | Stated before | Stated now | Actual |
|---|---|---|---|
| OPEN-DECISIONS.md:12 (intro) | 23 OPEN · 62 AD · 84 DL (DL-01…DL-98) · 231 DV (15/103/44/69) + 3 / 4 / 3 | 23 · 62 · **87** (DL-01…DL-101) · 231 (15/103/44/69) + 3 / 4 / 3 | 23 · 62 · 87 · 231 (15/103/44/69) + 3 ops / 4 merged / 3 closed |
| OPEN-DECISIONS.md OPEN-16 context | 231 (15/103/44/69) | same | 231 (15/103/44/69) |
| OPEN-DECISIONS.md PT message | 231 erros (15/103/44/69) · 62 · **84** · 23 perguntas | 231 · 62 · **87** · 23 | as above |
| DIVERGENCES.md Summary table + line | 231 (15/103/44/69); domain rows | unchanged | identical per domain (PROT 0/23/12/9, TODAY 0/20/0/11, REM 1/14/6/9, FOOD 2/16/7/4, CURVE 0/8/2/9, BODY 1/9/5/3, ACCT 4/9/5/11, PLAT 7/4/7/5, DOCS 0/0/0/8) |
| DIVERGENCES.md:4 | "the PRD's gaps G-1…G-137" | G-1…G-233 | 233 G rows, G-1…G-233, no gap, no duplicate |
| DIVERGENCES.md:74 | 43 rows cite an OPEN (8 only OPEN-24) | 46 (11 only OPEN-24) | 46 (11) |
| README.md (OPEN-DECISIONS row) | 23 · 62 · **84** | 23 · 62 · 87 | 23 · 62 · 87 |
| README.md (DIVERGENCES row) | 231 (15/103/44/69) + 3 / 4 / 3, DV-001…DV-241 | unchanged | same; 241 ids issued |
| README.md (PRD row) | 463 requirements, 40 contracts, **G-1…G-155** | 463, 40, 233 gap rows G-1…G-233 | 463 (no duplicate id), 40, 233 |
| README.md (flows row) | 14 flows, 263 checks | unchanged | 263 (01 26, 02 25, 03 25, 04 19, 05 16, 06 19, 07 19, 08 19, 09 18, 10 15, 11 18, 12 13, 13 15, 14 16) |
| README.md (picture / verification rows) | 14 flows · "105 diagrams parse" | 14 flows, 15 diagrams · 120 parse (105 + 15) | 105 Markdown + 15 picture = 120; 120 / 120 parse (mermaid 10.9.1) |
| PRD.md:6 | 23 · 62 · **84** · 231 (15/103/44/69) + 3/4/3; "78 gap rows G-156…G-233" | 23 · 62 · 87 · same | as above; G-156…G-233 = 78 |
| PRD.md:18, :1891 | G-1…G-233; 23 OPEN | unchanged | ✓ |
| flows/README.md | 263 checks (per flow as above); 23 questions; of the 36 flow questions 23 reach an OPEN, touching 19 OPEN ids | unchanged | ✓ (recounted from the OPEN-DECISIONS flows crosswalk) |
| id-map.md final counts | 62 AD · 84 DL · 231 DV | round-3 section appended: 87 DL | 87 |
| decisions.md:645 (DL section header) | DL-01…DL-98 | DL-01…DL-101 | 101 DL rows |

## 5. Not resolved here (and why)

1. **DV-168 is an active S4 row whose fix is "No change" and whose test is "—"** (the 18+ floor uses the birth year only; AD-43 keeps it). A register row with nothing to fix breaks the register's own rule ("a test must fail first"); closing it would change the counts every document states. Left for the next register pass; flagged, not changed.
2. **PT name of the Dose log.** AD-59 (the founder's 2026-10-03 "Aprovado / Siga") names it "Histórico"; the app's strings still say "Registro" (`tab_log`) / "Registro de doses" (`log_title`) — DV-193. The message and the picture use the app's current string, as instructed; when DV-193 is fixed, both should follow the new name.
3. **"Frasco novo" (Restart button) vs "Novo frasco" (protocol page)** — the app itself uses two forms; the picture and the message quote the screen they describe. A one-term fix is copy (a wording approval), not a documentation fix.
4. **DV-217's severity** stays S4 (the register's call); a free user answering two questions before a refusal is arguably S2 ("wrong information"). Not changed: severity is the register's, and counts would ripple.
5. **Dossiers (research/)** were checked for citations only (R-49 → DL-99); they are evidence snapshots and keep their original wording.
6. **Live-state claims** (deployed functions, the `reality_checks` trigger, the Apple probe) were not re-checked: no network writes or reads were in scope.
7. **`index.ts:NNN` references** are resolved through the edge-function name in the same cell; their line ranges were checked against the longest candidate file only.

## 6. Final counts

| Register / document | Count |
|---|---|
| OPEN questions open | **23** (OPEN-01…OPEN-11, OPEN-13…OPEN-24) — Portuguese questions 1–23 |
| AD in force | **62** (AD-01…AD-76; 14 moved out) |
| DL in force | **87** (DL-01…DL-101; 14 withdrawn or moved; DL-99…DL-101 added in round 3) |
| DV active | **231** — S1 15 · S2 103 · S3 44 · S4 69 |
| DV not counted | 3 ops (DV-173, DV-188, DV-211) · 4 merged (DV-189, DV-206, DV-208, DV-212) · 3 closed (DV-100, DV-142, DV-194) |
| DV ids issued | DV-001…DV-241 |
| DV rows citing an OPEN | 46 (11 only for OPEN-24's new UI) |
| Approvals still owed | 9 items (18 wording approvals in item 2) |
| PRD | 463 requirements · 40 contracts · 233 gap rows (G-1…G-233) |
| Flows | 14 flows · 263 acceptance checks · 237 D-rows in the §11 tables (all mapped to a DV Source, except D01-5 → closed DV-142 and D07-3 → DV-003 via merged DV-206) |
| Diagrams | 120 (105 Markdown + 15 picture), all parse with mermaid 10.9.1 |

## 7. Edits made (file:line at the time of the edit — before → after)

Categories: restart-order (item 1), ids (item 2 and item 4), dl-new (items 5 and 6), open-sweep (item 7), pt-message (item 10), picture, counts (item 8), ledger, mechanical (item 11), citations, mermaid. Long strings are cut at 160 characters. The 71 Source-column additions of item 3 follow at the end.

#### restart-order (11)

- docs/product/PRD.md:321 "4. **Restart** from the Ended section, in this order (code, `ProtocolsScreen.js:1253-1290`): (1) duplicate warning if the same compound is active; (2) the conta" → "4. **Restart** from the Ended section, in this order: (1) the free-limit check first (a free user at 3 active sees "Protocol limit reached" before any question)"
- docs/product/PRD.md:623 "one restart at a time; the free limit is checked when the restart runs — after the warning and container sheets, before anything is written (`ProtocolsScreen.js" → "one restart at a time; the free limit is checked FIRST, before the duplicate warning and the container question, so a free user at the limit never answers a que"
- docs/product/PRD.md:1323 "built order: duplicate warning when the same compound is active → container question → free-limit check last, when the restart runs (`ProtocolsScreen.js:1253-12" → "order: free-limit check first → duplicate warning when the same compound is active → container question (today the limit is checked last, after a container is p"
- docs/product/flows/05-protocol-end-restart-delete.md:43 "\| P8 \| Free user at 3 active wants to restart / restore a 4th \| Restart → limit sheet, shown only after the duplicate warning and the container question; Restor" → "\| P8 \| Free user at 3 active wants to restart / restore a 4th \| Restart → the limit sheet first, before the duplicate warning and the container question (today "
- docs/product/flows/05-protocol-end-restart-delete.md:127 "\| Ended → new Active \| Restart \| duplicate warning, container question, then free limit (checked on the button tap, before anything is written) \|" → "\| Ended → new Active \| Restart \| free limit first, then the duplicate warning and the container question (today the limit is checked last, on the container butt"
- docs/product/flows/05-protocol-end-restart-delete.md:145 "- Order (ProtocolsScreen.js:1253-1290): duplicate warning → container question → free-limit check last, inside `restartProtocol`, after a container button is ta" → "- Order: free-limit check first ("Protocol limit reached", nothing written) → duplicate warning → container question. A question whose answer is then refused mu"
- docs/product/flows/05-protocol-end-restart-delete.md:302 "- Expect: Restart → "Resume {name}?" (after the duplicate warning, if any) → tap New vial / Keep using the same vial / Resume → "Protocol limit reached" / "Limi" → "- Expect: Restart → "Protocol limit reached" / "Limite de protocolos atingido" sheet at once, before the duplicate warning or "Resume {name}?"; nothing written."
- docs/design/fluxos-dosetrace.html:792 "<td>Retomar mostra “Limite de protocolos atingido”, mas só por último: primeiro vem o aviso de composto já ativo (se houver), depois a pergunta do frasco; o lim" → "<td class="div">Previsto: Retomar mostra “Limite de protocolos atingido” logo de cara, antes de qualquer pergunta, e nada é gravado. Restaurar leva a Encerrado."
- docs/product/DIVERGENCES.md:360 "(`ProtocolsScreen.js:1253-1290`); the PRD and flow 05 say the limit comes first. \|" → "(`ProtocolsScreen.js:1253-1290`). Intended (PRD-PROT-90, flow 05 §7.2): the limit first — a question whose answer is then refused must not be asked. \|"
- docs/product/DIVERGENCES.md:360 "\| DV-217 \| verification 01 (coordinator summary 2) \|" → "\| DV-217 \| verification 01 (coordinator summary 2); flows D05-17 \|"
- docs/product/flows/05-protocol-end-restart-delete.md:250 "\| `01 D-21` \| DV-026 \|" → "\| `01 D-21` \| DV-026 \|⏎\| D05-17 \| Restart checks the free limit first, before any question (bug) \| Duplicate warning and container question first; the limit onl"

#### ids (7)

- docs/product/DIVERGENCES.md:250 "OPEN-20 (b) (AD-27 withdrawn: decisions.md:623 does not say this;" → "OPEN-20 (b) (AD-27 moved to OPEN-20 (b) in round 1: decisions.md:623 does not say this;"
- docs/product/OPEN-DECISIONS.md:150 "(AD-27, which said "not asked again", was withdrawn in round 1.)" → "(AD-27, which said "not asked again", was moved to this question in round 1.)"
- docs/product/flows/01-onboarding-signup-signin.md:229 "AD-27 was withdrawn (moved to OPEN-20 (b))." → "AD-27 moved to OPEN-20 (b) in round 1."
- docs/product/flows/01-onboarding-signup-signin.md:312 "`03 G25`, `07 §8`; AD-27 withdrawn → OPEN-20 (b) \|" → "`03 G25`, `07 §8`; AD-27 moved to OPEN-20 (b) \|"
- docs/product/flows/01-onboarding-signup-signin.md:327 "Was AD-27 (withdrawn). → D01-4, DV-054." → "Was AD-27 (moved to OPEN-20 (b) in round 1). → D01-4, DV-054."
- docs/product/flows/README.md:140 "**OPEN-20 (b)** (AD-27 withdrawn)" → "**OPEN-20 (b)** (AD-27 moved here)"
- docs/product/DIVERGENCES.md:356 "\| DV-201 \| verification 01 NEW-D (flow 02 FC-19);" → "\| DV-201 \| verification 01 NEW-D (its claim-table row FC-19, flow 02 §7.4);"

#### dl-new (22)

- docs/product/OPEN-DECISIONS.md:788 "\| DL-98 \| On the unfolded Fold, the left page follows every write made on the right page, the food log included. Added round 2. \| BK-19 (the left page follows d" → "\| DL-98 \| On the unfolded Fold, the left page follows every write made on the right page, the food log included. Added round 2. \| BK-19 (the left page follows d"
- docs/decisions.md:645 "Source: docs/product/OPEN-DECISIONS.md (DL-01…DL-98; DL-75…DL-98 added by the verification rounds)" → "Source: docs/product/OPEN-DECISIONS.md (DL-01…DL-101; DL-75…DL-101 added by the verification rounds)"
- docs/decisions.md:743 "- **DL-98: On the unfolded Fold, the left page follows every write made on the right page, the food log included** — reason: BK-19 exists so the two pages of on" → "- **DL-98: On the unfolded Fold, the left page follows every write made on the right page, the food log included** — reason: BK-19 exists so the two pages of on"
- docs/product/PRD.md:617 "a deliberate end = the moment tapped (A-83). [D 2026-10-03 #504 (coordinator block); DL-87 (was decisions.md:536)]" → "a deliberate end = the moment tapped, no date question (DL-99). [DL-99 (was the coordinator lines #504, #535); DL-87 (was decisions.md:536)]"
- docs/product/PRD.md:400 "They never carry into a different person's sign-up (email, Apple or Google). [D 2026-10-03 #472-473; PA-71…PA-73]" → "They never carry into a different person's sign-up (email, Apple or Google). [DL-100 (was the coordinator lines #472-473); PA-71…PA-73, built; checklist signatu"
- docs/product/PRD.md:427 "No birth year = the profile gate, not this one. [D 2026-10-03 #482, #496; PA-100…PA-108]" → "No birth year = the profile gate, not this one. [D 2026-10-03 #482 (the confirmation, founder); DL-101 (the real-year ask, was the coordinator line #496); PA-10"
- docs/product/flows/01-onboarding-signup-signin.md:45 "(PA-71…PA-73, built; a coordinator rule, decisions.md:472-473, not a founder answer — its premium-and-auth checklist awaits the founder's signature, Approvals i" → "(DL-100; PA-71…PA-73, built — the coordinator lines decisions.md:472-473 placed as logic; its premium-and-auth checklist awaits the founder's signature, Approva"
- docs/product/flows/01-onboarding-signup-signin.md:151 "### 6.3 Stash freshness (shared-device rule, PA-71…73 — coordinator rule decisions.md:472-473, built; checklist signature owed, Approvals item 7)" → "### 6.3 Stash freshness (shared-device rule, DL-100; PA-71…73, built; checklist signature owed, Approvals item 7)"
- docs/product/flows/01-onboarding-signup-signin.md:207 "never written to B (PA-71…73; coordinator rule decisions.md:472, built; checklist signature owed, Approvals item 7)." → "never written to B (DL-100; PA-71…73, built; checklist signature owed, Approvals item 7)."
- docs/product/flows/01-onboarding-signup-signin.md:293 "a non-fresh stash is never written to any account (PA-71…73, built — a coordinator rule, decisions.md:472, not a founder answer; the premium-and-auth checklist " → "a non-fresh stash is never written to any account (DL-100; PA-71…73, built; the premium-and-auth checklist is unsigned: signature owed, Approvals item 7, DV-229"
- docs/product/flows/01-onboarding-signup-signin.md:294 "(CLAUDE.md "Writes merge, never clobber", founder 2026-09-12; applied by the coordinator line decisions.md:473 and PA-72; the display-name case is DL-57)." → "(CLAUDE.md "Writes merge, never clobber", founder 2026-09-12; DL-100, PA-72; the display-name case is DL-57)."
- docs/product/flows/01-onboarding-signup-signin.md:300 "The confirmation also asks the real birth year on the year wheel (this year − 18 back to 1900, nothing preselected) — a coordinator line (decisions.md:496; PA-1" → "The confirmation also asks the real birth year on the year wheel (this year − 18 back to 1900, nothing preselected) — DL-101 (the coordinator line decisions.md:"
- docs/product/flows/01-onboarding-signup-signin.md:430 "- Sources: the gate itself is the founder's (decisions.md:482); the real-year ask is a coordinator line (decisions.md:496, PA-106…108, checklist signature owed " → "- Sources: the gate itself is the founder's (decisions.md:482); the real-year ask is DL-101 (decisions.md:496, PA-106…108, checklist signature owed — Approvals "
- docs/product/flows/01-onboarding-signup-signin.md:338 "- **Approvals still owed item 7** — the premium-and-auth checklist (PA-71…73 stash rules, PA-80 consent, PA-106…108 real-year ask) is unsigned; the build gate d" → "- **DL-100** (round 3; PA-71…73, was the coordinator lines decisions.md:472-473) — the stash belongs only to the person who passed "Before we begin" in this run"
- docs/product/flows/05-protocol-end-restart-delete.md:124 "\| `ended_at = now`, `active 0`, `status_at` \| as above (no Missed cleanup needed) \|" → "\| `ended_at = now` (DL-99), `active 0`, `status_at` \| as above (no Missed cleanup needed) \|"
- docs/product/flows/05-protocol-end-restart-delete.md:137 "the end is the moment tapped (A-85 as registered; DV-090's test); placement shown as a picture first." → "the end is the moment tapped, no date question (DL-99 — the coordinator lines decisions.md:504 / :535 placed as logic; DV-090's test); placement shown as a pict"
- docs/product/flows/05-protocol-end-restart-delete.md:229 "R-49 deliberate end = moment tapped (A-85: approved, picture owed — AD-11, Approvals item 3)." → "R-49 deliberate end = moment tapped (DL-99; the End action itself: A-85, approved, picture owed — AD-11, Approvals item 3)."
- docs/product/flows/05-protocol-end-restart-delete.md:265 "- **DL-87** (A-86 / A-86b) — the inactivity end is dated at the last Taken dose;" → "- **DL-99** (round 3; was the coordinator lines decisions.md:504 / :535) — a deliberate end is dated at the moment tapped; no date question. → §5, §6, §7.1; DV-"
- docs/product/OPEN-DECISIONS.md:791 "is seen and signed with the premium-and-auth checklist (Approvals item 7). \| DV-168 \|" → "is seen and signed with the premium-and-auth checklist (Approvals item 7). \| — \|"
- docs/product/DIVERGENCES.md:252 "\| AD-11 (A-85 in 1.3.0) · the End + "Later" picture is owed (see "Approvals still owed") \|" → "\| AD-11 (A-85 in 1.3.0) · DL-99 (the end is dated at the tap) · the End + "Later" picture is owed (see "Approvals still owed") \|"
- docs/product/OPEN-DECISIONS.md:377 "## Reclassified on 2026-10-12 — round 2⏎" → "## Reclassified on 2026-10-12 — round 3⏎⏎Source: `docs/product/verification/round3/R3-consistency.md` (the final cross-document consistency pass).⏎⏎\| Item \| Was"
- docs/product/flows/README.md:118 "DL-75 withdrawn (→ OPEN-22 (a))." → "DL-75 withdrawn (→ OPEN-22 (a)).⏎  - **Round 3 (final consistency pass):** DL-99 (a deliberate end is dated at the tap; was the coordinator lines decisions.md:5"

#### open-sweep (24)

- docs/product/flows/03-dose-day.md:36 "A second tap on the Android notification button posts a notification "Nothing new logged" / "That dose is already recorded, or the protocol is paused. Open Dose" → "A second tap on the Android notification button posts a notification "Nothing new logged" / "That dose is already recorded, or the protocol is paused. Open Dose"
- docs/product/flows/03-dose-day.md:339 "\| D03-25 \| A slot turns "Due" on screen when its time comes (bug) \| Not re-rendered while Today stays open (SUSPECTED) \| `02 §8` \| DV-148 \|" → "\| D03-25 \| A slot turns "Due" on screen when its time comes (bug) \| Not re-rendered while Today stays open (SUSPECTED) \| `02 §8` \| DV-148 \|⏎\| D03-26 \| Every dos"
- docs/product/flows/03-dose-day.md:353 "- **OPEN-11 — skipped / missed doses and the curve** (Portuguese question 17). §8 Curve column (the curve follows the planned schedule, FX-13) → DV-072." → "- **OPEN-11 — skipped / missed doses and the curve** (Portuguese question 17). §8 Curve column (the curve follows the planned schedule, FX-13) → DV-072.⏎- **OPE"
- docs/product/DIVERGENCES.md:91 "flows D07-14, D08-15, D09-10" → "flows D07-14, D08-15, D09-10, D03-26"
- docs/product/DIVERGENCES.md:96 "flows D02-19, D07-14, D09-10" → "flows D02-19, D07-14, D09-10, D03-26"
- docs/design/fluxos-dosetrace.html:603 "<tr><td>A dose já foi registrada em outro aparelho ou pela notificação</td><td>Hoje se atualiza; um segundo toque mostra “Nada novo registrado” com o motivo.</t" → "<tr><td>A dose já foi registrada em outro aparelho ou pela notificação</td><td class="div">Previsto: Hoje se atualiza; um segundo toque mostra “Nada novo regist"
- docs/design/fluxos-dosetrace.html:961 "<tr><td>Registrou o mesmo dia em outro celular</td><td>Sincroniza; a conversa mostra os dois.</td></tr>" → "<tr><td>Registrou o mesmo dia em outro celular</td><td class="div">Previsto: sincroniza; a conversa mostra os dois.<span class="div-tag">Hoje está diferente:</s"
- docs/design/fluxos-dosetrace.html:1117 "<tr><td>Pesou em outro celular hoje de manhã</td><td>Depois de sincronizar, a pesagem mais nova é o peso atual.</td></tr>" → "<tr><td>Pesou em outro celular hoje de manhã</td><td class="div">Previsto: depois de sincronizar, a pesagem mais nova é o peso atual.<span class="div-tag">Hoje "
- docs/product/DIVERGENCES.md:219 "\| No — DL-43 \| `MarkerChart`: one series per unit; x positions by date (picture first). \|" → "\| No — DL-43 · OPEN-24 item 4 (the new chart is new UI; picture first) \| `MarkerChart`: one series per unit; x positions by date (picture first). \|"
- docs/product/DIVERGENCES.md:260 "\| No — DL-49 \| `reminderHealth` rows for the channel of each kind the user has switched on (picture first). \|" → "\| No — DL-49 · OPEN-24 item 5 (the new rows are new UI; picture first) \| `reminderHealth` rows for the channel of each kind the user has switched on (picture fi"
- docs/product/DIVERGENCES.md:307 "\| No — DL-12 \| "All caught up" when no open slot remains; the skipped line stays visible (picture first). \|" → "\| No — DL-12 · OPEN-24 item 12 (picture first) \| "All caught up" when no open slot remains; the skipped line stays visible (picture first). \|"
- docs/product/PRD.md:481 "- **PRD-TODAY-33** Tracker streak stays a **day** streak, "{n} days without a miss":" → "- **PRD-TODAY-33** Tracker streak — as built and as on the binding prototype a **day** streak, "{n} days without a miss" (its unit and its words wait for the fo"
- docs/product/PRD.md:481 "changing the tracker's unit to doses (and its copy ×6) is a founder decision → OPEN-17." → "the tracker's unit (days or doses) and its words (copy ×6; recommended: days, with words that read right for a weekly user) are a founder decision → OPEN-17."
- docs/product/flows/04-vial-and-supply.md:160 "an empty rtu vial can be replaced, and the new box is a new vial row. Where it is offered is not decided (picture first); asking the new box's printed date is p" → "an empty rtu vial can be replaced, and the new box is a new vial row. Where it is offered (the protocol page, OPEN-01 option A) and whether it asks the new box'"
- docs/product/flows/04-vial-and-supply.md:210 "\| Finished (rtu) \| nothing (intended DL-22: an empty rtu vial can be replaced; where = picture first, not decided) \|" → "\| Finished (rtu) \| nothing (intended DL-22: an empty rtu vial can be replaced; where, and whether it asks the box date = pending OPEN-01) \|"
- docs/product/flows/04-vial-and-supply.md:339 "- Expect (intended, DL-22): a way to start a new vial (where = picture first). **Today:**" → "- Expect (intended, DL-22): a way to start a new vial (where, and whether it asks the box date = pending OPEN-01, Portuguese question 3). **Today:**"
- docs/product/PRD.md:648 "the prompt asks the mix date; the new vial's capacity is derived (water read with comma decimals); the protocol (start date) is never changed. [D 2026-09-27 #18" → "the prompt asks the mix date; the new vial's capacity is derived (water read with comma decimals); the protocol (start date) is never changed. [D 2026-09-27 #18"
- docs/product/flows/02-protocol-create-edit.md:314 "\| D02-4 \| Free limit counted the same on every device \| Local only \|" → "\| D02-4 \| *Pending OPEN-05 (Portuguese question 7):* whether the limit is also enforced across devices / on the server (recommendation A: phone-only, as today) "
- docs/product/flows/08-reality-check.md:45 "\| P10 \| Result came out implausible / maintenance / too short \| Not saved; Progress explains; Today must not say "ready — tap to see it" as if a number waited. " → "\| P10 \| Result came out implausible / maintenance / too short \| Not saved; Progress explains; Today must not say "ready — tap to see it" as if a number waited ("
- docs/product/flows/11-labs-and-vaccines.md:40 "\| P9 \| Last panel 7 months ago \| Today "Bloodwork due · It's been 7 months since your last panel". \|" → "\| P9 \| Last panel 7 months ago \| Today "Bloodwork due · It's been 7 months since your last panel" (as built; whether the app keeps saying "due" is pending OPEN-"
- docs/product/flows/11-labs-and-vaccines.md:354 "tap → Lab test journal; snooze Tomorrow / In 3 days.⏎⏎**F11-17 — Fold**" → "tap → Lab test journal; snooze Tomorrow / In 3 days. (Today's words; the alert's words and trigger are pending OPEN-13 — re-write this check when it is answered"
- docs/product/TRD.md:439 "\| Different account signs in (cross-account guard) \| wiped \| **discarded** (decision `docs/decisions.md:509`) \|" → "\| Different account signs in (cross-account guard) \| wiped \| **discarded** today (the coordinator line `docs/decisions.md:509`; whether to warn first is **OPEN-"
- docs/product/TRD.md:764 "\| decision 2026-10-03 (`docs/decisions.md:509`) \| `__tests__/foldAndAccountGuards.test.js`" → "\| coordinator line 2026-10-03 (`docs/decisions.md:509`); privacy holds under every option of OPEN-21 (11), which asks only what happens to the previous account'"
- docs/product/TRD.md:327 "\| tombstone (Stop tombstones **all**, `clearRealityChecks`) → cloud DELETE \|" → "\| tombstone (Stop tombstones **all** today, `clearRealityChecks`; whether Stop should erase earlier results is **OPEN-08**) → cloud DELETE \|"

#### pt-message (19)

- docs/product/OPEN-DECISIONS.md:839 "como no card de Hoje" → "como no cartão de Hoje"
- docs/product/OPEN-DECISIONS.md:853 "no card ("faltam N porções")" → "no cartão ("faltam N porções")"
- docs/product/OPEN-DECISIONS.md:875 "a sequência do card de cada protocolo" → "a sequência do cartão de cada protocolo"
- docs/product/OPEN-DECISIONS.md:875 "o texto que você rejeitou no card." → "o texto que você rejeitou no cartão."
- docs/product/OPEN-DECISIONS.md:916 "o card de Progresso" → "o cartão de Progresso"
- docs/product/OPEN-DECISIONS.md:949 "no card do plano grátis" → "no cartão do plano grátis"
- docs/product/OPEN-DECISIONS.md:958 "pelo card do Premium" → "pelo cartão do Premium"
- docs/product/OPEN-DECISIONS.md:987 "no card de Meus protocolos" → "no cartão de Meus protocolos"
- docs/product/OPEN-DECISIONS.md:839 "> 11. em Meus protocolos, os dias de validade coloridos como no cartão de Hoje (verde acima de 7 dias);" → "> 11. em Meus protocolos, os dias restantes do frasco coloridos como no cartão de Hoje (verde acima de 7 dias);"
- docs/product/OPEN-DECISIONS.md:833 "linhas para a pergunta das 20h, o lembrete semanal de peso e os alertas de frasco;" → "linhas para a pergunta das 20h, o check-in semanal e os alertas de frasco;"
- docs/product/OPEN-DECISIONS.md:959 "mais o status (teste grátis até…, renova em…) quando a loja informar." → "mais a situação da assinatura (teste grátis até…, renova em…) quando a loja informar."
- docs/product/OPEN-DECISIONS.md:980 "a nova versão do Registro de comida com IA no servidor (o limite de 25 contado pelo dia em que a pessoa pede, e recusar uso de IA sem acesso);" → "a nova versão do Registro de comida com IA no servidor (o limite de 25 contado pelo dia em que a pessoa pede, recusar uso de IA sem acesso, e o que você decidir"
- docs/product/OPEN-DECISIONS.md:981 "o Diário de exames vazio para o Premium sem número; e o texto da animação que explica a sequência." → "o Diário de exames vazio para o Premium sem número; e o texto que explica a sequência, no topo do Registro de doses."
- docs/product/OPEN-DECISIONS.md:803 "pedi para agentes independentes conferirem tudo duas vezes contra o código, as suas decisões e o estado real do servidor." → "pedi para agentes independentes conferirem tudo, em três rodadas, contra o código, as suas decisões e o estado real do servidor."
- docs/product/OPEN-DECISIONS.md:834 "Corrigir muda como exclusões e edições viajam entre aparelhos em todas as tabelas," → "Corrigir muda como exclusões e edições viajam entre aparelhos em todo tipo de registro (doses, frascos, refeições, pesagens, exames),"
- docs/product/OPEN-DECISIONS.md:875 "voltar a limpar tudo, depois de tirar as doses da exclusão em cascata no servidor —" → "voltar a limpar tudo, depois de mudar o servidor para que apagar um protocolo não leve junto o histórico de doses —"
- docs/product/OPEN-DECISIONS.md:937 "muda o modelo de dados sincronizado e passa por revisão farmacológica)" → "muda a forma como os protocolos são guardados e sincronizados, e passa por revisão farmacológica)"
- docs/product/OPEN-DECISIONS.md:991 "a exclusão de conta citando todas as tabelas;" → "a exclusão de conta apagando todo tipo de dado da pessoa (hoje duas listas estão incompletas);"
- docs/product/OPEN-DECISIONS.md:PT approvals item 1 "a exclusão de conta citando todas as tabelas;" → "a exclusão de conta apagando todo tipo de dado da pessoa (hoje a lista do servidor não inclui o uso do Assistente de IA);"

#### picture (4)

- docs/design/fluxos-dosetrace.html:876 "A pergunta das 20h, o lembrete semanal de peso ou os alertas de frasco" → "A pergunta das 20h, o check-in semanal ou os alertas de frasco"
- docs/design/fluxos-dosetrace.html:921 "<p class="pend-box"><span class="pend-tag">Falta sua decisão (pergunta 23 (e)):</span>sua regra e o checklist assinado dizem totais de comida por dia, por seman" → "<p class="pend-box"><span class="pend-tag">Falta sua decisão (pergunta 23 (e)):</span>sua regra e o checklist assinado dizem totais de comida por dia, por seman"
- docs/design/fluxos-dosetrace.html:685 "encerra o protocolo, com um “Depois” para quem ainda não decidiu." → "encerra o protocolo, com um “Mais tarde” para quem ainda não decidiu."
- docs/design/fluxos-dosetrace.html:785 "encerra o protocolo, com um “Depois”." → "encerra o protocolo, com um “Mais tarde”."

#### counts (14)

- docs/product/OPEN-DECISIONS.md:808 "> - **84 pontos resolvi pela lógica do produto**" → "> - **87 pontos resolvi pela lógica do produto**"
- docs/product/OPEN-DECISIONS.md:12 "**84 Decided by logic in force** (DL-01…DL-98 minus 14 withdrawn or moved; 23 added in round 2: DL-76…DL-98)." → "**87 Decided by logic in force** (DL-01…DL-101 minus 14 withdrawn or moved; 23 added in round 2: DL-76…DL-98; 3 added in round 3: DL-99…DL-101, coordinator line"
- docs/product/OPEN-DECISIONS.md:12 "- **Counts after round 2: 23 OPEN questions open**" → "- **Counts after round 3 (2026-10-12): 23 OPEN questions open**"
- docs/product/PRD.md:6 "Register counts after round 2: **23 OPEN questions open** (OPEN-01…OPEN-11, OPEN-13…OPEN-24), **62 AD in force**, **84 DL in force**," → "Register counts after round 3 (2026-10-12): **23 OPEN questions open** (OPEN-01…OPEN-11, OPEN-13…OPEN-24), **62 AD in force**, **87 DL in force** (DL-99…DL-101 "
- docs/product/DIVERGENCES.md:4 "the PRD's gaps G-1…G-137 point to DV rows (PRD §6, DV column); every flow's "Divergence today" row (`Dnn-k`) is listed in the Sources of its DV row (D07-10, D02" → "the PRD's gaps G-1…G-233 point to DV rows (PRD §6, DV column); every flow's "Divergence today" row (`Dnn-k`) is listed in the Sources of its DV row (D07-10, D02"
- docs/product/DIVERGENCES.md:74 "Rows that need a founder answer before their code: 43 rows cite an OPEN item (8 of them only for their new screen or text, OPEN-24)." → "Rows that need a founder answer before their code: 46 rows cite an OPEN item (11 of them only for their new screen or text, OPEN-24; DV-080, DV-098 and DV-129 g"
- docs/product/README.md:10 "\| Size (2026-10-12, after verification round 2) \|" → "\| Size (2026-10-12, after verification round 3) \|"
- docs/product/README.md:12 "\| 23 OPEN open (OPEN-12 closed; ids never reused) · 62 AD in force · 84 DL in force \|" → "\| 23 OPEN open (OPEN-12 closed; ids never reused) · 62 AD in force · 87 DL in force \|"
- docs/product/README.md:14 "\| 463 requirements (PRD-AREA-n), 40 cross-feature contracts, G-1…G-155 \|" → "\| 463 requirements (PRD-AREA-n), 40 cross-feature contracts, 233 gap rows G-1…G-233 \|"
- docs/product/README.md:17 "\| 14 flows \|⏎\| `research/" → "\| 14 flows, 15 diagrams \|⏎\| `research/"
- docs/product/README.md:19 "Round 2 (`round2/R2-01…R2-07`): a second independent check of the corrected set, plus `round2/id-map.md` — the one table of every id whose status changed in eit" → "Round 2 (`round2/R2-01…R2-07`): a second independent check of the corrected set, plus `round2/id-map.md` — the one table of every id whose status changed, with "
- docs/product/README.md:21 "Counts in the PRD, TRD, flows and picture are as of verification round 2; they are brought in line with the registers (OPEN-DECISIONS, DIVERGENCES, the ledger) " → "Every count stated in the PRD, TRD, flows, picture and this README was recounted by script against the registers in round 3 (`verification/round3/R3-consistency"
- docs/product/README.md:40 "→ 6. Verification round 2 and corrections to the registers, then propagation into PRD / TRD / flows / picture →" → "→ 6. Verification round 2 and corrections to the registers, then propagation into PRD / TRD / flows / picture → 6b. Round 3: one cross-document consistency pass"
- docs/product/verification/round2/id-map.md:end appended "Round 3 (2026-10-12) — additions" section (DL-99..101, DV-217, AD-27 wording, round-3 counts)

#### ledger (3)

- docs/decisions.md:645 "DL-01 supersedes the 2026-10-03 line "Site questions older than 7 days are let go"" → "DL-01 (since round 2: AD-76, the founder's own :379) supersedes the 2026-10-03 line "Site questions older than 7 days are let go""
- docs/decisions.md:661 "coloured by deadline as on the Today card (≤ 3 risk, ≤ 7 attention, above 7 ok green), Protocols included — AD-65 in docs/product/OPEN-DECISIONS.md." → "coloured by deadline as on the Today card (≤ 3 risk, ≤ 7 attention, above 7 ok green), Protocols included — AD-65 in docs/product/OPEN-DECISIONS.md. — **ROUND 2"
- docs/decisions.md:end appended "2026-10-12 — verification round 3: status of earlier lines" (:504/:535 → DL-99, :472-473 → DL-100, :496 → DL-101, Restart order)

#### mechanical (9)

- docs/product/DIVERGENCES.md:86 "New owner `lib/bodyPrefs.js`:" → "New owner (PROPOSED) `lib/bodyPrefs.js`:"
- docs/product/DIVERGENCES.md:214 "`lib/bodyPrefs.js` (DV-006) keys labels" → "PROPOSED `lib/bodyPrefs.js` (DV-006) keys labels"
- docs/product/DIVERGENCES.md:107 "New `lib/protocolName.js displayName(p, t)`" → "New (PROPOSED) `lib/protocolName.js displayName(p, t)`"
- docs/product/DIVERGENCES.md:241 "the live-schema snapshot (`supabase/schema.snapshot.json`, created by the DV" → "the live-schema snapshot (PROPOSED `supabase/schema.snapshot.json`, created by the DV"
- docs/product/DIVERGENCES.md:249 "`deleteUserCoverage` against `supabase/schema.snapshot.json` (from DV-119)" → "`deleteUserCoverage` against PROPOSED `supabase/schema.snapshot.json` (from DV-119)"
- docs/product/DIVERGENCES.md:279 "(applied nowhere, marked baseline) + `supabase/schema.snapshot.json` +" → "(applied nowhere, marked baseline) + PROPOSED `supabase/schema.snapshot.json` +"
- docs/product/DIVERGENCES.md:261 "with a CONNECTED constraint (`BackgroundTaskScheduler.kt:93-95`," → "with a CONNECTED constraint (node_modules/expo-background-task `BackgroundTaskScheduler.kt:93-95`,"
- docs/product/DIVERGENCES.md:319 "Android counts it, `NotificationBehaviorRecord.kt:24`)" → "Android counts it, node_modules/expo-notifications `NotificationBehaviorRecord.kt:24`)"
- docs/product/flows/README.md:185 per-flow OPEN table rows reordered 10…14, 01…09 → 01…14

#### citations (1)

- docs/product/research/01-protocols.md:291 "49. R-49 A deliberate end = moment tapped — 2026-10-03 (docs/decisions.md:504); lib/protocolEnd.js:45-50 (no UI caller)." → "49. R-49 A deliberate end = moment tapped — 2026-10-03 (docs/decisions.md:504, a coordinator line; now DL-99); lib/protocolEnd.js:45-50 (no UI caller)."

#### mermaid (3)

- docs/product/flows/05-protocol-end-restart-delete.md:57 "  D -->\|Restart\| E{"Same compound active?"}⏎  E -->\|yes\| F["name is already active, Resume anyway / Cancel"]⏎  E -->\|no\| I["Resume name? New vial / Keep using t" → "  D -->\|Restart\| G{"Free limit ok?"}⏎  G -->\|no\| H["Protocol limit reached, Paywall, nothing written"]⏎  G -->\|yes\| E{"Same compound active?"}⏎  E -->\|yes\| F["n"
- docs/product/flows/05-protocol-end-restart-delete.md:53 "B2["Ended, ended_at = tap moment"]" → "B2["Ended, ended_at = tap moment (DL-99)"]"
- docs/product/flows/05-protocol-end-restart-delete.md:84 "Active --> Ended: End protocol on the page (A-85 approved, picture owed, not built, ended_at = tap)" → "Active --> Ended: End protocol on the page (A-85 approved, picture owed, not built, ended_at = tap, DL-99)"

#### drows — DIVERGENCES Sources (item 3, 71 rows)

- DIVERGENCES:91 DV-182 Sources: "TRD §3.9 H-1, §3.7, R-01, TR-SYNC-2" → "TRD §3.9 H-1, §3.7, R-01, TR-SYNC-2; flows D07-14, D08-15, D09-10"
- DIVERGENCES:92 DV-183 Sources: "TRD §3.9 H-3, §3.6, R-05, TR-SYNC-3" → "TRD §3.9 H-3, §3.6, R-05, TR-SYNC-3; flows D04-18"
- DIVERGENCES:96 DV-222 Sources: "verification round 2 R2-06 M-1 (harness reproduced twice); TRD F-14 / H-15 / R-54" → "verification round 2 R2-06 M-1 (harness reproduced twice); TRD F-14 / H-15 / R-54; flows D02-19, D07-14, D09-10"
- DIVERGENCES:97 DV-226 Sources: "verification round 2 R2-06 N-4" → "verification round 2 R2-06 N-4; flows D07-11"
- DIVERGENCES:98 DV-231 Sources: "verification round 2 R2-03 #1 (PRD-AI-6); registry A-117" → "verification round 2 R2-03 #1 (PRD-AI-6); registry A-117; flows D12-11"
- DIVERGENCES:115 DV-021 Sources: "01:D-17, 01:G-3 (registry A-87b); TRD H-8, TR-SYNC-8; flows D04-12, D05-4" → "01:D-17, 01:G-3 (registry A-87b); TRD H-8, TR-SYNC-8; flows D04-12, D05-4, D03-23"
- DIVERGENCES:120 DV-026 Sources: "01:D-21" → "01:D-21; flows D05-16"
- DIVERGENCES:122 DV-126 Sources: "01:G-11" → "01:G-11; flows D02-21, D13-12"
- DIVERGENCES:126 DV-223 Sources: "verification round 2 R2-06 N-1" → "verification round 2 R2-06 N-1; flows D02-15"
- DIVERGENCES:127 DV-230 Sources: "verification round 2 R2-03 #4 (PRD-PROT-19)" → "verification round 2 R2-03 #4 (PRD-PROT-19); flows D02-16"
- DIVERGENCES:128 DV-236 Sources: "verification round 2 R2-05 (05:146, H5-F7)" → "verification round 2 R2-05 (05:146, H5-F7); flows D04-20, D05-13"
- DIVERGENCES:139 DV-033 Sources: "02:D14, 02:D18" → "02:D14, 02:D18; flows D03-24"
- DIVERGENCES:148 DV-135 Sources: "02:§6.12" → "02:§6.12; flows D03-20"
- DIVERGENCES:149 DV-202 Sources: "verification 02 (new defect 3)" → "verification 02 (new defect 3); flows D03-15, D05-15"
- DIVERGENCES:150 DV-203 Sources: "verification 02 (new defect 4)" → "verification 02 (new defect 4); flows D03-16"
- DIVERGENCES:151 DV-204 Sources: "verification 02 (PRD-DOSE-1)" → "verification 02 (PRD-DOSE-1); flows D03-17"
- DIVERGENCES:152 DV-227 Sources: "verification round 2 R2-06 N-5" → "verification round 2 R2-06 N-5; flows D03-18"
- DIVERGENCES:153 DV-228 Sources: "verification round 2 R2-01 (OPEN-19 d side defect); TRD §4 divergence line" → "verification round 2 R2-01 (OPEN-19 d side defect); TRD §4 divergence line; flows D03-19"
- DIVERGENCES:159 DV-042 Sources: "03:D-1, 03:D-2, 03:G5; flows D06-3, D06-4" → "03:D-1, 03:D-2, 03:G5; flows D06-3 (D06-4 closed round 2)"
- DIVERGENCES:160 DV-043 Sources: "03:D-4, 03:D-16" → "03:D-4, 03:D-16; flows D06-24"
- DIVERGENCES:161 DV-044 Sources: "03:D-14" → "03:D-14; flows D06-24"
- DIVERGENCES:164 DV-047 Sources: "03:D-12" → "03:D-12; flows D06-21"
- DIVERGENCES:170 DV-053 Sources: "03:G18" → "03:G18; flows D06-23"
- DIVERGENCES:172 DV-196 Sources: "verification 03 NEW-1 (extends DV-050)" → "verification 03 NEW-1 (extends DV-050); flows D06-10"
- DIVERGENCES:190 DV-150 Sources: "04:§8.11; flows D08-10" → "04:§8.11; flows D08-10, D08-14"
- DIVERGENCES:192 DV-205 Sources: "verification 04 N-2" → "verification 04 N-2; flows D08-14"
- DIVERGENCES:193 DV-238 Sources: "verification round 2 R2-05 (F07-18)" → "verification round 2 R2-05 (F07-18); flows D07-13, D14-6"
- DIVERGENCES:199 DV-005 Sources: "05:E4, 05:G13 (registry F-051 "F2")" → "05:E4, 05:G13 (registry F-051 "F2"); flows D10-17"
- DIVERGENCES:204 DV-072 Sources: "05:E5, 05:G13 (registry A-31)" → "05:E5, 05:G13 (registry A-31); flows D10-18"
- DIVERGENCES:206 DV-207 Sources: "verification 05 O-3 (extends DV-158)" → "verification 05 O-3 (extends DV-158); flows D10-11"
- DIVERGENCES:213 DV-074 Sources: "06:D-4" → "06:D-4; flows D11-16"
- DIVERGENCES:219 DV-080 Sources: "06:E-7, 06:E-8" → "06:E-7, 06:E-8; flows D11-12"
- DIVERGENCES:220 DV-237 Sources: "verification round 2 R2-05 (13:213), R2-03 #9" → "verification round 2 R2-05 (13:213), R2-03 #9; flows D11-13, D13-14"
- DIVERGENCES:226 DV-081 Sources: "02:D16, 03:G28, 03:§8 (vial_low_sent), 07:D-17, 08:G14; flows D07-6, D12-2" → "02:D16, 03:G28, 03:§8 (vial_low_sent), 07:D-17, 08:G14; flows D07-6, D12-2, D06-27"
- DIVERGENCES:233 DV-186 Sources: "PRD G-43; features.md S-16 note; `lib/paywallPlans.js:175, :182`" → "PRD G-43; features.md S-16 note; `lib/paywallPlans.js:175, :182`; flows D13-13"
- DIVERGENCES:234 DV-190 Sources: "PRD G-136; decisions.md:570 (council 2, 2026-10-05)" → "PRD G-136; decisions.md:570 (council 2, 2026-10-05); flows D12-12"
- DIVERGENCES:243 DV-241 Sources: "verification round 2 R2-06 (split from DV-119, DR-7)" → "verification round 2 R2-06 (split from DV-119, DR-7); flows D02-20"
- DIVERGENCES:249 DV-011 Sources: "08:G9; TRD §2.3 DR-3, Appendix B" → "08:G9; TRD §2.3 DR-3, Appendix B; flows D12-13"
- DIVERGENCES:250 DV-054 Sources: "03:G25, 07:§8 ("Not now"); flows D01-4" → "03:G25, 07:§8 ("Not now"); flows D01-4, D06-22"
- DIVERGENCES:261 DV-099 Sources: "03:G23; TRD R-34" → "03:G23; TRD R-34; flows D06-25"
- DIVERGENCES:269 DV-108 Sources: "06:D-8, 06:G-2; flows D11-2, D13-6" → "06:D-8, 06:G-2; flows D11-2, D13-6, D14-7"
- DIVERGENCES:272 DV-111 Sources: "06:G-13" → "06:G-13; flows D11-17"
- DIVERGENCES:281 DV-149 Sources: "04:§6.6" → "04:§6.6; flows D09-9"
- DIVERGENCES:283 DV-191 Sources: "PRD G-133; features.md A-91 (spec-auditor 2026-10-04)" → "PRD G-133; features.md A-91 (spec-auditor 2026-10-04); flows D02-18"
- DIVERGENCES:284 DV-192 Sources: "PRD G-135; decisions.md:544 (A-90); flows D02-9" → "PRD G-135; decisions.md:544 (A-90); flows D02-9, D09-11"
- DIVERGENCES:285 DV-213 Sources: "verification 07 X-09; PRD-FOOD-51" → "verification 07 X-09; PRD-FOOD-51; flows D07-15, D13-15"
- DIVERGENCES:287 DV-224 Sources: "verification round 2 R2-06 N-2" → "verification round 2 R2-06 N-2; flows D06-19"
- DIVERGENCES:288 DV-225 Sources: "verification round 2 R2-06 N-3" → "verification round 2 R2-06 N-3; flows D04-19, D06-20"
- DIVERGENCES:289 DV-229 Sources: "verification round 2 R2-01 (OPEN-18 item 8)" → "verification round 2 R2-01 (OPEN-18 item 8); flows D14-2"
- DIVERGENCES:290 DV-232 Sources: "verification round 2 R2-03 #7 (PRD-FOOD-20)" → "verification round 2 R2-03 #7 (PRD-FOOD-20); flows D07-12"
- DIVERGENCES:291 DV-239 Sources: "verification round 2 R2-01 (OPEN-18 item 6)" → "verification round 2 R2-01 (OPEN-18 item 6); flows D01-11"
- DIVERGENCES:292 DV-240 Sources: "verification round 2 R2-03 #13 (PRD-AI-37)" → "verification round 2 R2-03 #13 (PRD-AI-37); flows D02-17, D13-15"
- DIVERGENCES:307 DV-129 Sources: "02:D10" → "02:D10; flows D03-21"
- DIVERGENCES:308 DV-130 Sources: "02:G8 (undo part)" → "02:G8 (undo part); flows D03-3"
- DIVERGENCES:309 DV-131 Sources: "02:G9 (decisions Conflict 22)" → "02:G9 (decisions Conflict 22); flows D03-22"
- DIVERGENCES:310 DV-132 Sources: "02:D20, 02:G7 (decisions Conflict 23, 40); flows D03-12" → "02:D20, 02:G7 (decisions Conflict 23, 40); flows D03-12, D10-16"
- DIVERGENCES:317 DV-140 Sources: "03:G4; flows D04-10" → "03:G4; flows D04-10, D06-26"
- DIVERGENCES:324 DV-148 Sources: "04:D-5, 05:E19, 02:§8 (Due tag), 02:D24; flows D07-4, D08-7, D09-4" → "04:D-5, 05:E19, 02:§8 (Due tag), 02:D24; flows D07-4, D08-7, D09-4, D03-25, D10-13"
- DIVERGENCES:327 DV-154 Sources: "05:D7" → "05:D7; flows D10-12"
- DIVERGENCES:329 DV-156 Sources: "05:G10" → "05:G10; flows D10-15"
- DIVERGENCES:333 DV-160 Sources: "06:E-13, 06:E-14, 06:E-15, 06:E-16, 06:E-22" → "06:E-13, 06:E-14, 06:E-15, 06:E-16, 06:E-22; flows D11-15"
- DIVERGENCES:342 DV-169 Sources: "08:G7; TRD H-10" → "08:G7; TRD H-10; flows D12-15"
- DIVERGENCES:353 DV-181 Sources: "01:G-25, 01:G-12, 02:G14, 02:G19, 02:§6.6, 03:G32, 03:G12, 04:G-11, 06:D-2, 06:G-15, 07:D-13, 07:D-15, 07:§6.3; flows D07-7, D14-5" → "01:G-25, 01:G-12, 02:G14, 02:G19, 02:§6.6, 03:G32, 03:G12, 04:G-11, 06:D-2, 06:G-15, 07:D-13, 07:D-15, 07:§6.3; flows D07-7, D14-5, D08-13"
- DIVERGENCES:356 DV-201 Sources: "verification 01 NEW-D (flow 02 FC-19)" → "verification 01 NEW-D (flow 02 FC-19); flows D02-13, D11-15"
- DIVERGENCES:357 DV-214 Sources: "verification 03 NEW-3" → "verification 03 NEW-3; flows D06-17"
- DIVERGENCES:358 DV-215 Sources: "verification 03 NEW-5" → "verification 03 NEW-5; flows D06-18"
- DIVERGENCES:362 DV-219 Sources: "verification 05 O-6" → "verification 05 O-6; flows D12-14"
- DIVERGENCES:364 DV-233 Sources: "verification round 2 R2-03 #6 (PRD-UI-6); R2-05 (H5-F10)" → "verification round 2 R2-03 #6 (PRD-UI-6); R2-05 (H5-F10); flows D01-12, D02-14, D04-21, D05-14, D13-16"
- DIVERGENCES:365 DV-234 Sources: "verification round 2 R2-03 #24 (PRD-UI-5)" → "verification round 2 R2-03 #24 (PRD-UI-5); flows D10-14"
- DIVERGENCES:366 DV-235 Sources: "verification round 2 R2-03 #52 (PRD-UI-10)" → "verification round 2 R2-03 #52 (PRD-UI-10); flows D11-14, D13-17"
- DIVERGENCES:376 DV-211 Sources: "verification 05 (most important error 1), O-1; STATE.md:17; PA-123" → "verification 05 (most important error 1), O-1; STATE.md:17; PA-123; flows D01-8"
