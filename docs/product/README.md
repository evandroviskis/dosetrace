# DoseTrace — product and technical definition (started 2026-10-12)

Founder 2026-10-12: "Quero isso feito, mas sem cortar caminhos. Sem nada curto se pode ser mais detalhado."
Why: the app never had a PRD, a TRD or drawn end-to-end flows. Features were specified one at a
time (docs/specs/), so a rule changed in one place could stay old in another (A-118: Today kept
asking for the weigh-in while Progress knew it was done).

## The set

| File | What it is | Size (2026-10-12, after verification round 3; updated 2026-10-15 with the founder's answers) |
|---|---|---|
| `OPEN-DECISIONS.md` | The single list of founder questions (OPEN-xx), the decisions already taken by the founder (AD-xx) or by product logic (DL-xx), the founder actions that are not questions ("Approvals still owed"), the crosswalk of every earlier question, and the Portuguese message to send him (one round). | **0 OPEN open** (all 23 questions answered 2026-10-15, "siga as recomendações"; ids never reused) · 94 AD in force (AD-77…AD-109 added 2026-10-15; AD-108 superseded by AD-109) · 94 DL in force (DL-102…DL-108 added) |
| `DIVERGENCES.md` | The one register of defects (DV-xxx): every gap between the code and the founder's decisions, signed specs or the binding prototype, each with severity, evidence, founder link, fix and the test that must fail first. | 229 active rows (17 S1, 102 S2, 44 S3, 66 S4), each with a target (AD-78: 203 in 1.3.0, 24 in 1.3.1, 2 split) + 3 ops items, 4 merged, 7 closed (DV-001…DV-243) |
| `PRD.md` | What the product is, for whom, the daily loops, every feature's rules and how the features connect (§6 gap rows G-n point to DV rows). Source of truth for behaviour; each rule cites its decision, spec row or OPEN / AD / DL id. | 471 requirements (PRD-AREA-n), 40 cross-feature contracts, 235 gap rows G-1…G-235 |
| `TRD.md` | Architecture, data model, sync, the single owner of every derived state and the screens that consume it, invariants, test strategy, risks (R-xx point to DV rows). | — |
| `flows/01…14-*.md` + `flows/README.md` | The 14 core journeys: state diagrams, state × surface tables, divergence rows (Dnn-k → DV) and acceptance checks — also the script for the agent-device QA walk before every test build. | 14 flows, 269 acceptance checks |
| `docs/design/fluxos-dosetrace.html` | The drawn picture of the 14 flows, in Portuguese, for the founder. | 14 flows, 15 diagrams |
| `research/01…08-*.md` | The factual dossiers per domain, read from the code, the specs and the ledger, each with a state-ownership audit. The other documents were built from them. | 8 dossiers |
| `verification/` | Round 1 (`00-mechanical`, `00b-diagrams`, `01…07`): independent checks of every claim against the code, the ledger and live state. Round 2 (`round2/R2-01…R2-07`): a second independent check of the corrected set, plus `round2/id-map.md` — the one table of every id whose status changed, with the final counts (round-3 additions at its end). Round 3 (`round3/R3-consistency.md`): the final cross-document consistency pass before the founder round. | 120 diagrams parse with mermaid 10.9.1 (105 in the Markdown files, 15 in the picture; re-run in round 3). The 19 blocks changed on 2026-10-15 (flows 01, 04, 05, 08–12 and five in the picture) passed a static lint only — no network to load mermaid in that step |

Every count stated in the PRD, TRD, flows, picture and this README was recounted by script against the registers in round 3 (`verification/round3/R3-consistency.md`, final counts table), and again on 2026-10-15 after the founder's answers (`verification/round2/id-map.md`, section "2026-10-15").

## Authority (which source wins)
1. The founder's own lines in `docs/decisions.md` (the ledger). Lines the coordinator wrote — "by logic", "coordinator", "resolved by the ledger", council syntheses — are not founder answers.
2. Founder-signed rows in `docs/specs/*.md` (`checklist-signed:` with a date).
3. The binding prototype `docs/design/prototype.html` (decisions.md:34), unless a LATER founder line says otherwise.
4. The code.

Inside this folder, the registers win over the narrative documents: `OPEN-DECISIONS.md` for every decision and question, `DIVERGENCES.md` for every defect. A PRD / TRD / flow line that disagrees with them is a documentation error.

## Reading order
1. `OPEN-DECISIONS.md` — the open questions first, then "Approvals still owed", then the AD and DL tables.
2. `DIVERGENCES.md` — the Summary, then the S1 rows.
3. `PRD.md` — the product, feature by feature.
4. `flows/README.md`, then the flow you need; the founder reads `docs/design/fluxos-dosetrace.html`.
5. `TRD.md` — when building: owners, sync, invariants, tests.
6. `research/` and `verification/` — the evidence behind any line you doubt.

## Process
1. Dossiers (parallel) → 2. PRD + TRD drafts → 3. Flows drawn → 4. Reconciliation into one founder round (OPEN-DECISIONS) and one defect register (DIVERGENCES) → 5. Verification round 1 and corrections → 6. Verification round 2 and corrections to the registers, then propagation into PRD / TRD / flows / picture → 6b. Round 3: one cross-document consistency pass (counts, ids, topic matrix, the Portuguese message) → 7. Founder answers the one round (Portuguese message) — **done 2026-10-15** ("siga as recomendações", plus one active device per account and "signing out is never blocked"; AD-77…AD-109) — and gives the approvals (still owed: OPEN-DECISIONS "Approvals still owed"); every answer goes into `docs/decisions.md` the same day → 8. Code sweep against TRD ownership (every divergence fixed test-first, scope per AD-78 — the Target column of DIVERGENCES.md) → 9. Test build (dt-council, ship-check, the founder's go).
