# DoseTrace — product and technical definition (started 2026-10-12)

Founder 2026-10-12: "Quero isso feito, mas sem cortar caminhos. Sem nada curto se pode ser mais detalhado."
Why: the app never had a PRD, a TRD or drawn end-to-end flows. Features were specified one at a
time (docs/specs/), so a rule changed in one place could stay old in another (A-118: Today kept
asking for the weigh-in while Progress knew it was done).

## Documents
- `research/01..08-*.md` — factual dossiers per domain, read from the code, the specs and the
  decisions ledger, each with a STATE OWNERSHIP AUDIT (every place that computes the same state)
  and the gaps between spec, decisions and code.
- `PRD.md` — what the product is, for whom, the daily loops, every feature's rules and how the
  features connect. Source of truth for behaviour; each rule cites its decision / spec row.
- `TRD.md` — architecture, data model, sync, and the single owner of every derived state plus the
  screens that consume it (no screen computes shared state on its own).
- `flows/*.md` + a drawn picture — the core journeys as state diagrams, both themes, for the
  founder's approval; they are also the script for the agent-device QA walk before every test build.

## Process
1. Dossiers (parallel) → 2. PRD + TRD drafts → 3. Flows drawn → founder review and sign-off →
4. Code sweep against TRD ownership (every divergence fixed test-first) → 5. test build.
