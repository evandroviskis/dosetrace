# Round 2 — id map (the single source for propagation)

- Written 2026-10-12 after verification round 2 (`R2-01…R2-07` in this folder). Canonical registers: `docs/product/OPEN-DECISIONS.md`, `docs/product/DIVERGENCES.md`, and the 2026-10-12 sections of `docs/decisions.md`.
- Every id whose status changed in round 1 or round 2 is listed once, with its final status. Phase-2 agents propagate exactly this into `PRD.md`, `TRD.md`, `flows/`, `research/` (citations only) and `docs/design/fluxos-dosetrace.html`.
- "R1" = verification round 1 (2026-10-12, `verification/01…07`); "R2" = round 2. Ids are never reused: a moved or withdrawn id keeps its row in its register, marked.

## Final counts

| Register | Count |
|---|---|
| OPEN questions open | **23** — OPEN-01…OPEN-11, OPEN-13…OPEN-24 |
| OPEN closed in round 2 | 1 whole (OPEN-12 → AD-68) + parts: OPEN-14 (a); OPEN-18 (5), (6), (7), (8); OPEN-19 (a), (b), (c); OPEN-20 (a); OPEN-21 (1)…(10) |
| OPEN added in round 2 | OPEN-22, OPEN-23, OPEN-24; and items OPEN-18 (9), OPEN-21 (11) |
| AD in force | **62** (AD-01…AD-76 = 76 rows; 14 moved out: AD-04, 10, 12, 27, 28, 29, 35, 44, 45, 46, 50, 54, 56, 57) |
| DL in force | **84** (DL-01…DL-98 = 98 rows; 14 out: DL-01, 16, 24, 32, 50, 51, 66, 67, 68, 71, 72, 73, 74, 75) |
| DV active | **231** — S1 15 · S2 103 · S3 44 · S4 69 |
| DV by domain (S1/S2/S3/S4) | PROT 0/23/12/9 = 44 · TODAY 0/20/0/11 = 31 · REM 1/14/6/9 = 30 · FOOD 2/16/7/4 = 29 · CURVE 0/8/2/9 = 19 · BODY 1/9/5/3 = 18 · ACCT 4/9/5/11 = 29 · PLAT 7/4/7/5 = 23 · DOCS 0/0/0/8 = 8 |
| DV not counted | 3 ops items (DV-173, DV-188, DV-211) · 4 merged (DV-189, DV-206, DV-208, DV-212) · 3 closed in R1 (DV-100, DV-142, DV-194) |
| DV ids issued | DV-001…DV-241 |

## Open OPEN items (one line each)

| ID | Topic | Portuguese question # |
|---|---|---|
| OPEN-16 | (a) scope of 1.3.0; (b) when the sync hardening ships (DV-182, 183, 209, 210, 222) | 1 |
| OPEN-24 | the 12 new screens / texts that logic decisions would add (pictures first, ×6) | 2 |
| OPEN-01 | correct the vial in use; recon "New vial" on the protocol page; the new rtu box date | 3 |
| OPEN-02 | low-supply warning for oral bottles | 4 |
| OPEN-03 | end of a fixed course of doses; bring back "total doses"? | 5 |
| OPEN-04 | automatic purge of Recently deleted after 1.3.0 | 6 |
| OPEN-05 | 3-protocol free limit on the server and after a lapse | 7 |
| OPEN-17 | Today tracker streak: days / doses / days with new words | 8 |
| OPEN-19 (d) | Undo bar after Skip | 9 |
| OPEN-06 | iPhone reminders without opening the app | 10 |
| OPEN-20 (b), (c) | OS permission after "Not now" (incl. the iPhone sync case); vial-expiry lead time and words | 11 |
| OPEN-07 | reality check finishes by itself; one start weight | 12 |
| OPEN-08 | does Stop erase earlier results | 13 |
| OPEN-09 | a check whose math gives no number | 14 |
| OPEN-22 (a), (b) | measured daily burn with an incomplete profile (PO-12); target ETA from an old weigh-in window | 15 |
| OPEN-10 | dose edit rewrites the past curve | 16 |
| OPEN-11 | skipped / missed doses and the curve | 17 |
| OPEN-23 | existing false Missed rows of real users | 18 |
| OPEN-13 | "Bloodwork due" alert | 19 |
| OPEN-14 (b), (c) | scans used this month; change a test's date | 20 |
| OPEN-15 | manage the subscription in Settings | 21 |
| OPEN-21 (11) | cross-account guard discards another account's unsynced data | 22 |
| OPEN-18 (1), (2), (3), (4), (9) | blend lines; "not recorded" mark; builder AI caps (food + assistant); ring + curve intro animation; week / whole-check food totals | 23 (a)–(e) |

## AD — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| AD-04 | → OPEN-21 (1) | → DL-85 | moved (DL-85) |
| AD-06 | — | rows: DV-030 → AD-70 | in force |
| AD-07 | narrowed to the protocol card; tracker → OPEN-17 | — | in force (narrowed) |
| AD-09 | narrowed to Restart (:614); copy → OPEN-21 (2) | copy → Approvals item 2; "supplier" → AD-75 | in force (narrowed) |
| AD-10 | → OPEN-21 (3) | → DL-86 | moved (DL-86) |
| AD-11 | narrowed: in 1.3.0 only; rules → OPEN-21 (4) | rules → DL-87, DL-88, DL-89, DL-90, DL-91; A-85 / A-96 pictures → Approvals item 3; A-90 copy → Approvals item 2 | in force (narrowed) |
| AD-12 | corrected scope | → DL-25 (registry line, not a founder answer) | moved (DL-25) |
| AD-26 | label = new copy | re-cited to decisions.md:165 | in force |
| AD-27 | → OPEN-20 (b) | — | moved (OPEN-20 (b), open) |
| AD-28 | — | → DL-81 | moved (DL-81) |
| AD-29 | → OPEN-21 (5) | → DL-92 (+ OPEN-24 item 10) | moved (DL-92) |
| AD-30 | setup done, live | "the founder signed in on the Fold 2026-10-07" removed (unsourced) | in force |
| AD-35 | → OPEN-21 (6) | → DL-97 | moved (DL-97) |
| AD-43 | re-cited :300 | narrowed: the counsel flag citation (:388) dropped | in force (narrowed) |
| AD-44 | → OPEN-18 (4) | — (OPEN-18 (4) now also has the curve-intro half) | moved (OPEN-18 (4), open) |
| AD-45 | → DL-75 | → OPEN-22 (a) | moved (OPEN-22 (a), open) |
| AD-46 | → OPEN-21 (7) | → DL-93 | moved (DL-93) |
| AD-49 | marked coordinator | re-cited to founder :287 + signed MB-11; eligibility → DL-82 | in force (re-cited) |
| AD-50 | → OPEN-21 (8) | → DL-94 | moved (DL-94) |
| AD-51 | — | narrowed to the :388 items; A-95, ePrivacy, RevenueCat → DL-83 | in force (narrowed) |
| AD-52 | does not cover unsigned checklists | note: Conflicts 22/23/25/26/28 routed by the coordinator | in force |
| AD-54 | → OPEN-21 (9) | → DL-95 | moved (DL-95) |
| AD-56 | → OPEN-14 (a) | OPEN-14 (a) closed → AD-69 | moved (AD-69) |
| AD-57 | marked coordinator | → DL-84 (wording → Approvals) | moved (DL-84) |
| AD-60 | push at 3 → OPEN-18 (5) | push at 3 decided (signed FX-11 deviation, :148); OPEN-18 (5) closed | in force |
| AD-61 | narrowed; gym → OPEN-21 (10) | gym → DL-96 | in force (narrowed) |
| AD-65 | added (replaces DL-16) | narrowed to the Today card; My Protocols → DL-80 | in force (narrowed) |
| AD-66 | — | added: interval Every day / Custom N, no presets (:34 over :200) | in force |
| AD-67 | — | added: Delete forever identity per the founder-approved migration (:552, :556) | in force |
| AD-68 | — | added: manual lab entry in 1.3.0 (closes OPEN-12) | in force |
| AD-69 | — | added: no scan number in Premium strings; no Premium line; free number never shown to Premium (closes OPEN-14 (a)) | in force |
| AD-70 | — | added: a late dose on the slot's own day belongs to that slot (F1, :140) (closes OPEN-19 (a)) | in force |
| AD-71 | — | added: Settings red per signed SP-1 / RC-1 (closes OPEN-20 (a)) | in force |
| AD-72 | — | added: the privacy policy names Anthropic and covers the AI food log (:330) | in force |
| AD-73 | — | added: one off switch for the 8 PM question, no backoff (:249) | in force |
| AD-74 | — | added: official Apple artwork on Android (:40) (closes OPEN-18 (6)) | in force |
| AD-75 | — | added: "check with your supplier" stays (:186, AP-22) | in force |
| AD-76 | — | added: site questions never dropped for age (:379; was DL-01) | in force |

## DL — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| DL-01 | — | → AD-76 (founder line :379) | moved (AD-76) |
| DL-02 | — | wording of the report line → Approvals 2.3 | in force |
| DL-03 | narrowed: 365-day look-back; unit → OPEN-17 | — | in force (narrowed) |
| DL-06 | narrowed: one slot list; default → OPEN-19 (c) | default → DL-77 | in force |
| DL-08 | narrowed: Skip cancels reminders; Undo → OPEN-19 (d) | — | in force (narrowed) |
| DL-10 | "flow 03 §7.2 must match" | rewritten to the founder's tap-time rule (:153); message → OPEN-24 item 9 | in force (rewritten) |
| DL-12 | picture first | picture → OPEN-24 item 12 | in force |
| DL-14 | citation corrected | mirrored into decisions.md | in force |
| DL-16 | → AD-65 | — | moved (AD-65) |
| DL-19 | reason corrected | mirrored into decisions.md | in force |
| DL-22 | narrowed: recon New vial → OPEN-01 | narrowed: the rtu box date → OPEN-01 | in force (narrowed) |
| DL-24 | → OPEN-05 | — | withdrawn (OPEN-05) |
| DL-25 | — | absorbs AD-12 | in force |
| DL-26 | — | new texts → OPEN-24 item 7 | in force |
| DL-28 | rewritten | new row state → OPEN-24 item 8; deploy → Approvals 1 | in force |
| DL-30 | — | labels → OPEN-24 item 3 | in force |
| DL-32 | → OPEN-18 (1) | — | withdrawn (OPEN-18 (1)) |
| DL-43 | — | chart → OPEN-24 item 4 | in force |
| DL-45 | narrowed: Silent; Settings → OPEN-20 (a) | Settings → AD-71 | in force (narrowed) |
| DL-48 | — | wording → Approvals 2.2 | in force |
| DL-49 | — | rows → OPEN-24 item 5 | in force |
| DL-50 | withdrawn (moot) | — | withdrawn |
| DL-51 | → OPEN-07 | — | withdrawn (OPEN-07) |
| DL-52 | — | reason rewritten (no longer cites the cross-account guard) | in force |
| DL-55 | — | Settings row → OPEN-24 item 1; server proof → DL-83 | in force |
| DL-58 | — | editor → OPEN-24 item 2 | in force |
| DL-60 | — | line + link → OPEN-24 item 6 | in force |
| DL-61 | — | wording → Approvals 2.14 | in force |
| DL-64 | — | production go → Approvals 1 | in force |
| DL-66 | → OPEN-18 (2) | — | withdrawn (OPEN-18 (2)) |
| DL-67 | → OPEN-19 (b) | OPEN-19 (b) closed → DL-76 | withdrawn (DL-76) |
| DL-68 | — | → OPEN-22 (b) | moved (OPEN-22 (b)) |
| DL-71 | — | → OPEN-23 (premise false) | moved (OPEN-23) |
| DL-72 | → OPEN-16 (b) | — | withdrawn (OPEN-16 (b)) |
| DL-73 | withdrawn (false premise) | — | withdrawn |
| DL-74 | → OPEN-16 (b) | — | withdrawn (OPEN-16 (b)) |
| DL-75 | added (replaced AD-45) | withdrawn → OPEN-22 (a) | withdrawn (OPEN-22 (a)) |
| DL-76 | — | added: Mark-complete cap = doses per day on every path (closes OPEN-19 (b)) | in force |
| DL-77 | — | added: 08:00 for no-time protocols everywhere (closes OPEN-19 (c)) | in force |
| DL-78 | — | added: A-30 window max(180 d, 5 × t½) | in force |
| DL-79 | — | added: admin panel O-4 / O-5 / O-6 / O-7 | in force |
| DL-80 | — | added: My Protocols colouring = Today card (from AD-65) | in force |
| DL-81 | — | added: one privacy text (was AD-28) | in force |
| DL-82 | — | added: trial only when eligible (from AD-49) | in force |
| DL-83 | — | added: counsel list extended (A-95, ePrivacy, RevenueCat) | in force |
| DL-84 | — | added: "not linked to your account" (was AD-57) | in force |
| DL-85 | — | added (was AD-04, OPEN-21 (1)) | in force |
| DL-86 | — | added (was AD-10, OPEN-21 (3)) | in force |
| DL-87 | — | added: A-86 / A-86b (OPEN-21 (4)) | in force |
| DL-88 | — | added: A-87 / A-87b (OPEN-21 (4)) | in force |
| DL-89 | — | added: A-89 | in force |
| DL-90 | — | added: A-92 | in force |
| DL-91 | — | added: A-98 | in force |
| DL-92 | — | added (was AD-29, OPEN-21 (5)) | in force |
| DL-93 | — | added (was AD-46, OPEN-21 (7)) | in force |
| DL-94 | — | added (was AD-50, OPEN-21 (8)) | in force |
| DL-95 | — | added (was AD-54, OPEN-21 (9)) | in force |
| DL-96 | — | added (was AD-61 part, OPEN-21 (10)) | in force |
| DL-97 | — | added (was AD-35, OPEN-21 (6)) | in force |
| DL-98 | — | added: Fold left page follows food writes | in force |

## OPEN — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| OPEN-01 | premises fixed; recon part of DL-22 merged | premise (:614 Restart) fixed; DL-22's rtu box date merged | open |
| OPEN-02…OPEN-06, OPEN-08, OPEN-09, OPEN-11, OPEN-13 | premises fixed (some) | small premise fixes (OPEN-03 cites :620; OPEN-13 adds :139) | open |
| OPEN-07 | DL-51 merged | unsourced "A-118 texts approved 2026-10-09" removed | open |
| OPEN-10 | — | "the edit already writes only what changed" removed (no edit history) | open |
| OPEN-12 | A = default | closed → AD-68 | closed |
| OPEN-14 | (a) added | (a) closed → AD-69; (b) premise fixed (limit shown only before the first scan with values) | open: (b), (c) |
| OPEN-15 | premise fixed | "store rules 100%" over-extension removed | open |
| OPEN-16 | added | true counts; AD-32 stated next to the facts; what is lost; DV-222 added to (b); new-UI list moved to OPEN-24 | open |
| OPEN-17 | added | premise fixed (tracker already skips rest days); option C added | open |
| OPEN-18 | added (items 1–8) | 5 → AD-60; 6 → AD-74; 7, 8 → Approvals 8, 7; 3 widened (assistant caps, DV-240); 4 widened (curve intro); 9 added (DV-232) | open: 1, 2, 3, 4, 9 |
| OPEN-19 | added (a)–(d) | (a) → AD-70; (b) → DL-76; (c) → DL-77 | open: (d) |
| OPEN-20 | added (a)–(c) | (a) → AD-71; (b) premise fixed (dialog once; SP-5 Android-only; iPhone sync case) | open: (b), (c) |
| OPEN-21 | added (items 1–10) | 1 → DL-85; 2 → Approvals 2 + AD-75; 3 → DL-86; 4 → DL-87, 88, 89, 90, 91 + Approvals 3; 5 → DL-92; 6 → DL-97; 7 → DL-93; 8 → DL-94; 9 → DL-95; 10 → DL-96; item 11 added (cross-account guard) | open: (11) |
| OPEN-22 | — | added (from AD-45 / DL-75 and DL-68) | open |
| OPEN-23 | — | added (from DL-71) | open |
| OPEN-24 | — | added (new-UI parts of DL-10, 12, 26, 28, 30, 43, 49, 55, 58, 60, 80, 92) | open |

## DV — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| DV-001 | S1 → S2 (protocols fixed in e85519c); 8 tables | fix: send created_at on INSERT only, keep the earliest on pull | S2 |
| DV-002 | S1 → S2 | S2 → S1 (privacy by the legend); test asserts trigger.channelId | S1 |
| DV-003 | — | absorbs DV-206 | S1 |
| DV-004 | Stop with no open check | S1 → S2 (S1 if OPEN-08 = A); the confirm sheet stated | S2 |
| DV-005 | — | S1 → S2 (a derived estimate) | S2 |
| DV-007 | — | link: DL-55 · OPEN-24 item 1 · DL-83 | S1 |
| DV-009 | link OPEN-21 | link: DL-85; lost response No (bug) | S1 |
| DV-010 | — | fix corrected (pending patch, not a full merge); first-save upsert added | S1 |
| DV-011 | S1 → S4 (reconciliation) | S4 → S3; link DL-93 | S3 |
| DV-018 | link DL-16 → AD-65 | link AD-65 + DL-80 | S2 |
| DV-021, DV-025 | link OPEN-21 | link DL-88, DL-87 | S2 |
| DV-023 | link OPEN-21 | link: bug + Approvals wording | S2 |
| DV-027 | link DL-22 | link DL-22 · OPEN-01 (box date) | S2 |
| DV-028 | link DL-06 · OPEN-19 (c) | link DL-06 + DL-77; server mirror; "12:00 AM" | S2 |
| DV-030 | link OPEN-19 (a) | link AD-70 + DL-04 | S2 |
| DV-036 | link DL-10 | link DL-10 (rewritten) · OPEN-24 item 9; fix per the tap-time rule | S2 |
| DV-042 | link DL-45 · OPEN-20 (a) | narrowed to the Today / Silent half; Settings half = AD-71 | S2 |
| DV-048 | — | extended: INV-23 (`notificationActions.js:134-146`) | S2 |
| DV-053 | thresholds rewritten | thresholds recomputed from `doseBudget` (assumptions stated) | S2 |
| DV-054 | link OPEN-20 (b) | S2 → S3; premise (dialog once) | S3 |
| DV-056, DV-057 | link AD-12 + DL-25 | link DL-25 | S2 |
| DV-058, DV-066, DV-087, DV-113, DV-114, DV-146 | links DL-26, DL-28, DL-60, DL-58, OPEN-21, DL-30 | + OPEN-24 (the new UI part) | unchanged |
| DV-068 | — | absorbs DV-208 | S2 |
| DV-070 | — | S2 → S4 | S4 |
| DV-071 | — | absorbs DV-212; per-language stem test | S2 |
| DV-085 | link AD-28 | link DL-81 | S2 |
| DV-088 | SUSPECTED → CONFIRMED | absorbs DV-189; test depends on DV-119's snapshot | S2 |
| DV-090, DV-096, DV-105 | link OPEN-21 | AD-11 + pictures owed / DL-91 | S3 |
| DV-091 | link OPEN-21 | link DL-86 + wording | S3 |
| DV-107 | link OPEN-12 | link AD-68 | S3 |
| DV-110 | corrected | premise corrected; link OPEN-14 (b), (c) + AD-69 | S3 |
| DV-123 | — | link DL-19 + AD-66 | S4 |
| DV-125 | link OPEN-04 / OPEN-21 | link DL-94 · OPEN-04 | S4 |
| DV-126 | — | S4 → S2; link AD-49 + DL-82 | S2 |
| DV-127 | link OPEN-21 | link DL-97 | S4 |
| DV-132 | link OPEN-18 | curve-intro half added | S4 |
| DV-135 | — | S4 → S2 | S2 |
| DV-149 | link DL-75 | S4 → S3; link OPEN-22 (a) | S3 |
| DV-150 | — | S4 → S2; broken row fixed | S2 |
| DV-152 | — | S4 → S2 | S2 |
| DV-168 | link AD-43 (counsel) | link AD-43 (narrowed), no counsel | S4 |
| DV-170 | BodyMapModal dropped | narrowed to the ErrorBoundary | S4 |
| DV-173 | — | → ops item | OPS |
| DV-175 | link DL-01 | (DL-01 → AD-76; the row keeps its historical link text) | S4 |
| DV-182 | corrected (dose comes back) | vial half narrowed (not reachable in 1.3.0); weigh-ins by design (DL-90); test on the stock harness | S1 |
| DV-183 | — | oral protocol for the note test | S1 |
| DV-184 | — | description and test corrected (the write is what throws) | S1 |
| DV-188 | — | → ops item | OPS |
| DV-189 | corrected | merged into DV-088 | merged |
| DV-190 | — | S3 → S2; link DL-84; stem test | S2 |
| DV-192 | link OPEN-21 | narrowed ("supplier" stays, AD-75); two strings | S3 |
| DV-196 | added | test corrected (shared language helper) | S2 |
| DV-199, DV-200 | added | links: fixed with DV-027; AD-65 + DL-80; Today alert extension | S2 |
| DV-204 | added | narrowed to ended oral protocols; link DL-76 | S2 |
| DV-206 | added S1 | merged into DV-003 | merged |
| DV-208 | added S2 | merged into DV-068 | merged |
| DV-209, DV-210 | added S1 | link: bug, shipped per OPEN-16 (b); tests rewritten | S1 |
| DV-211 | added S2 | → ops item (dated console step) | OPS |
| DV-212 | added S2 | merged into DV-071 | merged |
| DV-213 | added | link OPEN-18 (3) | S3 |
| DV-215 | added | ES added | S4 |
| DV-218 | added | narrowed to flow 06; domain REM → DOCS | S4 |
| DV-219 | added (AD-51) | link DL-83 | S4 |
| DV-221 | added S1 (coordinator :540) | S1 → S3; link AD-67; only 4 columns | S3 |
| DV-222 | — | added S1: a phone's own push moves its pull watermark | S1 |
| DV-223 | — | added S2: rtu dose edit ignores doses taken | S2 |
| DV-224 | — | added S3: snooze does not stop persistent repeats after a resync | S3 |
| DV-225 | — | added S3: switching a kind off leaves its snoozed copies | S3 |
| DV-226 | — | added S1: the food chat's Remove pill deletes without asking | S1 |
| DV-227 | — | added S2: Dose log Missed → Complete capped, silent | S2 |
| DV-228 | — | added S2: Undo bar says "Dose logged" after "Didn't take" | S2 |
| DV-229 | — | added S3: spec-audit reads an empty signature as signed; unsigned only warns | S3 |
| DV-230 | — | added S2: Edit shows an empty interval field with a grey "14" | S2 |
| DV-231 | — | added S1: in-app privacy policy omits food log, assistant, vial scan | S1 |
| DV-232 | — | added S3: week / whole-check food totals gone (OPEN-18 (9)) | S3 |
| DV-233 | — | added S4: error sheets — circle glyph and generic "Error" titles | S4 |
| DV-234 | — | added S4: Android DTWheel for curve date and backfill (:48) | S4 |
| DV-235 | — | added S4: "(s)" plurals | S4 |
| DV-236 | — | added S2: Restart "same vial" reactivates an empty vial | S2 |
| DV-237 | — | added S2: Premium empty lab journal shows "3 free scans" | S2 |
| DV-238 | — | added S2: Fold Journey food hero does not refresh | S2 |
| DV-239 | — | added S3: Android Apple glyph drawn, not Apple's artwork | S3 |
| DV-240 | — | added S3: protocol-assistant builder caps | S3 |
| DV-241 | — | added S2 (split from DV-119, DR-7): a cloud type that rejects a value leaves the row pending | S2 |
| Other DV rows | R1 text corrections | R2 fix / test / extension corrections (no status change): DV-012, 013, 014, 019, 031, 032, 034, 035, 037, 038, 040, 043, 045, 049, 057, 060, 063, 065, 067, 078, 081, 082, 083, 084, 095, 099, 101, 104, 108, 118, 119, 120, 158, 160, 164, 180, 186, 187, 193, 201, 203, 205, 207, 214, 216, 220 | unchanged severity |

## Round-2 findings not applied as written (and why)

1. **R2-06: DV-221 → OPEN-21.** Not applied. R2-03 showed the founder's go (decisions.md:552) and the applied migration (:556, header `:8-9`) define the tombstone's identity (type, colour and deleted_at included); decisions.md:540 is a coordinator line. → AD-67, DV-221 S3.
2. **R2-06: DV-126 → OPEN-21 (AD-49 is a coordinator line).** Not applied: AD-49 was re-cited to the founder's line :287 and the signed MB-11; only the eligibility clause is logic (DL-82).
3. **R2-06: DV-190 → OPEN-21.** Not applied: the principle ("not linked to your account" — copy must be true) is genuine logic (DL-84); the visible wording ×6 and the store labels are founder approvals, not a question.
4. **R2-06: DV-204 → OPEN-19 (b).** Superseded: OPEN-19 (b) was closed by logic (DL-76).
5. **R2-06 / R2-04: DV-053 "≥ 13 vials with 2, 4, 8 or 16 protocols".** Not used as the headline: it needs several active vials per protocol, reachable only through the DV-016 bug. Recomputed with the real `doseBudget` under one active vial per protocol; both assumption sets are stated in the row.
6. **R2-03 #37: "dose_logs does not send created_at either (9 tables)".** Rejected: `dose_logs` has no local `created_at` column (`lib/schema.js:75-86`), so there is nothing to send.
7. **R2-07 R2-33: "add a DV row for the missing interval presets (S3)".** Rejected: decisions.md:200 (2026-09-04) is superseded by the later binding prototype (:34, 2026-10-01; `prototype.html:1380`), which has no presets → AD-66. The real defect found next to it (the empty field on Edit, R2-03 #4) is DV-230.
8. **R2-05: "DL-10 → a new OPEN item".** Not needed: the founder's tap-time rule (decisions.md:153) answers it; DL-10 was rewritten to that rule.
9. **R2-04 / R2-02: INV-23 "notifyNothingLogged bypasses Silent" as a new row.** Not added as a new row: DV-048 already registers exactly this defect; it was extended with the evidence (`notificationActions.js:134-146`) and the TRD INV-23 crosswalk line.
10. **R2-06: DV-086 "arguably S1 (GDPR portability)".** Not applied: the data is not lost (it stays in the app and the cloud); an incomplete export is incomplete information shown to the user → S2 kept.
11. **R2-01: "items 1, 7, 9, 10 of OPEN-21 are DL-class".** Applied and, after checking each line, extended to items 3, 4, 5, 6 and 8 (all genuine logic or the founder's own BK-14 lifetime); item 2 is copy (Approvals) plus the founder's own "supplier" (AD-75).
12. **R2-01: missing questions — A-30 long-depot window, streak explainer text, 1.2.3 deferred food-nudge items, admin O-3…O-7.** Checked against the ledger; none is a genuine founder preference: A-30 → DL-78 (math); streak explainer → a wording approval; 1.2.3 (a), (b) → AD-73 (decisions.md:249), (c) → OPEN-07; admin O-3 → the founder's :389 ("include test accounts for now"), O-4 / O-5 / O-6 / O-7 → DL-79. The curve intro on every open (Conflict 40, second half) IS taste → added to OPEN-18 (4).
13. **R2-03 #32: "PRD-ACCT-7 cites OPEN-21 for a topic not in it — a question may be missing".** No question missing: a delete whose response is lost and is then reported as "offline" is a bug (DV-009, "lost-response half: No (bug)").
14. **R2-03 #5 (PRD-UI-4 "Cancel on top").** No DV: the coordinator line :547 misdescribes the built convention; the ledger's round-2 section records the built order (`ProtocolParts.js:56-57`). PRD fix in phase 2.
15. **R2-03 #15, #22, #23, #11, #43–#55 and R2-04 / R2-05 / R2-07 document-only findings** (PRD / TRD / flows / picture wording, citations, tables, line drift). Not register changes; they are phase-2 propagation work, driven by this map.
16. **R2-02: DL-75 "should be OPEN or a signed deviation".** Applied as OPEN-22 (a): the founder's words (grok/206) were about the formula inputs, the signed PO-12 text covers every daily burn — ambiguous, so his call.

## Not resolved here (owner noted)

- Propagation into `PRD.md`, `TRD.md`, `flows/`, `research/` and `docs/design/fluxos-dosetrace.html` — phase 2, from this map (R2-03, R2-04, R2-05, R2-07 list the exact lines).
- The TRD's P-scale vs the register's S-scale disagreements (R-05 / DV-183, R-32 / DV-184, R-38 / DV-008, R-41 / DV-003, R-50 / DV-070, R-51 / DV-209, R-53 / DV-210) — phase 2 aligns the TRD to the register.
- `docs/specs/fixes-1.2.5.md` FX-25 evidence cell and `docs/review/features.md` statuses (DV-176, DV-179) — spec / registry owners; not in this step's file list.
- Live-state claims (the `reality_checks` trigger, deployed function versions, the assistant's server parts per STATE.md:20) — not re-checked: no network in this step.

## Round 3 (2026-10-12) — additions after the final consistency pass

Source: `docs/product/verification/round3/R3-consistency.md`. These supersede the "Final counts" table above where they differ.

| ID | Final | Why |
|---|---|---|
| DL-99 | added, in force | A deliberate end (End protocol; "Protocol finished" once its picture is approved) is dated at the tap. It rested only on the coordinator lines decisions.md:504 / :535 (A-83 option a; grok/251 "decided by logic (not asked)"); genuine logic, so it is a DL. |
| DL-100 | added, in force | The onboarding stash rules PA-71…PA-73 (coordinator lines decisions.md:472-473) had no id; genuine logic (one account never receives another's data; merge, never clobber). |
| DL-101 | added, in force | The real birth year at the 18+ confirmation, PA-106…PA-108 (coordinator line decisions.md:496), had no id; genuine logic; the built year wheel is seen and signed with the premium-and-auth checklist (Approvals item 7). |
| DV-217 | unchanged (S4, bug) | Restart's intended order is the register's: the free limit first, before the duplicate warning and the container question (no founder line sets an order; asking a question whose answer is refused is the defect). PRD, flow 05 (§4, §5 diagram, §6.2, §7.2, new D05-17, F05-06) and the picture now say so. |
| AD-27 | wording only | One wording everywhere: "moved to OPEN-20 (b)" (not "withdrawn"). |

Counts after round 3: **23 OPEN open · 62 AD in force · 87 DL in force (DL-01…DL-101, 14 out) · 231 DV active (15 / 103 / 44 / 69) + 3 ops, 4 merged, 3 closed (DV-001…DV-241)**.
