# Journey-review — first eval run (2026-09-13)

First run of the new `journey-review` process on a real, un-changed flow (protocol
create/edit + vial), by the separate-context reviewer. Purpose: prove it finds
ordinary missing scenarios the diff-based council misses — on the RESERVED cases, not
the disclosed tirzepatide one.

## Result vs the reserved answer key (`eval/expected-findings.md`)
| Reserved case | Expected | Reviewer result | Score |
|---|---|---|---|
| FX3 uncertain start date | omission / decision | **F1** — exact date forced, drives curve+backfill+adherence as fact | ✓ hit |
| FX2 replace vial mid-protocol | omission / decision | **F5** (no manual recon new-vial path) + **F6** (RTU stale expiry) | ✓ hit (exceeded) |
| FX6 edit dose mid-cycle | plausible / decision | **F2** — curve rewrites past at the new dose | ✓ hit |
| FX4 log today after time passed | **Pass** (must not block) | scenario 9 ✓ Pass, not flagged | ✓ no false positive |
| FX5 multi-year reconstruction | out-of-scope | correctly parked out-of-scope | ✓ scope held |
| — (not in key) | — | **F4** start_date overwrite on new recon vial wipes curve/adherence; **F7** no partial-vial adoption | ✓ bonus real defects |

Caught every reserved omission, zero false positives, held scope, cited file:line,
no invented prevalence. It also found **F4**, a high-severity data/history-loss defect
that wasn't even in the answer key.

## Old vs new (observable improvement)
The old dt-council reviews the **change set** (`git diff` since last build). None of
these flows were in a recent diff — the vial-continuation, curve disclaimer, and
edit-dose paths are months old and untouched — so the old process's coverage of them
was **zero**; it could not have surfaced any of F1–F7. The journey lens surfaced
**4 confirmed defects + 3 product decisions** on those same untouched flows. That is
the improvement: coverage of ordinary journeys independent of what changed.

## Confirmed defects (verified in code)
- **F4 (HIGH, data/history loss)** `screens/TodayScreen.js:650` — `createNewVial`
  does `updateProtocol(id, { start_date: mixDate })`; curve + adherence read
  `start_date` (SerumCurveScreen.js:176-198, schedule.js:23-28), so opening a fresh
  recon vial erases all pre-vial curve + adherence history. **Fix:** don't write
  `start_date` in `createNewVial` (vial expiry lives on the vial's `mixed_on`).
- **F3 (truthfulness/regulatory, small)** `i18n/translations.js:470` — `curve_disclaimer`
  claims the model uses "your logged doses"; the curve is schedule-only. **Fix:**
  reword to "based on your planned schedule" (×6 languages).
- **F2 (confirmed)** editing dose/interval mid-protocol rewrites the historical curve
  at the new value (curve derives from the single current protocol row). Needs a
  product decision (disclaim vs dated segments).
- **F5 (confirmed omission)** recon "new vial" is only reachable by exhausting the
  derived count; a skip-vial recon protocol can never add vial tracking later →
  delete-and-recreate. **Fix:** a manual "start new vial" on the recon card (like
  RTU), without touching start_date.

## Plausible / lower
- **F6** RTU "new vial" keeps the old box expiry (stale fact) — prompt for new expiry.
- **F7** no way to record a partially-used vial when adopting mid-vial — add a
  "doses already used" field on the initial vial.

## Product decisions needed (founder)
1. Is `start_date` an exact fact or an approximate marker? And what is the supported
   adoption look-back window? (only an unowned 180-day implementation cap exists) (F1)
2. Should the serum curve honor logged doses (missed/skipped lower it) or stay
   schedule-only with honest labeling? (F2, F3)
3. Representing a dose/schedule that changed over time — disclaimed current-settings
   model now vs dated segments later? (F2)

## Caveats
Reviewer was **code-only** (no simulator run) — the UI behaviors are inferred from
source; confirm F4/F5 on device. The answer key is itself fallible; F4 shows the real
app can be worse than the key predicted.
