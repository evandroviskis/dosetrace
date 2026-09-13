# Journey-review coverage log

Which core flows have had a bounded journey-review, when, and the outcome. Purpose:
review a core flow ONCE up front, then revisit only when its behavior/dependencies
materially change — never re-audit the whole app every build. Update this after each
review. Keep the scenario set so coverage is preserved between sessions.

| Flow | Last reviewed | Outcome | Notes / revisit trigger |
|------|---------------|---------|-------------------------|
| Protocol create — schedule/first-dose | 2026-09-13 (founder-found) | Omission → fix queued | "started earlier" not supported → backfill `0b62d20` (committed, not built). Revisit after it ships + verify on device. |
| Protocol create — dose time picker | 2026-09-13 | Fixed | Phantom 2nd-dose bug `682a962`. Revisit if dose/time UI changes. |
| Protocol create/edit — vial/mixing | 2026-09-13 | Blocked | F4 new-recon-vial overwrites start_date → wipes curve+adherence (TodayScreen.js:650); F5 no manual recon new-vial path; F6 RTU stale expiry; F7 no partial-vial adoption. See docs/journey-review-eval-2026-09-13.md. |
| Protocol edit (dose/schedule change mid-cycle) | 2026-09-13 | Needs product decision | F2 curve rewrites past at the new dose (schedule-driven off current row); F3 disclaimer says "logged doses" but curve is schedule-only. |
| Dose logging / Today / adherence | partial | — | Creation-day rule verified in tests (eval FX4 = adequate). Full journey review pending. |
| Reality-check + calc snapshots | partial | — | Data now in synced tables (build 55). Review the full save/restore/clear journey. |
| Bloodwork entry + lab scan | not yet | — | Uncertain units / scan-then-correct journey. |
| Onboarding + returning-user profile gate | partial | — | Gate reviewed for copy; review the full first-run vs returning-v24 journey. |
| Sign-in / sign-out / re-auth / account switch | partial | — | Wipe-guard `dee0fbd` (committed, not built) — review + verify on device. |

Legend: not yet = never journey-reviewed; partial = touched but no full bounded review.
