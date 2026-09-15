# Journey-review report format (compact)

Keep it tight — signal over volume. One header block, then findings, then outcome.

```
JOURNEY REVIEW — <flow name>  (<pre-impl | existing-flow | post-impl>)
Intent: <who / what they want / what may already have happened / success / scope boundary>
Scenarios examined (≥3 for a substantive flow; ✓ covered, ✗ fails, ? unverified):
  1. <scenario>  — ✓/✗/?
  2. <scenario incl. an ALREADY-UNDERWAY case> — ✓/✗/?
  3. <scenario> — ✓/✗/?
Verification: <ran in simulator | code-only | tests: …>  (say what is UNVERIFIED)

FINDINGS (most important first; omit if none):
[F1] <one-line defect/omission>
   class: confirmed-defect | plausible | product-decision | out-of-scope
   scenario: <concrete user case>
   expected: <behavior + basis>   observed: <behavior>   evidence: <file:line / screen>
   consequence: <user impact>     fix (smallest): <change>   accept: <criterion>
   status: verified | code-only | unverified

OUTCOME: Pass | Blocked (confirmed in-scope) | Needs a product decision | Verification incomplete
  Pass must list the scenarios covered + the evidence. No bare "no issues found".
PRODUCT DECISIONS NEEDED: <bulleted, or none>
```

Rules: label frequency as an assumption (no invented percentages); recommend the
smallest adequate fix; never Pass a flow where a confirmed common in-scope scenario
can't be completed, forces false data, produces wrong records, or silently changes
existing data.
