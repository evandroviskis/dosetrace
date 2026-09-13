---
name: journey-review
description: Real-world user-journey review for DoseTrace. Finds MISSING requirements and unsupported assumptions a spec/diff review misses — especially "what may already have happened in the user's life before they open this feature for the first time?". Run before implementing a substantive behavior change, as a bounded review of an existing core flow, or via /journey-review. Complements dt-council (should-we/is-it-right) and ship-check (can-it-ship).
---

# Journey Review

The dt-council reviews the **change set**; ship-check reviews **can it ship**. This
skill reviews the **whole user journey** and hunts the failure the others miss: an
ordinary real-world situation the requirements/implementation never considered. The
motivating miss: the protocol flow assumed the first dose starts *today* and never
supported someone who **started tirzepatide 3 weeks ago and downloads the app today**.

The one question this skill exists to force:
> **"What may already have happened in the user's life before they open this
> feature for the first time — and can they represent it truthfully without a
> workaround?"**

This is a method, not a credential. It applies the judgment of a senior journey
designer, a requirements analyst, an exploratory QA, and a scope-disciplined PM. It
never proves completeness; it surfaces likely-missing scenarios with evidence.

## When to run (explicit — don't rely on the model noticing)
- **Before implementing** any substantive behavior change (a new/changed flow,
  field, default, restriction, schedule/records effect). Do the intent + scenarios
  pass FIRST, then implement against agreed acceptance criteria.
- **Bounded existing-flow review**: once, up front, for a core journey (start with
  protocol create/edit), then again only when that flow's behavior or dependencies
  materially change. Track what's been covered in `coverage.md` so the whole app
  isn't re-audited every build.
- Inside **dt-council** when the change set touches a substantive flow (the chair
  invokes it — see dt-council SKILL "Journey lens").
- On request: `/journey-review <flow>`.
- Skip for cosmetic-only changes (copy, color, icon swap).

Prefer a **separate-context reviewer** (`journey-reviewer` agent) so the review
isn't anchored to the implementer's account of why the solution is right. Give it the
product intent + constraints + access to the code/running app — NOT the persuasive
rationale.

## Procedure
Load `scenario-lenses.md` (the variation lenses + the explicit questions) and
`report-template.md` (the output format). Then:

**A. Establish intent BEFORE looking at the solution.** Write: who uses this; what
they're trying to accomplish; **what may already have happened before first use**;
what success looks like; the boundary of the requested work (scope). Draft an initial
scenario set from the user's intent — before adopting the current UI's assumptions.

**B. Examine ordinary variations** (from `scenario-lenses.md`) — apply the relevant
ones, don't mechanically multiply. Always include an **already-underway** scenario
whenever the activity can precede app adoption. For a substantive flow give **≥3
distinct realistic scenarios**.

**C. Ask the explicit questions** (from `scenario-lenses.md`) — e.g. "What common
situation does this default/restriction exclude?", "Can the user complete their
intent without entering something false?", "Are we requiring info they can't
reasonably know?", "Does missing info become an unsupported factual claim?", "Can
they fix a mistake without deleting everything?", "Is the restriction backed by an
explicit product decision?", "Is the correction proportionate, or are we inventing a
bigger product?"

**D. Verify against the actual product.** Use the running app where available
(EAS simulator build → iOS Simulator), plus code inspection + relevant tests. For
each finding record: scenario · expected behavior + basis · observed behavior ·
evidence · user consequence · smallest adequate fix · acceptance criterion ·
verification status. If only code was read, say so — don't claim the UI was tested.

**E. Classify each finding** as: confirmed in-scope defect/omission · plausible
concern (needs verification) · unresolved product decision · out-of-scope future.
Prioritize by likely occurrence × impact × recoverability. Label frequency
assumptions; never invent numeric prevalence.

## Outcomes (approval must be meaningful)
Use one of: **Pass** (list the scenarios covered + evidence) · **Blocked by a
confirmed in-scope issue** · **Needs a product decision** · **Verification
incomplete**. A flow does NOT get an unqualified Pass if a confirmed, common,
in-scope scenario can't be completed, forces false info / an unreasonable workaround,
produces incorrect records, or silently changes existing data's meaning. "UX
reviewed" / "no issues found" without listed coverage is not a Pass.

## Scope discipline
Recommend the **smallest adequate correction**. Three weeks is an example, not an
approved max backdating window — find the explicit product decision on the supported
window; if none exists, report it as an **unresolved product decision**, don't invent
one. Don't turn a review into an app redesign.

## Learn from a founder-discovered miss
When the founder finds a missed scenario: capture the real-world case; name the
assumption that excluded it; add a scenario to `eval/` (fixtures + expected findings)
as a regression; identify which review question should have exposed it; do a bounded
search for the same assumption in related flows; improve this method only if
justified (don't accumulate one-off bug memorization).

## Evaluate (don't tune-then-claim)
`eval/fixtures.md` holds flows with known omissions, adequate flows, and over-scope
traps; `eval/expected-findings.md` holds the answers and is NOT shown to the reviewer.
The tirzepatide case is a disclosed training example — prove improvement on the
RESERVED cases, not on it. Keep fixtures separate from reviewer inputs; report
omissions caught, false/exaggerated findings, evidence quality, scope discipline, and
cost.

Written instructions guide behavior; only executable tests verify what they test. Do
not claim this skill guarantees product completeness.
