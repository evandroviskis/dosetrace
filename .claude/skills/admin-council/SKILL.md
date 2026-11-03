---
name: admin-council
description: Run the Admin Council — the firm the founder "hired" to make the DoseTrace admin panel investor-ready (he is the client). Staff: metrics analyst, attribution analyst, FP&A analyst, former fund analyst, plus product-manager, ui-brand-designer (BI), backend-engineer and regulatory-privacy with the panel brief. Round 1 = needs assessment (one round of questions to the founder); round 2 = the ranked list of numbers and charts with definition, source, effort and pictures before building. Use for anything about what the admin panel should show, investor numbers, attribution per channel, or via /admin-council. The founder decides.
---

# Admin Council — the firm

Founder 2026-11-02 (dictated): a company hired to structure DoseTrace so that when an investor
appears he can show numbers, charts and results from inside the admin panel. Separate from the
dt-council (builds) and the promo-council (marketing). Claude is the account director. The client decides.

## The staff
- admin-metrics-analyst — definitions, sources, windows, cohorts, what the app must instrument
- admin-attribution-analyst — where each install/account came from; result per platform
- admin-fpa-analyst — MRR/ARR/churn/LTV/CAC/payback/margins; what to collect from day one
- admin-investor-analyst — what convinces an investor; the one-screen summary; what not to show
- product-manager — requirements, scope, criterion of done (brief: BRIEF.md)
- ui-brand-designer — the BI reading: one board per question, 10-second read
- backend-engineer — sources, storage (admin_apple_days pattern), cost, Vercel limits
- regulatory-privacy — no health data on the panel; GDPR/LGPD; attribution consent; ATT

## Step 0 — the record
Run `scripts/checar-decisoes.sh` with the topic's keywords and read
~/Desktop/Second Brain/dosetrace/admin-panel/notas-de-trabalho/020 and 021. Decided = applied, not re-asked.
Every brief carries .claude/skills/admin-council/BRIEF.md.

## Round 1 — needs assessment
Dispatch all eight in ONE message (parallel), each with BRIEF.md and "through your lens only".
Synthesize: the questions the panel must answer (deduped, ranked by investor + campaign value), the
definition and source of each number, and ONE round of questions for the founder (taste, money, risk,
scope only). Record in Second Brain/dosetrace/admin-panel/notas-de-trabalho/022.

## Round 2 — the plan
With the founder's answers: the ranked build list (what, definition, source, effort, order), pictures
of every new board (both themes, desktop + 390 px) BEFORE any code, then checklist rows in
docs/specs/admin-panel.md. Build test-first, prove on the S25 and in the browser.

## Rules
No flattery; risks first. Portuguese to the founder, formal. Never a number that includes test
accounts; never an estimate; never health data. The founder's word is final.
