# R2-02 — Ledger verification, round 2 (AD / DL / reclassification / decisions.md 2026-10-12)

- Target: `docs/product/OPEN-DECISIONS.md` (HEAD 19e4ebc, branch redesign/graduated): "Already decided (applied)" (lines 478–548), "Decided by logic" (550–632), "Reclassified on 2026-10-12 (verification)" (294–338); `docs/decisions.md` 2026-10-12 sections (638–720).
- Rule applied (CLAUDE.md "decide what is already decided", as briefed): AD only when the founder's own line in `docs/decisions.md` or a founder-signed spec row answers it; DL only when the answer follows from how features connect (not taste, money, risk, scope, visible copy, or reversing a founder line / signed row). Coordinator lines are not founder answers.
- Method: every AD citation opened (decisions.md line, spec row + its `checklist-signed:` header, registry row, grok file, code line where cited); every DL checked against decisions.md (incl. the Conflicts list :393–443) and `docs/specs/*.md`; every reclassification destination opened; `git diff` of decisions.md.
- Read-only: no code or doc changed except this file.

## 1. Summary counts

| | Stated at top of OPEN-DECISIONS.md | Recounted | Match |
|---|---|---|---|
| OPEN | 21 | 21 (`#### OPEN-` headings: OPEN-01…OPEN-21) | yes |
| AD in force | 54 (11 moved out, 4 narrowed, AD-65 added) | 65 rows − 11 marked "→" (AD-04, 10, 27, 29, 35, 44, 45, 46, 50, 54, 56) = 54; narrowed AD-07, 09, 11, 61 = 4 | yes |
| DL in force | 65 (10 withdrawn/moved, 5 narrowed, DL-28 rewritten, DL-75 added) | 75 rows − 10 (DL-16, 24, 32, 50, 51, 66, 67, 72, 73, 74) = 65; narrowed DL-03, 06, 08, 22, 45 = 5 | yes |
| OPEN-21 sub-items | "ten" | 10 | yes |
| "2 of 54 AD are coordinator lines (AD-49, AD-57)" | 2 | at least 4 rest on non-founder sources as cited (AD-12, AD-28, AD-49, AD-57) plus partial reliance in AD-11, AD-51 | **no** |

Verdicts:

| | VALID | STRETCHED | NOT-A-FOUNDER-ANSWER | BAD-CITE | ACTUALLY-FOUNDER-CALL | CONTRADICTS | ADDS-UNAPPROVED-UI |
|---|---|---|---|---|---|---|---|
| AD (54) | 44 | 7 | 1 | 2 | — | — | — |
| DL (65) | 54 | — | — | — | 3 | 1 | 7 |

decisions.md: lines 1–637 are byte-identical to the pre-PRD ledger (`git diff aeb5bca HEAD -- docs/decisions.md` has a single hunk `@@ -634,3 +634,87` with no removed lines; `git diff 897f01d HEAD` touches only lines 639–720). Every WITHDRAWN / CORRECTED line names its destination. Three small drifts listed in §5.

## 2. AD items that are not VALID

| AD | Verdict | Evidence |
|---|---|---|
| AD-11 | STRETCHED (the narrowing is incomplete) | Founder line :550 "council fixes A-85…A-98 in parallel" supports only the scheduling. The narrowing moves "A-85, A-86b, A-87b, A-90, A-96, A-98" to OPEN-21 (4), but **OPEN-21 (4) (OPEN-DECISIONS.md:280) contains only A-85, A-86b, A-87b**; A-90 is in OPEN-21 (2); **A-96 and A-98 appear in no OPEN item**. The base rules of A-86 ("inactivity end … dated at the last logged Taken dose", decisions.md:536), A-87 ("End / Delete wins across devices", :537), A-89 ("Restoring a protocol deleted before today puts it in Ended", :538) and A-92 (weigh-in re-inserted, :539) sit under the header "decided 2026-10-04 by the ledger / logic (coordinator, council synthesis; no question to the founder)" (:533) — the same status as :542/:543/:544, which were moved to OPEN-21 — yet they are in no AD, DL or OPEN item. |
| AD-12 | BAD-CITE | Only source: features.md:258 (registry A-118, Source column "founder 2026-10-09"). The founder reported the bug ("Weighed in, Today still asked to weigh in"); the rule "follow the check's real state" is the builder's fix (commit 4dade55 "texts x6"). Not a decisions.md line nor a signed row; the AD itself says "it should be added to decisions.md" and the 2026-10-12 sections did not add it. No grok note of 2026-10-09 exists (grok/286 is 10-08, grok/287 is 10-12). Better as DL (follows from the reported bug). OPEN-07's statement "the A-118 texts approved on 2026-10-09" has no source either. |
| AD-28 | STRETCHED | features.md:257 (A-117): Source column "Claude 2026-10-07 (founder: 'escreva e me dê um handoff para cowork')". The founder asked for the policy text and a handoff; "the in-app policy ×6 has the same content as the website" is the registry author's scope, not his words, and not in decisions.md. Logic (one policy) — DL, not AD. |
| AD-43 | STRETCHED (+ BAD-CITE for the counsel part) | :300 "Age floor 18 for the typed birth year" supports a year-based floor, but `birth_month` IS stored (lib/pendingProfile.js:16, lib/onboardingSteps.js:116; :301 "split birth month / year"), so "birth year only" is a choice the line does not make explicitly. "(counsel flag stands)" cites :388, which is about "The GDPR Art. 9 flag on the hard profile gate … Anthropic DPA … crisis-resource policy" — nothing about the 18+ test. The only line that says "uses the birth year only" is premium-and-auth.md:133, under "## Notes (not decisions)" in an unsigned spec (`checklist-signed: pending`). |
| AD-49 | BAD-CITE (marking honest) | Cited :451 sits under "Resolved 2026-10-03 by the ledger + product logic (no question to the founder)" (:445); :478 under the coordinator section (:469–470); PA-9 is in premium-and-auth.md (`checklist-signed: pending`, line 10). The "(Coordinator line …)" mark is honest but omits that PA-9 is unsigned. Founder support exists and is not cited: :287 "Monthly and Yearly carry a 7-day free trial" and signed MB-11 ("Start 7-day free trial", my-body.md:25). Re-cite :287 + MB-11 for the trial; the eligibility clause is a store rule (DL). |
| AD-51 | STRETCHED | :388 (founder memory) covers GDPR Art. 9, the Anthropic DPA and the crisis-resource policy. "Server proof of consent (A-95)" comes from features.md:236 (source "regulatory 2026-10-04", council) and "default-on analytics under ePrivacy" from :570, a line headed "applied by logic within '4 anônima'" (coordinator). Routing those two to counsel is reasonable but not the founder's answer. |
| AD-52 | STRETCHED | :554 answers council question 5 ("Deviations: eyeball them on the test build, sign before the store build (one list)", grok/270-conselho-veredito.md:34). That list is A-97 (features.md:238): "AP, MB open points 1–3, PA-4/6/16/37/39/56/90/113/128 and the premium-and-auth checklist". AD-52 additionally carries ledger Conflicts 22 (Today items incl. "51 new strings ×6", :423), 23 (tracker gauge, :424), 25 (grok/205 Journey calls, :426), 26 (grok/199 Protocols calls, :427) and 28 (delete-dose layout, :429) onto that list and calls them "not founder questions". He still signs them, so nothing is taken from him, but :554 does not say these conflicts go there. |
| AD-57 | NOT-A-FOUNDER-ANSWER (marking honest) | :570 "Regulatory review (council 2, 2026-10-05), applied by logic within '4 anônima' … Store build still needs: 'anonymous' wording → 'not linked to your account'". Coordinator line that changes visible privacy copy ×6 and the store labels. Same status as AD-46 (:545 "Privacy, by logic"), which was moved to OPEN-21 (7); keeping AD-57 in the AD table is inconsistent. Belongs in OPEN-21 (or as DL with the wording for approval). |
| AD-60 | STRETCHED (contradicts itself) | Lists as already decided "the supply push fires at 3 doses left (one rule, decisions.md:148)" and in the same cell says "The push threshold 2 → 3 has no dated approval (Conflict 31, decisions.md:432) → OPEN-18 (5)". OPEN-18 item 5 asks "Keep as built … or back to 2". One item cannot be both decided and open. Drop the push-at-3 clause from AD-60. (The other two clauses — the vial-finished pop-up in the approved Today proposal :142, the A-33 test closed by :341 — are VALID.) |
| AD-65 | STRETCHED | Founder: Q9 = B "Low stock stays amber with coloured days" (grok/172:14) and "A, dias coloridos" over the V10 grey fix in the **Today** proposal (grok/182:11, grok/183:4–6; decisions.md:147). "My Protocols included" (green above 7 days on the Protocols screen) is an extension: ProtocolsScreen.js:197–200 follows DESIGN.md §2.5 ("Supply words only: ≤3 days risk, ≤7 attention, else the plain caption") from the approved design system (:54 "Semantic colours only on dots, ticks and short words"). Today's colouring = AD; extending it to Protocols = DL at best, picture first (it changes an approved screen). |

## 3. DL items that are not VALID

| DL | Verdict | Evidence |
|---|---|---|
| DL-22 (rtu part) | ACTUALLY-FOUNDER-CALL | "an rtu new vial is a new row that asks for the new box date" is registry A-08 F6: features.md:148 "Manual 'start new vial' for recon protocols; ask for a new expiry on RTU new vial; 'doses already used' … (F5, F6, F7) … Not confirmed; needs a founder decision." The reclassification moved only F5 (recon) to OPEN-01 "(registry A-08 F5 waits for the founder)", but OPEN-01's own context says "Registry A-08 (F5–F7) has waited for this answer since 2026-09-13". F6 is decided in DL-22 and claimed by OPEN-01 at the same time. It also adds a new prompt. (Replacing an empty rtu vial — the DV-027 dead end — is genuine logic and can stay.) |
| DL-68 | ACTUALLY-FOUNDER-CALL | decisions.md:417 (Conflicts, "Long-standing open founder items from the registry") lists "target ETA staleness cutoff and BF% targets (2026-09-13)". The BF% part is answered by :241 ("weight and/or body-fat target"); whether an old weigh-in window still drives an ETA (a cutoff or not) is a product preference, not a consequence of how features connect. Verification 07 (P-02) already asked that it be shown; it is in the PT "Para você saber" list, but it should be a question. |
| DL-71 | ACTUALLY-FOUNDER-CALL (false premise) | :417 lists "whether existing false Missed rows get migrated (S-18)" as an open founder item. The reason says "users can correct or delete them in the Dose log": a Missed row opens `openMissedEditor` with only Mark taken / Mark skipped / Cancel (screens/LogScreen.js:112-121); a Missed row cannot be deleted, and a deleted past-day dose "shows Missed at the next scan" (:191). A false Missed from a time-zone change (no dose was due) can only be turned into a false "Skipped". With no user remedy, leaving wrong health records vs removing identifiable app-written rows (precedent :536 "Missed rows the APP wrote after that end are removed") is a risk call. The PT summary repeats the false premise ("a pessoa corrige ou apaga no registro de doses"). |
| DL-75 | CONTRADICTS-progress-one-card.md PO-12 | Signed PO-12 (progress-one-card.md:26, signed 2026-10-03 "5 assino"): "Daily burn shows only when weight + height + age + sex all exist (founder option A)". The founder's words (grok/206:6, 2026-10-02): "do not show calories until height, age and sex are filled". DL-75 limits PO-12 to the formula estimate, relying on the earlier :240 (2026-09-13). The reading is sensible, but it changes the literal text of a signed row and the founder's later words; DL-66 (FL-3) and the Settings half of DL-45 (SP-1/RC-1) were sent to the founder for exactly this reason. The AD-45 → DL-75 move should be AD-45 → OPEN (or a deviation signed on OPEN-18). The PT summary cites only "a sua linha de 13/09". |
| DL-26 | ADDS-UNAPPROVED-UI | DV-058 fix: "`realityCheckRules.checkAlert` returns `locked` / `no_result` variants; the Today text follows" — new Today alert texts ×6 (only `today_alert_rc_ready` exists, i18n/translations.js:526). :85 "Every new or changed string needs founder approval in all 6". It also overlaps OPEN-09 (what happens and what is shown when the math gives no number): DL-26 rules out OPEN-09 option C. |
| DL-30 | ADDS-UNAPPROVED-UI | New labels on Progress (picture first). OPEN-16 itself lists it: "Some logic decisions add new UI that was never approved, only derived (… DL-30 …)". |
| DL-43 | ADDS-UNAPPROVED-UI | New chart layout (one series per unit, x by date; picture first). Listed in OPEN-16 as new UI never approved. |
| DL-49 | ADDS-UNAPPROVED-UI (and extends signed RC-3) | New Reminder check rows. Signed RC-3 (reminder-check.md:18, signed 2026-10-05) lists the Android checks: "notifications allowed; the 'Dose reminders' category on; battery …". Adding the check-in / vial-alert channels widens a signed check list. Listed in OPEN-16 as new UI. |
| DL-55 | ADDS-UNAPPROVED-UI | "withdrawable in Settings" = a new Settings › Data & privacy row (DV-007). Listed in OPEN-16 as new UI. |
| DL-58 | ADDS-UNAPPROVED-UI | A new "what you track" editor in Edit profile (DV-113). Listed in OPEN-16 as new UI. |
| DL-60 | ADDS-UNAPPROVED-UI | A new billing line + store link in the delete-account sheets ×6 (DV-087). Store guidance makes the content non-negotiable, but the line and its wording ×6 were never approved (:85). Not in OPEN-16's list. |

Note on the ADDS-UNAPPROVED-UI group: the document does route their timing to OPEN-16 (a) and marks most "picture first", so the founder sees them before code; but the table header "Decided by logic — no question to the founder" still decides that they are added at all, which the brief defines as scope. They should either move to OPEN-16 explicitly or carry "(new UI — founder approves the picture)" in the decision text.

## 4. Reclassification table (OPEN-DECISIONS.md:296–330)

All 31 moves checked against their destinations.

| Move | Correct? | Destination contains the question? |
|---|---|---|
| AD-04 → OPEN-21 (1) | yes (:599 "By logic from that principle (founder may override)") | yes |
| AD-07 narrowed; tracker → OPEN-17 | yes (commit b215b32 "The streak on a protocol's card counts doses"; lib/doseStreak.js:2) | yes |
| AD-09 narrowed; copy → OPEN-21 (2) | yes (:544 coordinator; :614 founder) | yes |
| AD-10 → OPEN-21 (3) | yes (:543) | yes |
| AD-11 narrowed; rules → OPEN-21 (4) | partly | **no** — OPEN-21 (4) names A-85, A-86b, A-87b only; A-90 is in (2); A-96, A-98 nowhere; A-86/A-87/A-89/A-92 base rules (:536–:539) not moved (see AD-11 above) |
| AD-27 → OPEN-20 (b) | yes (:623 does not say it; :626 and signed SP-5 reopen the screen for "Not now" users) | yes |
| AD-29 → OPEN-21 (5) | yes (:542) | yes |
| AD-35 → OPEN-21 (6) | yes (BK-14 scope, :378) | yes |
| AD-44 → OPEN-18 (4) | yes (Conflict 40, :441) | yes |
| AD-45 → DL-75 | **no** — DL-75 narrows the signed PO-12 (see §3); should be OPEN / signed deviation | n/a |
| AD-46 → OPEN-21 (7) | yes (:545) | yes |
| AD-50 → OPEN-21 (8) | yes (:506) | yes |
| AD-54 → OPEN-21 (9) | yes (Conflict 29, :430) | yes |
| AD-56 → OPEN-14 (a) | yes (:544 vs :104 and signed MB-10) | yes |
| AD-61 narrowed; gym → OPEN-21 (10) | yes (:458 under "Resolved … by the ledger + product logic") | yes |
| DL-03 narrowed → OPEN-17 | yes | yes |
| DL-06 narrowed → OPEN-19 (c) | yes | yes |
| DL-08 narrowed → OPEN-19 (d) | yes | yes |
| DL-16 → AD-65 | direction right (DL-16 reversed Q9 = B); AD-65 stretches to Protocols (§2) | n/a |
| DL-22 narrowed → OPEN-01 | partly — the rtu box-date question (A-08 F6) should have moved too (§3) | yes (recon), and OPEN-01 claims F5–F7 |
| DL-24 → OPEN-05 | yes | yes (options A and C) |
| DL-28 rewritten | yes (:251 "per user per day … resets at local midnight"; signed FL-22) | n/a |
| DL-32 → OPEN-18 (1) | yes (:205) | yes |
| DL-45 narrowed → OPEN-20 (a) | yes (signed SP-1 / RC-1) | yes |
| DL-50 withdrawn (moot) | yes (signed SP-4 "right after 'Turn on notifications' is answered"; 07 X-05) | n/a |
| DL-51 → OPEN-07 | yes | yes (A-24 named) |
| DL-66 → OPEN-18 (2) | yes (signed FL-3) | yes |
| DL-67 → OPEN-19 (b) | yes | yes |
| DL-72 → OPEN-16 (b) | yes | yes |
| DL-73 withdrawn (false premise) | yes (lib/wheelPick.js:16 `y0 = Math.min(now.getFullYear() - 10, y)`) | n/a |
| DL-74 → OPEN-16 (b) | yes | yes |

## 5. decisions.md 2026-10-12 sections

- No earlier line edited: `git diff aeb5bca HEAD -- docs/decisions.md` = one hunk at line 634 with additions only; `git diff 897f01d HEAD` changes lines 642, 645, 648, 651, 653, 661, 667, 669, 673, 677, 690, 695, 696, 711, 712, 717–720 only (all inside the two 2026-10-12 sections). Working tree clean for this file.
- WITHDRAWN lines (DL-24, 32, 50, 51, 66, 67, 72, 73, 74) each name the destination (OPEN-05, OPEN-18 item 1, moot, OPEN-07, OPEN-18 item 2, OPEN-19 (b), OPEN-16 (b), false premise, OPEN-16 (b)). CORRECTED lines (the :642 streak line, DL-03, 06, 08, 16, 22, 28, 45) each name what stays and where the rest went. DL-75 added (:720). All match OPEN-DECISIONS.md.
- Drifts (not edits of old lines):
  1. Section header :645 still says "DL-01…DL-74" (DL-75 now exists) and "Production changes that follow from a DL (DL-64, DL-72)" — DL-72 is withdrawn and DL-28 (rewritten) is now a server change too.
  2. Corrections made in OPEN-DECISIONS ("Other corrections without reclassification: … DL-10 (flow 03 §7.2 must match), DL-14 (citation), DL-19 (reason)") are not mirrored: decisions.md:664 still gives DL-19's reason as "The longest ester in the catalogue is ~12 weeks", OPEN-DECISIONS gives the Testosterone Undecanoate / assistantSchema reason; :655 and :659 keep the old text.
  3. AD-12 says the A-118 founder line "should be added to decisions.md"; it was not.
- The :642 line ("founder line missing from the ledger") is a 2026-10-12 reconstruction by the coordinator from commit b215b32's message and code comments (lib/doseStreak.js:2, TodayScreen.js:610). No grok note holds the founder's words of 2026-10-05 (grok/272–274 do not exist; grok/276 mentions only the DE streak truncation). It is honestly labelled, and the CORRECTED note correctly limits it to the card; AD-07 is accepted on that basis.

## 6. Notes on VALID items (no reclassification needed, but worth knowing)

- AD-26: the founder line is decisions.md:165 ("A-45 build a real vial-EXPIRY alert behind the existing toggle"); the AD cites only the registry row. Re-cite :165.
- AD-48: carries its own logic extension (Dose-log Missed → Complete path), honestly marked.
- AD-55: :266 (founder) says never ranges; :417 still lists "the lab reference-range band (regulatory call)" as an open registry item. The later line wins, but the ledger Conflicts entry is stale.
- AD-58: "No move to promotional grants is scheduled" is status, not a decision; :417 still lists "moving hard-coded premium accounts to RevenueCat promos" as open.
- AD-59: rests on a blanket "Aprovado / Siga" (grok/228:3–7) — "approval inferred" under the ledger's own convention (:8).
- AD-62: Conflict 37 (:438) says the landscape default was "never confirmed"; :77 quotes the founder's "do it correctly, take your time". Accepted.
- DL-01: could be AD — :379 (founder, 2026-10-01) "kept until answered"; the code agrees (lib/siteQuestion.js:47 "Never dropped for its age").
- DL-02: the report streak is per protocol (SettingsScreen.js:385–416), the same concept as the card, so following AD-07 is logic; the string `report_streak_line` "Current streak: {days} days" ×6 must change — wording to the founder (:85).
- DL-18, DL-19: both tighten the manual form (mix date ≤ 365 days back; interval 999 → 365). Logic (one bound everywhere), but they add refusals to the form :324 calls "fully free (anyone can type anything)". Low risk.
- DL-28, DL-48, DL-61: change or add copy (a row state, the persistent-reminders line, "free days"); the decision is logic, the wording ×6 needs the founder's approval (:85).
- DL-69: settles ledger Conflict 30 (:431, "the parse rule was the assistant's own"); genuine logic for the round-trip of displayed numbers.
- DL-70: settles the :417 item "iOS supportsTablet" by the closed-scope rule; logic, and shown to the founder in the PT list.
- DL-37: settles the :417 item "Enanthate/Nandrolone time-to-peak" by the founder's PK evidence rule (:202).
