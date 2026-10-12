# DoseTrace — product and technical definition (started 2026-10-12)

Founder 2026-10-12: "Quero isso feito, mas sem cortar caminhos. Sem nada curto se pode ser mais detalhado."
Why: the app never had a PRD, a TRD or drawn end-to-end flows. Features were specified one at a
time (docs/specs/), so a rule changed in one place could stay old in another (A-118: Today kept
asking for the weigh-in while Progress knew it was done).

## The set

| File | What it is | Size (2026-10-12, after verification round 2) |
|---|---|---|
| `OPEN-DECISIONS.md` | The single list of founder questions (OPEN-xx), the decisions already taken by the founder (AD-xx) or by product logic (DL-xx), the founder actions that are not questions ("Approvals still owed"), the crosswalk of every earlier question, and the Portuguese message to send him (one round). | 23 OPEN open (OPEN-12 closed; ids never reused) · 62 AD in force · 84 DL in force |
| `DIVERGENCES.md` | The one register of defects (DV-xxx): every gap between the code and the founder's decisions, signed specs or the binding prototype, each with severity, evidence, founder link, fix and the test that must fail first. | 231 active rows (15 S1, 103 S2, 44 S3, 69 S4) + 3 ops items, 4 merged, 3 closed (DV-001…DV-241) |
| `PRD.md` | What the product is, for whom, the daily loops, every feature's rules and how the features connect (§6 gap rows G-n point to DV rows). Source of truth for behaviour; each rule cites its decision, spec row or OPEN / AD / DL id. | 463 requirements (PRD-AREA-n), 40 cross-feature contracts, G-1…G-155 |
| `TRD.md` | Architecture, data model, sync, the single owner of every derived state and the screens that consume it, invariants, test strategy, risks (R-xx point to DV rows). | — |
| `flows/01…14-*.md` + `flows/README.md` | The 14 core journeys: state diagrams, state × surface tables, divergence rows (Dnn-k → DV) and acceptance checks — also the script for the agent-device QA walk before every test build. | 14 flows, 263 acceptance checks |
| `docs/design/fluxos-dosetrace.html` | The drawn picture of the 14 flows, in Portuguese, for the founder. | 14 flows |
| `research/01…08-*.md` | The factual dossiers per domain, read from the code, the specs and the ledger, each with a state-ownership audit. The other documents were built from them. | 8 dossiers |
| `verification/` | Round 1 (`00-mechanical`, `00b-diagrams`, `01…07`): independent checks of every claim against the code, the ledger and live state. Round 2 (`round2/R2-01…R2-07`): a second independent check of the corrected set, plus `round2/id-map.md` — the one table of every id whose status changed in either round, with the final counts. | 105 diagrams parse |

Counts in the PRD, TRD, flows and picture are as of verification round 2; they are brought in line with the registers (OPEN-DECISIONS, DIVERGENCES, the ledger) in the propagation step that follows, using `verification/round2/id-map.md`.

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
1. Dossiers (parallel) → 2. PRD + TRD drafts → 3. Flows drawn → 4. Reconciliation into one founder round (OPEN-DECISIONS) and one defect register (DIVERGENCES) → 5. Verification round 1 and corrections → 6. Verification round 2 and corrections to the registers, then propagation into PRD / TRD / flows / picture → 7. Founder answers the one round (Portuguese message) and gives the approvals; every answer goes into `docs/decisions.md` the same day → 8. Code sweep against TRD ownership (every divergence fixed test-first, scope per OPEN-16) → 9. Test build (dt-council, ship-check, the founder's go).
