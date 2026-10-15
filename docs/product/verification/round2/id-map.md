# Round 2 — id map (the single source for propagation)

- Written 2026-10-12 after verification round 2 (`R2-01…R2-07` in this folder). Canonical registers: `docs/product/OPEN-DECISIONS.md`, `docs/product/DIVERGENCES.md`, and the 2026-10-12 sections of `docs/decisions.md`.
- Every id whose status changed in round 1 or round 2 is listed once, with its final status. Phase-2 agents propagate exactly this into `PRD.md`, `TRD.md`, `flows/`, `research/` (citations only) and `docs/design/fluxos-dosetrace.html`.
- "R1" = verification round 1 (2026-10-12, `verification/01…07`); "R2" = round 2. Ids are never reused: a moved or withdrawn id keeps its row in its register, marked.

## Final counts (round 2; superseded — see the 2026-10-15 section at the end)

| Register | Count |
|---|---|
| OPEN questions open | **23** — OPEN-01 → AD-80…OPEN-11 → AD-96, OPEN-13 → AD-98…OPEN-24 → AD-79 |
| OPEN closed in round 2 | 1 whole (OPEN-12 → AD-68) + parts: OPEN-14 (a) → AD-69; OPEN-18 (5) → AD-60, (6), (7), (8); OPEN-19 (a) → AD-70, (b), (c); OPEN-20 (a) → AD-71; OPEN-21 (1) → DL-85…(10) |
| OPEN added in round 2 | OPEN-22 → AD-93 / AD-94, OPEN-23 → AD-97, OPEN-24 → AD-79; and items OPEN-18 (9) → AD-107, OPEN-21 (11) → AD-102 |
| AD in force | **62** (AD-01…AD-76 = 76 rows; 14 moved out: AD-04, 10, 12, 27, 28, 29, 35, 44, 45, 46, 50, 54, 56, 57) |
| DL in force | **84** (DL-01…DL-98 = 98 rows; 14 out: DL-01, 16, 24, 32, 50, 51, 66, 67, 68, 71, 72, 73, 74, 75) |
| DV active | **231** — S1 15 · S2 103 · S3 44 · S4 69 |
| DV by domain (S1/S2/S3/S4) | PROT 0/23/12/9 = 44 · TODAY 0/20/0/11 = 31 · REM 1/14/6/9 = 30 · FOOD 2/16/7/4 = 29 · CURVE 0/8/2/9 = 19 · BODY 1/9/5/3 = 18 · ACCT 4/9/5/11 = 29 · PLAT 7/4/7/5 = 23 · DOCS 0/0/0/8 = 8 |
| DV not counted | 3 ops items (DV-173, DV-188, DV-211) · 4 merged (DV-189, DV-206, DV-208, DV-212) · 3 closed in R1 (DV-100, DV-142, DV-194) |
| DV ids issued | DV-001…DV-241 |

## OPEN items of the round (one line each) — all closed 2026-10-15 (the AD after each arrow)

| ID | Topic | Portuguese question # |
|---|---|---|
| OPEN-16 → AD-77 / AD-78 | (a) scope of 1.3.0; (b) when the sync hardening ships (DV-182, 183, 209, 210, 222) | 1 |
| OPEN-24 → AD-79 | the 12 new screens / texts that logic decisions would add (pictures first, ×6) | 2 |
| OPEN-01 → AD-80 | correct the vial in use; recon "New vial" on the protocol page; the new rtu box date | 3 |
| OPEN-02 → AD-81 | low-supply warning for oral bottles | 4 |
| OPEN-03 → AD-82 | end of a fixed course of doses; bring back "total doses"? | 5 |
| OPEN-04 → AD-83 | automatic purge of Recently deleted after 1.3.0 | 6 |
| OPEN-05 → AD-84 | 3-protocol free limit on the server and after a lapse | 7 |
| OPEN-17 → AD-85 | Today tracker streak: days / doses / days with new words | 8 |
| OPEN-19 (d) → AD-86 | Undo bar after Skip | 9 |
| OPEN-06 → AD-87 | iPhone reminders without opening the app | 10 |
| OPEN-20 (b) → AD-88, (c) | OS permission after "Not now" (incl. the iPhone sync case); vial-expiry lead time and words | 11 |
| OPEN-07 → AD-90 | reality check finishes by itself; one start weight | 12 |
| OPEN-08 → AD-91 | does Stop erase earlier results | 13 |
| OPEN-09 → AD-92 | a check whose math gives no number | 14 |
| OPEN-22 (a) → AD-93, (b) | measured daily burn with an incomplete profile (PO-12); target ETA from an old weigh-in window | 15 |
| OPEN-10 → AD-95 | dose edit rewrites the past curve | 16 |
| OPEN-11 → AD-96 | skipped / missed doses and the curve | 17 |
| OPEN-23 → AD-97 | existing false Missed rows of real users | 18 |
| OPEN-13 → AD-98 | "Bloodwork due" alert | 19 |
| OPEN-14 (b) → AD-99, (c) | scans used this month; change a test's date | 20 |
| OPEN-15 → AD-101 | manage the subscription in Settings | 21 |
| OPEN-21 (11) → AD-102 | cross-account guard discards another account's unsynced data | 22 |
| OPEN-18 (1) → AD-103, (2), (3), (4), (9) | blend lines; "not recorded" mark; builder AI caps (food + assistant); ring + curve intro animation; week / whole-check food totals | 23 (a)–(e) |

## AD — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| AD-04 | → OPEN-21 (1) → DL-85 | → DL-85 | moved (DL-85) |
| AD-06 | — | rows: DV-030 → AD-70 | in force |
| AD-07 | narrowed to the protocol card; tracker → OPEN-17 → AD-85 | — | in force (narrowed) |
| AD-09 | narrowed to Restart (:614); copy → OPEN-21 (2) → AD-75 | copy → Approvals item 2; "supplier" → AD-75 | in force (narrowed) |
| AD-10 | → OPEN-21 (3) → DL-86 | → DL-86 | moved (DL-86) |
| AD-11 | narrowed: in 1.3.0 only; rules → OPEN-21 (4) → DL-87…DL-91 | rules → DL-87, DL-88, DL-89, DL-90, DL-91; A-85 / A-96 pictures → Approvals item 3; A-90 copy → Approvals item 2 | in force (narrowed) |
| AD-12 | corrected scope | → DL-25 (registry line, not a founder answer) | moved (DL-25) |
| AD-26 | label = new copy | re-cited to decisions.md:165 | in force |
| AD-27 | → OPEN-20 (b) → AD-88 | — | moved (OPEN-20 (b) → AD-88, open) |
| AD-28 | — | → DL-81 | moved (DL-81) |
| AD-29 | → OPEN-21 (5) → DL-92 | → DL-92 (+ OPEN-24 item 10 → AD-79 item 10) | moved (DL-92) |
| AD-30 | setup done, live | "the founder signed in on the Fold 2026-10-07" removed (unsourced) | in force |
| AD-35 | → OPEN-21 (6) → DL-97 | → DL-97 | moved (DL-97) |
| AD-43 | re-cited :300 | narrowed: the counsel flag citation (:388) dropped | in force (narrowed) |
| AD-44 | → OPEN-18 (4) → AD-106 | — (OPEN-18 (4) → AD-106 now also has the curve-intro half) | moved (OPEN-18 (4) → AD-106, open) |
| AD-45 | → DL-75 | → OPEN-22 (a) → AD-93 | moved (OPEN-22 (a) → AD-93, open) |
| AD-46 | → OPEN-21 (7) → DL-93 | → DL-93 | moved (DL-93) |
| AD-49 | marked coordinator | re-cited to founder :287 + signed MB-11; eligibility → DL-82 | in force (re-cited) |
| AD-50 | → OPEN-21 (8) → DL-94 | → DL-94 | moved (DL-94) |
| AD-51 | — | narrowed to the :388 items; A-95, ePrivacy, RevenueCat → DL-83 | in force (narrowed) |
| AD-52 | does not cover unsigned checklists | note: Conflicts 22/23/25/26/28 routed by the coordinator | in force |
| AD-54 | → OPEN-21 (9) → DL-95 | → DL-95 | moved (DL-95) |
| AD-56 | → OPEN-14 (a) → AD-69 | OPEN-14 (a) → AD-69 closed → AD-69 | moved (AD-69) |
| AD-57 | marked coordinator | → DL-84 (wording → Approvals) | moved (DL-84) |
| AD-60 | push at 3 → OPEN-18 (5) → AD-60 | push at 3 decided (signed FX-11 deviation, :148); OPEN-18 (5) → AD-60 closed | in force |
| AD-61 | narrowed; gym → OPEN-21 (10) → DL-96 | gym → DL-96 | in force (narrowed) |
| AD-65 | added (replaces DL-16) | narrowed to the Today card; My Protocols → DL-80 | in force (narrowed) |
| AD-66 | — | added: interval Every day / Custom N, no presets (:34 over :200) | in force |
| AD-67 | — | added: Delete forever identity per the founder-approved migration (:552, :556) | in force |
| AD-68 | — | added: manual lab entry in 1.3.0 (closes OPEN-12 → AD-68) | in force |
| AD-69 | — | added: no scan number in Premium strings; no Premium line; free number never shown to Premium (closes OPEN-14 (a) → AD-69) | in force |
| AD-70 | — | added: a late dose on the slot's own day belongs to that slot (F1, :140) (closes OPEN-19 (a) → AD-70) | in force |
| AD-71 | — | added: Settings red per signed SP-1 / RC-1 (closes OPEN-20 (a) → AD-71) | in force |
| AD-72 | — | added: the privacy policy names Anthropic and covers the AI food log (:330) | in force |
| AD-73 | — | added: one off switch for the 8 PM question, no backoff (:249) | in force |
| AD-74 | — | added: official Apple artwork on Android (:40) (closes OPEN-18 (6) → AD-74) | in force |
| AD-75 | — | added: "check with your supplier" stays (:186, AP-22) | in force |
| AD-76 | — | added: site questions never dropped for age (:379; was DL-01) | in force |

## DL — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| DL-01 | — | → AD-76 (founder line :379) | moved (AD-76) |
| DL-02 | — | wording of the report line → Approvals 2.3 | in force |
| DL-03 | narrowed: 365-day look-back; unit → OPEN-17 → AD-85 | — | in force (narrowed) |
| DL-06 | narrowed: one slot list; default → OPEN-19 (c) → DL-77 | default → DL-77 | in force |
| DL-08 | narrowed: Skip cancels reminders; Undo → OPEN-19 (d) → AD-86 | — | in force (narrowed) |
| DL-10 | "flow 03 §7.2 must match" | rewritten to the founder's tap-time rule (:153); message → OPEN-24 item 9 → AD-79 item 9 | in force (rewritten) |
| DL-12 | picture first | picture → OPEN-24 item 12 → AD-79 item 12 | in force |
| DL-14 | citation corrected | mirrored into decisions.md | in force |
| DL-16 | → AD-65 | — | moved (AD-65) |
| DL-19 | reason corrected | mirrored into decisions.md | in force |
| DL-22 | narrowed: recon New vial → OPEN-01 → AD-80 | narrowed: the rtu box date → OPEN-01 → AD-80 | in force (narrowed) |
| DL-24 | → OPEN-05 → AD-84 | — | withdrawn (OPEN-05 → AD-84) |
| DL-25 | — | absorbs AD-12 | in force |
| DL-26 | — | new texts → OPEN-24 item 7 → AD-79 item 7 | in force |
| DL-28 | rewritten | new row state → OPEN-24 item 8 → AD-79 item 8; deploy → Approvals 1 | in force |
| DL-30 | — | labels → OPEN-24 item 3 → AD-79 item 3 | in force |
| DL-32 | → OPEN-18 (1) → AD-103 | — | withdrawn (OPEN-18 (1) → AD-103) |
| DL-43 | — | chart → OPEN-24 item 4 → AD-79 item 4 | in force |
| DL-45 | narrowed: Silent; Settings → OPEN-20 (a) → AD-71 | Settings → AD-71 | in force (narrowed) |
| DL-48 | — | wording → Approvals 2.2 | in force |
| DL-49 | — | rows → OPEN-24 item 5 → AD-79 item 5 | in force |
| DL-50 | withdrawn (moot) | — | withdrawn |
| DL-51 | → OPEN-07 → AD-90 | — | withdrawn (OPEN-07 → AD-90) |
| DL-52 | — | reason rewritten (no longer cites the cross-account guard) | in force |
| DL-55 | — | Settings row → OPEN-24 item 1 → AD-79 item 1; server proof → DL-83 | in force |
| DL-58 | — | editor → OPEN-24 item 2 → AD-79 item 2 | in force |
| DL-60 | — | line + link → OPEN-24 item 6 → AD-79 item 6 | in force |
| DL-61 | — | wording → Approvals 2.14 | in force |
| DL-64 | — | production go → Approvals 1 | in force |
| DL-66 | → OPEN-18 (2) → AD-104 | — | withdrawn (OPEN-18 (2) → AD-104) |
| DL-67 | → OPEN-19 (b) → DL-76 | OPEN-19 (b) → DL-76 closed → DL-76 | withdrawn (DL-76) |
| DL-68 | — | → OPEN-22 (b) → AD-94 | moved (OPEN-22 (b) → AD-94) |
| DL-71 | — | → OPEN-23 → AD-97 (premise false) | moved (OPEN-23 → AD-97) |
| DL-72 | → OPEN-16 (b) → AD-77 | — | withdrawn (OPEN-16 (b) → AD-77) |
| DL-73 | withdrawn (false premise) | — | withdrawn |
| DL-74 | → OPEN-16 (b) → AD-77 | — | withdrawn (OPEN-16 (b) → AD-77) |
| DL-75 | added (replaced AD-45) | withdrawn → OPEN-22 (a) → AD-93 | withdrawn (OPEN-22 (a) → AD-93) |
| DL-76 | — | added: Mark-complete cap = doses per day on every path (closes OPEN-19 (b) → DL-76) | in force |
| DL-77 | — | added: 08:00 for no-time protocols everywhere (closes OPEN-19 (c) → DL-77) | in force |
| DL-78 | — | added: A-30 window max(180 d, 5 × t½) | in force |
| DL-79 | — | added: admin panel O-4 / O-5 / O-6 / O-7 | in force |
| DL-80 | — | added: My Protocols colouring = Today card (from AD-65) | in force |
| DL-81 | — | added: one privacy text (was AD-28) | in force |
| DL-82 | — | added: trial only when eligible (from AD-49) | in force |
| DL-83 | — | added: counsel list extended (A-95, ePrivacy, RevenueCat) | in force |
| DL-84 | — | added: "not linked to your account" (was AD-57) | in force |
| DL-85 | — | added (was AD-04, OPEN-21 (1) → DL-85) | in force |
| DL-86 | — | added (was AD-10, OPEN-21 (3) → DL-86) | in force |
| DL-87 | — | added: A-86 / A-86b (OPEN-21 (4) → DL-87…DL-91) | in force |
| DL-88 | — | added: A-87 / A-87b (OPEN-21 (4) → DL-87…DL-91) | in force |
| DL-89 | — | added: A-89 | in force |
| DL-90 | — | added: A-92 | in force |
| DL-91 | — | added: A-98 | in force |
| DL-92 | — | added (was AD-29, OPEN-21 (5) → DL-92) | in force |
| DL-93 | — | added (was AD-46, OPEN-21 (7) → DL-93) | in force |
| DL-94 | — | added (was AD-50, OPEN-21 (8) → DL-94) | in force |
| DL-95 | — | added (was AD-54, OPEN-21 (9) → DL-95) | in force |
| DL-96 | — | added (was AD-61 part, OPEN-21 (10) → DL-96) | in force |
| DL-97 | — | added (was AD-35, OPEN-21 (6) → DL-97) | in force |
| DL-98 | — | added: Fold left page follows food writes | in force |

## OPEN — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| OPEN-01 → AD-80 | premises fixed; recon part of DL-22 merged | premise (:614 Restart) fixed; DL-22's rtu box date merged | open |
| OPEN-02 → AD-81…OPEN-06 → AD-87, OPEN-08 → AD-91, OPEN-09 → AD-92, OPEN-11 → AD-96, OPEN-13 → AD-98 | premises fixed (some) | small premise fixes (OPEN-03 → AD-82 cites :620; OPEN-13 → AD-98 adds :139) | open |
| OPEN-07 → AD-90 | DL-51 merged | unsourced "A-118 texts approved 2026-10-09" removed | open |
| OPEN-10 → AD-95 | — | "the edit already writes only what changed" removed (no edit history) | open |
| OPEN-12 → AD-68 | A = default | closed → AD-68 | closed |
| OPEN-14 → AD-99 / AD-100 | (a) added | (a) closed → AD-69; (b) premise fixed (limit shown only before the first scan with values) | open: (b), (c) |
| OPEN-15 → AD-101 | premise fixed | "store rules 100%" over-extension removed | open |
| OPEN-16 → AD-77 / AD-78 | added | true counts; AD-32 stated next to the facts; what is lost; DV-222 added to (b); new-UI list moved to OPEN-24 → AD-79 | open |
| OPEN-17 → AD-85 | added | premise fixed (tracker already skips rest days); option C added | open |
| OPEN-18 → AD-103…AD-107 | added (items 1–8) | 5 → AD-60; 6 → AD-74; 7, 8 → Approvals 8, 7; 3 widened (assistant caps, DV-240); 4 widened (curve intro); 9 added (DV-232) | open: 1, 2, 3, 4, 9 |
| OPEN-19 → AD-86 | added (a)–(d) | (a) → AD-70; (b) → DL-76; (c) → DL-77 | open: (d) |
| OPEN-20 → AD-88 / AD-89 | added (a)–(c) | (a) → AD-71; (b) premise fixed (dialog once; SP-5 Android-only; iPhone sync case) | open: (b), (c) |
| OPEN-21 → AD-102 | added (items 1–10) | 1 → DL-85; 2 → Approvals 2 + AD-75; 3 → DL-86; 4 → DL-87, 88, 89, 90, 91 + Approvals 3; 5 → DL-92; 6 → DL-97; 7 → DL-93; 8 → DL-94; 9 → DL-95; 10 → DL-96; item 11 added (cross-account guard) | open: (11) |
| OPEN-22 → AD-93 / AD-94 | — | added (from AD-45 / DL-75 and DL-68) | open |
| OPEN-23 → AD-97 | — | added (from DL-71) | open |
| OPEN-24 → AD-79 | — | added (new-UI parts of DL-10, 12, 26, 28, 30, 43, 49, 55, 58, 60, 80, 92) | open |

## DV — status changes

| ID | R1 | R2 | Final |
|---|---|---|---|
| DV-001 | S1 → S2 (protocols fixed in e85519c); 8 tables | fix: send created_at on INSERT only, keep the earliest on pull | S2 |
| DV-002 | S1 → S2 | S2 → S1 (privacy by the legend); test asserts trigger.channelId | S1 |
| DV-003 | — | absorbs DV-206 | S1 |
| DV-004 | Stop with no open check | S1 → S2 (S1 if OPEN-08 → AD-91 = A); the confirm sheet stated | S2 |
| DV-005 | — | S1 → S2 (a derived estimate) | S2 |
| DV-007 | — | link: DL-55 · OPEN-24 item 1 → AD-79 item 1 · DL-83 | S1 |
| DV-009 | link OPEN-21 → AD-102 | link: DL-85; lost response No (bug) | S1 |
| DV-010 | — | fix corrected (pending patch, not a full merge); first-save upsert added | S1 |
| DV-011 | S1 → S4 (reconciliation) | S4 → S3; link DL-93 | S3 |
| DV-018 | link DL-16 → AD-65 | link AD-65 + DL-80 | S2 |
| DV-021, DV-025 | link OPEN-21 → AD-102 | link DL-88, DL-87 | S2 |
| DV-023 | link OPEN-21 → AD-102 | link: bug + Approvals wording | S2 |
| DV-027 | link DL-22 | link DL-22 · OPEN-01 → AD-80 (box date) | S2 |
| DV-028 | link DL-06 · OPEN-19 (c) → DL-77 | link DL-06 + DL-77; server mirror; "12:00 AM" | S2 |
| DV-030 | link OPEN-19 (a) → AD-70 | link AD-70 + DL-04 | S2 |
| DV-036 | link DL-10 | link DL-10 (rewritten) · OPEN-24 item 9 → AD-79 item 9; fix per the tap-time rule | S2 |
| DV-042 | link DL-45 · OPEN-20 (a) → AD-71 | narrowed to the Today / Silent half; Settings half = AD-71 | S2 |
| DV-048 | — | extended: INV-23 (`notificationActions.js:134-146`) | S2 |
| DV-053 | thresholds rewritten | thresholds recomputed from `doseBudget` (assumptions stated) | S2 |
| DV-054 | link OPEN-20 (b) → AD-88 | S2 → S3; premise (dialog once) | S3 |
| DV-056, DV-057 | link AD-12 + DL-25 | link DL-25 | S2 |
| DV-058, DV-066, DV-087, DV-113, DV-114, DV-146 | links DL-26, DL-28, DL-60, DL-58, OPEN-21 → AD-102, DL-30 | + OPEN-24 → AD-79 (the new UI part) | unchanged |
| DV-068 | — | absorbs DV-208 | S2 |
| DV-070 | — | S2 → S4 | S4 |
| DV-071 | — | absorbs DV-212; per-language stem test | S2 |
| DV-085 | link AD-28 | link DL-81 | S2 |
| DV-088 | SUSPECTED → CONFIRMED | absorbs DV-189; test depends on DV-119's snapshot | S2 |
| DV-090, DV-096, DV-105 | link OPEN-21 → AD-102 | AD-11 + pictures owed / DL-91 | S3 |
| DV-091 | link OPEN-21 → AD-102 | link DL-86 + wording | S3 |
| DV-107 | link OPEN-12 → AD-68 | link AD-68 | S3 |
| DV-110 | corrected | premise corrected; link OPEN-14 (b) → AD-99, (c) + AD-69 | S3 |
| DV-123 | — | link DL-19 + AD-66 | S4 |
| DV-125 | link OPEN-04 → AD-83 / OPEN-21 → AD-102 | link DL-94 · OPEN-04 → AD-83 | S4 |
| DV-126 | — | S4 → S2; link AD-49 + DL-82 | S2 |
| DV-127 | link OPEN-21 → AD-102 | link DL-97 | S4 |
| DV-132 | link OPEN-18 → AD-103…AD-107 | curve-intro half added | S4 |
| DV-135 | — | S4 → S2 | S2 |
| DV-149 | link DL-75 | S4 → S3; link OPEN-22 (a) → AD-93 | S3 |
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
| DV-192 | link OPEN-21 → AD-102 | narrowed ("supplier" stays, AD-75); two strings | S3 |
| DV-196 | added | test corrected (shared language helper) | S2 |
| DV-199, DV-200 | added | links: fixed with DV-027; AD-65 + DL-80; Today alert extension | S2 |
| DV-204 | added | narrowed to ended oral protocols; link DL-76 | S2 |
| DV-206 | added S1 | merged into DV-003 | merged |
| DV-208 | added S2 | merged into DV-068 | merged |
| DV-209, DV-210 | added S1 | link: bug, shipped per OPEN-16 (b) → AD-77; tests rewritten | S1 |
| DV-211 | added S2 | → ops item (dated console step) | OPS |
| DV-212 | added S2 | merged into DV-071 | merged |
| DV-213 | added | link OPEN-18 (3) → AD-105 | S3 |
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
| DV-232 | — | added S3: week / whole-check food totals gone (OPEN-18 (9) → AD-107) | S3 |
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

1. **R2-06: DV-221 → OPEN-21 → AD-102.** Not applied. R2-03 showed the founder's go (decisions.md:552) and the applied migration (:556, header `:8-9`) define the tombstone's identity (type, colour and deleted_at included); decisions.md:540 is a coordinator line. → AD-67, DV-221 S3.
2. **R2-06: DV-126 → OPEN-21 → AD-102 (AD-49 is a coordinator line).** Not applied: AD-49 was re-cited to the founder's line :287 and the signed MB-11; only the eligibility clause is logic (DL-82).
3. **R2-06: DV-190 → OPEN-21 → AD-102.** Not applied: the principle ("not linked to your account" — copy must be true) is genuine logic (DL-84); the visible wording ×6 and the store labels are founder approvals, not a question.
4. **R2-06: DV-204 → OPEN-19 (b) → DL-76.** Superseded: OPEN-19 (b) → DL-76 was closed by logic (DL-76).
5. **R2-06 / R2-04: DV-053 "≥ 13 vials with 2, 4, 8 or 16 protocols".** Not used as the headline: it needs several active vials per protocol, reachable only through the DV-016 bug. Recomputed with the real `doseBudget` under one active vial per protocol; both assumption sets are stated in the row.
6. **R2-03 #37: "dose_logs does not send created_at either (9 tables)".** Rejected: `dose_logs` has no local `created_at` column (`lib/schema.js:75-86`), so there is nothing to send.
7. **R2-07 R2-33: "add a DV row for the missing interval presets (S3)".** Rejected: decisions.md:200 (2026-09-04) is superseded by the later binding prototype (:34, 2026-10-01; `prototype.html:1380`), which has no presets → AD-66. The real defect found next to it (the empty field on Edit, R2-03 #4) is DV-230.
8. **R2-05: "DL-10 → a new OPEN item".** Not needed: the founder's tap-time rule (decisions.md:153) answers it; DL-10 was rewritten to that rule.
9. **R2-04 / R2-02: INV-23 "notifyNothingLogged bypasses Silent" as a new row.** Not added as a new row: DV-048 already registers exactly this defect; it was extended with the evidence (`notificationActions.js:134-146`) and the TRD INV-23 crosswalk line.
10. **R2-06: DV-086 "arguably S1 (GDPR portability)".** Not applied: the data is not lost (it stays in the app and the cloud); an incomplete export is incomplete information shown to the user → S2 kept.
11. **R2-01: "items 1, 7, 9, 10 of OPEN-21 → AD-102 are DL-class".** Applied and, after checking each line, extended to items 3, 4, 5, 6 and 8 (all genuine logic or the founder's own BK-14 lifetime); item 2 is copy (Approvals) plus the founder's own "supplier" (AD-75).
12. **R2-01: missing questions — A-30 long-depot window, streak explainer text, 1.2.3 deferred food-nudge items, admin O-3…O-7.** Checked against the ledger; none is a genuine founder preference: A-30 → DL-78 (math); streak explainer → a wording approval; 1.2.3 (a), (b) → AD-73 (decisions.md:249), (c) → OPEN-07 → AD-90; admin O-3 → the founder's :389 ("include test accounts for now"), O-4 / O-5 / O-6 / O-7 → DL-79. The curve intro on every open (Conflict 40, second half) IS taste → added to OPEN-18 (4) → AD-106.
13. **R2-03 #32: "PRD-ACCT-7 cites OPEN-21 → AD-102 for a topic not in it — a question may be missing".** No question missing: a delete whose response is lost and is then reported as "offline" is a bug (DV-009, "lost-response half: No (bug)").
14. **R2-03 #5 (PRD-UI-4 "Cancel on top").** No DV: the coordinator line :547 misdescribes the built convention; the ledger's round-2 section records the built order (`ProtocolParts.js:56-57`). PRD fix in phase 2.
15. **R2-03 #15, #22, #23, #11, #43–#55 and R2-04 / R2-05 / R2-07 document-only findings** (PRD / TRD / flows / picture wording, citations, tables, line drift). Not register changes; they are phase-2 propagation work, driven by this map.
16. **R2-02: DL-75 "should be OPEN or a signed deviation".** Applied as OPEN-22 (a) → AD-93: the founder's words (grok/206) were about the formula inputs, the signed PO-12 text covers every daily burn — ambiguous, so his call.

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
| AD-27 | wording only | One wording everywhere: "moved to OPEN-20 (b) → AD-88" (not "withdrawn"). |

Counts after round 3: **23 OPEN open · 62 AD in force · 87 DL in force (DL-01…DL-101, 14 out) · 231 DV active (15 / 103 / 44 / 69) + 3 ops, 4 merged, 3 closed (DV-001…DV-241)**.

## 2026-10-15 — the founder's answers (AD-77…AD-109, DL-102…DL-108)

Sources: docs/decisions.md, the three 2026-10-15 sections — "founder: one active device per account" (question 1 (b); DL-102…DL-108 from the A-119 journey review), "founder: 'siga as recomendações'" (all 23 questions + A-119 screen 3) and "founder: signing out is never blocked; say the truth" (amends AD-77 item 6 and DL-107). The AD numbers are assigned in OPEN-DECISIONS.md (the ledger names the questions, Q1…Q23). These supersede every count above.

### Final counts (recounted by script 2026-10-15)

| Register | Count |
|---|---|
| OPEN questions open | **0** — every question of the round answered 2026-10-15; ids kept, never reused |
| AD in force | **94** (AD-01…AD-109 = 109 rows; 15 out: the 14 moved in rounds 1–2 and AD-108, superseded the same day by AD-109) |
| DL in force | **94** (DL-01…DL-108 = 108 rows; 14 out; DL-107 amended by AD-109) |
| DV active | **229** — S1 17 · S2 102 · S3 44 · S4 66 |
| DV by domain (S1/S2/S3/S4) | PROT 0/23/11/9 = 43 · TODAY 0/20/1/11 = 32 · REM 1/14/6/8 = 29 · FOOD 3/15/7/3 = 28 · CURVE 0/8/2/8 = 18 · BODY 1/9/5/3 = 18 · ACCT 5/9/5/11 = 30 · PLAT 7/4/7/5 = 23 · DOCS 0/0/0/8 = 8 |
| DV targets (AD-78) | 1.3.0: 203 (S1 17, S2 101, S3 41, S4 44) · 1.3.1: 24 (S3 2, S4 22) · split 1.3.0 / 1.3.1: 2 (DV-072, DV-097) |
| DV not counted | 3 ops items · 4 merged · 3 closed in R1 · 4 closed 2026-10-15 (DV-095, DV-144, DV-151, DV-156) |
| DV ids issued | DV-001…DV-243 |
| PRD | 471 requirements (PRD-ACCT-9…15, PRD-DATA-8 added) · 235 gap rows (G-234 = DV-242, G-235 = DV-243) |
| TRD | TR-SYNC-1…16 · INV-01…INV-53 · R-01…R-56 |

### Ids whose status changed on 2026-10-15

| ID | Final | Why |
|---|---|---|
| OPEN-16 (b) | → AD-77 | one active device per account (A-119) |
| OPEN-16 (a) | → AD-78 | 1.3.0 scope = B; every DV row has a Target |
| OPEN-24 | → AD-79 | all twelve go ahead, each from its picture; item 10 = the gates get the Settings "Sign out anyway" behind the AD-109 sheet |
| OPEN-01 · OPEN-02 · OPEN-03 · OPEN-04 · OPEN-05 | → AD-80 · AD-81 · AD-82 · AD-83 · AD-84 | Q3 A · Q4 A · Q5 B · Q6 A · Q7 A (as built) |
| OPEN-17 · OPEN-19 (d) · OPEN-06 | → AD-85 · AD-86 · AD-87 | Q8 C · Q9 A · Q10 A now, B in 1.3.1 |
| OPEN-20 (b) · OPEN-20 (c) | → AD-88 · AD-89 | Q11 (a) A · Q11 (b) A (as built) |
| OPEN-07 · OPEN-08 · OPEN-09 | → AD-90 · AD-91 · AD-92 | Q12 C · Q13 A · Q14 A |
| OPEN-22 (a) · OPEN-22 (b) | → AD-93 · AD-94 | Q15 (a) A (PO-12 amended, signature owed) · Q15 (b) A (as built) |
| OPEN-10 · OPEN-11 · OPEN-23 · OPEN-13 | → AD-95 · AD-96 · AD-97 · AD-98 | Q16 B (A interim) · Q17 C now, B 1.3.1 · Q18 B · Q19 B |
| OPEN-14 (b) · OPEN-14 (c) · OPEN-15 · OPEN-21 (11) | → AD-99 · AD-100 · AD-101 · AD-102 | Q20 (a), (b): 1.3.1 · Q21 A · Q22 B |
| OPEN-18 (1) · (2) · (3) · (4) · (9) | → AD-103 · AD-104 · AD-105 · AD-106 · AD-107 | Q23 (a) keep · (b) retire, FL-3 amended · (c) keep with true messages · (d) · (e) change |
| AD-108 | superseded by AD-109 | A-119 screen 3 = "OK" only, moot once sign-out is never blocked |
| AD-109 | added, in force | sign-out is never blocked: one true sheet with "Sign out anyway" and Stay; replaces AD-77 item 6 and the blocking part of DL-107; amends the words of decisions.md:309 |
| DL-102…DL-108 | added, in force | the A-119 journey review (OD-14…OD-18 and the rewritten OD rows); DL-107 amended by AD-109 |
| DV-182, DV-183, DV-209, DV-222 | founder AD-77; fix A-119; test = the OD-8 two-device harness tests | one writer at a time instead of tombstones / counter events / pull cursors |
| DV-210 | No (bug) | keyset paging still needed with one device |
| DV-004 | S2 → S1 | its own rule: with AD-91 a Stop that wipes past results is data loss |
| DV-095 · DV-144 · DV-151 · DV-156 | closed | as built (AD-84) · answered (AD-90) · mark retired, FL-3 signature owed (AD-104) · as built, pictures owed (AD-103) |
| DV-242 · DV-243 | added (S1 ACCT · S3 TODAY) | AD-102 cross-account warning · AD-97 "There was no dose" |
| DV-114 | AD-79 item 10 + AD-109 | the gates get the same "Sign out anyway" as Settings |
| every DV row | Target column added | AD-78 |
| TR-SYNC-2, -3, -12, -13 | superseded for DV-182 / 183 / 209 / 222 | AD-77; TR-SYNC-14…16 added (active-device record, guard, replaced-device handling); TR-SYNC-11 stays |
| INV-52, INV-53 · R-55, R-56 | added | wipe only on a confirmed answer; one writer · DV-242, DV-243 |
| PRD-ACCT-9…15, PRD-DATA-8 · G-234, G-235 | added | A-119 behaviour (OD-1…OD-18); DV-242, DV-243 |
| Flows | D01-13, D01-14, D12-16, D12-17, D12-18 added; F01-27, F01-28, F12-14…F12-17 added | AD-77, AD-102, AD-109 |

### Not resolved here (owner noted)

- `docs/review/features.md`: writing every row's target build (AD-78) and closing registry A-24 (AD-90) — the registry owner.
- `docs/decisions.md` names the questions (Q1…Q23) and the amendment, not the AD numbers; the numbers live in OPEN-DECISIONS.md.
- The changed mermaid blocks were checked by a static lint only (no network to load mermaid 10.9.1).
- TRD cites INV-19 (since before 2026-10-15) without a row that defines it.
