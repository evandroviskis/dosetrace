# Journey-review evaluation fixtures (REVIEWER INPUT)

Each fixture is a flow + its user intent. Review each with the journey-review method
and produce the report format. Do NOT read `expected-findings.md` before reviewing —
that file holds the answers and must stay unseen to keep the eval honest.

Mix on purpose: some have a real omission, some are adequate (must NOT block), one is
an over-scope trap (must be classified out-of-scope, not blocked).

---

## FX1 — Protocol create: first dose (DISCLOSED TRAINING EXAMPLE)
Intent: a user who **started a compound recently (e.g. tirzepatide ~3 weeks ago)**
downloads the app today and wants their record + curve + adherence to reflect that
they're already underway.
Flow: the create wizard's "first dose" step offers Today / Tomorrow + a start date.
(Training example — recognizing this alone is NOT proof of improvement.)

## FX2 — Vial runs out mid-protocol; user opens a fresh vial
Intent: a user on an ongoing recon protocol finishes one vial and reconstitutes the
next, continuing the same schedule/dose. They want supply/expiry to reflect the new
vial without losing history or recreating the protocol.
Flow: vial tracking is created with the protocol (mixed date, validity, derived
supply). Consider how the user records a replacement vial.

## FX3 — User knows they started "about 3 weeks ago" but not the exact day
Intent: represent an already-underway regimen when the exact start date is uncertain.
Flow: the start date is a required precise calendar date that feeds the accumulation
curve and adherence.

## FX4 — Logging today's dose when the scheduled time already passed
Intent: user sets up a protocol at 11pm (or opens Today late) and wants to mark
today's dose as taken even though the reminder time was 8am.
Flow: Today lists due doses; expected-doses logic has a creation-day rule.

## FX5 — Full historical reconstruction (2 years, dose changes, ester switches)
Intent (as stated by a hypothetical stakeholder): "let users rebuild their entire
multi-year history — every dose change, ester switch, and vial — so the curve is
perfect from day one."
Flow: current create + backfill supports a bounded recent start.

## FX6 — Editing a protocol's dose partway through
Intent: a user's prescriber lowers the dose; the user edits the protocol. They expect
the change to apply going forward, not to rewrite the meaning of doses already logged.
Flow: editing updates the protocol row; the curve is schedule-driven off the current
protocol fields.
