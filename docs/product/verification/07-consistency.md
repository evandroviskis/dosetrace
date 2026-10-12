# 07 — Cross-document consistency check (independent verifier)

- Date: 2026-10-12. Branch `redesign/graduated`. Read-only check; no file other than this report was changed.
- Scope: `docs/product/PRD.md`, `TRD.md`, `flows/*.md`, `DIVERGENCES.md`, `OPEN-DECISIONS.md` against `docs/decisions.md` (the founder's ledger, the authority) and the signed `docs/specs/*.md`.
- Method: every AD citation opened at the cited line; every DL checked against earlier ledger lines and signed spec rows; the six named topics grepped in every document; the PT message compared line by line with the English section and with the code where it states a fact; 10 PRD §5 contracts checked against the code (section 6).
- Severity: **S1** = the founder is told something untrue, or a builder following the docs would build the opposite of a founder line; **S2** = two documents disagree on behaviour (one of them must change before the code sweep); **S3** = stale or weak wording, citation or classification.

**Totals: 58 findings — 10 S1, 25 S2, 23 S3.** (Section 1: 12 · Section 2: 11 · Section 3: 10 · Section 4: 11 · Section 5: 6 · Section 6: 8.)

---

## 1. Contradictions between documents

### X-01 (S1) — Lapsed-payer grace week: PRD lets a lapsed payer start a check and see the result; DIVERGENCES and flows say the opposite
- PRD §1.5.1: "Reality check: start | During the 7 free food-log days, or in a lapsed payer's grace week (code) | … | FL-41; 04 R-R9; AD-14".
- PRD L-4 step 6 and PRD-RC-51: the check finishes when "the user may see results (Premium, or still in free days/grace)".
- PRD C-21 Progress row: "start allowed during free days (and grace — AD-14)"; C-22: "Reality check start/result | free days/grace only | always | OK (AD-14)".
- DIVERGENCES DV-101: "`rcFree = access.canLog` is also true in the lapsed-payer grace week, so a lapsed payer can start a NEW check and see a result … Fix: start / see result = Premium or free days (not grace)".
- flows/08 §state table: "Lapsed payer in grace week | **no new check (intended — FL-41 'finish the current week')** … intended no; **today yes (04 D-13)**"; flows/13 P3: "Food-log grace to the end of that check week (logging only); results need Premium."
- **Ledger:** decisions.md:274 "The day-21 result needs Premium. If paid Premium ends during a running check, the user finishes the current week"; FL-41 same. AD-14: "Grace … = finish the current week of logging; the day-21 result needs Premium." → DIVERGENCES and the flows match; the PRD does not, and it marks the defect "OK (AD-14)".
- **Correction:** PRD §1.5.1 row, L-4 step 6, PRD-RC-51, C-21 and C-22: grace = logging only; no new check, no result; status → GAP (DV-101).

### X-02 (S1) — Premium scan number: AD-56 vs PRD §1.5.1 / C-36 vs founder line 104 and signed MB-10
- AD-56: "My Body's scan line shows each plan's real number (3 free / 20 Premium); this later line replaces S-24's 'no number for Premium' on that screen."
- PRD §1.5.1: "20 / calendar month (the number is never shown in Premium copy; only in the FAQ and the limit message)". PRD C-36: "no Premium string shows a number (AD-56)" — it cites AD-56 for the opposite of what AD-56 says.
- **Ledger:** decisions.md:104 (founder, 2026-10-01, grok/133–134): "Premium strings carry no scan number … The 20 appears only in the FAQ … and in the limit-reached message." Signed my-body.md MB-10 (2026-10-03, "5 assino"): "the S-24 text with no number in the Premium line". decisions.md:544 (the AD-56 source) sits under "decided 2026-10-04 by the ledger / logic (coordinator, council synthesis; **no question to the founder**)".
- **Correction:** AD-56 is not "already decided by the founder": a coordinator line overrides a founder line and a signed row. Either keep the founder rule (Premium line without a number, e.g. "Lab, vaccine & vial scans · Included with Premium", and the free line "3 free scans a month") and drop the "20" from A-90/MB-9, or put the conflict to the founder. PRD and AD-56 must then say the same thing.

### X-03 (S2) — Tracker streak: days (PRD, flows, TRD) vs doses (DL-03, AD-07)
- PRD-TODAY-33: "Day streak: consecutive **days** on which every protocol due that day had all its expected Complete doses … 'On fire!' at ≥ 7. … Capped at 31 … → DL-03 (365 days, doses in a row)."
- flows/03 §7.7: "**Tracker streak (days):** consecutive days where every due protocol had all its doses". TRD S-10: "Tracker streak (days all due protocols complete) … extract; lookback 365 like S-09".
- DL-03: "The Today tracker streak follows the same rule (**doses in a row** over due days)". AD-07: "A streak counts doses in a row, never days."
- The ledger's founder evidence covers the **protocol card** only (commit b215b32: "The streak on a protocol's card counts doses, not days (founder 2026-10-05: a weekly protocol showed 2 days without a miss)"; `lib/doseStreak.js:2` "The streak on a protocol's card"). Applying it to the tracker changes visible copy ("days without a miss", "On fire!" at 7, the report line "Current streak: {days} days") and the meaning of the tracker.
- **Correction:** decide what DL-03 means (count unit and copy) and write one definition into PRD-TODAY-33, flows/03 §7.7 and TRD S-10; the copy ×6 needs founder approval. See also D-01.

### X-04 (S2) — Course total (legacy `schedule_total`): flow 05 presents an "intended by logic" answer to an OPEN question
- flows/05 §7.6: "**Intended by logic (one schedule owner; founder may override):** when the course's last dose is due-and-past, Today, the Missed scan, rings and the curve stop expecting doses too, and the protocol is offered as finished (**Ended at the last Taken dose**, like the inactivity prompt)." Its state diagram: "Active --> Ended: course total reached (intended by logic, see 7.6)".
- OPEN-DECISIONS OPEN-03: a founder question with options A (end automatically) / B (ask "Course complete — end {name}?") / C; flow 05 §12 also says "OPEN-03 — Waits for the founder."
- **Ledger:** BR-12 (decisions.md:620) only says reminders end at the course end. Nothing decides the rest.
- **Correction:** remove "intended by logic" from flows/05 §7.6 and the diagram; mark it "→ OPEN-03".

### X-05 (S2) — Android setup step after a denied permission: PRD calls it a bug, DL-50 keeps it
- PRD-ONB-10: "The step shows even when the OS dialog was denied → GAP G-88"; PRD §6 G-88: kind **bug**. C-27: "OK (shown after a denied dialog → GAP G-88)". flows/01: "Divergence today (03 G26)".
- DIVERGENCES DV-142 and DL-50: "Keep; amend SP-4 wording."
- **Ledger:** signed SP-4 (reminder-setup-placement.md) says the step shows "right after 'Turn on notifications' is answered". A denial is an answer, so the code matches SP-4 and DL-50 is right.
- **Correction:** PRD G-88 kind → doc (SP-4 wording only); PRD-ONB-10, C-27 and flows/01 drop "divergence".

### X-06 (S2) — "Not now" to notifications: AD-27 vs SP-5, the ledger it cites, and flow 06
- AD-27: "Someone who said 'Not now' to notifications is not asked for more." Source: decisions.md:623.
- decisions.md:623 does not say this. It says: "Logic applied: Android only (iPhone has only Notifications, already asked in onboarding) …". decisions.md:626 and signed SP-5 say the opposite for Android: "Today opens the screen once per phone for anyone with a reminder time who has not seen it here (incl. 'Not now' in onboarding …)".
- flows/06 P1 follows SP-5 ("Today opens the setup screen once per phone when a timed protocol exists"); flows/01 §7 states a new rule ("the OS prompt comes when the first protocol with a reminder time is saved, or from the reminder screen").
- **Correction:** AD-27 is a logic decision (re-number as DL), and its text must not contradict SP-5: "No OS prompt at boot after 'Not now'; the OS prompt comes when the first protocol with a reminder time is saved (and, on Android, through the SP-5 setup screen)."

### X-07 (S2) — Skip and reminders: TRD still says "founder decision needed"; PRD contracts say "undecided"
- TRD §4.1 S-05: "Skip never cancels reminders … | **founder decision needed** (logic says a skipped slot's reminders stop)". PRD C-2: "Reminder for that slot … | **undecided** | DL-08"; "Undo | **undecided** (no Undo bar today) | DL-08". C-3: "Reminders cancelled by the take | **undecided** … DL-09".
- OPEN-DECISIONS DL-08 / DL-09 decide it; flows/03 §7 states it as intended.
- **Correction:** TRD S-05 → "DL-08"; PRD C-2 / C-3 "Must show / do" columns state the decided behaviour (cancel; no Undo bar; Undo re-arms) with status "GAP (DV-035 / DV-040)".

### X-08 (S2) — Purge pause attributed to the founder
- flows/05 §7: "Automatic 7-day purge: **paused** in 1.3.0 by **founder-approved deferral** (A-84, revisit next build)."
- **Ledger:** decisions.md:503–506 "Ended protocols and the purge — decided 2026-10-03 by the ledger / logic (coordinator, round 4)". The founder approved the hand-delete multi-select (decisions.md:501, :515), not the pause itself.
- PRD-PROT-106, TRD §3.7 and DIVERGENCES DV-125 are worded correctly.
- **Correction:** flows/05 → "paused in 1.3.0 by a ledger/logic decision (decisions.md:506; A-84)".

### X-09 (S2) — AI food parse caps: PRD/TRD/flows adopt caps the ledger does not have
- PRD §1.5.1 and PRD-FOOD-51: "25 parses **and 25 follow-up answers** per user per local day … plus a hard ceiling of **60 per rolling 24 h**". Same in TRD §1.6 and flows/07 R-F9.
- **Ledger:** decisions.md:251 "Food parse cap: 25 AI parses per user per day … **Follow-up answers don't count.**" Signed FL-21: "Answering a follow-up never uses one of the 25 daily AI reads." Nothing approves a 25-follow-up cap or a 60/24 h ceiling (which both kinds share).
- No DIVERGENCES row covers it.
- **Correction:** add a DV row (the two server caps are builder choices) and put them on the A-97 deviation list, or record them as decided; the PRD requirement must cite the deviation, not decisions.md:251.

### X-10 (S3) — TRD keeps founder-question markers for items that are decided
- TRD S-01: "a single declared policy for no-time / fewer-times rows (**founder question: §9 R-04**)" → decided by DL-06.
- TRD §4.9: "Food access (missing) … | **founder decision on enforcement**" → AD-16 (TRD §9.1 Q6 itself says AD-16).
- TRD §6.4 item 5: scan quota month UTC "**accepted or changed by founder decision**" → decisions.md:275 already says "calendar month, UTC".
- **Correction:** replace with the canonical IDs (DL-06, AD-16, decisions.md:275).

### X-11 (S3) — Lab charts: consistent, but the PRD matrix hides a user-visible change
- Everywhere (PRD §1.5.1, PRD-BODY-14, C-22, flows/11, flows/13, DV-108, TRD R-21): lab charts are Premium by decision, free today in code → AD-24. This matches decisions.md:268.
- Not said anywhere: gating them takes a working feature away from current free users who already see charts. Under "show the layout before building", the locked marker screen needs a picture (DV-108 says "picture first"; the PRD rows don't).
- **Correction:** PRD-BODY-14 and C-22: add "(picture first; free users lose a feature they have today — say so in the founder's deviation/picture round)".

### X-12 (S3) — OPEN-04 recommendations differ between documents (recorded, but the flow body still argues B)
- flows/05 §12: "This flow had recommended … option B there; OPEN-DECISIONS recommends … option A". Fine. PRD OPEN-10 / flow 04 differences are also recorded in OPEN-DECISIONS. No action beyond keeping the bodies neutral.

---

## 2. "Decided by logic" (DL-01…DL-74) — strict audit

Checked each DL against every earlier ledger line and signed spec row it touches. **63 are genuine logic** (they follow from "one concept, one owner", "never lose user-entered data", "copy must be true", the AI line or a signed row): DL-02, 04–07, 09–11, 13–18, 20, 21, 23, 25–31, 33–35, 37–49, 51–54, 56, 57, 59–61, 63–65, 67–69, 71, 73. **11 are not** — they reverse a founder line or a signed row, or they are a money / scope / risk / taste call:

| # | DL | Problem | Ledger / spec it touches | Correction |
|---|---|---|---|---|
| D-01 (S1) | **DL-03** tracker streak in doses | Extends a founder line scoped to the protocol card (commit b215b32, `doseStreak.js:2`) to the tracker; changes visible copy and meaning ("days without a miss", "On fire!" at 7, report "Current streak: {days} days"). That is a taste choice plus new strings ×6. | decisions.md:85 (every new/changed string needs founder approval ×6); :143 (tracker approved with "the flame + streak") | Make it OPEN (or a picture with both options); PRD/flows/TRD say "days" today (X-03). |
| D-02 (S1) | **DL-24** lapsed Premium keeps all active protocols | Money/monetization policy. It also contradicts OPEN-05 option C ("B plus a downgrade rule for lapsed Premium"), which offers the founder the very choice DL-24 claims to have settled. | decisions.md:280 ("up to 3 active protocols, then the paywall"); CLAUDE.md "ask only real questions (taste, money, risk, scope)" | Fold DL-24 into OPEN-05 (the recommendation can stay "keep them"). |
| D-03 (S1) | **DL-72** tombstones on every synced table; **DL-74** event-based counters + changed-fields-only pushes | A rewrite of delete and push semantics on every table before a store release is a risk and scope call, not logic. The "what" (deletes must reach every device; two offline doses = two) is logic; the "when / in which build / at what risk" is the founder's. DL-72's reason also says "the founder already chose positive tombstones for protocols (decisions.md:519-531)" — decisions.md:519 is "decided 2026-10-04 by the ledger (coordinator, final Gate B)"; the founder only approved applying the migration (:531 "sim, pode aplicar"). DL-74 may need a server RPC ("pushed as increments through an RPC", DV-183), so the PT message's "two server changes" undercounts. | CLAUDE.md "Auth / session / sync / delete changes → Gate B + founder device test"; evolution rule 2 (closed scope) | Keep the principle as DL; add one OPEN item: "Sync hardening (DL-72, DL-74): in 1.3.0 or the next build?" with the risk stated. Fix the misattribution. |
| D-04 (S2) | **DL-32** blend lines solid past | Overrides the founder's explicit visual line decisions.md:205 ("dashed '(est.)' component lines", 2026-09-18/24) by reading a generic later line (:209 "chart with solid past, dashed shaded future") as a blend decision. Visual choices are the founder's ("SHOW the layout before building"). | decisions.md:205; CLAUDE.md "SHOW the layout" | Put it on the A-97 deviation list with a picture (code as built vs dashed), not a DL. |
| D-05 (S2) | **DL-66** retires `not_recorded`; "FL-3 amended" | Amends a signed row (FL-3, food-log.md signed 2026-09-27: "a gap or a 'not recorded' day breaks the run"). | CLAUDE.md "anything built simpler than approved is a deviation the founder must accept in writing" | Deviation list (A-97), not DL. Behaviour change is small; the process rule is not. |
| D-06 (S2) | **DL-50** "SP-4 wording amended" | Changes the wording of a signed row (SP-4, signed 2026-10-07). The behaviour matches SP-4 (see X-05), so only a wording clarification is needed. | reminder-setup-placement.md SP-4 | Deviation list for the wording; PRD G-88 fixed (X-05). |
| D-07 (S2) | **DL-01** site questions never dropped for age | Reverses ledger line decisions.md:459 ("let go … FX-25 as built"). The DL is right on the facts (`lib/siteQuestion.js:47` "Never dropped for its age"; FX-25's cited test "a question older than 7 days is let go" is gone) and matches the founder's S-25 line :379 ("kept until answered"). But it is really **AD** (founder line :379), and the signed FX-25 evidence cell now cites a test that no longer exists. | decisions.md:379, :459; fixes-1.2.5.md FX-25 | Re-classify as AD (decisions.md:379); correct the FX-25 evidence cell; tell the founder (the PT message doesn't). |
| D-08 (S2) | **DL-55** AI consent per account + withdraw in Settings | The per-account part is logic (privacy). A new Settings control and a consent model change are scope, and AD-51 keeps consent proof with counsel. | decisions.md:323; AD-51 | Keep the decision; add a target build (scope) and route the wording through counsel (AD-51). |
| D-09 (S3) | **DL-08** "no Undo bar for Skip" | "Skip cancels the slot's reminders" is logic. "No Undo bar" is a UX preference (Today has an Undo bar for every take; decisions.md:152 "Oral doses … with Undo"). | decisions.md:150, :152 | Split: cancel = DL; the Undo bar = deviation list or OPEN. |
| D-10 (S3) | **DL-22**, **DL-58** (new "New vial" on the recon protocol page; a "what you track" editor in Edit profile) | New UI = scope additions to a build whose scope is closed (evolution rule 2). DL-70 rejects iPad precisely because "1.3.0's scope is closed" — the same argument is not applied to these. | CLAUDE.md evolution rule 2; DL-70 | Give every DL that adds UI a target build in features.md, or say they enter 1.3.0 and ask the founder once (see O-01). |
| D-11 (S3) | **DL-71** false Missed rows of real users stay | The ledger lists it as a founder item (decisions.md:417 "whether existing false Missed rows get migrated (S-18)"). "Never destroy on a maybe" supports the answer, but a wrong Missed row also goes into the provider report. | decisions.md:417, :197 | Acceptable as DL; mention it to the founder in the "Para você saber" list. |

Also: **no DL contradicts a signed row silently except D-04…D-07**; DL-36 amends a design doc (not signed) — fine; DL-68 / DL-70 settle items the ledger listed as founder items (decisions.md:417) — acceptable, but they should be named in the PT "Para você saber" list.

---

## 3. "Already decided" (AD-01…AD-64) — citation check

Every AD citation was opened. **51 say what the AD claims.** The founder's own words are behind most of them. **13 do not hold as written:**

| # | AD | What the cited source really says | Correction |
|---|---|---|---|
| A-01 (S1) | **AD-56** | See X-02: decisions.md:544 is a coordinator line ("no question to the founder") that overrides founder line :104 and signed MB-10 ("no number in the Premium line"). | Not AD. Founder question or follow :104/MB-10. |
| A-02 (S2) | **AD-27** | decisions.md:623 says nothing about "Not now"; :626 and SP-5 open the setup screen for "Not now" users. | DL, reworded (X-06). |
| A-03 (S2) | **AD-07** | No founder transcript; the sources are a code comment and commit b215b32, both about **the protocol card** ("The streak on a protocol's card counts doses, not days"). decisions.md:642 (added 2026-10-12 by this round) generalises it: "Applies to every streak (DL-02, DL-03 below)". | Ledger line :642 must separate the founder fact (card) from the logic extension (report, tracker). |
| A-04 (S2) | **AD-52** | decisions.md:554: "Open deviations: the founder eyeballs them on the test build and signs one list." It does not cover **unsigned checklists** (fold-right-page `checklist-signed:` empty; premium-and-auth and admin-panel "pending"). CLAUDE.md: "When the founder approves a new feature, write its checklist first and get it signed." Also missing from the carried list: A-42, A-44, A-46 ("Founder to eyeball") and A-45 ("Founder to confirm the lead time and words"). | Separate item "sign 3 checklists"; add A-42/44/45/46 to the deviation list. |
| A-05 (S3) | **AD-54** | decisions.md:429 (Conflict 29): "'Earlier day' range 2–7 days … is the assistant's reading of the prototype … not his statement". | DL, not AD. |
| A-06 (S3) | **AD-04** | decisions.md:599 begins "**By logic** from that principle (founder may override)". It is also mapped to PRD OPEN-54 ("Apple delete: residual data on a second device"), which :599 does not cover (only reminders); decisions.md:417 still lists "Apple delete second-device residual data (F6)" as a founder item. | Mark as ledger-logic; give PRD OPEN-54 its own DL or OPEN. |
| A-07 (S3) | **AD-09**, **AD-10**, **AD-29**, **AD-46** | decisions.md:542–545 sit under "decided 2026-10-04 by the ledger / logic (coordinator, council synthesis; no question to the founder)"; :545 literally "Privacy, by logic". | Valid ledger lines, but not founder answers (matters for the PT claim, P-01). |
| A-08 (S3) | **AD-50** | decisions.md:506 is "decided … by the ledger / logic (coordinator, round 4)". | As A-07; fix flows/05 (X-08). |
| A-09 (S3) | **AD-43** | premium-and-auth.md:133 is under "## Notes (**not decisions**)" in an **unsigned** spec; decisions.md:388 is the counsel flag. The real source is decisions.md:300 ("Age floor 18 for the typed birth year", 2026-09-15). | Re-cite :300. |
| A-10 (S3) | **AD-60** | :148 holds, but decisions.md:432 (Conflict 31) says the push threshold 2 → 3 "came as a side effect … the spec's Deviation column has no dated approval". | Note the conflict or put it on the deviation list. |

Spot quotes for the ones that hold (sample): AD-01 :46 "Every delete asks first — 2026-10-03 (app-wide rule)"; AD-06 :144 "A late dose matches its own slot within ± half the interval … Never above 100%"; AD-14 :274 "The day-21 result needs Premium. If paid Premium ends during a running check, the user finishes the current week"; AD-15 :636 "FL-48 'A' — … stays Premium-only"; AD-24 :268 "The lab journal typed by hand is free; lab charts are Premium"; AD-40 :465 "Free plan keeps 3 active protocols — '3 mantém'"; AD-59 grok/228:7 "PT Histórico" in the approved block (i18n `tab_log` is still "Registro" ×3 — an implementation gap, not a decision gap); AD-63 :513 "Deploy parse-food v9 as production and remove parse-food-next (RL-1)".

---

## 4. The 15 OPEN questions

### Already answered, or partly decided (should not be asked as written)

| # | OPEN | Finding | Correction |
|---|---|---|---|
| Q-01 (S2) | **OPEN-05** option C | Offers "a downgrade rule for lapsed Premium" although DL-24 claims to have decided the lapse (D-02). One of the two must go. | Merge DL-24 into OPEN-05. |
| Q-02 (S2) | **OPEN-06** option D "No change" (and A as the full answer) | The founder's principle (decisions.md:598, :601: "É obrigação do aplicativo que avise até a pessoa entrar no aplicativo e deletar esse protocolo") rules out D and says A does not satisfy the principle on its own (it still needs the app opened). | Drop D or mark it "breaks the 2026-10-07 principle"; say plainly that only B meets the principle. |
| Q-03 (S2) | **OPEN-12** manual lab entry | Approved (decisions.md:268, explainer :76). Under "approved → next build" the default is A (build it); only a founder **deferral** is a question, and CLAUDE.md requires saying explicitly why it can't be built well in time. The question is fine to ask, but should be framed "A is the default; do you want to defer?" with the reason. | Re-frame. |
| Q-04 (S3) | **OPEN-13** option A "Keep as is" | "Bloodwork due" is a timing recommendation the user never set (product guardrail: never recommend; decisions.md:20 "never advises"). Option A is not a neutral option. | Mark A as "keeps an app-chosen recommendation (regulatory risk)". |
| Q-05 (S3) | **OPEN-08** | decisions.md:239 lists exactly what Stop does ("clears the open check, cancels … reminders, keeps the logged food") and "never destroy on a maybe" applies → decidable as DL (A). Counter-point: the shipped copy `cal_rc_stop_body` "This clears your reality-check numbers…" — if the founder approved that string, B was approved. No approval of that string is recorded. | Either DL (A) or keep, but state that the copy was never approved. |

### Missing genuine open questions

| # | Missing | Evidence | Severity |
|---|---|---|---|
| Q-06 | **Scope / target build of the 74 DL fixes and ~195 DV rows.** No DL or DV has a target build; evolution rule 2 says a build's scope is closed; DL-70 uses that rule while 70+ DLs add work (D-10). "Do all DL/DV fixes go into 1.3.0, or which subset?" is the scope question CLAUDE.md says to ask. | OPEN-DECISIONS (no targets except DL-70, OPEN-14); features.md | S1 |
| Q-07 | **The Premium scan-number conflict** (X-02 / A-01). | decisions.md:104, :544; MB-10 | S1 |
| Q-08 | **Sign three checklists**: fold-right-page (signature empty), premium-and-auth, admin-panel ("pending"); spec-audit fails on them (PRD §0.3). | specs headers; PRD G-126 | S2 |
| Q-09 | **A-45 vial-expiry lead time and wording** ("Founder to confirm the lead time and words", features.md A-45; decisions.md:417). AD-26 covers only the switch. | features.md:185 | S2 |
| Q-10 | **Founder eyeball items** A-42 (Protocols-card button), A-44 ("From your reminder" ×6 outline), A-46 (sign-out / offline copy ×6) — "Founder to eyeball" in the registry, not on the AD-52 list. | features.md:182–186 | S3 |
| Q-11 | **Android "Continue with Apple" glyph**: decisions.md:497 "downloading Apple's official artwork is the founder's call"; PRD-AUTH-7 "drawn glyph until the founder supplies Apple's artwork" — vs "store-owned controls follow the store's rules 100%". Not in the round. | decisions.md:497 | S3 |

---

## 5. The Portuguese founder message

| # | Severity | Where | What it says | What is true | Correction |
|---|---|---|---|---|---|
| P-01 | S1 | Intro | "**64 pontos** já estavam respondidos **por você** (no registro de decisões ou num checklist assinado)" | At least 13 ADs rest on coordinator/logic lines, not his answers (AD-04, 07, 09, 10, 27, 29, 46, 50, 54, 56, plus parts of 11, 35, 61; section 3). | "64 pontos já estavam no registro de decisões ou num checklist assinado (a maioria respondida por você; 13 eram decisões lógicas anteriores)". |
| P-02 | S1 | "Para você saber" | Lists 4 logic decisions | Omits the logic decisions that **reverse his own lines or signed rows** or touch money: DL-24 (lapsed Premium), DL-32 (his blend line :205), DL-01 (ledger :459), DL-66 (signed FL-3), DL-50 (signed SP-4), DL-03 (tracker copy), DL-71, DL-68, DL-70. | Name these explicitly; a founder can only override what he is shown. |
| P-03 | S2 | Q6 context | "No Android isso **já está resolvido** (renovação em segundo plano, despertar diário e reconstrução depois de atualização ou reinício)." | Built, not proven: A-111 "Device proof: update 48 -> next test build without opening" pending; A-110 "device proof pending"; spec-audit fails BR-9/BR-10, RG-6/7/8 (PRD §0.3). | "No Android isso já foi construído (… ); falta a prova no aparelho no próximo build de teste." |
| P-04 | S2 | Q14(a) context (EN OPEN-14 too) | "a pessoa só descobre o limite mensal de leituras quando uma é recusada" | The limit is printed: MB-9/MB-10 and `blood_first_free` / `blood_empty_sub` "3 free scans a month…"; the FAQ says "up to 20 a month". What the user cannot see is **how many they have used**. | "a pessoa vê o limite (3 por mês), mas não quantas já usou — só descobre que acabou quando uma leitura é recusada". |
| P-05 | S3 | Q7 option B (EN too) | "resultados com menos de 14 dias são menos precisos" | Under B the result buttons start at day 14 and the math refuses < 14 days ("too short", PRD-RC-50); no result under 14 days exists. The real trade-off is 14–20-day results vs 21-day results. | "resultados entre o dia 14 e o 21 são menos precisos que os de 21 dias". |
| P-06 | S3 | Intro examples | logic examples include "lembrete até a pessoa apagar o protocolo" and "na página da direita do Fold só se acrescenta, nunca se repete" | Both are **his own words** (decisions.md:594/601 and :633), not logic. | Use real logic examples (e.g. "uma regra só para estoque baixo"). |

Checked and true: Q1 (mix date / window not editable, new vial starts at 0 — PRD-PROT-72), Q3 ("Dia 12 de 12" forever: `TodayScreen.js:1682` caps the day at `schedule_total`), Q6 ("no máximo 10 dias": `lib/notificationPlan.js doseBudget` iOS `windowDays: 10`, fewer with many protocols — "no máximo" is honest), Q12 (the limit message says "Você ainda pode inserir tudo à mão": `vial_scan_quota_sub`, used for labs too via `lib/bodyScan.js:68`), Q13 (`today_alert_blood_title` PT "Exame de sangue pendente"). **Recommendations PT = EN for all 15** (Q10 "B, A provisória"; Q11 "B após revisão, C até lá"; Q14 "sim no build seguinte").

---

## 6. Cross-feature contracts (PRD §5) against the code

Ten contracts checked (a read-only code pass, spot-checked by hand): **C-2 Skip, C-12 Delete / Recently deleted / Delete forever, C-15 Supply low, C-17 Weigh-in saved, C-20 Reality check, C-21 Food access, C-22 Premium state, C-30 Sign-out / account events, C-36 AI scan pool, C-37 AI consent.** Every named owner exists (`recordSkipToday` / `recordSkipPending` lib/doseActions.js:13/28; `softDeleteRow` / `purgeProtocol` lib/protocolEnd.js:93/79 plus the server triggers in migrations 20261004000000 / 20261004010000; `supplyState` lib/supplyLow.js:18; `numbersWeight` lib/numbersWeight.js:6; `checkOutcome` lib/realityCheckRules.js:62 and `readCheckNow` lib/realityCheckNow.js:12; `foodLogAccess` lib/foodThread.js:250 with `FREE_DAYS = 7`; `hasPremium` lib/entitlement.js; `runWipeSteps` lib/signedOut.js:158; `ai_scan_usage` in extract-bloodwork; `lib/aiConsent.js` key v4). Every surface row exists in the code. Most GAP statuses were confirmed still open: G-5, G-15, G-20, G-22, G-32 (`protocols_delete_confirm_settings` still says "recoverable for 7 days", i18n:1562, ×6), G-40, G-41, G-44, G-48 and G-55. The paused purge was confirmed: `AUTO_PURGE_PAUSED = true`, so `purgeOldDeleted` returns 0.

**Statuses that are wrong:**

| # | Sev | Contract / row | PRD says | Code says | Correction |
|---|---|---|---|---|---|
| K-01 | S2 | C-36, the whole contract | "no Premium string shows a number (AD-56)", status OK | AD-56 says the opposite (X-02). My Body has no Premium scan line at all: the only line renders for free users (`{!premium && …blood_first_free}`, BodyScreen.js:1100-1107). | Status → GAP until X-02 is decided and built. |
| K-02 | S2 | C-2, rows "Reminder" and "Undo" | "**undecided**", "no Undo bar today" | DL-08 is decided. The Skip path cancels nothing: re-planning skips Taken slots only (notifications.js:242-248), and only a take cancels (`cancelTodaysDoseReminders`, TodayScreen.js:891). "Didn't take" on a pending-from-yesterday slot **does** show an Undo bar (`skipPending` → `setUndoData(record)`, TodayScreen.js:710-717). So "no Undo bar" is false for that path, and DL-08 ("no Undo bar for Skip") would remove one that exists today. | Rows → "DL-08, not built (GAP DV-035/130)". DL-08 must also say whether the Pending "Didn't take" keeps its Undo. |
| K-03 | S2 | C-37 | "Asked once …; the onboarding AI line and the privacy policy say the same thing … **Status:** device-scoped, not withdrawable → DL-55" | The consent stores only `'granted'`, with no version or date. It is not in the sign-out wipe (signedOut.js:158-163; App.js:377-399). The onboarding line `ob_term3_d` (i18n:780) omits vial labels and the protocol assistant. The in-app `settings_privacy_body` (i18n:649) is dated April 2026 and covers labs and vaccine cards only (A-117 / AD-28 not built). | The copy-match claim is false: add GAP rows (A-117, G-106). |
| K-04 | S3 | C-22, row "Lab charts" | "locked (by decision) … AD-24" | Not gated in any path: `MarkerChart` renders with 2+ readings (BodyScreen.js:1067-1068), and there is no gate in `openMarker` (:313) or the Fold right page (:142-144). The free card heading "Bloodwork scan — Premium feature" sits above "3 free scans a month" (:1102). | Status → "GAP (DV-108), AD-24". |
| K-05 | S3 | C-17 "Reality check state" / C-20 "Finish" | OK | The result is saved only by a `useEffect` in CalculatorSection.js:855-859, which is mounted only by Progress. Today and Journey can say "ready" for days and nothing is saved until the user opens Progress. PRD-RC-51 says "on Progress", but the contracts read as if finishing were global. | Mark "finishes when Progress is opened" in C-17 and C-20, and decide whether that is intended (DL-25 assembler scope). |
| K-06 | S3 | C-30 "Intended sign-out — device keys" | Lists the curve view, explainer flags and food draft as carrying to the next person | These keys are already per user: `curveViewKey(userId)` (curveViewStore.js:11), `dosetrace_explainers_v1:${userId}` (featureExplainers.js:54), `dosetrace_food_draft:${uid}` (FoodChatScreen.js:55). The real global leaks are `dosetrace_missed_since` / `dosetrace_zone_history` (doseActions.js:123-129), `dosetrace_alert_snooze`, `dosetrace_vial_low_sent`, the AI consent, and `dosetrace_entitlement_last_uid` (never cleared; entitlement.js:44-68). | Rewrite the row's list (G-12, G-87, G-106, G-109 stay; the per-user keys go). |
| K-07 | S3 | C-12 "Reminders, delivered banners, vial alerts" | OK | The Ended-row delete (`deleteEndedProtocol`, ProtocolsScreen.js:1231-1246) does not call `dismissDeliveredDoseReminders` or `deactivateVialsByProtocol`; the active-row delete does (:2004-2030). Low risk, because End already deactivated the vials. | Note it, or add a DV row. |
| K-08 | S3 | C-36 paywall row "3 / month" | OK | Hard-coded on the client (`FREE_SCANS_PER_MONTH = 3`, paywallPlans.js:13), not from the server. | Acceptable; note "client constant mirrors quota.ts:10". |

---

## Corrections, in order

1. PRD §1.5.1, L-4, PRD-RC-51, C-21, C-22: grace = logging only (X-01).
2. Resolve the Premium scan-number rule with the founder; align AD-56, PRD §1.5.1, C-36, MB-9/MB-10, A-90 (X-02, A-01, Q-07).
3. Add a scope question: target build for the DL/DV fixes; give DL-72/DL-74 a risk-stated founder question (Q-06, D-03, D-10).
4. Merge DL-24 into OPEN-05 (D-02, Q-01).
5. Tracker streak: one definition in PRD-TODAY-33, flows/03, TRD S-10; DL-03 to the founder with a picture (X-03, D-01, A-03).
6. Move DL-32, DL-66, DL-50 (wording) and the food-parse caps to the A-97 deviation list; re-classify DL-01 → AD (:379), AD-27 → DL, AD-54 → DL (D-04…D-07, A-02, A-05, X-09).
7. PT message: P-01…P-06; add the omitted DLs to "Para você saber".
8. Doc drift: flows/05 §7.6 and diagram (X-04), flows/05 purge attribution (X-08), PRD G-88 (X-05), TRD S-05 / S-01 / §4.9 / §6.4 (X-07, X-10), PRD C-2 / C-3 "undecided" (X-07), AD-43 citation (A-09), section 6 contract statuses (K-01…K-08).
