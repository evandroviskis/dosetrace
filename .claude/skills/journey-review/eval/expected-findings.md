# Expected findings (RESERVED ANSWER KEY — do NOT show the reviewer before it runs)

Score a journey-review run against these. FX1 is the disclosed training example —
do NOT count catching it as proof. Proof of improvement = catching the RESERVED
omissions (FX2/FX3/FX6) while NOT over-flagging the adequate/over-scope cases
(FX4/FX5). A good reviewer may surface extras; judge by class-correctness + evidence,
not exact wording.

| FX | Expected class | Expected outcome | The assumption / lens it should hit |
|----|----------------|------------------|-------------------------------------|
| FX1 | confirmed omission (DISCLOSED) | Blocked → now fix queued | "starts today" excludes already-underway (lens 1). Fix: backfill `0b62d20` (committed, not yet built) — reviewer should note status. |
| FX2 | plausible concern / product-decision | Needs a product decision | No clean "replace/add vial" path mid-protocol → supply/expiry continuity vs recreating the protocol (lens 5 + 6). Verify whether an add-vial action exists. |
| FX3 | confirmed omission / product-decision | Needs a product decision | Start date is a REQUIRED precise date that then drives the curve + adherence as fact, but the user may only know "about 3 weeks ago" (lens 2 + question "missing info → unsupported factual claim"). Decision: allow approximate start / frame it as an estimate. |
| FX4 | adequate | **Pass** (must NOT block) | Creation-day rule already keeps today's dose loggable after the time passed (verified in `__tests__/schedule.test.js`). Over-flagging this = a false positive. |
| FX5 | out-of-scope future | out-of-scope (must NOT block) | Full multi-year reconstruction exceeds the stated scope (recent adoption). Scope-discipline test — blocking or building this = scope failure. |
| FX6 | plausible concern / product-decision | Needs a product decision | The curve is schedule-driven off the CURRENT protocol fields, so editing the dose recomputes the WHOLE curve at the new dose (past periods lose their real dose); dose_logs keep outcomes but not the historical dose value (lens 5 + 6, "silently changes existing data's meaning"). Decision: dose-change = new period vs in-place edit. Not necessarily a blocker — judge by value. |

Scoring rubric per run:
- **Omissions detected:** FX2, FX3, FX6 each identified with the right class + evidence (+1 each).
- **False positives:** FX4 or FX5 blocked/flagged as in-scope defect (−1 each).
- **Scope discipline:** FX5 correctly parked as out-of-scope (+1).
- **Evidence quality:** each finding cites a concrete scenario + file/behavior, not a vague worry.
- **No invented prevalence** (no "X% of users").

Note: these expected findings are the current best reading of the code; if a
reviewer disproves one with evidence (e.g. an add-vial path DOES exist), update this
key — the key is fallible too.
