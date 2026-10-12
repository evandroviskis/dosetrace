# Round 2 — R2-03: PRD.md (round-1 corrections and a fresh-eyes pass)

- **What was checked:** `docs/product/PRD.md` at HEAD 19e4ebc (branch `redesign/graduated`). This is a read-only check; only this file was written. No code changed between the PRD's stated HEAD 976ef9e and 19e4ebc (`git diff --stat 976ef9e HEAD -- . ':!docs'` is empty), so every code line cited below is current.
- **Authority, in order:** founder lines in `docs/decisions.md`, then signed rows in `docs/specs/*.md`, then `docs/design/prototype.html`, then the code. Coordinator, "by logic" and council-synthesis blocks in the ledger are **not** founder answers. These include decisions.md:445-461, :469-484, :485-509, :519-530, :533-548, :580-583 and :644 onward.
- **Method:**
  - Five independent verifiers each took one slice: report 01, reports 02+03, reports 04+05, reports 06+07, and the fresh-eyes sets. Their working files are in the session scratchpad (`r2-A1…A4`, `r2-B1…B3`).
  - The coordinator re-read the code for every S1/S2 finding below and did the gap-row, register-id and mechanical checks itself.
  - Verdicts were re-checked in code. The round-1 reports were not trusted.
- **Tags:**
  - **R1W** means round 1 itself was wrong: its correction was false, or the text it changed was right.
  - Severity: S1 = data loss, privacy, a regulatory or money rule, or a false user-visible claim; S2 = a builder would build the wrong thing; S3 = a wrong pointer or citation (doc hygiene).

## Summary counts

### A. Correction check (round-1 rows against the corrected PRD)

The scope was every WRONG row in 01–06, all 58 finding rows of 07, and a sample of 78 PARTLY rows spread across 01–06. The PARTLY sample is 18 rows from 01, 26 from 02/03, 23 from 04/05 and 11 from 06.

| Slice | Items | APPLIED-CORRECTLY | APPLIED-BUT-STILL-WRONG | NOT-APPLIED | OVER-CORRECTED | not in PRD (claim lives in flow/TRD/register only) |
|---|---|---|---|---|---|---|
| 01 protocols (8 WRONG + summary + NEW-A…D + 18 PARTLY) | 30 | 25 | 4 | 0 | 0 | 1 |
| 02 + 03 (14 WRONG + new-defect lists + 26 PARTLY) | 47 | 37 | 5 | 0 | 0 | 5 |
| 04 + 05 (20 WRONG + §7/§8 + "most important" + 23 PARTLY) | 56 | 43 | 7 | 0 | 0 | 6 |
| 06 + 07 (11 WRONG + 58 findings X/D/A/Q/P/K + 11 PARTLY) | 80 | 47 | 9 | 3 | 1 | 20 |
| Coordinator (register-id cites, caution list, G-151 authority) | 5 | 0 | 5 | 0 | 0 | 0 |
| **Total** | **218** | **152** | **30** | **3** | **1** | **32** |

R1W (round 1 itself wrong) occurred in 8 cases: PRD-PROT-19; the scan-limit premise (05 Q14 / PRD-AI-13); the 06 S3-31 vial-resurrection claim; the 06 D2-41 claim; PRD-PROT-105's authority (decisions.md:540 is a coordinator line); and three detail-only cases (02 P11, 05 #47, 05 #55).

### B. Fresh-eyes check (requirements no round-1 report cited)

There are 100 ids that no round-1 report cites, not even through a range. All 100 were checked. A further 38 ids had been covered by round 1 only through a range heading (for example "PRD-AUTH-1…6"); those were also checked row by row.

| Set | Ids | CORRECT | PARTLY | WRONG | UNVERIFIABLE |
|---|---|---|---|---|---|
| §4.12 AI-1…13, AI-30…39; §4.13 DATA-* (40) | 40 | 22 | 18 | 0 | 0 |
| §4.5/4.6/4.8 FOOD/PROG/RC/BODY-80 (37) | 37 | 31 | 6 | 0 | 0 |
| §4.11/4.14 FOLD-1…11, UI-1…12 (23) | 23 | 19 | 3 | 1 | 0 |
| Range-only AUTH/ONB/PREM/SET/GATE (38) | 38 | 32 | 6 | 0 | 0 |
| **Total** | **138** | **104** | **33** | **1** | **0** |

Chapters 4.2, 4.3, 4.4, 4.7 and 4.10 have no uncited ids: every id there is cited by round 1 explicitly. Their fresh coverage comes from the contracts, loops and gap rows checked in A.

### C. Gap rows G-138…G-155 and their DV column

| Result | Count |
|---|---|
| Defect confirmed in code (four with line drift of 2–10 lines) | 16 |
| PARTLY (overstated) | 2 (G-151, G-155) |
| Not a defect | 0 |
| DV id exists | 18/18 |
| DV row describes the same defect | 18/18, but DV-221's severity and authority and DV-182's vial clause are overstated |
| Cited PRD requirement exists and fits | 18/18 |
| Source row exists in the cited round-1 report | 18/18 |

### D. OPEN / AD / DL citations

- **OPEN cites:** all 20 OPEN ids the PRD cites exist, and all ~95 occurrences were read in context. Two problems:
  - OPEN-16 (the 1.3.0 scope and the sync hardening) is never cited.
  - PRD-ACCT-7 cites OPEN-21 for a topic that is not among OPEN-21's ten items.
- **AD/DL cites:** the PRD cites 69 distinct AD/DL ids, and 58 of them were read in context. Every id exists. 49 are cited for the right topic. 9 are stale against the 2026-10-12 reclassification: AD-44, AD-45, AD-62 (wording), DL-08, DL-28, DL-73, AD-12 (should be DL-25), DL-01, and OPEN-05 doubled where DL-24 was swapped out.

### E. Mechanical checks

- Every backticked file name in the PRD resolves to a file. Short names are unique, except 01–04, which exist both in `research/` and in `verification/`.
- All 209 `file:line` cites fall within their files.
- Spot checks of five cites were accurate: TodayScreen.js:1956-1957, BodyScreen.js:1067, CalculatorSection.js:220, SettingsScreen.js:642, TodayScreen.js:710-717.

---

## Every non-correct finding

Ordered by severity, then by PRD line. "A" rows come from the correction check, "B" rows from the fresh-eyes check, and "C" rows from the coordinator's gap and citation checks.

### S1

| # | PRD line | Quoted text | Verdict | Evidence | Correct statement |
|---|---|---|---|---|---|
| 1 | 1096 (PRD-AI-6) | "Anthropic is named as a sub-processor in the privacy policy, which covers the AI food log and the assistant" | B · PARTLY | The in-app policy shown by Settings (`settings_privacy_body`, translations.js:649 ×6, "Last updated: April 2026") names only "a lab report or vaccine card" as going to Anthropic. Only the web text (web/privacy-policy.html:60-61) covers food, the assistant and the vial label. | "The web policy names Anthropic for every AI feature; the in-app policy (×6) still covers labs and vaccine cards only → GAP G-136 / DV-085 (A-117)." This is a false privacy statement that users read in the app. |
| 2 | 1128-1131, §6 (PRD-DATA-1/-3/-4; §6.9) | No G row exists for DV-209 or DV-210; PRD-DATA-1 describes sync with no caveat | A · NOT IN PRD (an omission of an S1 register row) | DIVERGENCES.md:88-89, both S1. DV-210: `fetchSince` pages by offset, so a row can be skipped for good. DV-209: the watermark uses `now()` at transaction start, so a late-committing row is never fetched. | Add G rows pointing to DV-209 and DV-210 under PRD-DATA-1/-3. |
| 3 | 1672 (G-56) | "saving 'Fix this entry' with every item cleared also deletes the entry without asking … DV-003" | C · APPLIED-BUT-STILL-WRONG (pointer) | DV-206 (DIVERGENCES.md:87, S1) is the dedicated row for this case, and no PRD row cites it. | G-56's DV column: "DV-003, DV-206". |

### S2

| # | PRD line | Quoted text | Verdict | Evidence | Correct statement |
|---|---|---|---|---|---|
| 4 | 588 (PRD-PROT-19) | "`PRESET_INTERVALS` only decides whether a stored value opens Custom; the code differs from :200 and no later ledger line replaces it" | A · APPLIED-BUT-STILL-WRONG · R1W | Custom shows for any interval ≠ 1 (ProtocolsScreen.js:3070, :3076). PRESET_INTERVALS only decides whether the N field is **pre-filled** (protocolForm.js:16, :94): for intervals 3, 7 and 14 the field is empty, while 21 gives "21". decisions.md:34 (2026-10-01) makes the prototype binding over :200, and the prototype has Every day / Custom with a typed N (prototype.html:1380). | "Every day / Custom + typed N (as the binding prototype; :200's presets superseded by :34). Defect: editing a protocol whose interval is 2–7, 10 or 14 opens Custom with an EMPTY field showing the grey placeholder 14 (`formFromProtocol`, protocolForm.js:94) → new GAP/DV." This is a user-visible defect that no register has. |
| 5 | 1153 (PRD-UI-4) | "DTSheet button order: Cancel on top with two buttons, app-wide. [D 2026-10-04 #547]" | B · WRONG | ProtocolParts.js:55-57: two short buttons sit side by side with Cancel on the left; stacked buttons are reversed, so the action is on top and Cancel below. decisions.md:547 sits in the coordinator block :533-548. | "Two short buttons side by side (Cancel left); long or 3+ buttons stacked with the action on top, Cancel last (as built) [coordinator :547, 'order unchanged']." As written, a builder would flip every sheet in the app. |
| 6 | 1155 (PRD-UI-6) | "error sheets use the warning triangle" (stated as built) | B · PARTLY | The paywall, sign-in, reset-password, onboarding, email-link and 18+ sheets use the circle `alert` glyph: paywallPlans.js:149-154, AuthScreen.js:179, ResetPasswordScreen.js:43,55, OnboardingFlowScreen.js:277,298, App.js:258,266, AgeConfirmScreen.js:60. Founder line: decisions.md:64. | "…→ GAP (new): the auth/paywall/onboarding/18+ error sheets use the circle glyph." |
| 7 | 768 (PRD-FOOD-20) | Totals "per day, per week and for the whole window" | B · PARTLY | Only daily totals are shown. `nutri_tot_week` / `nutri_tot_window` (translations.js:221-222) have no caller, and the totals fold was replaced by Journey part 8 (NutritionLogger.js:6-9; prototype.html:1712). The founder line is decisions.md:250 (FL-24). | Add a GAP/DV, or a founder conflict between :250 and the part-8 replacement. |
| 8 | 783, 1675 (PRD-FOOD-51, G-59) | "the proposed fix 'retry after local midnight' (DL-28) cannot work … it needs re-dating with the user, a server exemption … or a permanent 'not read' state" | A · APPLIED-BUT-STILL-WRONG | OPEN-DECISIONS DL-28 row (:583) was rewritten: count by the request's local day, mark "not read yet — daily limit reached", retry the next day. "Pending forever" is also overstated: catch-up re-parses only the last 60 days (foodLogActions.js, `localDaysAgoISO(60)`). | Cite the rewritten DL-28 as the fix and drop the competing remedies. |
| 9 | 168, 1105, 1586 (§1.5.1, PRD-AI-13, C-36) | "The app shows free users the limit ('3 free scans a month…') but never how many scans are used or left" | A · APPLIED-BUT-STILL-WRONG · R1W (partial) | BodyScreen.js:1105-1107: the free card shows the limit only while `markerSeries.length === 0`. :1115-1120: the empty state shows only with no rows, and is shown to Premium users too. After the first scan with markers, My Body no longer shows the limit; it remains only on the paywall (paywallPlans.js:173) and in the FAQ. | "Free users see the limit only before their first scan with markers (empty state, free card), then only on the paywall/FAQ; used/left is never shown; the empty-state line also shows to Premium users." The founder's PT question 18(b) rests on the old premise. |
| 10 | 1215, 528 (C-2, PRD-DOSE-22) | "no Undo bar after a Skip on Today (DL-08)"; "DL-08 must say whether that Undo stays" | A · APPLIED-BUT-STILL-WRONG | OPEN-DECISIONS.md:101-115 moved the Undo bar to OPEN-19 (d), recommendation A = add one. The "Didn't take" Undo exists (TodayScreen.js:710-717). | "…Undo after Skip / 'Didn't take' → OPEN-19 (d)." As written, a builder could remove the existing Undo. |
| 11 | 1119 (PRD-AI-38) | "Offline or AI error: 'The AI isn't available right now…'" | A + B · APPLIED-BUT-STILL-WRONG | assistantErrors.js:23: offline maps to `ap_err_offline`, "I can't connect right now. You can continue in the form — everything you answered is kept." (translations.js:2287). `ap_err_service` (:2288) is used for the other errors. | Give the two strings separately. |
| 12 | 1117 (PRD-AI-36) | Supplier wording treated as an unapplied decision → GAP | B · PARTLY · R1W (authority) | Founder line :186 and signed AP-22 both say "check with your supplier"; the app matches them (`ap_fit_fact_powder`, translations.js:2197). The change to "product label or manufacturer" is coordinator line :544, now OPEN-21 (2). | "As built = founder :186 / AP-22; the wording change waits on OPEN-21 (2)." |
| 13 | 1118 (PRD-AI-37) | "At the limit it says … ('in the last 7 days')" | B · PARTLY | `ap_err_quota` says "this week" plus the reset date (translations.js:2289). The PRD omits the server limits of 40 answers per conversation, a 24-hour conversation life and 200 answers per rolling 24 h (budget.ts:10-12), which surface as "AI isn't available". | State the built copy and all four limits; the wording change → OPEN-21 (2). |
| 14 | 1120 (PRD-AI-39) | Reads as if the assistant's server parts are deployed | B · PARTLY (part UNVERIFIABLE) | STATE.md:20 says "edge function + migration NOT deployed"; the AP-18 evidence says "DEPLOY STILL NEEDED"; A-91's live 429 is still owed. | "Deploy pending per STATE.md:20 (live state not provable from the repo); until deployed every AI door says the AI isn't available." |
| 15 | 1135 (PRD-DATA-10) | "Encrypted in transit and at rest" | B · PARTLY | Both policies say "in transit" only. The web policy also presents sync as optional ("if you create an account" / "opt into cloud sync"). | Align the claim with the policies, or add a GAP. |
| 16 | 1140, 632, 1791 (PRD-DATA-21, PRD-PROT-105, G-151 / DV-221) | "the cloud row keeps only its identity (ledger #540: 'only id, user_id, purged_at and timestamps stay' …)"; DV-221 S1 | C + B · APPLIED-BUT-STILL-WRONG · R1W (authority) | decisions.md:540 is inside the coordinator block :533-548. The founder's go is :556 ("blanked to its identity … (deleted_at kept)", "3 sim"), and the migration defines identity as id, user_id, type, colour, timestamps, deleted_at and purged_at (20261004010000_protocol_delete_guard.sql:8-9). Only interval_days, doses_per_day, concentration_unit and divisible are genuinely left (:31-41). PRD-DATA-21 has no GAP marker. | "Purge keeps identity (incl. type, colour, deleted_at — founder-approved migration :556); defect: 4 dosing columns not blanked → G-151 (S2/S3, not S1)." |
| 17 | 48 (§0.2 caution) | Lists only decisions.md:429, :503-506, :519-530, :542-545, :599 as coordinator lines | C · APPLIED-BUT-STILL-WRONG (07 A-07 partly applied) | The PRD also tags `[D …]` on lines from coordinator blocks the caution leaves out: #448, #451, #456, #472-478 (:445-461, :469-484); #487-#494 (:485-492); #509 (:508); #535-#541 and #547 (:533-548). Affected rows include PRD-ONB-13, AUTH-13/14, PREM-7, PROT-62/100-106, AI-4/5/32-34, DATA-20/21 and UI-4. | List the whole blocks: :445-461, :469-484, :485-509, :519-530, :533-548, :580-583, :599, :644+. |
| 18 | 604, 628, 633, 1139 (PRD-PROT-62, -101, -106, PRD-DATA-20) | Stated as settled `[D …]` requirements | A · APPLIED-BUT-STILL-WRONG | Their topics are AD-10, the AD-09 copy, AD-50 and AD-46, now OPEN-21 (3), (2), (8) and (7). Line 6 says "their topics were corrected in the text"; that holds only for AD-29 (:428) and AD-04 (:439). | Add "→ OPEN-21 (n)" to each. |
| 19 | 642, 309 (PRD-VIAL-20, L-2) | Supply push at 3 doses left, cited as #148 only | A · NOT-APPLIED | decisions.md:432 (Conflict 31): the change from 2 to 3 has no dated approval. The register sends it to OPEN-18 (5). | "…→ OPEN-18 (5)". |
| 20 | 646, 696 (PRD-VIAL-31, PRD-REM-40) | "7 days before and on the day" as a settled requirement | A · NOT-APPLIED | features.md A-45 says "Founder to confirm the lead time and words"; decisions.md:417 agrees. The question is OPEN-20 (c). | "…→ OPEN-20 (c)". |
| 21 | 1130, 1795 (PRD-DATA-3, G-155 / DV-182) | "for `dose_logs` and `vials` that device's later edit re-inserts the row" | C + A · OVER-CORRECTED · R1W | Vials are deleted only by Delete forever (protocolEnd.js:86, :212), and the cloud refuses a vial written onto a purged protocol (`vials_refuse_purged_parent`, 20261004000000_protocol_purged_at.sql:63-67). A deleted dose does come back (database.js:340 → syncCore.js:696 `reinsertRow`). The re-insert path also re-inserts a weigh-in (`calc_snapshots`, syncCore.js:700-703, A-92 by design), which neither row names. | "…for `dose_logs` (and, by design, a weigh-in edited on B) …"; drop "vials" unless a test with the server triggers proves it. PRD should cite OPEN-16 (b) as where DV-182's fix now waits. |
| 22 | 1129 (PRD-DATA-2), 1128-1132 (DATA-1/-5) | "Exceptions today: favourites and labels …" | A + B · APPLIED-BUT-STILL-WRONG | The profile (sex, activity), notification preferences, the food-reminder preference and the analytics switch are also stored only in `user_metadata` (CalculatorSection.js:411, :462; NutritionLogger.js:101); PRD-SET-41 (:1023) says the same. Favourites and labels rewrite the whole array from the local copy, which clobbers another device's change and contradicts DATA-5. | Complete the exceptions list and add the clobber case. |
| 23 | 1131 (PRD-DATA-4) | "No device removes data because it is absent from the cloud" | A · APPLIED-BUT-STILL-WRONG (incidental) | syncCore.js:817 `NO_ABSENCE_DELETE` exempts only protocols, dose_logs and vials. The full-import absence delete still runs for the other 8 tables (:832-845). decisions.md:520 scopes the rule to those three tables. | "…for protocols, dose logs and vials; the other 8 tables still absence-delete on a full import (empty device only)." |
| 24 | 1154 (PRD-UI-5) | "Android keeps native dialogs" | B · PARTLY | On Android the curve date (SerumCurveScreen.js:1081) and the backfill date (CalculatorSection.js:1807-1810) use DTWheel, as do the lab, vaccine and 18+ wheels. Founder line decisions.md:48 names curve and backfill among the native-on-Android cases. | GAP (new). |

### S3

| # | PRD line | Quoted text | Verdict | Evidence | Correct statement |
|---|---|---|---|---|---|
| 25 | 297 (L-1 step 3) | "only a slot of a previous day still inside slot + 12 h is logged at the slot time" | A · APPLIED-BUT-STILL-WRONG | markTaken.js:204-208 `notificationTakeTarget`: any non-snoozed previous-day copy is logged at its slot. PRD-REM-30 (:690) is right, so the two lines disagree. | "…a previous day's slot is logged at the slot, except a snoozed copy tapped > 12 h after its slot (tap time)." |
| 26 | 478, 1609 (PRD-TODAY-31, G-1) | The late-dose day rule is described as a bug with no founder marker | A · APPLIED-BUT-STILL-WRONG | The question is now OPEN-19 (a) (OPEN-DECISIONS.md:104, :109). | Add "→ OPEN-19 (a)". |
| 27 | 477, 914 (PRD-TODAY-30, PRD-CURVE-25) | "→ AD-44, AD-52 … either the founder closes Conflict 40 or it becomes an OPEN question" | A · APPLIED-BUT-STILL-WRONG | AD-44 moved to OPEN-18 (4) (OPEN-DECISIONS.md:310). Line 6's list of replaced ids omits AD-44. | "→ OPEN-18 (4); AD-52 for the gauge visual". |
| 28 | 701 (PRD-REM-52) | "`[logic … = AD-12]`" | A · APPLIED-BUT-STILL-WRONG | OPEN-DECISIONS AD-12: the day-21 notification part is DL-25. | "= DL-25". |
| 29 | 817 (PRD-PROG-14) | "→ AD-45 (contested …)" | A · APPLIED-BUT-STILL-WRONG | AD-45 became DL-75 (measured burn shows whenever a measured result exists). Neither DL-75 nor DV-149 appears in the PRD. | State the DL-75 requirement → GAP (DV-149). |
| 30 | 832 (PRD-PROG-43) | "DL-73 … re-decide or drop" | A · APPLIED-BUT-STILL-WRONG | DL-73 is withdrawn (OPEN-DECISIONS.md:337). | "(DL-73 withdrawn)". |
| 31 | 518, 1266 (DL-01) | "verification 07 D-07 re-classifies it as already decided (AD, :379)" | A · APPLIED-BUT-STILL-WRONG | The register and decisions.md:646 still carry DL-01, and the reclassification table has no DL-01 row. | Pick one status in both documents. |
| 32 | 438 (PRD-ACCT-7) | "[logic: P-14 = OPEN-21]" | C · APPLIED-BUT-STILL-WRONG | None of OPEN-21's ten items covers the lost delete response being reported as "offline". This is a mechanical swap from the earlier (also wrong) AD-04. | "[logic: P-14] → GAP G-116 (DV-009)". |
| 33 | 580, 1058, 1275, 1450, 1463 | "→ OPEN-05 (fold into OPEN-05)", "OPEN-05, OPEN-05" | C · APPLIED-BUT-STILL-WRONG | Artefacts of the DL-24 → OPEN-05 swap. | Remove the duplicates. |
| 34 | 150 (§1.4) | "never confirmed by the founder (conflict #37 → AD-62)" | C · APPLIED-BUT-STILL-WRONG | AD-62 rests on founder line decisions.md:77 ("do it correctly, take your time"); conflict 37 is :438. | "Confirmed by the founder (:77); conflict #37 closed by AD-62." |
| 35 | 434 (PRD-ACCT-3) | "AI consent (`dosetrace_ai_consent` …)" | A · APPLIED-BUT-STILL-WRONG | That key does not exist. The real one is `dosetrace_ai_extraction_consent_v4` (lib/aiConsent.js:19). The time-zone keys are `dosetrace_missed_tz` / `_tz_since`. | Fix the key names. |
| 36 | 859, 869 (PRD-RC-51, edge cases) | "A new check started on the result day is hidden" | A · APPLIED-BUT-STILL-WRONG | CalculatorSection.js:853 `c.date >= rcStartISO`, which also hides a backdated start. G-48 (:1664) was fixed; RC-51 was not. | "…started on or before the last result's date…". |
| 37 | 1645 (G-33) | "8 tables still do not send it" | A · APPLIED-BUT-STILL-WRONG | `dose_logs` does not send `created_at` either (syncMappers.js:112-116; pull INSERT syncCore.js:523). | "9 tables (incl. dose logs)". DV-001 carries the same list. |
| 38 | 598, 1732 (PRD-PROT-30, G-104) | The oversized-photo "PDF" notice has no GAP id | A · APPLIED-BUT-STILL-WRONG (pointer) | DV-201 (DIVERGENCES.md:338) is not referenced anywhere. G-104 points to DV-160. | Add the G/DV link. |
| 39 | 1758 (G-126), 1142 (PRD-DATA-31) | Lists two of the three unsigned checklists; cites "07 A-04 / Q-08" | A + B · APPLIED-BUT-STILL-WRONG | fold-right-page.md:7 `checklist-signed:` is empty. The open item is OPEN-18 (8). | Name all three and cite OPEN-18 (8). |
| 40 | 1761 (G-129) | Lists the BodyMapModal palette as a leftover hard-coded colour | A · NOT-APPLIED | BodyMapModal.js:94-96 declares it a deliberately fixed surface, and DV-170 dropped it (DIVERGENCES.md:323). | Remove it from G-129. |
| 41 | 1701 (G-77) | DV column lists only DV-050 | A · APPLIED-BUT-STILL-WRONG | Round 1's NEW-1 is DV-196. | "DV-050, DV-196". |
| 42 | 717 (PRD-REM-90) | Quotes DL-06's "the same default the form writes" | A · APPLIED-BUT-STILL-WRONG | DL-06 no longer contains that wording (OPEN-DECISIONS.md:561); the default question is OPEN-19 (c). | Drop the quote. |
| 43 | 763 (PRD-FOOD-15) | "the typed text is kept" | B · PARTLY | An advice-shaped follow-up answer is cleared and its draft deleted (FoodChatScreen.js:440-449). | Limit the claim to the composer. |
| 44 | 771 (PRD-FOOD-23) | A bare "no" dismisses | B · PARTLY | It skips an open follow-up or moves to the next gap question (FoodChatScreen.js:339-344; FL-6 evidence). | Describe both effects. |
| 45 | 777 (PRD-FOOD-41) | "never offers … an intake number" | B · PARTLY | Before a 7-day run, the fold shows "Run: {d} days · ~{kcal} kcal/day logged" (CalculatorSection.js:1503-1504), which the prototype approves. | "…offers no number for the check". |
| 46 | 822 (PRD-PROG-22) | The profile is the "only source" of sex and birth year | B · PARTLY | Fallbacks: calculator age (bodyProfile.js:14); saved calculator sex or 'male' (:10). | Name the fallbacks. |
| 47 | 854 (PRD-RC-5) | The 20:00 reminder stops at the weigh-in | B · PARTLY | No day-21 or weigh-in cutoff: it runs while the check is open (notifications.js:695-703) and not while logging is locked. | Correct the stop condition. |
| 48 | 1112 (PRD-AI-31) | Door labels | B · PARTLY | Step 1 switches to "Finish with AI" once anything is typed (ProtocolsScreen.js:2329); the step-5 door exists only for powders. | Add these details. |
| 49 | 1137 (PRD-DATA-12) | "Anonymous" | B · PARTLY | The install id is pseudonymous (:570); the applied wording is "not linked to your account" (AD-57). | Use that wording. |
| 50 | 1139 (PRD-DATA-20) | — | B · PARTLY | AD-46 is now OPEN-21 (7) (erased by FK cascade anyway). G-154 (the RevenueCat customer survives deletion) is not linked from DATA-20. | Add OPEN-21 (7) and G-154. |
| 51 | 1143, 1144 (PRD-DATA-40, -41) | Year-only 18+ as a counsel item; store labels stated as built | B · PARTLY | :388 does not mention age. G-136 / DV-190 says the store labels are not built. | Re-source the age item; add "→ G-136". |
| 52 | 1159 (PRD-UI-10) | "no '(s)'" | B · PARTLY | `blood_dropped_sub` "value(s)" (BodyScreen.js:618; translations.js:1986 ×6); `paywall_start_trial_months` "mes(es)/Monat(e)/mese/i". | GAP (new). |
| 53 | 1053 (PRD-PREM-8) | "Terms of Use (EULA)", "Privacy Policy" | B · PARTLY | Android shows "Terms of service" (lib/legalLinks.js:11-14), and "Privacy policy" is in sentence case (PaywallScreen.js:397). The founder's :285 supersedes FX-17. | Give the built labels. |
| 54 | 395 (PRD-ONB-9) | "Enable notifications" → Create account | B · PARTLY | On Android it goes to the reminder-setup step first (OnboardingFlowScreen.js:306-310; SP-4). | "(Android: via PRD-ONB-10)". |
| 55 | 399, 417, 418, 1052 (ONB-13, AUTH-13/14, PREM-7) | `[D #472-477]` | B · PARTLY (provenance) | These lines are in coordinator block :469-484 (lib/pendingProfile.js:3 says "by logic"); the PA rows are unsigned. | Covered by the fix in #17. |
| 56 | §6 (whole) | 10 of the 26 new DV rows (DV-196…221) are referenced nowhere in the PRD: 196, 201, 206, 207, 208, 209, 210, 212, 215, 217 | C · APPLIED-BUT-STILL-WRONG (pointer) | DV-217 (restart order) belongs to PRD-PROT-90 / C-11; DV-212 to G-70 (which lists only DV-071); DV-207 / DV-208 to the curve and Journey gaps. | Link each from its G row. |
| 57 | various | Line drift copied from round 1 | A · cosmetic | TodayScreen.js:2241 should be 2259; :1000-1003 should be 1008-1010; :885 should be 887. LogScreen.js:145 should be 146. notificationActions.js:139 should be 138. CalculatorSection.js:1531 should be 1541. SerumCurveScreen.js:1021/1031 should be 1020/1030. "GAP DV-101" should read "G-53" (:332, :859, :1452). :411 "not yet in any register" is wrong (DV-211 exists). | — |

## Gap rows G-138…G-155 (detail)

| G | Defect | Evidence | DV (DIVERGENCES.md line) | Notes |
|---|---|---|---|---|
| G-138 | CONFIRMED | STATE.md:17 "Client secret EXPIRES 2027-04-04" | DV-211 (:218) ✓ | PRD:411 still says "not yet in any register" (#57) |
| G-139 | CONFIRMED | ProtocolsScreen.js:935 (unit 'mg'), :1793-1795, :2773 (oral IU), :1834/:1975; doseMath.js:104-107 | DV-198 (:114) ✓ | The warning box is hidden for orals (:2956); only the popup (:1960) shows |
| G-140 | CONFIRMED | notificationPlan.js:243-255; ProtocolsScreen.js:2103-2108 | DV-199 (:115) ✓ | — |
| G-141 | CONFIRMED | ProtocolsScreen.js:189-194 (`Math.ceil` → −0) | DV-200 (:116) ✓ | — |
| G-142 | CONFIRMED | TodayScreen.js:530 (three refs only) | DV-202 (:136) ✓ | — |
| G-143 | CONFIRMED (drift) | TodayScreen.js:1008-1010 | DV-203 (:137) ✓ | Cites :1000-1003 |
| G-144 | CONFIRMED | LogScreen.js:142-146; doseActions.js:56 | DV-204 (:138) ✓ | "Paused" means Ended |
| G-145 | CONFIRMED (drift) | TodayScreen.js:886-887 | DV-220 (:345) ✓ | Cites :885 |
| G-146 | CONFIRMED | notificationPlan.js:153 | DV-197 (:176) ✓ | — |
| G-147 | CONFIRMED | reminderHealth.js:56; reminder-check.md RC-6 | DV-214 (:339) ✓ | — |
| G-148 | CONFIRMED | notifications.js:609-640 (no switch), :68-70 (Silent guard) | DV-218 (:343) ✓ | — |
| G-149 | CONFIRMED (drift) | CalculatorSection.js:1475, :1541, :946 | DV-004 (:77), extended ✓ | DV cites :1531 |
| G-150 | CONFIRMED | energyCalc.js:266; CalculatorSection.js:1445; translations.js:1070 | DV-205 (:177) ✓ | — |
| G-151 | PARTLY | See #16 | DV-221 (:90): topic ✓, S1 / authority ✗ | — |
| G-152 | CONFIRMED | ProtocolsScreen.js:1231-1248 vs :2017-2019 | DV-216 (:341) ✓ | — |
| G-153 | CONFIRMED | parse-food/index.ts:28-30, :159-172; decisions.md:251 | DV-213 (:268) ✓ | The DV routes to OPEN-18 (3); the G row and PRD-FOOD-51 do not |
| G-154 | CONFIRMED | delete-user has no RevenueCat call | DV-219 (:344) ✓ | — |
| G-155 | PARTLY | See #21 | DV-182 (:84), extended ✓ (same vial over-claim) | — |

## Notes

1. **The text most often wrong now is the citations, not the behaviour claims.** Round 1's behaviour corrections landed well: 152 of 218 items were applied correctly, and none over-corrected except the vial clause in #21. What lags is the 2026-10-12 reclassification. Ids moved in OPEN-DECISIONS (AD-44, AD-45, DL-08, DL-28, DL-73, AD-12 → DL-25, AD-09/10/46/50 → OPEN-21) are still cited at their old meaning in the PRD. Line 6 claims those topics were corrected; for most of them that is not true.
2. **Line 6 of the PRD overstates its own completeness.** It says "every WRONG / PARTLY row of 01–07 that concerns the PRD" was applied and "their topics were corrected in the text". Findings #10, #18-#20, #27-#31 and #40 contradict that.
3. **Round 1 was itself wrong in these places:**
   - PRD-PROT-19: it missed that the prototype supersedes :200, and missed the empty-field defect.
   - The scan-limit premise: it said the limit "always shows".
   - The vial resurrection: the harness has no server triggers.
   - PRD-PROT-105 / DV-221: it treated coordinator line :540 as the authority over founder line :556 and the migration's own definition of identity.
   - Detail only: 02 P11, 05 #47 (look-back is at serumModel.js:98-99) and 05 #55 (it missed founder line :205).
4. **New defects with no register row:**
   - The empty interval field on Edit (#4).
   - The error-sheet glyph (#6).
   - Android DTWheel (#24).
   - The "(s)" plural strings (#52).
   - The week/window food totals (#7, or a founder conflict).
   - The in-app privacy policy, which G-136 / DV-085 cover only if linked (#1).
   - Each should become a DV row, test first, under the evolution rules.
5. **Things that hold, checked independently:**
   - The grace week is logging only (decisions.md:229, :274).
   - Android Apple sign-in is live, and the secret expires 2027-04-04.
   - Restart order: duplicate → container → limit.
   - The vial prompt has two buttons.
   - The tap time is used for today's notification take.
   - The 10-year floor on past weigh-ins.
   - The AI hard line in every prompt; no AI function logs user text.
   - The account-delete table list covers every synced table.
   - The SIGNED_OUT wipe runs only on an intended sign-out.
   - Scan quotas: 3 free / 20 Premium, UTC month, RevenueCat consulted only at ≥ 3.
   - Book-layout thresholds of 700 × 560 and the 22 pt gutter.
   - Colour tokens #DDE0DB / #121416 / #2350D8 / #8AA8FF / #383C41 / #EEEFEB.
   - SegmentedBar at 42 pt / 0.8.
6. **Verifier working files** (session scratchpad): r2-A1-protocols.md, r2-A2-today-reminders.md, r2-A3-food-curve-body.md, r2-A4-platform-consistency.md, r2-B1-ai-data.md, r2-B2-food-progress-rc.md, r2-B3-fold-ui-auth-prem.md, r2-C-gaps-and-cites.md. The node proof for #4 is r2a1/int.cjs.
