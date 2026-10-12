# DoseTrace — open decisions (one round)

- Compiled 2026-10-12 from the 8 dossiers in `docs/product/research/`, `docs/decisions.md`, `docs/specs/*.md` and `docs/review/features.md`, together with `docs/product/DIVERGENCES.md` (the DV-xxx rows referred to below). No code was changed.
- **This is the single list of founder questions for the PRD / TRD / flows round.** Reconciled the same day with `PRD.md` (its former §7, OPEN-1…OPEN-69), `TRD.md` (§9.1, nine questions, and the "Decision?" column of §9) and `flows/` (the README's 36-question round and every flow's §12). Each of those questions carries a canonical ID from this file; the crosswalk is in "Where every earlier question went" below.
- **Verified 2026-10-12 in two rounds.** Round 1 (`docs/product/verification/01…07`) and round 2 (`docs/product/verification/round2/R2-01…R2-07`): independent agents opened every AD citation, checked every DL against the earlier ledger lines and signed rows, and checked every OPEN premise against the code. Every round-2 finding was re-checked in the code or the ledger before it was applied; the findings that were rejected, and why, are in `docs/product/verification/round2/id-map.md`, which is also the one table of every id whose status changed.
- Authority, in order: (1) the founder's own lines in `docs/decisions.md`; (2) founder-signed rows in `docs/specs/*.md`; (3) the binding prototype `docs/design/prototype.html`, unless a LATER founder line says otherwise; (4) the code. Lines the coordinator wrote ("by logic", "coordinator", "resolved by the ledger", council syntheses — decisions.md:445-461, :469-509, :519-548, :580-583, :599, :644 onward) are never founder answers.
- The CLAUDE.md rule "decide what is already decided" was applied to every question:
  1. If a founder line in `docs/decisions.md` or a founder-signed spec row answers it → **Already decided (applied)**, with the citation (AD-xx). An AD says only what that line or row says.
  2. If the answer follows from how the features connect and why they exist → **Decided by logic**, one-line reason (DL-xx). Taste, money, risk, scope, visible copy or UI never approved, and reversing a founder line or signed row are never logic. When a logic decision needs a new screen or text, the principle stays a DL and the new screen or text goes to OPEN-24.
  3. Only real preferences (taste, money, risk, scope) remain **OPEN** (OPEN-xx).
  4. Founder actions that are not questions (a production go, a wording approval in 6 languages, a signature, a download) are listed in **Approvals still owed**.
- **Counts after round 3 (2026-10-12): 23 OPEN questions open** (OPEN-01…OPEN-11, OPEN-13…OPEN-24; OPEN-22…OPEN-24 are new in round 2; OPEN-12 closed; parts of OPEN-14, OPEN-18, OPEN-19, OPEN-20 and OPEN-21 closed). **62 Already decided in force** (AD-01…AD-76 minus 14 moved out; 11 added in round 2: AD-66…AD-76). **87 Decided by logic in force** (DL-01…DL-101 minus 14 withdrawn or moved; 23 added in round 2: DL-76…DL-98; 3 added in round 3: DL-99…DL-101, coordinator lines placed as logic). **231 active divergence rows** (15 S1, 103 S2, 44 S3, 69 S4), plus 3 ops items, 4 merged rows and 3 closed rows.
- Every answer the founder gives goes into `docs/decisions.md` the same day. The DL list and the 2026-10-05 streak line were added to `docs/decisions.md` on 2026-10-12; both verification rounds corrected that section the same day (withdrawn, moved and corrected lines are marked there; earlier lines are never edited).
- A Portuguese version of the OPEN list and of the approvals, ready to send as one message, is at the end.

---

## OPEN — questions for the founder

### Scope

#### OPEN-16 — What enters 1.3.0, and when the sync hardening ships
- **Question.** (a) Which of this round's fixes enter 1.3.0, and which go to the next build with a target written in the registry? (b) Does the sync hardening ship in 1.3.0 or in the next build?
- **Context.**
  - (a) The defect list holds 231 active rows (15 S1, 103 S2, 44 S3, 69 S4) and no DL or DV row has a target build yet. The new screens and texts that logic decisions would add are listed, each with a picture first, in OPEN-24. Two founder rules meet here: "Vamos resolver tudo. Sem pendência" (2026-10-07: no production submit while any item is open, decisions.md:634) and evolution rule 2 (a build's scope is closed; new items get a target build and are never slipped in silently). "Approved → next build" covers what the founder approved.
  - (b) Four ways a synced row is lost or wrong between two phones, all confirmed in the code: (1) DV-182 — a dose deleted on phone A stays on phone B, and if B then edits it, it comes back on A (the cloud delete is a hard delete; the other phone never hears of it); (2) DV-183 — two doses logged offline on two phones leave the vial or bottle counter one short (both rows are in the Dose log; only "N of M left" and the bottle count are wrong), and a note edited on A can be reverted by B's next dose; (3) DV-222 (new in round 2) — once a phone pushes its own new row, the rows another phone saved earlier in the same table are skipped by its pull for good: a dose, meal, weigh-in or lab value saved on one phone may never appear on the other; (4) DV-209 / DV-210 — two rarer timing cases with the same outcome. (3) happens in ordinary sequential use (log offline on one phone, then on the other), not only in simultaneous use.
  - The founder's own line, decisions.md:199 (AD-32, 2026-09-28): "Concurrent multi-device use is not a real DoseTrace use case (A-48 parked)". Next to it, the facts: the founder himself uses an iPhone and a Galaxy Z Fold with the same account, and cases (1)–(3) need no simultaneous use — only two phones used one after the other, or one phone offline for a while. AD-32 stays as written for truly simultaneous edits (DV-041, duplicate Missed rows); it does not cover (1)–(3).
  - The fixes change how deletes and edits travel between phones on every synced table: production migrations (a tombstone per table; probably a server function for the counters), a server change for the watermark, Gate B and a two-device test of update-over-old-version. DV-222 and DV-210 are client-only. All five are plain bugs; what the founder decides is the timing and the risk.
- **Options.**
  - (a) A — Everything in 1.3.0 ("Sem pendência"); the store release waits for all of it. B — 1.3.0 = every S1 and S2 row, every item the founder already approved, every copy fix; S3 / S4 rows that add a screen or control nobody approved yet (OPEN-24 answered "later"), and code hygiene (dead code, source guards, doc drift), get a 1.3.1 target in the registry. C — 1.3.0 = S1 rows and approved items only; the rest 1.3.1.
  - (b) A — All of it (DV-182, DV-183, DV-209, DV-210, DV-222) in 1.3.0, behind Gate B, rolled-back dry runs and a two-device test. B — Deletes, paging and the pull cursor (DV-182, DV-210, DV-222, DV-209) in 1.3.0; the counters (DV-183) in 1.3.1. C — All of it in 1.3.1; 1.3.0 ships with the holes documented.
- **Recommendation: (a) B, (b) A.** (a) B ships every approved item in the next build (the standing rule) and keeps every user-visible error out of the store, without slipping unapproved new screens into a closed build; every 1.3.1 target is written down, so nothing is dropped. B fits "Sem pendência" only if a written, founder-accepted target counts as decided rather than pending — if not, A. (b) A: a deleted dose that comes back, a counter that is one short, and above all a dose that never reaches the other phone are wrong health records (S1), and the founder's own two-phone use hits them; 1.3.0 is the build every phone updates to — but only with the full Gate B and the device proof.
- **Related:** every DV row; DV-182, DV-183, DV-209, DV-210, DV-222; DV-041 (AD-32).
- **Replaces:** DL-72 and DL-74 (withdrawn round 1); consistency findings Q-06, D-03, D-10.

#### OPEN-24 — New screens and texts that logic decisions would add (pictures first, all 6 languages)
- **Question.** Each item below follows from a logic decision (DL), but adds a screen element or a text the founder never approved. Do they go ahead (each shown as a picture in both themes and approved before code, texts in all 6 languages), and which wait?
- **Context.** decisions.md:85: every new or changed string needs the founder's approval in all 6 languages; CLAUDE.md: show the layout before building. The principle of each item stays decided by logic; only whether to add the visible part, and when (OPEN-16 (a)), is his.
  1. Settings › Data & privacy: a row to withdraw AI consent (DL-55, DV-007; GDPR Art. 7(3)).
  2. Edit profile: an editor for "what you track" (DL-58, DV-113).
  3. Progress: each "days" count labelled by what it counts (DL-30, DV-146).
  4. Lab charts: one line per unit, points spaced by date (DL-43, DV-080).
  5. Reminder check: rows for the channels of the food question, the weekly check-in and the vial alerts (DL-49, DV-098; widens the signed RC-3).
  6. Delete account: a line telling Premium users that the store keeps billing, with a link to the store page (DL-60, DV-087).
  7. Today: what the alert says when a reality check is "ready" but locked or without a number (DL-26, DV-058; the texts depend on OPEN-09).
  8. Food chat: a row marked "not read yet — daily limit reached", with its notice (DL-28, DV-066).
  9. Today: a short message when a reminder is tapped for a dose already logged (DL-10, DV-036).
  10. The 18+ and profile gates: the same "Sign out anyway" as Settings (DL-92, DV-114).
  11. My Protocols: days left coloured like the Today card (green above 7 days) (DL-80, DV-018).
  12. Today: "All caught up" on a day finished with a skip, with the skipped line still visible (DL-12, DV-129).
- **Options.** A — All twelve go ahead, each approved from a picture before code; the build target follows OPEN-16 (a). B — All except the numbers named (those are dropped or get a later target).
- **Recommendation: A.** Each one makes the app tell the truth or close a gap the user can hit (consent withdrawal is a legal requirement; a billing warning is store guidance); the picture round keeps every visual choice his.
- **Replaces:** the list of "logic decisions that add new UI" in the round-1 OPEN-16 (a); the "picture first" notes of DL-12, DL-26, DL-30, DL-43, DL-49, DL-55, DL-58, DL-60.

### Protocols and supply

#### OPEN-01 — Correcting the vial in use, "New vial" for powder protocols, and the new box date
- **Question.** Should the protocol page let the user correct the current vial (mix date, validity window, doses already drawn), should powder (recon) protocols get a "New vial" button there, and should a new ready-to-use box ask for its printed expiry date?
- **Context.** The mix date and the 30-day window are typed once (wizard step 5 or Today's "Log new vial") and can never be changed (`ProtocolsScreen.js:3171`: the vial step renders only on create); a new protocol always starts its vial at 0 doses taken (`:1897`), even when the person started the vial weeks before installing the app. A typo or a half-used vial gives a wrong "days left", a wrong "N of M doses left", a "Past window" tag on the wrong day and a supply alert at the wrong time, for the whole life of that vial. At a Restart the founder already gave a way to keep using the old vial ("New vial / Continue the same vial", decisions.md:614, built); the gap is a part-used vial at FIRST creation, correcting a typo, and starting a powder vial before the old one is empty. A recon vial can be replaced only from Today's prompt when it is finished or missing, so an expired but not empty vial ("Past window") has no next step (DV-093). A ready-to-use protocol's "New vial" today resets the same row and keeps the old box's expiry date (DV-027); that an empty one can be replaced, as a new row, is decided by logic (DL-22), but asking for the new box's date is a new question in the flow (registry A-08 F6). The AI assistant mirrors the form (AP-28). Registry A-08 (F5–F7) has waited for this answer since 2026-09-13.
- **Options.**
  - A — On the protocol page: "Edit vial" (mix date, validity days, doses already used) and "New vial" for powder (the same prompt as Today) and for ready-to-use (asking the box's expiry month and year, blank allowed). Picture first; one sheet each, strings ×6; writes only the vial row.
  - B — Only ask "doses already used from this vial?" when a protocol or vial starts in the past; powder "New vial" stays on Today; a new ready-to-use box keeps no date (blank).
  - C — No change beyond DL-22 (an empty ready-to-use vial can be replaced; blank date).
- **Recommendation: A.** The app's own supply alerts and expiry tags come from these numbers; under "enter once, used everywhere" (A-54) a wrong entry must be correctable in one place, and a new box has a new printed date.
- **Related:** DV-094, DV-093, DV-027, DV-199, DV-015. **Merged here:** the recon part of DL-22 (round 1) and its rtu box-date part (round 2).
- **Also asked as:** PRD OPEN-11 and PRD OPEN-12; TRD §9.1 Q8; flows README #4 and #12.

#### OPEN-02 — Should oral bottles warn when supply is low?
- **Question.** Should capsule / tablet / powder bottles get the same "running low" warning as vials?
- **Context.** The one supply rule (1–3 doses left, FX-11) drives the Today alert, the push and the Protocols badge — for vials only (`supplyLow.js:18-23`). A bottle can run out with no warning anywhere. (The days-of-supply math for orals every 2+ days is also wrong — DV-020 — a plain bug, fixed regardless.)
- **Options.**
  - A — Same rule for bottles (1–3 servings left) in the Today alert, the push and the Protocols badge.
  - B — Only an amber "N servings left" line on the card; no alert, no push.
  - C — No change.
- **Recommendation: A.** One rule for one concept (FX-11); a bottle running out matters as much as a vial. New strings ×6.
- **Related:** DV-092, DV-020.
- **Also asked as:** PRD OPEN-14; TRD §9.1 Q8 and R-42; flows README #13.

#### OPEN-03 — What happens when a fixed course of doses ends?
- **Question.** For protocols that have a total number of doses: should the end of the course end the protocol, and should the form offer "total doses" again?
- **Context.** The founder's council-3 answer (decisions.md:620, recorded as BR-12's approved deviation): protocols with a total number of doses end their reminders when the course ends. But the form has not let anyone set a total since commit 024c616; only older protocols carry one. For those, reminders stop while Today keeps asking for the dose (its "Day X of Y" line stops at the total, `TodayScreen.js:1675-1683`) and Missed rows pile up until "Still going?" appears.
- **Options.**
  - A — When the course ends the protocol ends automatically (Ended, dated at the last dose). Silent: someone who continues past the planned count loses reminders and the Today card without being asked.
  - B — When the course ends, Today, the Missed scan and the curve stop expecting doses (like the reminders), and Today asks "Course complete — end {name}?" with End / Keep going (like "Still going?"). Keep going removes the total.
  - C — Retire courses: ignore the total everywhere (reminders continue). Contradicts decisions.md:620.
  - Sub-question: bring "total doses" back to the form? Yes / No.
- **Recommendation: B, and do not bring the field back for now.** It keeps the founder's rule, asks before ending (as the inactivity prompt does), and matches the reminder principle "remind until the user ends it".
- **Related:** DV-012.
- **Also asked as:** PRD OPEN-10; TRD §9.1 Q3 and R-03; flows README #16.

#### OPEN-04 — Should Recently deleted ever empty itself again?
- **Question.** Once 1.3.0 is out, should the automatic 7-day purge of deleted protocols come back?
- **Context.** Paused through 1.3.0 by logic (DL-94: deletes made by the old "Yes, it's finished" button cannot be told from deliberate ones and the cloud cascade would erase their doses — never destroy on a maybe). Emptying it by hand, with multi-select ("Delete forever"), was approved by the founder (decisions.md:501, :515) and is built.
- **Options.**
  - A — Never purge automatically; Recently deleted keeps everything until the user deletes it forever. The delete sheet then says exactly that.
  - B — Purge after 7 days only protocols deleted from 1.3.0 on (they can be marked); keep the older ones.
  - C — Purge everything after moving dose logs off the cloud cascade. Largest change, highest risk.
- **Recommendation: A.** With "Delete forever" and multi-select already there, an automatic purge adds risk and no user value; storage is negligible ("never destroy on a maybe").
- **Related:** DV-125, DV-023.
- **Also asked as:** PRD OPEN-68; flows README #17.

#### OPEN-05 — The 3-protocol free limit: on the server, and after Premium ends
- **Question.** Should the server refuse a 4th active protocol for a free user, and what happens to a Premium user who stops paying with more than 3 active protocols?
- **Context.** The limit (3, "3 mantém", decisions.md:465) is checked only on the phone at add / restart / restore (`ProtocolsScreen.js:1290`, `:1309`, `:1880`, `:2053`). A protocol that arrives by sync, was created while Premium or is revived is never checked when it arrives; it only counts against that phone's next add, so a second phone or an old build can go over it. Today a lapsed Premium user keeps every active protocol (nothing ends them). This is a money rule, so it is the founder's (DL-24 withdrawn in round 1).
- **Options.**
  - A — Phone-only, as today; a lapsed Premium user keeps every active protocol and cannot add or restart one above 3 until paying again.
  - B — The server refuses the insert of a 4th active protocol for free users. In an offline-first app the refusal arrives at sync, after the protocol was created on the phone: a health record in limbo.
  - C — B plus a downgrade rule on lapse (e.g. protocols beyond 3 become Ended — their reminders stop).
- **Recommendation: A.** Ending protocols on lapse would stop reminders for something the person still takes (principle 2026-10-07) and holds data hostage; a server refusal risks losing an offline health record; no revenue need today.
- **Related:** DV-095. **Merged here:** DL-24 (withdrawn).
- **Also asked as:** PRD OPEN-15; TRD §9.1 Q6 (limit part; food access is AD-16) and R-16; flows README #7.

### Today and doses

#### OPEN-17 — The Today tracker's streak: days or doses, and its words
- **Question.** Should the Today tracker's streak (the flame, "N days without a miss", "On fire!" at 7) keep counting days, count doses in a row like the protocol card, or count days with words that fit a weekly protocol?
- **Context.** On 2026-10-05 the founder changed the streak on a protocol's card to count doses, because a weekly protocol showed "2 days without a miss" (commit b215b32; AD-07). The Today tracker is separate: it already skips days with nothing due (`TodayScreen.js:801`, "rest day — neither adds nor breaks") and stops looking back at 31 days (the year look-back is decided by logic, DL-03). So for a person whose protocols are all weekly, the tracker today counts dose days and still reads "2 days without a miss" (PT "2 dias sem falhar", `today_streak_days`) after two weekly doses — the very text the founder rejected on the card. The binding prototype shows "2 days without a miss" and the approved Today tracker has "the flame + streak" (decisions.md:143). "Doses in a row" across several protocols is not defined.
- **Options.**
  - A — As built: days, rest days skipped, wording unchanged ("N days without a miss"); 365 days back. A weekly-only user keeps reading "2 days without a miss".
  - B — Doses in a row on the tracker too (needs a rule for several protocols; new strings ×6).
  - C — Days as built, but the line counts dose days in words that read right for a weekly user (e.g. "2 dose days in a row", ×6); 365 days back.
- **Recommendation: C, with a picture of A and C first.** It keeps the tracker's meaning ("how many due days have I kept everything on track") and removes the wording the founder rejected; B needs a new multi-protocol rule for little gain.
- **Related:** DV-034. **Replaces:** the unit part of DL-03; the "applies to every streak" sentence of decisions.md:642 (corrected round 1).
- **Also asked as:** PRD OPEN-5; TRD §9.1 Q4; flows README #11.

#### OPEN-19 — Undo after Skip
- **Question.** (d) Does "Skip" on Today get an Undo bar?
- **Context.** Today shows an Undo bar after every "Mark complete" and after "Didn't take" on yesterday's pending dose (`TodayScreen.js:702`, `:710-717`), but none after "Skip" (`:1163-1184`). Skip is the only one of the three that already asks first (the "Skip dose?" sheet, decisions.md:150), and a skipped dose can still be marked complete from its line or deleted in the Dose log. (Items (a), (b) and (c) of this question were closed in round 2: (a) → AD-70, (b) → DL-76, (c) → DL-77. A side defect found here: after "Didn't take" the Undo bar says "Dose logged" — DV-228, a bug fixed regardless.)
- **Options.** A — An Undo bar after Skip too (one pattern on Today; Undo re-arms the reminders, DL-09). B — No Undo after Skip, and none after "Didn't take" either. C — As built (mixed).
- **Recommendation: A.** One Undo pattern on one screen; the "Skip dose?" sheet stays.
- **Related:** DV-130. **Replaces:** the Undo part of DL-08.
- **Also asked as:** PRD OPEN-2; TRD §9.1 Q5; flows README #8.

### Reminders

#### OPEN-06 — iPhone reminders for someone who stops opening the app
- **Question.** How should iPhone keep reminding a person who keeps taking something but does not open the app?
- **Context.** Founder principle 2026-10-07: reminders continue for as long as the person takes it, opened or not ("É obrigação do aplicativo que avise até a pessoa entrar no aplicativo e deletar esse protocolo"). Android has it **built** (background refresh, daily silent wake-up, rebuild after update / reboot) but **not yet proven on a device**: the A-110 / A-111 device proof is pending and spec-audit still fails BR-9, BR-10 and RG-6/7/8. iPhone has none (BR-11 kept iOS untouched): its reminders are scheduled up to 10 days ahead at most (fewer with many protocols; Apple's 64-notification cap, `notificationPlan.js:301-310`) and simply stop, with no warning.
- **Options.**
  - A — Keep local scheduling; the last notification of the window becomes "Open DoseTrace to keep your reminders coming", plus a Today line when the window is short. Small; it still needs the person to open the app once, so on its own it does not meet the principle.
  - B — Server push for iPhone (send-reminders with everything it lacks: Silent mode, Show names, action buttons, repeats, food access — A-62). The only option that meets the principle; large work, running cost.
  - C — iOS background app refresh. iOS runs it rarely and never after a force-quit; no guarantee.
- **Recommendation: A now, B as its own item right after (target per OPEN-16).** A closes the silent failure cheaply; only B meets the principle, and it deserves its own spec.
- **Related:** DV-097.
- **Also asked as:** PRD OPEN-19; TRD §9.1 Q7 and R-15; flows README #18.

#### OPEN-20 — Two reminder details
- **Question.** (b) When should the system ask for notification permission after "Not now"? (c) Are the vial-expiry alert's lead time and words right?
- **Context.**
  - (b) The app CALLS the permission request at every signed-in cold start and sign-in (`App.js:650`, `:730`) and inside the push-token registration (`notifications.js:1033`), seconds after the person said "Not now" in onboarding (DV-054). The system DIALOG itself appears only while the answer is still undecided (`notifications.js:157-160`): once on iPhone, at most twice on Android 13+. The signed SP-5 opens "Make sure your reminders arrive" once for an ANDROID user with a reminder time; iPhone has no such screen. So with a plain "never at start" rule, an iPhone user who said "Not now" and later gets a protocol with a reminder time by sync (new install, sign-in on a new phone) would never see the system dialog. (AD-27, which said "not asked again", was moved to this question in round 1.)
  - (c) Built 2026-10-03: a push 7 days before and on the expiry day at 09:00 (Today's own 7-day rule and words), the next one per vial (`notificationPlan.js:255-283`); the registry says "Founder to confirm the lead time and words" (features.md A-45; decisions.md:165, :417). The words are also on the test-build look list (Approvals still owed).
  - (Item (a), Settings red with dose reminders off, was closed in round 2: the signed SP-1 / RC-1 define Settings by blocks, as built — AD-71.)
- **Options.**
  - (b) A — No system dialog at start; it is asked when a protocol with a reminder time is first saved on the phone or first arrives on it by sync, and on Android through the SP-5 screen. B — Ask once more at the next start, then never. C — As built.
  - (c) A — As built (7 days before + the day; Today's words). B — 3 days before + the day. C — Only on the day.
- **Recommendation: (b) A, (c) A.** (b) Respects "Not now" and asks at the moment the person has asked for a reminder, including the iPhone user who arrives with synced reminders. (c) One 7-day rule for the Today alert and the push.
- **Related:** DV-054 (b), A-45 (c). **Replaces:** AD-27.
- **Also asked as:** PRD OPEN-21; flows README #2.

### Food log, Seus números reais, Progress

#### OPEN-07 — "Seus números reais": confirm "finishes by itself" and one start weight
- **Question.** Is the reality check that finishes by itself (as built) what the founder wants, and should its start weight be that day's weigh-in?
- **Context.** Ledger 2026-09-29 (Q-A, Q-B, decisions.md:233): the check uses the weigh-ins for its start and final weight, has no weight field of its own, and offers result buttons from day 14. What was built: a start sheet with its own weight field and no buttons; the check finishes by itself at the first weigh-in on or after day 21 once there are 7 food days in a row (or typed calories) — but only when Progress is opened, and only for users who may see the result (`CalculatorSection.js:855-858`). Conflict 25 (decisions.md:426) notes the self-finishing check never got an explicit OK; the A-118 texts built on 2026-10-09 after the founder's bug report ("Your reality check is ready — tap to see it") assume it. The start weight can differ from that day's weigh-in (`CalculatorSection.js:963-964`), so the check and the chart can use two different weights. The answer also settles registry A-24 ("does saving early end the 8 PM question?"): with A or C there is no early save and A-24 closes; with B it reopens.
- **Options.**
  - A — As built (own start weight, finishes by itself at day 21+). Two start weights stay possible.
  - B — Back to Q-A / Q-B: no weight field, result buttons from day 14. Rebuild; a result taken between day 14 and day 21 is less precise than a 21-day one.
  - C — Finishes by itself as built, but the start sheet's weight IS that day's weigh-in (a different number updates the weigh-in after a confirm, like Your numbers).
- **Recommendation: C.** It keeps the flow the founder has been testing, and one weight has one home (A-54).
- **Related:** DV-061, DV-058, DV-144. **Merged here:** DL-51 (withdrawn).
- **Also asked as:** PRD OPEN-23, PRD OPEN-25; flows README #23 and #24.

#### OPEN-08 — Should "Stop" erase earlier results?
- **Question.** Should "Stop reality check" delete every earlier measured result, or only end the running check?
- **Context.** Today Stop asks first and then deletes ALL saved results (`clearRealityChecks`, `database.js:579-583`; the measured daily burn goes back to "Estimated"). The same Stop link also sits on the finished-result screen and in the locked view **with no check running** (`CalculatorSection.js:1541`, `:1475`), and one confirmed tap there wipes everything. The ledger (decisions.md:239) says Stop "clears the open check, cancels the reminders and keeps the logged food" — nothing about earlier results. The confirm text says "This clears your reality-check numbers" (EN) / "Isso apaga seus números reais" (PT); it was never approved as a decision to delete past results, and in Portuguese it reads as ending the feature, not as deleting past measurements.
- **Options.**
  - A — Stop shows only while a check is running and ends only that check; earlier results stay.
  - B — As built: Stop wipes every result, wherever it is tapped.
  - C — A, plus a separate "Delete my results" that asks first.
- **Recommendation: A (or C if a way to wipe is wanted).** Never destroy on a maybe; a past measurement is user data.
- **Related:** DV-004.
- **Also asked as:** PRD OPEN-27; flows README #22.

#### OPEN-09 — A reality check whose math gives no number
- **Question.** What should happen when the weigh-in and the 7 food days are complete but the math cannot give a saved result?
- **Context.** Three cases (`energyCalc.js:262-266`): "maintenance" (weight changed less than 0.2 kg — the person eats at maintenance), "implausible" (outside 1,000–5,000 kcal) and "too short", which in practice only happens when every day was "I ate nothing" (an average of 0 kcal; the result weigh-in is always on day 21 or later, so "under 14 days" cannot occur). Only a normal result is saved (`CalculatorSection.js:856`); in the three cases the check never closes, Today keeps saying "ready — tap to see it", and the 8 PM question keeps coming while the person can still log (a free user after the free days gets none). (The "implausible" text always says "too low", even for a high value — DV-205, a plain bug fixed regardless.)
- **Options.**
  - A — Save "maintenance" as a real result (daily burn = average intake); for implausible / too short, show the reason and close the check once the user has seen it, offering Start over.
  - B — Keep it open, but stop the 8 PM question and show the reason on Today and Progress.
  - C — As built.
- **Recommendation: A.** A weight that does not move while eating X kcal is a measurement of maintenance (arithmetic, not advice); a check that never ends breaks the daily loop. A changes a health number shown, so the energy-math check runs before the build.
- **Related:** DV-104, DV-058, DV-150, DV-205.
- **Also asked as:** PRD OPEN-28; flows README #25.

#### OPEN-22 — Two Progress details: the measured daily burn with an incomplete profile, and an old weigh-in window
- **Question.** (a) Should a MEASURED daily burn (from a finished reality check) show on the Progress card and the Journey tile when height, age or sex is missing? (b) Should the target's finish-date estimate stop showing when the weigh-ins it is computed from are old?
- **Context.**
  - (a) The signed PO-12 (2026-10-03, "5 assino"): "Daily burn shows only when weight + height + age + sex all exist (founder option A)". The founder's words behind option A (grok/206, 2026-10-02): "do not show calories until height, age and sex are filled" — said while choosing which formula inputs are required. The earlier line decisions.md:240 (2026-09-13): "a measured maintenance becomes the hero number once it exists". A measured burn needs no height, age or sex. Today the card and the tile hide it when one of them is missing, while the reality check's own result view still shows it (`CalculatorSection.js:1189`, `:1520`; `progressTile.js:42`). The signed text covers every daily burn; the words were about the formula — two readings. (DL-75, which picked one reading, was withdrawn in round 2.)
  - (b) The founder approved the estimate "labelled with its weigh-in window" (decisions.md:241); whether an old window should still drive an estimate (a cutoff, or always shown with its window) was registered as his open item (decisions.md:417, "target ETA staleness cutoff"). Built: no cutoff; the window is named. (DL-68, which decided it, was moved here in round 2.)
- **Options.**
  - (a) A — Show a measured burn whenever one exists (PO-12 amended with the founder's signature to gate only the formula estimate). B — As built and signed: no daily burn of any kind until height, age and sex exist.
  - (b) A — As built: always shown, always naming its weigh-in window. B — Hidden (with a "weigh in again" line) when the newest weigh-in in its window is older than N days (N to choose).
- **Recommendation: (a) A, (b) A.** (a) A measured result is the user's own number and needs none of the formula inputs; hiding it after a 21-day check is a loss the user feels. (b) The window is already named, so nothing is hidden or guessed.
- **Related:** DV-149 (a). **Replaces:** AD-45 (round 1 → DL-75, withdrawn round 2), DL-68.
- **Also asked as:** PRD OPEN-29, PRD OPEN-64.

### Dose accumulation curve

#### OPEN-10 — Should a dose change rewrite the past curve?
- **Question.** When the user edits the dose (or interval, start date, doses per day), should the curve keep the old values for the past?
- **Context.** The curve applies today's values to every past dose (`serumModel.js:146-147`): lower a dose from 250 to 125 mg and months of history are redrawn at 125 mg, including "Estimate on a date" next to old blood tests. The app keeps no history of edits: the protocol row has one `updated_at`, which every write moves (`database.js:162-164`), even an oral take (`markTaken.js:141`), so the date of a past dose change cannot be recovered. Open since 2026-09-13 (F2).
- **Options.**
  - A — As built, plus a note on the curve when the protocol was edited ("uses your current dose for past dates").
  - B — From now on, keep a history of changes with the date each took effect; the past uses the old values. Data-model change (synced), migration (every existing protocol starts as one version — its past edits cannot be recovered), pharmacometrics review.
  - C — Editing the dose ends the old run and starts a new one (like Restart). Heavy for users; splits the history.
- **Recommendation: B; A as a stop-gap if B cannot be built well in time.** An honest journal shows what was planned at the time; from the change on, every edit is dated.
- **Related:** DV-005.
- **Also asked as:** PRD OPEN-33; flows README #28, first half.

#### OPEN-11 — Should skipped and missed doses lower the curve?
- **Question.** Should the curve use the doses actually logged for the past, instead of the plan?
- **Context.** The curve follows the planned schedule (FX-13; the disclaimer says so). Skipped and Missed doses still count. Ledger 2026-09-24 (decisions.md:206): "count only taken doses" is a model change for pharmacometrics review (registry A-31).
- **Options.**
  - A — As built (planned schedule, disclosed).
  - B — Past doses after the protocol was created come from the Dose log (Taken only); declared history before creation and the future stay planned. Reverses FX-13 for the past.
  - C — Planned curve, but skipped / missed dose ticks are drawn differently (hollow); the number does not change.
- **Recommendation: B after the pharmacometrics review; C until then.** The user's own log is the honest source for the past, and the curve is the flagship.
- **Related:** DV-072.
- **Also asked as:** PRD OPEN-32; flows README #28, second half.

### Today: existing Missed rows

#### OPEN-23 — Missed rows the app wrote by mistake
- **Question.** What should happen to "Missed" rows that the app wrote by mistake in real users' Dose logs (before the false-Missed fixes, e.g. after a time-zone change)?
- **Context.** The founder fixed the causes (A-43 / S-18, S-19, decisions.md:197) and kept Test03's false rows untouched (:197, :387); whether the existing false rows of real users get cleaned was registered as his open item (decisions.md:417). They cannot be told apart from real misses safely. In the Dose log a Missed row can only become "Taken" or "Skipped" (`LogScreen.js:112-121`); it cannot be removed, and a deleted past-day dose shows Missed again at the next scan (decisions.md:191) — so a person cannot correct a Missed day on which no dose was due. (DL-71, which said users could delete them, rested on a false premise and was moved here in round 2.)
- **Options.**
  - A — As built: no clean-up; the person can only turn a false Missed into Taken or Skipped.
  - B — Add "No dose was due" to a Missed row in the Dose log: the row becomes a neutral mark the scan respects (nothing is deleted, the report stops counting it). New text ×6, picture first.
  - C — A one-time clean-up of Missed rows the app can prove it wrote by mistake (e.g. days before a time-zone change). Risky: a real miss can look the same.
- **Recommendation: B.** The person, not the app, decides which miss was real (never destroy on a maybe), and the provider report stops showing a miss that never happened.
- **Related:** — (no DV row: no rule is broken today). **Replaces:** DL-71.
- **Also asked as:** PRD OPEN-65.

### My Body

#### OPEN-13 — The "Bloodwork due" alert
- **Question.** Should the app keep telling users their bloodwork is "due" after 6 months?
- **Context.** Today shows "Bloodwork due · It's been N months since your last panel" (PT "Exame de sangue pendente") when the latest test is 6+ months old (`TodayScreen.js:153`, `:1512-1519`). The 6 months were chosen by the app; no decision covers it. It is a schedule the user never set — close to the never-advise line. Today must keep all its features ("I need all the features", decisions.md:139).
- **Options.**
  - A — Keep as is. This keeps an app-chosen recommendation (regulatory risk; the product never advises, decisions.md:20).
  - B — Same trigger, factual words: "Last lab test N months ago" (no "due").
  - C — The user sets their own interval (or none) in My Body; none by default.
  - D — Remove the alert (Today loses a feature).
- **Recommendation: B.** It keeps the useful nudge without the app deciding what is due; the regulatory reviewer confirms the wording.
- **Related:** DV-111.
- **Also asked as:** PRD OPEN-44; flows README #32.

#### OPEN-14 — Two small additions to My Body
- **Question.** (b) Show how many AI scans were used this month? (c) Add "Change the date of this test"?
- **Context.**
  - (b) Free users see the limit ("3 free scans a month…") only before their first scan that yields lab values — on the empty journal and on the free card (`BodyScreen.js:1105-1107`, `:1115-1120`); after that My Body shows no number, the limit appears only on the paywall and in the FAQ, and nobody ever sees how many scans are used or left. A person finds out the month is used up only when a scan is refused (the count is on the server, UTC month). For Premium, a count without the limit would follow AD-69 (no number in Premium strings).
  - (c) When the AI reads a test date in the wrong order (DD/MM vs MM/DD), the only fix today is editing every value one by one (`BodyScreen.js:673`).
  - (Item (a), the Premium scan number, was closed in round 2: the founder's own line says Premium strings carry no scan number — AD-69. The empty journal showing the free plan's "3 free scans" to Premium users is a bug, DV-237.)
- **Options.** (b) and (c), each: Yes in 1.3.0 / Yes in the next build / No.
- **Recommendation: (b) yes and (c) yes, next build.** Both remove a real annoyance but were never approved, so they take a target (OPEN-16); each is shown as a picture first.
- **Related:** DV-110. **Merged here (round 1):** AD-56.
- **Also asked as:** PRD OPEN-42, PRD OPEN-43; flows README #33.

### Account and Premium

#### OPEN-15 — Managing the subscription in Settings
- **Question.** Should Settings show the subscription and let the person manage or cancel it?
- **Context.** Settings shows only Premium / Free (`SettingsScreen.js:617`): no trial end date, no renewal date, no billing problem, and no way to manage or cancel inside the app. A payer who reinstalls gets Premium back by signing in (RevenueCat is keyed to the account, `lib/purchases.js:67`); a payer the app shows as free reaches "Restore purchases" through the Settings Premium card → paywall. No store rule found in this review REQUIRES an in-app cancel row; offering it is a recommendation, not a store requirement. (The founder's "store rules 100%", decisions.md:40, is about the Apple and Google sign-in buttons.)
- **Options.**
  - A — Settings rows "Manage subscription" (opens the store page) and "Restore purchases", plus a state line (trial until…, renews on…) when the store provides it.
  - B — Only "Manage subscription".
  - C — No change.
- **Recommendation: A.** The person sees an honest state and reaches cancellation in one tap. (Separately, by logic DL-60, the delete-account sheet warns that the store subscription keeps billing — its text is item 6 of OPEN-24.)
- **Related:** DV-112, DV-087.
- **Also asked as:** PRD OPEN-48; flows README #36.

#### OPEN-21 — The cross-account guard
- **Question.** (11) When a different account signs in on a phone, should the previous account's unsynced data still be discarded without a warning?
- **Context.** Built (`App.js:621-633`): when another account signs in, the previous account's local data — including rows that never reached the cloud — is discarded, "privacy over keeping unsynced data that belongs to another person". The only source is a coordinator line (decisions.md:508-509, "final Gate B"), never put to the founder, and it collides with CLAUDE.md "NEVER lose user-entered data". It matters when the previous account's session ended without an intended sign-out (an intended sign-out already warns about unsynced changes, decisions.md:309) and then someone else signs in on that phone. (Items 1–10 of the round-1 OPEN-21 were closed in round 2: each was genuine logic and is now a DL — see "Closed in round 2".)
- **Options.**
  - A — As built: discard, no warning (privacy first; the previous account's unsynced rows are lost).
  - B — Before discarding, if the previous account has unsynced rows, say so and offer "Sign in as {previous} first to save them" or "Discard and continue" (the same pattern as "Sign out anyway").
  - C — Keep the previous account's unsynced rows hidden on the phone and send them when that account signs in again.
- **Recommendation: B.** It keeps the privacy rule (the new account never sees the old data) and turns a silent loss into an informed choice; C keeps another person's health data on the phone indefinitely.
- **Related:** DV-081 (DL-52), DV-169.

### Built differently from what was approved or signed

#### OPEN-18 — Keep as built, or change?
- **Question.** For items 1, 2, 3, 4 and 9: keep as built (it joins the deviation list the founder signs on the test build, AD-52) or change?
- **Context.** Builder judgement calls go on one deviation list the founder eyeballs and signs before the store build (decisions.md:554). These items go against one of the founder's own lines or a signed checklist row, so they need a direction now, not only a signature later. (Item 5, the supply push at 3, closed in round 2: the signed FX-11 deviation and decisions.md:148 say it — AD-60. Item 6, the Apple glyph on Android, closed: the founder's line decisions.md:40 decides it — AD-74; the artwork download is in "Approvals still owed". Items 7 and 8 moved to "Approvals still owed".)
  1. **Blend component lines** (DV-156): the founder's line of 2026-09-18/24 (decisions.md:205) says dashed "(est.)" lines; the code draws them like any compound (solid past, dashed future) and does show the "(est.)" label. The binding prototype has no blend on its curve (`prototype.html:1877` charts three single compounds), so it does not settle it. Two pictures first.
  2. **"Not recorded" day** (DV-151): the signed FL-3 says a "not recorded" day breaks the 7-day run; nothing writes that mark any more ("Just close the day" does the same job; FL-3's approved deviation of 2026-10-01 already says a manual mark still breaks the run).
  3. **AI caps the builder added** (DV-213, DV-240): food log — 25 follow-up answers a day and 60 AI calls in any 24 h (shared), while the founder's line (decisions.md:251, FL-21) says follow-up answers don't count and the 25 reads reset at midnight; protocol assistant — 40 answers per conversation, a 24-hour conversation life and 200 answers in any 24 h, while the signed AP-18 sets only 10 conversations a week. A heavy logger can be refused within the 25 a day (the rolling 60 spans two days), and a capped assistant says only "The AI isn't available right now".
  4. **Ring and curve animation** (DV-132): on 2026-09-24 the founder approved Motion "Version B" with "Apply all", including the Today ring fill and the serum-curve draw-in (decisions.md:74), and said the ring "loads from zero"; on 2026-09-29 "count-ups only when values change" was recorded (decisions.md:57); Conflict 40 (decisions.md:441) — the ring count-from-zero AND the curve intro on every open — is still open. Nothing animates on Today today.
  9. **Week and whole-check food totals** (DV-232): the founder's line (decisions.md:250) and the signed FL-24 say totals per day, week and whole window; since Journey part 8 replaced the Totals card only the day's total is shown, and removing it was never confirmed (Conflict 25).
- **Options (per item).** Keep as built / Change (1: dashed component lines; 2: bring back a way to mark a day "not recorded"; 3: only the approved limits — follow-ups free, 25 reads reset at midnight, 10 assistant conversations a week; 4: ring fills from zero on every open and the curve draws itself on every open; 9: show the week and whole-check totals again).
- **Recommendation:** 1 keep (one look for every line; the "(est.)" label already says estimated; confirm on the two pictures); 2 keep — retire the mark, FL-3 amended with the founder's signature; 3 keep the ceilings against abuse, each with its own true message when reached (×6); 4 the later line: count up only when a value changes, keep the caught-up card and the day-complete pulse, the curve draws itself once per session (as the Body tab hero, decisions.md:75); 9 change — show the week's total under the day's (picture first).
- **Related:** DV-156, DV-151, DV-213, DV-240, DV-132, DV-232. **Replaces:** DL-32, DL-66, AD-44; consistency Q-08, Q-10, Q-11, A-10.
- **Also asked as:** PRD OPEN-7, PRD OPEN-24, PRD OPEN-37, PRD OPEN-59; flows README #21, #29.

---

## Approvals still owed (not questions)

Founder actions the docs depend on. None is a choice between options; each needs his go, his eye or his signature. Each is tracked here until it is given.

1. **Production go-aheads** (every change to the live server waits for "pode aplicar"; each runs a rolled-back dry run first):
   - Migration: `updated_at` trigger on `reality_checks` (DL-64, DV-088).
   - Migration: the Delete-forever blanking also clears interval, doses per day, concentration unit and divisibility (AD-67, DV-221).
   - Function deploy `parse-food`: count the 25 by the request's local day (DL-28, DV-066), refuse AI use without access (AD-16, DV-103), and whatever OPEN-18 (3) decides.
   - Function deploy `extract-bloodwork`: release an empty scan (AD-23, DV-078) and the vaccine fields (DL-41, DV-109).
   - Function deploy `delete-user`: name `profiles` and `ai_assistant_usage`, drop two absent tables (DL-93, DV-011).
   - The sync hardening of OPEN-16 (b): the per-table tombstones migration (DV-182), the counters (possibly a server function, DV-183) and the watermark change (DV-209). DV-210 and DV-222 are client-only.
   - Already given, still to do: delete `parse-food-next` (decisions.md:513, DV-188); deploy the assistant's server parts (decisions.md:481).
2. **Wording approvals in all 6 languages** (existing strings reworded so they are true; decisions.md:85):
   1. The curve "from your log" lines: `curve_empty_sub`, `curve_combined_hint`, `paywall_hero_sub`, `settings_premium_feat_1` (AD-19, DV-071).
   2. The persistent-reminders line: two repeats, +5 and +10 minutes (DL-48, DV-049).
   3. The provider report's streak line: doses, not days (DL-02, DV-032).
   4. The switch label "Vial alerts" (AD-26, DV-140).
   5. The paywall line "Reality-check results", not "progress tracking" (AD-64, DV-186).
   6. Analytics wording "not linked to your account" in the consent, Settings and the in-app policy (DL-84, DV-190).
   7. The in-app privacy policy = the web text, covering every AI feature (AD-72, DL-81, DV-231, DV-085).
   8. The delete-protocol sheet without "7 days", saying the doses leave the Dose log while deleted (DV-023), and the Restart text per choice (DV-024).
   9. The history question naming the compound (DL-86, DV-091).
   10. The BMI line without "healthy range" and the assistant limit without "this week" (DV-192).
   11. The "all nothing-eaten days" message (DV-150) and the high vs low implausible messages (DV-205).
   12. The photo size message without "PDF" for vials and labs (DV-201, DV-160).
   13. PT / ES reminder terms (DV-215).
   14. "Free days", never "trial", for the 7 free food-log days (DL-61, DV-164).
   15. Plurals instead of "(s)" (DV-235).
   16. Error-sheet titles that say what happened (DV-233).
   17. The empty lab journal's line for Premium users, without a number (AD-69, DV-237).
   18. The streak explainer text (registry, grok/006; decisions.md:417).
3. **Pictures owed for work already approved** (shown before code, both themes): "Add values by hand" in My Body (AD-68); "End protocol" on the protocol page and the empty-vial prompt with "Later" (AD-11, A-85, DV-090); the A-96 curve stats and labels (DV-096); the locked lab chart for free users — it takes a feature away from today's free users (AD-24, DV-108); the dose-time row on the assistant's review card (DV-191).
4. **The go to download Apple's official sign-in artwork** for the Android "Continue with Apple" button (AD-74, DV-239; a download needs his permission).
5. **Rotate the Apple client secret before 2027-04-04** — his console step with the .p8 he keeps; without it every Android Apple sign-in fails from that day (DV-211, ops item).
6. **Apple and Play privacy labels** (Device ID + Product interaction, not linked) — his step in both consoles (DL-84, DV-190).
7. **Sign three checklists never signed:** fold-right-page (signature line empty), premium-and-auth and admin-panel ("pending"). The build gate does not catch them today (DV-229).
8. **Look on the test build:** "Mark complete" on the Protocols card (A-42); the "From your reminder" outline and text ×6 (A-44); the vial-expiry alert words (A-45, with OPEN-20 (c)); the sign-out-with-unsynced-data and offline texts ×6 (A-46).
9. **Counsel (a lawyer)** before the store build, as his own rule asks (decisions.md:388): GDPR Art. 9 on the profile gate, the Anthropic DPA for free text, the crisis-resource policy (AD-51); server proof of consent, default-on install-id analytics under ePrivacy, and deleting the RevenueCat customer with the account (DL-83, DV-219).

---

## Closed in round 2 (2026-10-12) — ids kept, never reused

| OPEN item (part) | Closed as | Why it is not a question |
|---|---|---|
| OPEN-12 (all) — manual lab entry | AD-68 | Approved (decisions.md:268) and promised by the app's own copy; "approved → next build" puts it in 1.3.0 unless the founder defers it, and nothing suggests a reason to defer. Picture in "Approvals still owed". |
| OPEN-14 (a) — Premium scan number | AD-69 | The founder's line decisions.md:104 (+ :257) and the signed MB-10 say Premium strings carry no number; the coordinator line :544 cannot override them. Nothing asks for a Premium scan line, so none is added. |
| OPEN-18 (5) — supply push at 3 | AD-60 | The signed FX-11 deviation column and decisions.md:148 say the push fires at 3 (one rule). |
| OPEN-18 (6) — Android Apple glyph | AD-74 | decisions.md:40 (founder, 2026-10-02): store-owned controls follow the store's rules 100%; it replaced the custom-drawn Apple button. Only the download go remains (Approvals). |
| OPEN-18 (7) — look on the test build | Approvals still owed, item 8 | A look, not a choice. A-45's words were added to it. |
| OPEN-18 (8) — sign three checklists | Approvals still owed, item 7 | A signature, not a choice. Its premise "spec-audit fails on them" was false (it warns, and fold-right-page passes through a parser bug, DV-229). |
| OPEN-19 (a) — late dose day | AD-70 (+ DL-04) | The approved Today v2.1 (decisions.md:140) includes fix F1: a same-day dose logged > 12 h late is not Missed — a dose on the slot's own day belongs to that slot; the rings follow by one owner. |
| OPEN-19 (b) — daily cap | DL-76 | Every path already caps at "doses per day"; the alternative refuses a real dose on a rest day. One rule on every path. |
| OPEN-19 (c) — default time | DL-77 | Every surface agrees with what the phone already does (08:00). |
| OPEN-20 (a) — Settings red | AD-71 | The signed SP-1 / RC-1 make any readable block red, unconditionally; as built = as signed. |
| OPEN-21 (1) AD-04 | DL-85 | Follows from the founder's reminder principle (decisions.md:597-601) and "never destroy on a maybe". |
| OPEN-21 (2) AD-09 copy | Approvals item 2 (8–10) · AD-75 | Copy rewordings to make texts true; "supplier" stays — it is the founder's own word (decisions.md:186, AP-22). |
| OPEN-21 (3) AD-10 | DL-86 | An answer must be correctable; the curve must not keep an estimate the user denied. |
| OPEN-21 (4) AD-11 rules | DL-87, DL-88, DL-91 · Approvals item 3 | A-86/A-86b, A-87/A-87b, A-98 follow from the end rule and "Stop wins"; A-85 and A-96 are approved pictures still owed. A-89 and A-92 (never placed before) are DL-89, DL-90. |
| OPEN-21 (5) AD-29 | DL-92 (+ OPEN-24 item 10) | A gate that cannot be answered offline traps a user with unsynced rows; the button is new UI. |
| OPEN-21 (6) AD-35 | DL-97 | The founder's draft rule (BK-14, decisions.md:378) keeps drafts "until saved or the app closes"; the wizard has the same lifetime, and Cancel already asks. |
| OPEN-21 (7) AD-46 | DL-93 | Privacy: every user table is named in delete-user. |
| OPEN-21 (8) AD-50 | DL-94 | Never destroy on a maybe; the by-hand path is the founder's (decisions.md:501, :515). |
| OPEN-21 (9) AD-54 | DL-95 | FL-2 (founder): food up to 7 days back; Today = 0, Yesterday = 1, so "Earlier day" = 2–7. |
| OPEN-21 (10) AD-61 part | DL-96 | A gym scan is a measurement the user brings; the AI line forbids advice, not measurements. |

---

## Reclassified on 2026-10-12 — round 3

Source: `docs/product/verification/round3/R3-consistency.md` (the final cross-document consistency pass).

| Item | Was | Now | Why |
|---|---|---|---|
| End = the moment tapped (deliberate end) | coordinator lines decisions.md:504, :535 (no id) | DL-99 | genuine logic; no founder line or signed row backs the timing |
| Onboarding stash rules PA-71…PA-73 | coordinator lines decisions.md:472-473 (no id) | DL-100 | genuine logic (one account never receives another's data; merge, never clobber) |
| Real birth year at the 18+ confirmation PA-106…PA-108 | coordinator line decisions.md:496 (no id) | DL-101 | genuine logic; the built year wheel is signed with the premium-and-auth checklist (Approvals item 7) |
| Restart order (DV-217) | PRD / flow 05 described "limit last" as built and intended | intended = the free limit first (register); built = last (bug) | no founder line sets an order; a question whose answer is then refused must not be asked |

## Reclassified on 2026-10-12 — round 2

Sources: `docs/product/verification/round2/R2-01…R2-07`; each finding re-checked in the code or the ledger before it was applied.

| Item | Was (after round 1) | Now | Why |
|---|---|---|---|
| AD-12 | Already decided | DL-25 (merged) | features.md A-118 records the founder's bug report; "follow the check's real state" is the builder's fix (R2-02) |
| AD-26 | Already decided | Re-cited to decisions.md:165 | the founder line is :165, not only the registry row |
| AD-28 | Already decided | DL-81 | registry line by the builder, not the founder's words; one policy text is logic (R2-02) |
| AD-43 | Already decided (counsel flag) | Narrowed: the floor uses the typed birth year (:300); the counsel citation dropped | :388 says nothing about age (R2-02) |
| AD-45 | → DL-75 | → OPEN-22 (a) | DL-75 changed the reading of a signed row; the founder's words and PO-12 are ambiguous about a measured number |
| AD-49 | Coordinator line | Re-cited: founder :287 + signed MB-11 (the 7-day trial); the eligibility clause → DL-82 | R2-02 |
| AD-51 | Counsel list incl. coordinator items | Narrowed to the founder's :388 items; A-95, ePrivacy, RevenueCat → DL-83 | :570 and A-95 are coordinator / council sources |
| AD-52 | Deviation list | Note: Conflicts 22, 23, 25, 26, 28 are routed to the list by the coordinator; he still signs them | :554 does not name them (R2-02) |
| AD-57 | Coordinator line | DL-84 (wording → Approvals) | not a founder answer; the principle (copy must be true) is logic |
| AD-60 | Mixed (decided and open) | Already decided incl. the push at 3 (signed FX-11 deviation, :148) | one item cannot be both (R2-01, R2-07) |
| AD-65 | Today card + My Protocols | Narrowed to the Today card (Q9 = B); My Protocols → DL-80 (+ OPEN-24 picture) | extending a founder pick to another approved screen is logic at best (R2-02) |
| AD-66…AD-76 | — | Added | founder lines and signed rows that answer questions the round-1 list still asked (see the AD table) |
| DL-01 | Decided by logic | AD-76 | the founder's own S-25 line says "kept until answered" (decisions.md:379) |
| DL-10 | Own slot | Rewritten to the founder's tap-time rule (decisions.md:153) | "acts on the reminder's own slot" contradicted :153 and the count model (R2-05) |
| DL-14 | Citation | Citation corrected (copied into decisions.md) | round-1 correction not mirrored |
| DL-19 | Reason | Reason corrected (copied into decisions.md) | round-1 correction not mirrored |
| DL-22 | rtu part | Narrowed again: asking the new box date → OPEN-01 | registry A-08 F6 waits for the founder (R2-02) |
| DL-52 | Reason cited the cross-account guard | Reason rewritten (intended sign-out, BK-14) | the guard itself is now OPEN-21 |
| DL-68 | Decided by logic | OPEN-22 (b) | a registered founder item (decisions.md:417); a preference |
| DL-71 | Decided by logic | OPEN-23 | a registered founder item; its premise ("users can delete them") is false (LogScreen.js:112-121) |
| DL-75 | Decided by logic | Withdrawn → OPEN-22 (a) | it narrowed a signed row (PO-12) |
| DL-76…DL-98 | — | Added | genuine logic that closes questions or places coordinator lines (see the DL table) |
| OPEN-12, OPEN-14 (a), OPEN-18 (5, 6, 7, 8), OPEN-19 (a, b, c), OPEN-20 (a), OPEN-21 (1–10) | OPEN | Closed (table above) | decided by a founder line, a signed row, the standing rule or genuine logic |
| OPEN-22, OPEN-23, OPEN-24 | — | Added | DL-68 / DL-75, DL-71, and the new-UI parts of 12 DLs |
| OPEN-21 (11) | — | Added | the cross-account guard rests only on a coordinator line (decisions.md:508) |
| OPEN-18 (9) | — | Added | FL-24's week and whole-window totals vs Journey part 8 (R2-03) |

Premises fixed in surviving OPEN items (round 2): OPEN-01 (the Restart case is answered by :614), OPEN-07 (no source for "the A-118 texts approved 2026-10-09"), OPEN-10 (no edit history exists), OPEN-14 (b) (the limit shows only before the first scan with values; also shown to Premium), OPEN-15 (no store rule requires an in-app cancel), OPEN-16 (true counts; AD-32 stated; what is lost; DV-222), OPEN-17 (the tracker already skips rest days; A keeps the rejected wording), OPEN-18 (the prototype has no blend; the "normal user" claim; :74 cited; item 3 widened to the assistant), OPEN-20 (b) (the dialog shows once; SP-5 is Android-only; the iPhone sync case).

Round-2 findings not applied (and why) are listed in `docs/product/verification/round2/id-map.md`.

---

## Reclassified on 2026-10-12 — round 1 (verification)

Kept as the record of round 1. Statuses here are as of round 1; the final status of every id is in the round-2 table above and in `docs/product/verification/round2/id-map.md`.

What the independent verification changed (sources: `docs/product/verification/01…07`; mainly 07 sections 2–4).

| Item | Was | Now | Why |
|---|---|---|---|
| AD-04 | Already decided | OPEN-21 (1) | decisions.md:599 begins "By logic … (founder may override)" (07 A-06) |
| AD-07 | Every streak counts doses | Narrowed: the protocol card (founder); tracker → OPEN-17 | the founder line and commit b215b32 are about the card (07 A-03, 02) |
| AD-09 | Already decided | Narrowed: Restart (founder :614); copy part → OPEN-21 (2) | decisions.md:544 is a coordinator line (07 A-07) |
| AD-10 | Already decided | OPEN-21 (3) | decisions.md:543, coordinator (07 A-07) |
| AD-11 | Already decided | Narrowed: in 1.3.0 (founder); the rules → OPEN-21 (4) | Gate B / coordinator sources (01) |
| AD-27 | Already decided | OPEN-20 (b) | decisions.md:623 does not say it; :626 and SP-5 say the opposite (07 A-02, 03) |
| AD-29 | Already decided | OPEN-21 (5) | decisions.md:542, coordinator (07 A-07) |
| AD-35 | Already decided | OPEN-21 (6) | BK-14's scope does not name the wizard (01) |
| AD-44 | Already decided | OPEN-18 (4) | Conflict 40 is open in the ledger (02) |
| AD-45 | Already decided | DL-75 | PO-12 gates the estimate; decisions.md:240 governs the measured number (04) |
| AD-46 | Already decided | OPEN-21 (7) | decisions.md:545 "Privacy, by logic" (07 A-07) |
| AD-50 | Already decided | OPEN-21 (8) | decisions.md:506, coordinator round 4 (07 A-08) |
| AD-54 | Already decided | OPEN-21 (9) | the assistant's reading of the prototype (07 A-05) |
| AD-56 | Already decided | OPEN-14 (a) | a coordinator line overriding founder line :104 and signed MB-10 (07 X-02) |
| AD-61 | Already decided | Narrowed: "a health professional" (founder); gym scans → OPEN-21 (10) | decisions.md:458 is under "resolved by the ledger + logic" |
| DL-03 | Decided by logic | Narrowed: 365-day look-back; days vs doses → OPEN-17 | a visible copy and meaning change (07 D-01) |
| DL-06 | Decided by logic | Narrowed: one slot list; which default → OPEN-19 (c) | the text named two different defaults (02) |
| DL-08 | Decided by logic | Narrowed: Skip cancels reminders; Undo bar → OPEN-19 (d) | a UX preference; "Didn't take" already has Undo (07 D-09, K-02) |
| DL-16 | Decided by logic | AD-65 | it reversed the founder's Q9 = B; the right answer is his line :147 (01) |
| DL-22 | Decided by logic | Narrowed: rtu; recon "New vial" → OPEN-01 | registry A-08 F5 waits for the founder (01) |
| DL-24 | Decided by logic | OPEN-05 | a money rule; OPEN-05 option C offered the same choice (07 D-02) |
| DL-28 | Decided by logic | Rewritten (still DL) | the old fix could never work: the cap counts per entry date (04) |
| DL-32 | Decided by logic | OPEN-18 (1) | reverses the founder's visual line :205 (07 D-04) |
| DL-45 | Decided by logic | Narrowed: Silent; Settings half → OPEN-20 (a) | amends the signed SP-1 / RC-1 (03) |
| DL-50 | Decided by logic | Withdrawn (moot) | the code already matches the signed SP-4; DV-142 closed (03, 07 X-05) |
| DL-51 | Decided by logic | OPEN-07 | it decided on top of the open question OPEN-07 (04) |
| DL-66 | Decided by logic | OPEN-18 (2) | amends the signed FL-3 (07 D-05) |
| DL-67 | Decided by logic | OPEN-19 (b) | would refuse a real dose on a rest day; contradicted itself (02) |
| DL-72 | Decided by logic | OPEN-16 (b) | timing and risk are the founder's; its reason misattributed a coordinator line (07 D-03, 01) |
| DL-73 | Decided by logic | Withdrawn (false premise) | the wheel already stops 10 years back; DV-194 closed (04) |
| DL-74 | Decided by logic | OPEN-16 (b) | as DL-72; may need a server RPC (07 D-03) |

New questions the verification found missing: scope of 1.3.0 (OPEN-16 a), the Premium scan number (OPEN-14 a), the same-day rule for late doses (OPEN-19 a), the vial-expiry lead time and words (OPEN-20 c), the food caps and the Apple glyph (OPEN-18 items 3, 6), the eyeball items A-42 / A-44 / A-46 and three unsigned checklists (OPEN-18 items 7, 8).

Premises fixed in the existing questions: OPEN-01 (the founder's :578 line; recon New vial), OPEN-05 (rows are counted at the next add, never when they arrive), OPEN-06 (Android built, not proven; option D removed), OPEN-07 (finishes only when Progress is opened; no "results under 14 days"), OPEN-08 (Stop also with no check running), OPEN-09 ("too short" = only an average of 0), OPEN-12 (A is the default), OPEN-13 (option A is a regulatory risk), OPEN-14 (the limit is shown; the used count is not), OPEN-15 (reinstall restores Premium; the gap is managing / cancelling).

Other corrections without reclassification: AD-12 (A-118 covers the Today alert and the food card; the rest is DL-25), AD-26 (the new label is new copy), AD-30 (setup done 2026-10-03; live; secret expires 2027-04-04), AD-43 (re-cited to decisions.md:300), AD-48 (the Dose-log path is a logic extension), AD-49 and AD-57 (coordinator lines, marked), AD-52 (does not cover the unsigned checklists), AD-60 (push threshold → OPEN-18 item 5), DL-10 (flow 03 §7.2 must match), DL-14 (citation), DL-19 (reason).

---

## Where every earlier question went (PRD, TRD, flows)

The PRD, the TRD and the flows were written in parallel and each kept its own question list. Those lists are retired; every question is mapped here to its canonical ID. Where an earlier document recommended differently, the reason for the canonical answer is in the OPEN item or the AD / DL line.

### PRD (former §7, OPEN-1 … OPEN-69)

| Former PRD ID | Topic | Canonical |
|---|---|---|
| PRD OPEN-1 | Site-question age limit | AD-76 (was DL-01) |
| PRD OPEN-2 | Skip: reminders and Undo | DL-08 (cancel) · OPEN-19 (d) (Undo bar) |
| PRD OPEN-3 | Today changes built inside the approved proposal (grok/184) | AD-38 (grey tag) · AD-52 (the rest) |
| PRD OPEN-4 | "As-needed doses are excluded" | DL-65 |
| PRD OPEN-5 | One meaning of streak and missed | DL-02 · DL-03 (look-back) · OPEN-17 (tracker unit) · AD-07 (card) |
| PRD OPEN-6 | Undo / Dose-log delete re-arms reminders | DL-09 |
| PRD OPEN-7 | Tracker visual and ring animations | OPEN-18 (4) (ring and curve intro) · AD-52 (gauge visual) |
| PRD OPEN-8 | Daily caps and late doses (A-35) | DL-76 (cap) · AD-70 (late dose) |
| PRD OPEN-9 | Open site questions device-only | AD-34 |
| PRD OPEN-10 | Courses with a total number of doses | OPEN-03 |
| PRD OPEN-11 | Vial lifecycle holes (A-08 F5–F7) | DL-22 (rtu replaceable, new row) · OPEN-01 (recon New vial, box date, doses used) |
| PRD OPEN-12 | Editing a powder vial after creation | DL-15 (capacity) · OPEN-01 (mix date, window) |
| PRD OPEN-13 | Deliberate End + empty-vial prompt picture | AD-11 (A-85 picture owed, Approvals item 3) |
| PRD OPEN-14 | Oral supply warnings | OPEN-02 |
| PRD OPEN-15 | Free limit after a lapse; where enforced | OPEN-05 (limit and lapse; DL-24 withdrawn) |
| PRD OPEN-16 | Half-filled wizard on a kill | DL-97 |
| PRD OPEN-17 | Protocols judgement calls (grok/199) | AD-52 |
| PRD OPEN-18 | Delete-a-dose layout | AD-52 |
| PRD OPEN-19 | iPhone reminders when never opened | OPEN-06 |
| PRD OPEN-20 | Persistent reminders copy | DL-48 |
| PRD OPEN-21 | "Not now" for notification permission | OPEN-20 (b) |
| PRD OPEN-22 | One "blocked" rule | DL-45 (Silent) · AD-71 (Settings, as signed) |
| PRD OPEN-23 | Does finishing a check end the 20:00 question (A-24) | OPEN-07 (DL-51 withdrawn) |
| PRD OPEN-24 | "Not recorded" day | OPEN-18 (2) |
| PRD OPEN-25 | Self-finishing check and Journey part 8 | OPEN-07 · AD-52 (judgement calls) |
| PRD OPEN-26 | Grace week | AD-14 |
| PRD OPEN-27 | Stop deletes measured history? | OPEN-08 |
| PRD OPEN-28 | Today wording when ready but locked / unsavable | DL-26 · OPEN-09 · OPEN-24 (item 7, the texts) |
| PRD OPEN-29 | Measured burn hidden when inputs incomplete | OPEN-22 (a) (DL-75 withdrawn) |
| PRD OPEN-30 | AI answer chips and meal slots | AD-53 |
| PRD OPEN-31 | "Earlier day" range | DL-95 |
| PRD OPEN-32 | Missed / skipped doses dip the curve | OPEN-11 |
| PRD OPEN-33 | Edited dose rewrites the past curve | OPEN-10 |
| PRD OPEN-34 | Fixed dose hours on the curve | DL-31 |
| PRD OPEN-35 | Enanthate / Nandrolone time-to-peak | DL-37 |
| PRD OPEN-36 | Future PK split | AD-47 |
| PRD OPEN-37 | Blend component lines | OPEN-18 (1) |
| PRD OPEN-38 | Second curve default | DL-36 |
| PRD OPEN-39 | Manual lab entry | AD-68 |
| PRD OPEN-40 | Lab charts Premium or free | AD-24 |
| PRD OPEN-41 | Favourites and labels to synced tables | AD-02 |
| PRD OPEN-42 | Change a test's date | OPEN-14 (c) |
| PRD OPEN-43 | Show the scan budget | OPEN-14 (b) |
| PRD OPEN-44 | "Bloodwork due" after 6 months | OPEN-13 |
| PRD OPEN-45 | Vaccine next-due reminders | DL-44 |
| PRD OPEN-46 | Lab reference-range band | AD-55 |
| PRD OPEN-47 | AI consent per account + withdraw | DL-55 · OPEN-24 (item 1, the withdraw row) · DL-83 (server proof) |
| PRD OPEN-48 | Subscription management in Settings | OPEN-15 · DL-60 · OPEN-24 (item 6) |
| PRD OPEN-49 | Display name from Google / Apple | DL-57 |
| PRD OPEN-50 | Offline cold start, expired token | DL-54 |
| PRD OPEN-51 | Reinstall behaviour | DL-63 |
| PRD OPEN-52 | Lawyer items | AD-51, DL-83, AD-43 |
| PRD OPEN-53 | Analytics | DL-62 · DL-84 · DL-83 |
| PRD OPEN-54 | Apple delete: residual data on a second device | DL-85 |
| PRD OPEN-55 | A-116 scope | AD-31 |
| PRD OPEN-56 | Unsigned checklists and open deviations | AD-42 · AD-52 · Approvals items 7–8 |
| PRD OPEN-57 | PT name of the Dose log | AD-59 |
| PRD OPEN-58 | Language-aware number parsing | DL-69 |
| PRD OPEN-59 | Minor confirmations (FX-11, pop-up style, A-33) | AD-60 |
| PRD OPEN-60 | Who users are pointed to | AD-61 · DL-96 |
| PRD OPEN-61 | iPad / supportsTablet | DL-70 |
| PRD OPEN-62 | Landscape everywhere | AD-62 |
| PRD OPEN-63 | Hard-coded Premium accounts | AD-58 |
| PRD OPEN-64 | Target ETA staleness, body-fat targets | OPEN-22 (b) |
| PRD OPEN-65 | Existing false Missed rows | OPEN-23 |
| PRD OPEN-66 | My Body small differences | AD-52 |
| PRD OPEN-67 | Scan numbers in My Body copy | AD-69 |
| PRD OPEN-68 | Purging soft-deleted protocols again (A-84) | OPEN-04 |
| PRD OPEN-69 | Edit "What you track" | DL-58 · OPEN-24 (item 2) |

### TRD §9.1 (nine questions)

| TRD Q | Topic | Canonical |
|---|---|---|
| 1 | Deletes across devices: server tombstones (R-01) | OPEN-16 (b) (DL-72 withdrawn; the migration itself needs the founder's go) |
| 2 | No-time and fewer-times protocols (R-03) | DL-06 · DL-77 |
| 3 | Courses: keep with a UI, or retire (R-03 / BR-12) | OPEN-03 |
| 4 | Report streak / adherence = Today; lift the 31-day cap (R-09) | DL-02, DL-03 (look-back) · OPEN-17 (tracker unit) |
| 5 | Skip stops reminders + Undo (R-17) | DL-08 (cancel) · OPEN-19 (d) (Undo) |
| 6 | Server enforcement of food access and the 3-protocol limit (R-16) | AD-16 (food) · OPEN-05 (limit) |
| 7 | iPhone reminders without opening the app (R-15) | OPEN-06 |
| 8 | Recon vial edit / manual new vial (R-13, A-08); oral low supply (R-42) | OPEN-01 (incl. recon New vial and the rtu box date) · DL-22 (rtu) · OPEN-02 |
| 9 | Lab charts Premium; manual lab entry (R-21) | AD-24 · AD-68 |

### Flows (README round of 36, plus one question asked only in a flow)

| Flows # | Topic | Flow | Canonical |
|---|---|---|---|
| 1 | AI consent per device or per account | 01, 11, 12 | DL-55 · OPEN-24 (item 1) (server proof: DL-83) |
| 2 | OS prompt after "Not now" | 01, 06 | OPEN-20 (b) |
| 3 | Year-only 18+ test | 01 | AD-43 |
| 4 | Doses already taken from this vial | 02, 04 | OPEN-01 |
| 5 | Half-filled protocol after a kill | 02 | DL-97 |
| 6 | Recon dose changed mid-vial | 02, 04 | DL-15 |
| 7 | Lapsed Premium with more than 3 active | 02, 13 | OPEN-05 |
| 8 | Skip cancels reminders + Undo bar | 03 | DL-08 (cancel) · OPEN-19 (d) (Undo bar) |
| 9 | "All caught up" with a skip | 03 | DL-12 |
| 10 | Grey "reminder" tag before Due | 03 | AD-38 |
| 11 | Tracker streak cap; report streak rule | 03, 12 | DL-03 (look-back), DL-02 · OPEN-17 (unit) |
| 12 | Manual recon New vial; rtu New vial as a new row | 04 | DL-22 (rtu) · OPEN-01 (recon, box date) |
| 13 | Oral bottles: low rule, interval-aware days | 04 | OPEN-02 (days left: DV-020 bug) |
| 14 | Pictures: End protocol; "Protocol finished" with Later | 04, 05 | AD-11 (pictures owed, Approvals item 3) |
| 15 | Days-left colour above 7 days | 04 | AD-65 (Today) · DL-80 (My Protocols; OPEN-24 item 11) |
| 16 | Course total reached | 05 | OPEN-03 |
| 17 | Resume the 7-day purge for 1.3.0+ deletes | 05 | OPEN-04 |
| 18 | iPhone users who never open the app | 06 | OPEN-06 |
| 19 | Settings "blocked" neutral when reminders are off | 06 | AD-71 |
| 20 | Persistent reminders copy | 06 | DL-48 |
| 21 | Drop the "not recorded" mark | 07 | OPEN-18 (2) |
| 22 | Stop keeps or deletes results | 08 | OPEN-08 |
| 23 | One start weight | 08 | OPEN-07 |
| 24 | Confirm the self-finishing check | 08 | OPEN-07 |
| 25 | Today lines for locked / unsavable results | 08 | DL-26 · OPEN-09 · OPEN-24 (item 7) |
| 26 | Lower date bound for a past weigh-in | 09 | No change (DL-73 withdrawn: the wheel already stops 10 years back) |
| 27 | Curve dose times vs the fixed grid | 10 | DL-31 |
| 28 | Dose edits forward only; count only logged doses | 10 | OPEN-10 · OPEN-11 |
| 29 | Blend lines solid past | 10 | OPEN-18 (1) |
| 30 | Manual lab entry | 11 | AD-68 |
| 31 | Lab charts Premium or free | 11, 13 | AD-24 |
| 32 | Bloodwork due | 11 | OPEN-13 |
| 33 | "x of 3 scans used" | 11 | OPEN-14 (b) · AD-69 |
| 34 | Delete account warns about billing | 12 | DL-60 · OPEN-24 (item 6) |
| 35 | Export includes profile and preferences | 12 | DL-42 |
| 36 | Manage subscription + Restore in Settings | 13 | OPEN-15 |
| 07 §12 Q2 | Food "Remove entry" asks first | 07 | AD-01 |

Flow 14 asked no question (A-116 waits by the founder's own instruction, AD-31).

---

## Already decided (applied) — no question to the founder

Each item: the decision, its source, and the DIVERGENCES rows it settles.

| ID | Decision applied | Source | Rows |
|---|---|---|---|
| AD-01 | Every delete asks first. | decisions.md:46 (2026-10-03); my-body.md header | DV-003 |
| AD-02 | Never lose user-entered data; durable synced storage, not `user_metadata` alone; writes merge, never clobber from a stale read. | CLAUDE.md (2026-09-12); decisions.md:369–371 | DV-006 |
| AD-03 | "Show names in notifications" off = the lock screen never shows a compound's name. | decisions.md:311 (2026-09-24) | DV-002 |
| AD-04 | **→ OPEN-21 (1), moved 2026-10-12 (by-logic ledger line).** When the server confirms the account was deleted or the session revoked, scheduled reminders are cancelled; a network failure never cancels anything. **Round 2 → DL-85** (genuine logic; OPEN-21 item closed). | decisions.md:599 (2026-10-07) | DV-009 |
| AD-05 | A real sign-out clears unsaved drafts. | decisions.md:378 (BK-14) | DV-081 |
| AD-06 | Rings: a late dose matches its own slot within ± half the interval; an extra log never adds. (A dose more than half an interval late on its own day: AD-70.) | decisions.md:144 (2026-09-29) | — (DV-030 → AD-70) |
| AD-07 | The streak on a protocol's card counts doses in a row, never days (founder 2026-10-05: a weekly protocol showed "2 days without a miss"). **Narrowed 2026-10-12:** the founder line covers the card; the report following it is DL-02; the Today tracker is OPEN-17. | lib/doseStreak.js:2; TodayScreen.js:610; commit b215b32; decisions.md:641-642 (corrected 2026-10-12) | DV-032, DV-180 |
| AD-08 | An alert that names one protocol opens that protocol. | decisions.md:146 (2026-09-29) | DV-089 |
| AD-09 | Restart with the same container moves it unchanged (mix date, count) — founder, council 3 "1 a 7 sim". **Narrowed 2026-10-12 (round 1):** the copy rules were a coordinator line → OPEN-21 (2); **round 2:** those copy rewordings are in "Approvals still owed" (item 2) and "supplier" stays (AD-75). | decisions.md:614 (founder); decisions.md:544 (coordinator) | DV-024 (DV-023, DV-091, DV-192 → Approvals / DL-86 / AD-75) |
| AD-10 | **→ OPEN-21 (3), moved 2026-10-12 (coordinator line).** The "Same dose?" answer can be corrected: asked again when an edit moves the start earlier; "Yes" clears `history_from`. **Round 2 → DL-86** (genuine logic; OPEN-21 item closed). | decisions.md:543 (2026-10-04) | DV-091 |
| AD-11 | The founder put the 2026-10-04 council items A-85…A-98 in 1.3.0 ("1 agora … council fixes A-85…A-98 in parallel"). **Narrowed 2026-10-12:** the rules inside them were coordinator / Gate B lines; round 2 placed each: A-86 / A-86b → DL-87, A-87 / A-87b → DL-88, A-89 → DL-89, A-92 → DL-90, A-98 → DL-91; A-85 (End + "Later") and A-96 are approved pictures still owed (Approvals item 3); A-90 copy → Approvals item 2. | decisions.md:550 ("Founder answers 2026-10-04"); features.md:224–239; decisions.md:533–558 | DV-021, DV-025, DV-090, DV-096, DV-105 |
| AD-12 | **→ DL-25, moved 2026-10-12 (round 2; registry line, not a founder answer).** (Was: A-118: the Today alert and the food card line follow the check's real state, never the date alone.) The founder reported the bug (features.md:258); "follow the real state" is the builder's fix, the same logic as DL-25. | features.md:258 (registry A-118) | DV-056, DV-057 (→ DL-25) |
| AD-13 | The latest weigh-in is the current weight everywhere; after a weigh-in fix or delete everything updates; the Journey tile follows the same rule as Progress. | decisions.md:231 (A-54); progress-one-card.md PO-12, PO-13, PO-25 (signed 2026-10-03) | DV-062, DV-063 |
| AD-14 | Grace after Premium ends = finish the current week of logging; the day-21 result needs Premium. | decisions.md:274; food-log.md FL-41 | DV-101 |
| AD-15 | The typed-calories link is Premium-only. | decisions.md:636 (FL-48 "A", 2026-10-08) | DV-102 |
| AD-16 | The server stays authoritative for paid AI calls. | decisions.md:288; fixes-1.2.5.md FX-16 | DV-103 |
| AD-17 | A day closed with no food counts only after "I ate nothing". | decisions.md:237; food-log.md FL-47 | DV-064 |
| AD-18 | Journey tile, My Body card and the curve show the same compound and the same Est. level. | decisions.md:209, :261; my-body.md MB-4 | DV-067, DV-068, DV-152 |
| AD-19 | The curve follows the planned schedule and never says "logged". | decisions.md:111; fixes-1.2.5.md FX-13 | DV-071 |
| AD-20 | Compounds that are not charted are named on screen. | decisions.md:130 (2026-09-24) | DV-155 |
| AD-21 | The hub counts uploads the way the journal lists them. | decisions.md:259; my-body.md MB-2 | DV-073 |
| AD-22 | Test dates cannot be in the future. | decisions.md:265; my-body.md MB-17 | DV-077 |
| AD-23 | Failed extractions are not counted. | decisions.md:275 | DV-078 |
| AD-24 | Lab charts are Premium; the hand-typed lab journal is free. | decisions.md:268 (2026-09-30); MB-10 copy (signed 2026-10-03) | DV-108 |
| AD-25 | Silent mode is its own state, never "blocked", and silences every notification except the user's test. | background-refresh.md BR-4; features.md A-108 | DV-042, DV-048 |
| AD-26 | One "Vial alerts" switch covers low supply and expiry. The new label "Vial alerts" ×6 is new copy (Approvals item 2.4). | decisions.md:165 (A-45 "behind the existing toggle", 2026-09-28; re-cited round 2); features.md A-45 | DV-140 |
| AD-27 | **→ OPEN-20 (b), moved 2026-10-12.** (Was: someone who said "Not now" to notifications is not asked for more.) decisions.md:623 does not say this; :626 and the signed SP-5 re-open the setup screen for "Not now" users with a reminder time. | decisions.md:623 (2026-10-07 evening) | DV-054 |
| AD-28 | **→ DL-81, moved 2026-10-12 (round 2; registry line).** (Was: the in-app privacy policy (×6) has the same content as the website.) The founder asked for the policy text and a handoff; "the same content" is logic. | features.md:257 (A-117) | DV-085 (→ DL-81) |
| AD-29 | **→ OPEN-21 (5), moved 2026-10-12 (coordinator line).** The 18+ and profile gates can be answered offline (saved later) and offer "Sign out anyway". **Round 2 → DL-92** (genuine logic; OPEN-21 item closed). | decisions.md:542 (A-94) | DV-114 |
| AD-30 | "Continue with Apple" also on Android (founder "3 sim"). The server setup was done 2026-10-03 and the button is live (STATE.md:17; probe 302). A real Android Apple sign-in is not recorded in the repo — it is a founder device test (corrected round 2: "the founder signed in on the Fold 2026-10-07" has no source). The Apple client secret expires 2027-04-04 (DV-211, ops). | decisions.md:483; STATE.md:17 | DV-115, DV-211 |
| AD-31 | A-116 (Fold: every tap and notification on the right page) waits for the PRD / TRD / flows, then resumes for 1.3.0 ("Vamos resolver tudo. Sem pendência" — no production submit while an item is open). | decisions.md:639 (2026-10-12); decisions.md:634 (2026-10-07) | DV-117 |
| AD-32 | Concurrent multi-device use is not a real use case (A-48 parked). | decisions.md:199 | DV-041 |
| AD-33 | The remembered curve view is device-local and not synced. | decisions.md:208, :380 | DV-159 |
| AD-34 | Open site questions stay on the device only, kept until answered. | decisions.md:379 | DV-137 |
| AD-35 | **→ OPEN-21 (6), moved 2026-10-12.** A half-filled new protocol is lost if the app is killed (BK-14 keeps drafts of the note, the Progress forms and the food chat field, and does not name the wizard; the assistant's conversation lost on a kill is AP-33, signed). **Round 2 → DL-97** (genuine logic; OPEN-21 item closed). | decisions.md:378; ai-protocol-assistant.md AP-33 | DV-127 |
| AD-36 | If RevenueCat is unreachable the server applies the Premium scan cap. | decisions.md:275 | DV-165 |
| AD-37 | Server push stays OFF; send-reminders is activated only after A-62. | decisions.md:350, :589 | DV-145 |
| AD-38 | Today tags: only "Due". | decisions.md:133 | DV-131 |
| AD-39 | "Taken" became "Complete" in counts and labels. | decisions.md:99 | DV-179 (BK-16) |
| AD-40 | Free plan: 3 active protocols. | decisions.md:465 ("3 mantém") | DV-181 (comment), OPEN-05 |
| AD-41 | Theme tokens only; hard-coded colours only on fixed surfaces. | decisions.md:41 | DV-170 |
| AD-42 | Done = the signed checklist with evidence; spec-audit passes; full-functionality pass before every build. | CLAUDE.md; decisions.md:339–340 | DV-118 |
| AD-43 | The 18+ floor is checked against the typed birth year (decisions.md:300). **Narrowed 2026-10-12 (round 2):** the "counsel flag" citation (:388) is dropped — that line is about GDPR Art. 9, the DPA and the crisis policy, not age. | decisions.md:300 (2026-09-15) | DV-168 |
| AD-44 | **→ OPEN-18 (4), moved 2026-10-12.** (Was: motion count-ups only when values change; keep the caught-up card and the day-complete pulse — decisions.md:57, :164.) The ring's count-from-zero is the open Conflict 40 (decisions.md:441; the founder said "ring loads from zero" on 2026-09-24). | decisions.md:57, :164 | DV-132 |
| AD-45 | **→ OPEN-22 (a), moved 2026-10-12.** (Round 1 moved it to DL-75; round 2 withdrew DL-75 because it narrowed a signed row.) The signed PO-12 ("Daily burn shows only when weight + height + age + sex all exist") and the founder's words (grok/206:6) were about the formula inputs; whether they gate a measured number is ambiguous. | progress-one-card.md PO-12; grok/206 | DV-149 (→ OPEN-22) |
| AD-46 | **→ OPEN-21 (7), moved 2026-10-12 (coordinator line, "Privacy, by logic").** `ai_assistant_usage` is named in delete-user. **Round 2 → DL-93** (genuine logic; OPEN-21 item closed). | decisions.md:545 | DV-011 |
| AD-47 | Dose accumulation stays Premium; a future free/Premium PK split is not scheduled. | decisions.md:279, :292 | (05:G13 context) |
| AD-48 | The vial-finished prompt follows the write on every injectable take path. (Today's order is the founder's S-25 line; applying it to the Dose-log Missed → Complete path is a logic extension.) | decisions.md:152–153 (S-25); fixes-1.2.5.md FX-22 | DV-038 |
| AD-49 | iOS and Play carry a 7-day free trial on Monthly and Yearly, and the upgrade sheet says "Start 7-day free trial". **Re-cited 2026-10-12 (round 2)** to the founder's line and the signed MB-11; that a trial is claimed only when the store says the person is eligible is DL-82 (the store rule, logic). | decisions.md:287 (founder); my-body.md MB-11 (signed 2026-10-03) | DV-126 |
| AD-50 | **→ OPEN-21 (8), moved 2026-10-12 (coordinator line, round 4).** The automatic purge stays paused in 1.3.0 (A-84, revisit after). **Round 2 → DL-94** (genuine logic; OPEN-21 item closed). | decisions.md:506 | DV-125 (OPEN-04 decides the "after") |
| AD-51 | Counsel items stay with counsel: GDPR Art. 9 on the profile gate, the Anthropic DPA for free text, the crisis-resource policy. **Narrowed 2026-10-12 (round 2):** server proof of consent (A-95), default-on analytics under ePrivacy and the RevenueCat customer on delete join the list by logic (DL-83). | decisions.md:388 | DV-167, DV-168 (age: AD-43) · DV-007, DV-219 via DL-83 |
| AD-52 | Builder judgement calls and small differences from an approved picture are not founder questions: they go on the one deviation list he eyeballs on the test build and signs before the store build (A-97). Carried there: the Today items built inside the approved Today proposal (alert "Remove" gone, snooze "Tomorrow / In 3 days", no "Add site" on the toast, the "Injection site" title in the Dose-log editor, dose-notes explainer hidden, notification snoozes "In 1 hour / Tomorrow"); the tracker gauge visual; the delete-a-dose layout A; the Protocols judgement calls of grok/199; the Journey part 8 judgement calls of grok/205; the My Body small differences. (Round 2: Conflicts 22, 23, 25, 26 and 28 are routed to this list by the coordinator — :554 does not name them — and he still signs every item; the unsigned checklists and the eyeball items are in "Approvals still owed", items 7–8.) | decisions.md:554 (2026-10-04); decisions.md:142 (Today proposal approved as shown) | DV-118 |
| AD-53 | AI-suggested short answer chips (≤ 40 characters) in food follow-ups are allowed and there are no strict meal slots; STATE.md's "pending" line is stale. | decisions.md:319, :245; food-log.md FL-16, FL-4 (signed 2026-09-27) | — |
| AD-54 | **→ OPEN-21 (9), moved 2026-10-12.** "Earlier day" in Fix this entry covers 2–7 days back (decisions.md:429, Conflict 29: the assistant's reading of the prototype, not the founder's statement). **Round 2 → DL-95** (genuine logic; OPEN-21 item closed). | decisions.md:244 (food is logged up to 7 days back, FL-2); Today = 0, Yesterday = 1 | — |
| AD-55 | Lab values never show a reference range, band, colour or verdict; the unused live columns `biomarkers.reference_min/max/status` are never written. | decisions.md:266; CLAUDE.md AI hard line | DV-119 |
| AD-56 | **→ OPEN-14 (a), moved 2026-10-12 (round 1); closed round 2 → AD-69.** (Was: My Body's scan line shows each plan's real number, 3 free / 20 Premium — a coordinator line, decisions.md:544, over the founder's :104 and the signed MB-10.) | decisions.md:544 (2026-10-04) over decisions.md:104 (2026-10-01) | — (→ AD-69) |
| AD-57 | **→ DL-84, moved 2026-10-12 (round 2; coordinator line, "applied by logic within '4 anônima'", the same status as AD-46).** (Was: analytics wording becomes "not linked to your account", with the policy rewrite and the store labels.) The principle (copy must be true: the install id is pseudonymous) is logic; the wording ×6 and the console labels are in "Approvals still owed". | decisions.md:570 (2026-10-05) | DV-190 (→ DL-84) |
| AD-58 | The founder's own extra accounts keep Premium through `DEVELOPER_EMAILS`; Test03 gets Premium only through a temporary RevenueCat promo. No move to promotional grants is scheduled. | decisions.md:290 | — |
| AD-59 | The PT name of the Dose log is "Histórico" (the grok/227 question "PT 'Registro'" was answered by the 2026-10-03 "Aprovado / Siga" block, grok/228). | decisions.md:88, Conflict 27; grok/227, grok/228 | DV-193 |
| AD-60 | Already in the ledger: the supply push fires at 3 doses left (one rule — the signed FX-11 deviation column, "The push now says low at 3 doses left (was 2)", and decisions.md:148); the vial-finished pop-up style is the approved Today proposal's (decisions.md:142); the A-33 energy test is closed by the fully-green-suite rule (decisions.md:341). **Round 2:** the push-at-3 part is decided by the signed row, so OPEN-18 (5) is closed and Conflict 31 is settled. | fixes-1.2.5.md FX-11 (signed 2026-09-27); decisions.md:142, :148, :341 | — |
| AD-61 | Users are pointed to "a health professional" (AI hard line, founder). **Narrowed 2026-10-12:** "gym body-composition scans are a measurement source, not advice" (decisions.md:458, a ledger-logic line) → OPEN-21 (10) in round 1 → DL-96 in round 2. | decisions.md:316 | — |
| AD-62 | Landscape stays on every screen (content in a centred column); no portrait revert. | decisions.md:77 (founder 2026-09-11 "do it correctly, take your time") | — |
| AD-63 | `parse-food-next` is removed from production (founder "2 sim" 2026-10-03, RL-1). | decisions.md:513 | DV-188 |
| AD-64 | Honest paywall: only real Premium features; the reality check is sold as "reality-check results", never "progress tracking" (weigh-ins, their chart and Progress are free). | decisions.md:283, :107, :229 | DV-186 |
| AD-65 | The Today card colours vial days by deadline (≤ 3 risk, ≤ 7 attention, above 7 ok green) — the founder's Q9 = B, re-confirmed over the grey V10 fix. **Narrowed 2026-10-12 (round 2):** using the same colouring on My Protocols is DL-80 (one days-left owner and one look), shown as a picture first (OPEN-24 item 11). Added round 1 (it replaced DL-16). | decisions.md:147; grok/182, grok/183; TodayScreen.js:1956-1957 | DV-018, DV-200 |
| AD-66 | Custom dosing interval = "Every day / Custom" with a typed number of days; no preset buttons. The binding prototype (made binding 2026-10-01, "wins over other docs unless the founder decided otherwise later") draws exactly this; the earlier preset line (decisions.md:200, 2026-09-04) is older, so the prototype governs. Added 2026-10-12 (round 2). | decisions.md:34 (2026-10-01); prototype.html:1380 (wizard step 4 "How often?"); decisions.md:200 superseded | DV-123, DV-230 |
| AD-67 | Delete forever blanks the purged tombstone's content; what stays is its identity as the founder-approved migration defines it: id, user_id, type, colour, timestamps, deleted_at, purged_at. Added 2026-10-12 (round 2; replaces the coordinator's narrower list at decisions.md:540 as the authority). | decisions.md:552 ("Go for the production migration A-88 … Delete forever blanks the tombstone's content", founder "3 sim"), :556 (applied); `20261004010000_protocol_delete_guard.sql:8-9` | DV-221 |
| AD-68 | Typing lab values by hand (the free lab journal) ships in 1.3.0, picture first. Added 2026-10-12 (round 2; closes OPEN-12). | decisions.md:268 ("The lab journal typed by hand is free", 2026-09-30); the approved explainer and the quota message promise it; CLAUDE.md "approved → the NEXT build" (only the founder defers) | DV-107 |
| AD-69 | Premium strings carry no scan number; the 20 appears only in the FAQ and the limit-reached message; no Premium scan line is added to My Body; the free plan's number is never shown to a Premium user. Added 2026-10-12 (round 2; closes OPEN-14 (a)). | decisions.md:104 (2026-10-01), :257 (2026-10-03); my-body.md MB-10 (signed 2026-10-03) | DV-110, DV-237 |
| AD-70 | A dose logged on the slot's own local day belongs to that slot, however late (fix F1 of the approved Today v2.1: "a same-day dose logged > 12 h late gets a false Missed"); the rings follow the same rule by DL-04. Added 2026-10-12 (round 2; closes OPEN-19 (a)). | decisions.md:140 (Today v2.1 approved with every recommended answer); today-build-handoff.md §3 F1 | DV-030 |
| AD-71 | Settings › Notifications shows red on any readable block (notifications denied, the Dose Reminders category off, or nothing scheduled while a protocol has a reminder time), whichever reminder kinds are switched on; Silent mode is never a block (AD-25). Added 2026-10-12 (round 2; closes OPEN-20 (a)). | reminder-setup-placement.md SP-1 (signed 2026-10-07); reminder-check.md RC-1 (signed 2026-10-05) | DV-042 (Settings half: not a defect) |
| AD-72 | The privacy policy names Anthropic as a sub-processor and its AI section covers the AI food log (and so every AI feature the app has). Added 2026-10-12 (round 2). | decisions.md:330 (2026-09-09 / 2026-09-29; counsel flag) | DV-231 |
| AD-73 | The 8 PM food question has one off switch shared by Settings and Progress, and no every-other-day backoff. Added 2026-10-12 (round 2; answers the 1.2.3 deferred items (a) and (b), STATE.md). | decisions.md:249 | — |
| AD-74 | Store-owned controls follow the store's rules 100%: the Android "Continue with Apple" uses Apple's official artwork, not a drawn glyph (the rule replaced the custom-drawn Apple button, Q21). The download needs the founder's go (Approvals item 4). Added 2026-10-12 (round 2; closes OPEN-18 (6); the coordinator's "keeps the drawn glyph for now", decisions.md:497, is superseded). | decisions.md:40 (2026-10-02) | DV-239 |
| AD-75 | The assistant's fit fact keeps "check with your supplier how much liquid the vial holds"; the coordinator's 2026-10-04 change to "the product label or manufacturer" (decisions.md:544) is withdrawn. Added 2026-10-12 (round 2). | decisions.md:186 (2026-10-02); ai-protocol-assistant.md AP-22 (signed) | DV-192 |
| AD-76 | Open site questions are never dropped for their age; they stay until answered (code as built). The 2026-10-03 line "let go after 7 days" (decisions.md:459, a by-logic reading of FX-25) is superseded. Moved 2026-10-12 (round 2) from DL-01: it is the founder's own line. | decisions.md:379 (2026-10-01; grok/145) | DV-175 |

## Decided by logic — no question to the founder

One line of reason each. The founder may override any line.

| ID | Decision | Reason | Rows |
|---|---|---|---|
| DL-01 | **→ AD-76, moved 2026-10-12 (round 2).** (Was: site questions are never dropped for their age.) | It is the founder's own S-25 line (decisions.md:379), not logic. | DV-175 (→ AD-76) |
| DL-02 | The report's streak uses `doseStreak` and its adherence uses the rings' slots; the week circles' "missed" and the report's Missed rows are labelled by what each counts. (The report line's wording ×6: Approvals item 2.3.) | One concept, one number: the report goes to a provider and must match what the user sees (AD-07). | DV-032, DV-033 |
| DL-03 | The Today tracker streak looks back 365 days (no 31-day cap). **Narrowed 2026-10-12:** whether it counts days or doses → OPEN-17. | The founder gave the protocol streak a year "so a weekly protocol keeps counting"; the same reason applies to the tracker. The unit is a visible copy and meaning change, so it is the founder's. | DV-034 |
| DL-04 | One "due today" owner for header, card, ring and streak. | Today counts doses (2026-07-23); three answers on one screen is the A-118 class of bug. | DV-029 |
| DL-05 | The Missed scan covers ended protocols up to their end. | Ended protocols keep their history (A-83); rings already count them. | DV-031 |
| DL-06 | Protocols with no or fewer reminder times use one slot list everywhere (reminders, Today, rings, warnings). **Narrowed 2026-10-12:** which default (08:00, what the phone does, or the form's defaults) → OPEN-19 (c). **Round 2:** the default is decided by logic — 08:00 (DL-77). | Every surface must agree with what the phone does; the earlier text named two different defaults (the form fills "now" rounded, then 14:00, 21:00 — `protocolForm.js:102-105`). | DV-028 |
| DL-07 | A legacy protocol without a start date is anchored on its creation day everywhere. | Reminders and Today must count the same days. | DV-014 |
| DL-08 | Skip cancels that slot's reminders. **Narrowed 2026-10-12:** the Undo bar after Skip → OPEN-19 (d) (the pending "Didn't take" already shows one). | A reminder for a dose the user declared skipped is noise. | DV-035 (DV-130 → OPEN-19) |
| DL-09 | Undo and the Dose-log delete re-arm the slot's future reminders. | Reminder principle 2026-10-07: a dose still owed must still be reminded. | DV-040 |
| DL-10 | A reminder's body tap does what its "Mark complete" button does: one row written at the tap time (today's slot; the count model fills the earliest open slot) and the same reminders cancelled — every reminder of today up to and including the tapped slot. **Rewritten 2026-10-12 (round 2):** the earlier "acts on the reminder's own slot" contradicted the founder's tap-time rule. (The new "already logged" message is OPEN-24 item 9.) | The founder: "the dose time is the TAP time" (S-25, decisions.md:153); two entry points for the same notification must do the same thing (`notificationActions.js:91-103`). | DV-036 |
| DL-11 | "Tomorrow" / "Next 5 days" count doses, not protocols. | Today counts doses, not protocols (2026-07-23). | DV-037 |
| DL-12 | "All caught up" shows when no open slot remains (a skip counts as handled); the skipped line stays visible (picture first). (The picture: OPEN-24 item 12.) | The card exists to say nothing is left to act on. | DV-129 |
| DL-13 | One display name per protocol everywhere (translated compound, blend label), and notifications are re-planned on a language change. | One term per concept; the app language rules every surface. | DV-013, DV-050 |
| DL-14 | Never two active vials per protocol. | S-20 rule "never two active vials" (features.md:329, S-20 notes; citation corrected round 1); screens already assume it. | DV-016 |
| DL-15 | A dose edit recomputes the recon vial's capacity from the mass left. | One capacity rule (FX-11); the vial's real content does not change with the dose. | DV-015 |
| DL-16 | **→ AD-65, corrected 2026-10-12.** The earlier text picked "the Protocols style" (grey above 7 days), which reverses the founder's Q9 = B coloured days; the decision is the founder's and lives in AD-65. | decisions.md:147 (verification 01) | DV-018 |
| DL-17 | "Vial age" sort = days left. | The sort exists to put the vial closest to expiry first. | DV-122 |
| DL-18 | Mix dates: an impossible date is refused, never silently changed; at most 365 days back. | Honest journal: never store a date the user did not type. | DV-019 |
| DL-19 | Custom interval 1–365 days in the form and the assistant. | The longest-acting compound in the catalogue (Testosterone Undecanoate, depot t½ ~90 days, lib/halfLives.js:39) is dosed every 10–14 weeks; 365 is the assistant's existing bound (assistantSchema.js:53); one bound everywhere. | DV-123 |
| DL-20 | Restore reopens a vial only if it was not finished by doses and is not a tombstone. | An empty vial cannot be in use. | DV-022 |
| DL-21 | "Still going?" and its end date use logged Taken doses only. | Declared history never counts as logged (A-30 option C). | DV-026 |
| DL-22 | An empty ready-to-use vial can be replaced, and a new box is a new vial row (never the old row reset). **Narrowed 2026-10-12:** round 1 moved the recon "New vial" on the protocol page to OPEN-01; round 2 moved asking the new box's printed date there too (registry A-08 F6 waits for the founder). | F-035's New vial exists to start a fresh container; resetting the old row also keeps the old supply-push flag (DV-199). | DV-027, DV-199 (DV-093 → OPEN-01) |
| DL-23 | Today's empty-state "Add a protocol" opens the wizard. | The button says Add. | DV-124 |
| DL-24 | **Withdrawn 2026-10-12 → OPEN-05.** (Was: a lapsed Premium user keeps all active protocols.) | A money rule, and OPEN-05 option C offered the same choice (verification 07, D-02). | DV-095 |
| DL-25 | One reality-check assembler (`readCheckNow`) for Today, the food card, Progress and the schedulers: every surface follows the check's real state, never the date alone; Progress listens to sync; the day-21 reminder is re-planned on a weigh-in. **Round 2:** absorbs AD-12 (A-118). | A-118 (the founder's bug report, features.md:258) showed what happens when each screen assembles the state itself. | DV-056, DV-057, DV-059 |
| DL-26 | Today says what Progress will actually show (no "ready" when there is no result to see). (The new texts: OPEN-24 item 7.) | Same rule as A-118: follow the real state. | DV-058 |
| DL-27 | One weigh-in validation (25–300 kg, 3–70 %, 30–250 cm) on every entry path. | PO-21 limits exist for the same data from another door. | DV-065 |
| DL-28 | **Rewritten 2026-10-12.** `parse-food` counts the 25 daily parses by the user's local day of the request, not by the entry's date; a re-parse refused by the cap marks the row "not read yet — daily limit reached", keeps the text, explains, and retries the next day. (The new row state and notice: OPEN-24 item 8; the server deploy: Approvals item 1.) | decisions.md:251: "25 AI parses per user per day … resets at local midnight"; counting per `entry_date` (`index.ts:161-171`) leaves a refused row stuck forever, so the earlier "retry after local midnight" could never succeed (verification 04). | DV-066 |
| DL-29 | `calc_inputs` is merged per key on push. | `mergeCalcInputs` already exists locally; never-lose-data. | DV-010 |
| DL-30 | Each "days" count on Progress is labelled by what it counts (picture first). (The labels: OPEN-24 item 3.) | Three correct numbers that look contradictory are a bug. | DV-146 |
| DL-31 | The curve places doses at the user's own times (fixed hours only without times); pharmacometrician check. | "Planned schedule" (FX-13) includes the time the user planned. | DV-069 |
| DL-32 | **Withdrawn 2026-10-12 → OPEN-18 (1).** (Was: blend lines stay like any compound; decisions.md:205 annotated.) | It overrides the founder's explicit visual line decisions.md:205; decisions.md:209 does not mention blends (verification 05, 07 D-04). | DV-156 |
| DL-33 | The curve picker names blend components as the curve does. | One name per series (MB-4). | DV-153 |
| DL-34 | The Journey tile waits while Premium is unknown. | A paying user must not be sent to the paywall. | DV-154 |
| DL-35 | The curve's date wheel goes back 365 days. | The window is capped at 365 days; a pickable date must show a value. | DV-158 |
| DL-36 | The curve's fallback stays the newest protocol; the design doc is amended. | A-41 (2026-10-02) is later than the dashboard plan and defines the restore. | DV-157 |
| DL-37 | Enanthate / Nandrolone get a time-to-peak only with a published source. | PK rule: covariates only from published data (2026-09-09); evidence, not preference. | DV-106 |
| DL-38 | Latest lab value: newest date, then newest batch, everywhere. | One "latest" for hub, marker screen and export. | DV-074 |
| DL-39 | Test labels belong to a test (card), not to a date. | One card per test (A-101d). | DV-075 |
| DL-40 | Lab values are parsed with `parseMeasure` on every path. | Lab numbers have always read a comma as the decimal (doseMath). | DV-076 |
| DL-41 | The vaccine scan fills manufacturer, lot, dose number, provider, location. | Transcription only (AI hard line allows it); the fields exist and the app expects them. | DV-109 |
| DL-42 | Exports are complete: vaccine details, the profile and preferences; Settings imports first like the 18+ sheet. | Export covers the user's data (S-07); the same action must give the same file. | DV-079, DV-086 |
| DL-43 | Lab charts: one series per unit; x by date (picture first). (The chart: OPEN-24 item 4.) | Honesty lines: never mix scales or distort time on a health value. | DV-080 |
| DL-44 | No vaccine due reminder. | The next-due date is user-entered and never advice; nothing promised it. | DV-161 |
| DL-45 | Today's "blocked" card excludes Silent mode, and Silent is never "blocked" anywhere. **Narrowed 2026-10-12:** whether Settings stays red when dose reminders are off but another switched-on kind is blocked → OPEN-20 (a). **Round 2:** the Settings half is decided by the signed rows (AD-71). | BR-4 says Silent is never "blocked". The Settings half would amend the signed SP-1 / RC-1, so it is the founder's (verification 03). | DV-042 |
| DL-46 | Reminders read "OK" only when every timed protocol due in the window has its reminders; the setup bar shows "None scheduled". | "All set" must be true. | DV-043, DV-044 |
| DL-47 | Refresh health is honest: never-ran warns after 2 days; OK only when reminders were rebuilt; the count is kept. | A-110 exists to catch the silent failure. | DV-045, DV-046 |
| DL-48 | The persistent-reminders text describes the two repeats (+5, +10). (Wording ×6: Approvals item 2.2.) | Copy must be true; no new behaviour without approval. | DV-049 |
| DL-49 | The Reminder check covers the channel of every reminder kind the user has switched on (picture first). (The new rows: OPEN-24 item 5.) | Its purpose: "a reminder that never arrives is invisible" — the food question included. | DV-098 |
| DL-50 | **Withdrawn 2026-10-12 (moot).** (Was: the Android setup step still shows after a denied dialog; SP-4 wording amended.) | The code already matches the signed SP-4 ("right after 'Turn on notifications' is answered"; a denial is an answer); nothing to amend; DV-142 closed (verification 03, 07 X-05). | — |
| DL-51 | **Withdrawn 2026-10-12 → OPEN-07.** (Was: A-24 closed; a check cannot be saved early any more.) | Whether a check can be saved early is exactly what OPEN-07 asks (verification 04). | DV-144 |
| DL-52 | Account-scoped device keys are removed on the intended sign-out (and by whatever the cross-account guard does, OPEN-21); per-phone keys stay. | A real sign-out clears the account's drafts (BK-14, AD-05); one account must never inherit another's state. **Reason rewritten round 2** (it cited the coordinator's cross-account guard). | DV-081 |
| DL-53 | The entitlement cache is bound to the session user at sign-in, before any read. | One account must never see another's Premium. | DV-082 |
| DL-54 | Offline with a stored session = signed in. | CLAUDE.md: distinguish "signed out" from "session changed". | DV-083 |
| DL-55 | AI consent per account, recorded with version and date, cleared on sign-out, withdrawable in Settings (picture first). (The Settings withdraw row: OPEN-24 item 1; server proof: DL-83.) | "Consent before every AI call" (decisions.md:323) means the person sending; GDPR Art. 7(3) requires withdrawal. | DV-007 |
| DL-56 | Profile and analytics writes report failures and keep the typed values. | Never lose user-entered data; same pattern as the notification switches. | DV-008 |
| DL-57 | A sign-in fills the display name only when missing (Apple or Google). | "Fill ONLY the missing fields, never overwrite" (2026-10-03, PA-71…73). | DV-084 |
| DL-58 | Settings › Edit profile can edit every field the gate requires ("what you track"). (The editor: OPEN-24 item 2.) | Enter once, correct anywhere; the gate cannot be the only editor. | DV-113 |
| DL-59 | Someone who chose "Sign in" returns to Sign in after a restart. | They told the app what they wanted. | DV-163 |
| DL-60 | Deleting the account warns Premium users that the store subscription keeps billing, with a link. (The line and link ×6: OPEN-24 item 6.) | Apple / Google account-deletion guidance (store rules 100%). | DV-087 |
| DL-61 | The 7 free food-log days are called "free days", never "trial". (Wording ×6: Approvals item 2.14.) | One term per concept; "trial" is the store's offer. | DV-164 |
| DL-62 | No analytics before sign-in for now. | Default-on install-id analytics is a counsel question (ePrivacy 5(3)). | DV-167 |
| DL-63 | Reinstall behaviour is written into the TRD and checked on a device before any change. | Unspecified states are where data leaks or gets lost. | DV-116 |
| DL-64 | Add the `updated_at` trigger to `reality_checks` (production SQL with the founder's go). (Production go: Approvals item 1.) | The pull depends on it; every other synced table has it. | DV-088 |
| DL-65 | "As-needed doses are excluded" is a note, no code. | The app has no as-needed protocol type. | DV-133 |
| DL-66 | **Withdrawn 2026-10-12 → OPEN-18 (2).** (Was: the `not_recorded` marker is retired; FL-3 amended.) | It amends the signed FL-3; a signed row changes only with the founder's signature (verification 07, D-05). | DV-151 |
| DL-67 | **Withdrawn 2026-10-12 → OPEN-19 (b).** (Was: one daily cap = the doses expected that day; a snoozed dose after slot + 12 h logged as today.) **Round 2:** OPEN-19 (b) closed → DL-76. | It would refuse a real dose recorded on a rest day and contradicts its own snooze clause (verification 02, R5). | — |
| DL-68 | **→ OPEN-22 (b), moved 2026-10-12 (round 2).** (Was: the target ETA has no extra staleness cutoff.) | A registered founder item (decisions.md:417, "target ETA staleness cutoff"); a preference, not logic. | — |
| DL-69 | Typed numbers are parsed in the app language (pt/es/fr/de/it: comma = decimal, "5.000" = 5000; English as in CLAUDE.md), via `parseDecimal(text, language)`. | The founder approved displaying numbers in the app language (decisions.md:92) and prefilled fields must round-trip; a field that shows "86,0" must read "86,0" back. | — |
| DL-70 | iPad stays off (`supportsTablet: false`) for 1.3.0; enabling it is a registry item for a later build. | 1.3.0's scope is closed (evolution rule 2); iPad was never approved, and the foldable book layout is the approved large-screen work. | — |
| DL-71 | **→ OPEN-23, moved 2026-10-12 (round 2).** (Was: existing false Missed rows of real users are not migrated away; users can correct or delete them.) | A registered founder item (decisions.md:417); and its premise is false: a Missed row cannot be deleted (`LogScreen.js:112-121`). | — |
| DL-72 | **Withdrawn 2026-10-12 → OPEN-16 (b).** (Was: every synced table gets a positive tombstone instead of a cloud hard DELETE.) The principle — a delete reaches every device — stays logic and is restated in OPEN-16. | Timing and risk of a delete-semantics change on every table are the founder's. The old reason misattributed decisions.md:519-530 (a coordinator decision, Gate B) to the founder; he approved applying that migration (:531) (verification 01, 07 D-03). | DV-182 |
| DL-73 | **Withdrawn 2026-10-12 (false premise).** (Was: "+ Add a past weigh-in" accepts any past date back to the birth year.) | The wheel already stops 10 years back (`lib/wheelPick.js:16`); "back to the birth year" would widen the range; decisions.md:241 only says past weigh-ins can be backfilled. DV-194 closed (verification 04). | — |
| DL-74 | **Withdrawn 2026-10-12 → OPEN-16 (b).** (Was: dose counters sync as events; pushes carry only changed fields.) The principle — two offline doses count as two — stays logic and is restated in OPEN-16. | Same as DL-72; it may also need a server RPC (verification 07, D-03). | DV-183 |
| DL-75 | **Withdrawn 2026-10-12 (round 2) → OPEN-22 (a).** (Was: a measured daily burn shows whenever a measured result exists, even with incomplete formula inputs.) | It narrowed the signed PO-12 and the founder's later words (grok/206); a signed row changes only with the founder's signature. | DV-149 (→ OPEN-22) |
| DL-76 | "Mark complete" is capped at the protocol's doses per day on every path — Today, the notification action and the Dose log (Missed → Complete included). Added round 2 (closes OPEN-19 (b)). | One rule on every path (DL-04); the alternative ("the doses expected that day") refuses a real dose recorded on a rest day; the Dose-log fallback is the only path off the rule today (DV-204). | DV-204, DV-227 |
| DL-77 | Protocols without a reminder time use 08:00 as their slot everywhere (reminders, Today, rings, warnings, the curve). Added round 2 (closes OPEN-19 (c)). | The phone already reminds them at 08:00 (`notificationPlan.js:55-63`); every surface must agree with what the user already receives (DL-06). | DV-028 |
| DL-78 | The estimated curve before a protocol's creation (A-30 option C) looks back max(180 days, 5 × the compound's half-life); only Testosterone Undecanoate exceeds 180 days (450). No extra note on screen; pharmacometrician check. Added round 2 (decisions.md:417, A-30 window). | A pure-math estimate must include every dose that still contributes (~5 half-lives); under option C nothing is written, so the 180-day cap has lost its performance reason (features.md:359, :378). | — |
| DL-79 | Admin panel: deleted protocols are excluded from the counts (O-4); the metric definitions are translated into the 6 languages (O-6); each glossary line describes the formula the panel really computes (O-7); the Plans chart, which can only show "free" (profiles.plan is never updated), is removed (O-5) — a RevenueCat replacement would be new scope. Test accounts stay included for now (founder, decisions.md:389; O-3). Added round 2. | A number shown must be true; one language rule everywhere; the founder already decided the test-account part. | — |
| DL-80 | My Protocols colours vial days left exactly like the Today card (AD-65), from one days-left function. Added round 2 (the part of AD-65 the founder's pick did not name). Picture first: OPEN-24 item 11. | One concept, one look; the same number in two colours on two screens is the DV-018 defect. | DV-018, DV-200 |
| DL-81 | The in-app privacy policy (×6) has the same content as the web policy. Added round 2 (was AD-28). | One policy, one text; two texts depending on where the user taps is the DV-085 defect. | DV-085, DV-231 |
| DL-82 | A free trial is offered in the app only when the store says the person is eligible; otherwise neutral words ("See Premium"). Added round 2 (the eligibility clause of AD-49). | Copy must be true; the store decides eligibility (Apple / Google rules). | DV-126 |
| DL-83 | Three more legal questions join the founder's counsel list (decisions.md:388): server proof of consent (A-95), default-on install-id analytics under ePrivacy 5(3), and deleting the RevenueCat customer when the account is deleted. Added round 2. | Same class as the :388 items (questions only a lawyer can settle); the founder's rule is that such items need a real lawyer. | DV-007, DV-167, DV-219 |
| DL-84 | Analytics copy says "not linked to your account" (the install id is pseudonymous, not anonymous), in the consent, Settings and the in-app policy; the Apple / Play privacy labels match. Added round 2 (was AD-57; the wording ×6 and the labels are in "Approvals still owed"). | Copy must be true; "anonymous" overstates what a random install id is. | DV-190 |
| DL-85 | When the server confirms the account was deleted or the session revoked, scheduled reminders are cancelled and the phone's data is wiped; a network failure never cancels anything. The same covers what stays on a second phone after an Apple-account delete (F6). Added round 2 (was AD-04, OPEN-21 (1)). | The founder's reminder principle (a person who is not using it needs no reminders; the names are private, decisions.md:597-601) and "never destroy on a maybe". | DV-009 |
| DL-86 | The "Same dose for the last N weeks?" answer can be corrected: it is asked again when an edit moves the start earlier; "Yes" clears the history marker. Added round 2 (was AD-10, OPEN-21 (3)). The question naming the compound is wording (Approvals item 2.9). | An answer the user gave must be correctable; the curve must not keep an estimate the user denied. | DV-091 |
| DL-87 | An end that comes from the inactivity prompt ("Yes, it's finished") is dated at the last logged Taken dose; Missed rows the APP wrote after that end are removed on every phone (never a row the user entered). Added round 2 (A-86 / A-86b; was inside AD-11 → OPEN-21 (4)). | The prompt appears only after 7+ days with no dose, so the tap always includes days not taken; an ended protocol owes no doses after its end, on every phone alike. | DV-025 |
| DL-88 | End / Delete wins across devices: another phone's pending edit never brings an ended or deleted protocol back to active; status fields are sent only by the device that changed the status; vials follow the same rule. Added round 2 (A-87 / A-87b). | Mirrors "Stop wins" (decisions.md:239); a deliberate end must not be undone by an unrelated edit. | DV-021 |
| DL-89 | Restoring a protocol deleted before today puts it in Ended (Restart makes it active and respects the free limit); a same-day Restore is an undo: active under the free limit, otherwise Ended. Added round 2 (A-89, decisions.md:538). | Its deleted days are never owed doses; Restore must not bypass the free limit; nothing is held hostage. | — |
| DL-90 | A newer weigh-in typed on another phone is re-inserted when the same-day row was deleted elsewhere. Added round 2 (A-92, decisions.md:539). | Never lose user-entered data: newer user input wins. | — (noted in DV-182) |
| DL-91 | A Journey tile tap logs an analytics event with its source (A-98). Added round 2. | The flagship's main entry must be measurable like every other entry (anonymous analytics, the founder's "4 anônima"). | DV-105 |
| DL-92 | The 18+ and profile gates can be answered offline (kept on the phone, written when online) and offer the same "Sign out anyway" as Settings. Added round 2 (was AD-29, OPEN-21 (5)); the button on the gates is OPEN-24 item 10. | A gate that cannot be answered offline traps a user with unsynced rows; the data is still collected (build-49 intent). | DV-114 |
| DL-93 | `delete-user` names `ai_assistant_usage` (and `profiles`) and drops the two tables that do not exist. Added round 2 (was AD-46, OPEN-21 (7)). | Privacy: the deletion list names every user table, so the code says what the policy promises. | DV-011 |
| DL-94 | The automatic 7-day purge of Recently deleted stays paused through 1.3.0; deleting forever by hand works. Added round 2 (was AD-50, OPEN-21 (8)); what comes after 1.3.0 is OPEN-04. | Never destroy on a maybe: deletes from the old "Yes, it's finished" button cannot be told from deliberate ones, and the cloud cascade would erase their doses; the by-hand path is the founder's (decisions.md:501, :515). | DV-125 |
| DL-95 | "Earlier day" in "Fix this entry" covers 2–7 days back. Added round 2 (was AD-54, OPEN-21 (9)). | FL-2 (founder): food is logged up to 7 days back; Today = 0 and Yesterday = 1, so the third choice is 2–7. | — |
| DL-96 | Gym body-composition scans are a measurement source, not advice. Added round 2 (was the AD-61 part, OPEN-21 (10)). | The AI line forbids advice and interpretation, not a measurement the user brings. | — |
| DL-97 | A half-filled new protocol lives, like every draft, until it is saved or the app closes; Cancel asks before discarding it. Added round 2 (was AD-35, OPEN-21 (6)). | The founder's draft rule (BK-14, decisions.md:378) keeps drafts "until saved or the app closes"; the wizard gets the same lifetime. | DV-127 |
| DL-98 | On the unfolded Fold, the left page follows every write made on the right page, the food log included. Added round 2. | BK-19 (the left page follows doses and weigh-ins) exists so the two pages of one screen never disagree; food is the same case. | DV-238 |
| DL-99 | A deliberate end — "End protocol" on the protocol page, or "Protocol finished" on the empty-vial prompt once its picture with "Later" is approved — is dated at the moment tapped; no date question; the doses and Missed rows before it stay as they are. Added round 3 (it was the coordinator lines decisions.md:504 and :535, A-83 option a "as built", never put to the founder; grok/251 "decided by logic (not asked)"). | The person ends it now, by a deliberate act: an honest journal records what was declared and when. Only the inactivity prompt is back-dated (DL-87), because it appears after 7+ days with no dose, so its tap always covers days not taken; a deliberate tap does not. A date question would be new UI nobody approved. | DV-090 |
| DL-100 | Onboarding answers kept on the phone before an account exists belong only to the person who passed "Before we begin" in this run of the app; they are written only into that person's account, fill ONLY the fields the account is missing (never overwrite a stored value), and leave the phone as soon as an account has them and on any real sign-out (PA-71…PA-73, built). Added round 3 (it was the coordinator lines decisions.md:472-473). | One account must never receive another person's data (as DL-52, DL-53); "writes merge, never clobber" (CLAUDE.md, founder 2026-09-12) with the build-49 "I need the data"; a real sign-out clears what belongs to the account (AD-05). The premium-and-auth checklist that holds these rows still needs his signature (Approvals item 7). | DV-084 (display name) |
| DL-101 | The one-time "I'm 18 or older" confirmation also asks the person's real birth year; `adult_confirmed_at` and `birth_year` are saved in one merge-only write and the calorie inputs then use the new year (PA-106…PA-108, built). Added round 3 (it was the coordinator line decisions.md:496). | Once the person confirms 18+, the stored under-18 year is wrong by definition, and the birth year feeds the calorie math (the profile is the only age source; age feeds the BMR, not the curve). The confirmation itself is the founder's (decisions.md:482); the year wheel on its sheet is built and is seen and signed with the premium-and-auth checklist (Approvals item 7). | — |

---

---

## Versão em português — para mandar ao fundador numa rodada só

Corresponde 1:1 à seção "OPEN" e à seção "Approvals still owed" acima. A mensagem não usa códigos; o comentário abaixo liga cada número ao ID do documento.

<!-- mapa pergunta → ID: 1 = OPEN-16 · 2 = OPEN-24 · 3 = OPEN-01 · 4 = OPEN-02 · 5 = OPEN-03 · 6 = OPEN-04 · 7 = OPEN-05 · 8 = OPEN-17 · 9 = OPEN-19 (d) · 10 = OPEN-06 · 11 = OPEN-20 (a = item b, b = item c) · 12 = OPEN-07 · 13 = OPEN-08 · 14 = OPEN-09 · 15 = OPEN-22 (a) e (b) · 16 = OPEN-10 · 17 = OPEN-11 · 18 = OPEN-23 · 19 = OPEN-13 · 20 = OPEN-14 (a = item b, b = item c) · 21 = OPEN-15 · 22 = OPEN-21 (11) · 23 = OPEN-18 (a = item 1, b = item 2, c = item 3, d = item 4, e = item 9). Lista "O que falta você fazer": 1 = Approvals 1 · 2 = Approvals 2 · 3 = Approvals 3 · 4 = Approvals 4 · 5 = Approvals 5 · 6 = Approvals 6 · 7 = Approvals 7 · 8 = Approvals 8 · 9 = Approvals 9. -->

> Oi! Terminei o levantamento completo do app — a descrição do produto, a descrição técnica e os 14 fluxos desenhados — e, antes de te mandar, pedi para agentes independentes conferirem tudo, em três rodadas, contra o código, as suas decisões e o estado real do servidor. Eles acharam erros meus, inclusive coisas que eu tinha dado como "já decididas por você" e não eram, e perguntas que eu ia te fazer mas que você já tinha respondido. Está tudo corrigido.
>
> **Os números, com honestidade:**
> - **231 erros na lista de erros do app:** 15 graves (perda de dado, dado de saúde errado ou privacidade), 103 de informação errada ou contraditória na tela, 44 de algo aprovado que falta ou não dá para provar, 69 de acabamento, texto ou código. Fora isso, 3 tarefas de operação (por exemplo, renovar a chave da Apple).
> - **62 pontos você já tinha decidido** — com palavras suas ou checklists que você assinou. Eu só aplico.
> - **87 pontos resolvi pela lógica do produto** (por exemplo: "nunca perder dado da pessoa", "um termo por conceito", "o texto tem que ser verdade", "uma regra só para estoque baixo"). Estão nas suas decisões, uma linha cada, com o motivo. Se discordar de algum, é só dizer que eu mudo.
> - Sobram **23 perguntas** que só você pode responder (gosto, dinheiro, risco ou escopo), e uma lista curta de coisas que dependem de você mas não são perguntas (no fim).
>
> Para cada pergunta deixo o contexto, as opções e a minha recomendação. Se concordar com tudo, basta responder **"siga as recomendações"**. Se quiser mudar alguma, mande só o número e a letra (ex.: "1b C, 8 A"). Nenhuma das 23 entra em código antes da sua resposta.
>
> **Escopo**
>
> **1. O que entra na 1.3.0, e quando sai a correção da sincronização entre aparelhos**
> *(a) O que entra.* São 231 erros, e nenhum tem ainda o build em que vai ser corrigido. Duas regras suas se encontram aqui: "Vamos resolver tudo. Sem pendência" (07/10) e "cada build tem escopo fechado; o que é novo ganha um build-alvo e nunca entra escondido". As telas e textos novos que algumas correções criariam estão na pergunta 2.
> *Opções:* **A)** tudo na 1.3.0 — a ida para as lojas espera tudo ficar pronto. **B)** na 1.3.0 entram todos os erros graves e de informação errada, tudo o que você já aprovou e todas as correções de texto; o que cria tela nova que você ainda não aprovou e a limpeza interna de código vão para a 1.3.1, com o alvo escrito. **C)** na 1.3.0 só os graves e o que você já aprovou; o resto na 1.3.1.
> *(b) A sincronização entre aparelhos.* Achamos quatro jeitos de um dado se perder ou ficar errado entre dois aparelhos da mesma conta, todos confirmados no código:
> 1. uma dose apagada no iPhone continua no Fold; e, se você mexer nela no Fold, ela volta a aparecer no iPhone;
> 2. duas doses registradas sem internet, uma em cada aparelho: as duas aparecem no Registro de doses, mas a contagem do frasco (ou do pote) fica uma dose atrás; e uma observação escrita no protocolo num aparelho pode ser desfeita pelo outro;
> 3. o mais sério, achado nesta segunda conferência: depois que um aparelho envia algo novo, ele pode nunca mais receber o que o outro aparelho salvou antes — uma dose, refeição, pesagem ou exame salvo num aparelho pode simplesmente nunca aparecer no outro;
> 4. dois casos mais raros, de horário, com o mesmo resultado.
> Você decidiu em 28/09 que "uso simultâneo em vários aparelhos não é um caso real do DoseTrace". Isso continua valendo para edições ao mesmo tempo. Mas esses quatro casos não precisam de uso ao mesmo tempo: basta usar dois aparelhos um depois do outro, ou um deles ficar sem internet um tempo — e você mesmo usa o iPhone e o Fold com a mesma conta. Corrigir muda como exclusões e edições viajam entre aparelhos em todo tipo de registro (doses, frascos, refeições, pesagens, exames), exige mudanças no servidor (que só aplico com o seu "pode aplicar"), revisão completa de segurança e teste em dois aparelhos atualizando de uma versão antiga.
> *Opções:* **A)** tudo na 1.3.0. **B)** na 1.3.0 as exclusões e os casos 3 e 4; a contagem do frasco (caso 2) na 1.3.1. **C)** tudo na 1.3.1, com o problema documentado.
> *Recomendação:* **(a) B e (b) A.** B coloca tudo o que você aprovou no próximo build e tira da loja todo erro que a pessoa vê, sem enfiar tela nova não aprovada num build fechado; nada some, porque cada item adiado fica com alvo escrito. Se para você "sem pendência" quer dizer que nem item com alvo pode ficar para depois, a resposta é A. Na sincronização, A: dose que volta depois de apagada, contagem errada e, principalmente, dose que nunca chega no outro aparelho são dados de saúde errados — e acontecem no seu próprio uso com dois aparelhos. A 1.3.0 é o build que todo mundo vai instalar.
>
> **2. Telas e textos novos que algumas correções criariam (desenho antes, nos 6 idiomas)**
> Cada item abaixo sai de uma correção pela lógica, mas cria algo que você nunca aprovou. A regra de fundo continua decidida; a pergunta é só se essa parte visível entra (cada uma te mostro desenhada, claro e escuro, antes de qualquer código):
> 1. em Ajustes › Dados e privacidade, uma linha para retirar o consentimento de IA (a lei europeia exige que dê para retirar);
> 2. em Editar perfil, poder mudar "o que você acompanha";
> 3. em Progresso, cada contagem de "dias" com o nome do que ela conta;
> 4. nos gráficos de exames, uma linha por unidade e os pontos espaçados pela data;
> 5. em Verificar lembretes, linhas para a pergunta das 20h, o check-in semanal e os alertas de frasco;
> 6. ao excluir a conta, um aviso para quem é Premium de que a loja continua cobrando, com o link para cancelar;
> 7. em Hoje, o que o alerta diz quando "Seus números reais" estão prontos mas bloqueados ou sem número (depende da pergunta 14);
> 8. no Registro de comida com IA, uma refeição marcada "ainda não lida — limite do dia atingido", com o aviso;
> 9. em Hoje, uma frase curta quando a pessoa toca num lembrete de uma dose que já foi registrada;
> 10. nas confirmações de 18+ e do perfil, o mesmo "Sair mesmo assim" dos Ajustes;
> 11. em Meus protocolos, os dias restantes do frasco coloridos como no cartão de Hoje (verde acima de 7 dias);
> 12. em Hoje, o "Tudo em dia por hoje" num dia terminado com uma dose pulada, com a linha da dose pulada ainda visível.
> *Opções:* **A)** os doze seguem, cada um aprovado no desenho antes do código; o build segue a pergunta 1. **B)** todos menos os números que você indicar.
> *Recomendação:* **A** — cada um faz o app dizer a verdade ou fecha um buraco que a pessoa encontra (retirar o consentimento é exigência legal; o aviso de cobrança é orientação das lojas); e todo detalhe visual continua sendo escolha sua no desenho.
>
> **Protocolos e estoque**
>
> **3. Corrigir o frasco em uso, "Novo frasco" para protocolo em pó, e a validade da caixa nova**
> *Contexto:* a data em que a pessoa misturou o frasco e a validade dele (30 dias, por padrão) são digitadas uma vez só e depois não dá para corrigir; e todo protocolo novo começa o frasco com zero doses usadas, mesmo quando a pessoa já está no meio dele. Um erro de digitação ou um frasco pela metade deixa errados o "faltam X doses", os dias restantes, a etiqueta "Fora do prazo" e o alerta de estoque, até o frasco acabar. No "Retomar" você já resolveu o caso de quem continua no frasco antigo ("Continuar o mesmo frasco"); falta o frasco pela metade quando o protocolo é criado, a correção de um erro de digitação e o frasco novo antes do antigo acabar. No protocolo em pó só dá para começar um frasco novo pelo aviso de Hoje, quando o frasco acaba: um frasco vencido mas não vazio fica sem saída. E no frasco pronto para uso, o "Novo frasco" hoje reaproveita o frasco antigo e mantém a validade da caixa velha. Essa dúvida está parada desde 13/09.
> *Opções:* **A)** na página do protocolo: "Editar frasco" (data da mistura, validade e doses já usadas) e "Novo frasco" — para pó, igual ao de Hoje; para frasco pronto, perguntando mês e ano de validade da caixa nova (pode deixar em branco). Te mostro o desenho antes. **B)** só perguntar "quantas doses você já usou deste frasco?" quando o protocolo ou o frasco começa no passado; o "Novo frasco" do pó continua só em Hoje; a caixa nova fica sem validade. **C)** só o mínimo: um frasco pronto vazio pode ser trocado, sem perguntar a validade.
> *Recomendação:* **A** — os alertas do próprio app saem desses números; o que a pessoa informa tem que poder ser corrigido num lugar só, e caixa nova tem validade nova impressa.
>
> **4. Aviso de estoque baixo para cápsulas, comprimidos e pó**
> *Contexto:* o aviso de "acabando" (faltam de 1 a 3 doses) existe só para frascos — no alerta de Hoje, na notificação e no selo de Meus protocolos. Um pote de cápsulas pode acabar sem nenhum aviso. (A conta de dias de estoque dos potes tomados em dias alternados também está errada; isso é erro e eu corrijo de qualquer jeito.)
> *Opções:* **A)** a mesma regra dos frascos para os potes: alerta em Hoje, notificação e selo. **B)** só uma linha âmbar no cartão ("faltam N porções"), sem alerta nem notificação. **C)** deixar como está.
> *Recomendação:* **A** — uma regra só para o mesmo conceito; ficar sem o suplemento importa tanto quanto ficar sem o frasco.
>
> **5. O que acontece quando termina um ciclo com número fixo de doses**
> *Contexto:* você aprovou em 07/10 que protocolos com total de doses param os lembretes quando o ciclo termina. Só que o formulário não deixa mais ninguém definir esse total — só protocolos antigos têm. Nesses, o lembrete para, mas Hoje continua pedindo a dose e vai acumulando doses perdidas até aparecer o "Ainda em andamento?".
> *Opções:* **A)** no fim do ciclo o protocolo é encerrado sozinho, sem perguntar (quem continua além do previsto perde os lembretes sem aviso). **B)** no fim do ciclo o app para de esperar doses em todo lugar e Hoje pergunta "Ciclo concluído — encerrar {nome}?", com Encerrar / Continuar (Continuar tira o total). **C)** ignorar o total em todo lugar e manter os lembretes (vai contra o que você aprovou em 07/10).
> E junto: quer o campo "total de doses" de volta no formulário? **Sim / Não.**
> *Recomendação:* **B, sem trazer o campo de volta por enquanto** — pergunta antes de encerrar, igual ao "Ainda em andamento?", e respeita a sua regra de lembrar até a pessoa encerrar.
>
> **6. "Excluídos recentemente" deve voltar a se esvaziar sozinho depois da 1.3.0?**
> *Contexto:* a limpeza automática depois de 7 dias fica pausada na 1.3.0 por segurança: os protocolos apagados pelo antigo botão "Sim, terminou" não dá para diferenciar das exclusões de propósito, e a limpeza levaria junto o histórico de doses deles. "Excluir para sempre", com seleção múltipla, você aprovou e já existe.
> *Opções:* **A)** nunca limpar sozinho: o protocolo fica lá até a pessoa excluir para sempre (e o aviso de exclusão diz exatamente isso). **B)** voltar a limpar depois de 7 dias só o que for excluído a partir da 1.3.0. **C)** voltar a limpar tudo, depois de mudar o servidor para que apagar um protocolo não leve junto o histórico de doses — a mudança maior e mais arriscada.
> *Recomendação:* **A** — com "Excluir para sempre" pronto, a limpeza automática só traz risco e nenhum ganho para a pessoa.
>
> **7. O limite de 3 protocolos do plano grátis: no servidor, e depois que o Premium acaba**
> *Contexto:* hoje o limite é conferido só no celular, na hora de adicionar, retomar ou restaurar; com dois aparelhos ou uma versão antiga dá para passar de 3. E quem deixa de pagar o Premium continua com todos os protocolos ativos. É regra de dinheiro, então é sua.
> *Opções:* **A)** continuar conferindo só no celular; quem deixa de pagar fica com todos os protocolos ativos, mas não adiciona nem retoma nenhum acima de 3 até assinar de novo. **B)** o servidor recusa o 4º protocolo — como o app funciona sem internet, a recusa chegaria depois, com o protocolo já criado no celular, e um dado de saúde ficaria no limbo. **C)** B + ao deixar de pagar, os protocolos acima de 3 são encerrados (e os lembretes deles param).
> *Recomendação:* **A** — encerrar protocolos pararia lembretes de algo que a pessoa ainda toma (seu princípio de 07/10), e recusar no servidor arrisca perder um dado de saúde; hoje não há necessidade de receita que justifique.
>
> **Hoje e doses**
>
> **8. A sequência da chama em Hoje: dias ou doses, e com que palavras**
> *Contexto:* em 05/10 você mudou a sequência do cartão de cada protocolo para contar doses seguidas, porque um protocolo semanal mostrava "2 dias sem falhar" — isso está aplicado. A chama de Hoje é outra coisa: ela já pula os dias sem dose prevista e conta só os dias em que havia dose (para no máximo 31 dias; passar para 1 ano já está decidido). Só que, para quem só tem protocolos semanais, ela conta os dias de dose e continua escrevendo "2 dias sem falhar" depois de duas doses semanais — exatamente o texto que você rejeitou no cartão. O protótipo aprovado mostra "dias sem falhar".
> *Opções:* **A)** como está: dias, pulando os dias sem dose, o mesmo texto ("N dias sem falhar"), até 1 ano. **B)** a chama também conta doses seguidas (precisa de uma regra para vários protocolos; textos novos nos 6 idiomas). **C)** dias como está, mas com um texto que fique certo para o semanal (por exemplo "2 dias de dose seguidos"), até 1 ano.
> *Recomendação:* **C, com o desenho de A e C antes** — a chama continua respondendo "quantos dias de dose mantive tudo em dia" e some o texto que você rejeitou; B pede uma regra nova para pouco ganho.
>
> **9. "Desfazer" depois de "Pular"**
> *Contexto:* depois de "Concluir" aparece a barra "Desfazer"; depois de marcar como não tomada a dose pendente de ontem também; depois de "Pular", não. "Pular" é o único dos três que já pergunta antes ("Pular dose?"), e uma dose pulada ainda pode ser concluída pela linha dela ou apagada no Registro de doses. (Achei aqui um erro que eu corrijo de qualquer jeito: depois de marcar a dose de ontem como não tomada, a barra diz "Dose registrada".)
> *Opções:* **A)** "Desfazer" depois de "Pular" também (um jeito só na tela; desfazer religa os lembretes). **B)** nenhum "Desfazer" depois de "Pular" nem depois de marcar a dose de ontem como não tomada. **C)** como está.
> *Recomendação:* **A** — um jeito só de desfazer na mesma tela; o "Pular dose?" continua.
>
> **Lembretes**
>
> **10. Lembretes no iPhone de quem para de abrir o app**
> *Contexto:* seu princípio (07/10) é que o app avisa enquanto a pessoa estiver tomando, abrindo o app ou não. No Android isso **já foi construído** (renovação em segundo plano, despertar diário e reconstrução depois de atualização ou reinício), mas **ainda falta a prova no aparelho**. No iPhone os lembretes ficam agendados por no máximo 10 dias (menos, com muitos protocolos, por causa do limite de 64 notificações da Apple) e depois simplesmente param, sem aviso.
> *Opções:* **A)** manter o agendamento no celular, mas a última notificação do período vira "Abra o DoseTrace para continuar recebendo seus lembretes", e Hoje avisa quando o período estiver acabando — barato, mas ainda depende de a pessoa abrir o app uma vez, então sozinho não cumpre o seu princípio. **B)** notificações enviadas pelo servidor para o iPhone — a única opção que cumpre o princípio; é um projeto grande, com custo mensal (precisa ter tudo o que os lembretes do celular têm: modo silencioso, esconder nomes, botões, repetições). **C)** atualização em segundo plano do iOS — o iPhone roda quando quer e nunca depois que a pessoa fecha o app à força; sem garantia.
> *Recomendação:* **A agora e B como projeto próprio logo em seguida** (o build segue a pergunta 1).
>
> **11. Dois detalhes dos lembretes**
> *(a) Quando o celular pede permissão de notificação depois do "Agora não".* Hoje o app chama o pedido de permissão a cada abertura e a cada login, segundos depois de a pessoa dizer "Agora não" no começo. A janela do sistema em si só aparece enquanto a pessoa ainda não respondeu: uma vez no iPhone, no máximo duas no Android. A tela "Garanta que seus lembretes cheguem" só existe no Android. Então, com uma regra simples de "nunca pedir ao abrir", quem tem iPhone, disse "Agora não" e depois recebe protocolos com horário de outro aparelho (instalação nova, login num celular novo) nunca veria a janela do sistema.
> *Opções:* **A)** não pedir ao abrir; pedir quando um protocolo com horário de lembrete for salvo pela primeira vez no aparelho ou chegar nele vindo de outro aparelho (e, no Android, pela tela "Garanta que seus lembretes cheguem"). **B)** pedir mais uma vez na abertura seguinte e depois nunca mais. **C)** como está.
> *(b) Alerta de vencimento do frasco.* Ficou pronto em 03/10: avisa 7 dias antes e no dia do vencimento, às 9h, com as mesmas palavras do alerta de Hoje; ficou pendente você confirmar a antecedência e o texto (o texto você também vê no build de teste — item 8 da lista final).
> *Opções:* **A)** como está (7 dias antes + no dia). **B)** 3 dias antes + no dia. **C)** só no dia.
> *Recomendação:* **(a) A, (b) A** — respeita o "Agora não" e pede quando a pessoa acabou de pedir um lembrete, inclusive quem chega no iPhone com lembretes de outro aparelho; e uma regra só de 7 dias para o alerta de Hoje e para a notificação.
>
> **Registro de comida com IA, "Seus números reais" e Progresso**
>
> **12. "Seus números reais": fechar sozinho e um peso só no início**
> *Contexto:* em 29/09 ficou combinado: sem campo de peso próprio (a medição usa as pesagens) e botões de resultado a partir do dia 14. O que foi construído: uma tela de início com campo de peso próprio, sem botões, e a medição fecha sozinha na primeira pesagem a partir do dia 21, quando há 7 dias seguidos de comida anotada (ou calorias informadas) — mas só quando a pessoa abre Progresso, e só para quem pode ver o resultado. O seu OK para esse fechamento automático nunca ficou escrito (os textos de "Seus números reais estão prontos — toque para ver", feitos depois do erro que você achou em 09/10, já partem dele). Hoje o peso do início pode ser diferente da pesagem daquele dia, e aí a conta e o gráfico usam pesos diferentes. A sua resposta também fecha uma dúvida antiga: "concluir antes encerra a pergunta das 20h?".
> *Opções:* **A)** como está (peso próprio, fecha sozinho; os dois pesos continuam possíveis). **B)** voltar ao combinado de 29/09 (sem peso próprio, botões a partir do dia 14) — exige refazer, e um resultado tirado entre o dia 14 e o 21 é menos preciso que um de 21 dias. **C)** fecha sozinho como está, mas o peso do início É a pesagem daquele dia (digitar outro número atualiza a pesagem, com confirmação, igual em "Seus números").
> *Recomendação:* **C** — mantém o fluxo que você já vem testando e cada peso passa a ter um lugar só.
>
> **13. "Parar a medição" apaga os resultados anteriores?**
> *Contexto:* hoje "Parar a medição" pergunta antes e depois apaga TODOS os resultados já medidos, e o gasto diário volta a aparecer como "Estimado". O mesmo link aparece também na tela do resultado pronto e na tela bloqueada, **sem nenhuma medição em andamento** — e um toque confirmado ali apaga tudo. A sua decisão falava só em encerrar a medição aberta, cancelar os lembretes e manter a comida anotada. O texto de confirmação ("Isso apaga seus números reais") nunca foi aprovado como "apagar os resultados antigos" e, em português, soa como desligar o recurso, não como apagar medições passadas.
> *Opções:* **A)** "Parar a medição" só aparece com uma medição em andamento e encerra só ela; os resultados antigos ficam. **B)** como está (apaga tudo, de onde for tocado). **C)** A + um botão separado "Apagar meus resultados", que pergunta antes.
> *Recomendação:* **A** (ou **C**, se quiser dar um jeito de apagar) — nunca apagar dado na dúvida; um resultado medido é dado da pessoa.
>
> **14. Quando a conta não gera um número**
> *Contexto:* com a pesagem e os 7 dias de comida completos, às vezes a conta dá "manutenção" (o peso mudou menos de 0,2 kg — a pessoa come o que gasta), "improvável" (fora de 1.000 a 5.000 kcal) ou "curto demais" — este, na prática, só quando todos os dias foram "Não comi nada" (média zero). Hoje só o resultado normal é salvo: nesses três casos a medição nunca termina, Hoje fica dizendo "prontos — toque para ver" sem ter nada para ver, e a pergunta das 20h continua chegando enquanto a pessoa ainda pode anotar comida. (O texto do "improvável" sempre diz "baixo demais", mesmo quando o número é alto — isso é erro e eu corrijo de qualquer jeito.)
> *Opções:* **A)** salvar "manutenção" como resultado de verdade (gasto diário = média consumida); nos outros dois casos, mostrar o motivo e encerrar a medição depois que a pessoa vir, oferecendo recomeçar. **B)** manter a medição aberta, mas parar a pergunta das 20h e mostrar o motivo em Hoje e em Progresso. **C)** como está.
> *Recomendação:* **A** — peso parado comendo X kcal é justamente a medida da manutenção (é conta, não conselho), e uma medição que nunca termina quebra o hábito diário. Como muda um número de saúde exibido, a revisão da conta de energia roda antes do build.
>
> **15. Dois detalhes de Progresso**
> *(a) Gasto diário medido com o perfil incompleto.* No checklist de Progresso que você assinou em 03/10 está: "o gasto diário só aparece quando peso, altura, idade e sexo existem". A sua frase de 02/10 foi "não mostrar calorias até altura, idade e sexo estarem preenchidos" — dita quando você escolheu o que a fórmula precisa. E em 13/09 você decidiu que "a manutenção medida vira o número principal assim que existe". O gasto medido (o resultado de "Seus números reais") não precisa de altura, idade nem sexo. Hoje, se falta um deles, o cartão de Progresso e o quadro em Evolução escondem até o gasto medido (a tela do resultado ainda mostra). O que você assinou cobre qualquer gasto; a sua frase era sobre a fórmula — dá para ler dos dois jeitos.
> *Opções:* **A)** mostrar o gasto medido sempre que existir (o checklist passa a limitar só a estimativa, com a sua assinatura). **B)** como está e assinado: nenhum gasto, nem o medido, até altura, idade e sexo existirem.
> *(b) Previsão da meta com pesagens antigas.* Você aprovou a previsão de quando a pessoa chega na meta "com o período de pesagens de onde ela sai" escrito ao lado. Ficou como dúvida sua se uma previsão feita com pesagens antigas deve sumir depois de um tempo. Hoje ela sempre aparece, sempre dizendo de que período saiu.
> *Opções:* **A)** como está: sempre aparece, sempre com o período. **B)** some (com um "pese de novo") quando a pesagem mais nova do período tiver mais de N dias (você escolhe o N).
> *Recomendação:* **(a) A, (b) A** — o gasto medido é o número da própria pessoa e não depende daqueles dados; esconder depois de 21 dias de medição é uma perda que ela sente. E a previsão já diz de onde vem, então nada é escondido nem inventado.
>
> **Acúmulo de doses**
>
> **16. Mudar a dose reescreve o passado da curva?**
> *Contexto:* hoje a curva aplica a dose atual (e o intervalo, a data de início e as doses por dia) a todas as doses passadas. Baixou de 250 para 125 mg? Meses de histórico são redesenhados em 125 mg — inclusive a "Estimativa em uma data" ao lado de exames antigos. O app não guarda o histórico das edições: não dá para saber quando uma dose antiga foi mudada. Está em aberto desde 13/09.
> *Opções:* **A)** como está, com um aviso na curva quando o protocolo foi editado ("usa a dose atual para as datas passadas"). **B)** daqui para a frente, guardar cada mudança com a data em que passou a valer; o passado usa os valores antigos (os protocolos de hoje começam com uma versão só, porque as mudanças antigas não podem ser recuperadas; muda a forma como os protocolos são guardados e sincronizados, e passa por revisão farmacológica). **C)** editar a dose encerra o ciclo antigo e começa um novo (pesado para a pessoa e divide o histórico).
> *Recomendação:* **B** (e **A** como solução provisória se B não ficar bom a tempo do build) — um diário honesto mostra o que estava planejado em cada época; a partir da mudança, toda edição fica com data.
>
> **17. Doses puladas ou perdidas devem baixar a curva?**
> *Contexto:* a curva segue o planejado — o aviso na tela já diz isso — e por isso as doses puladas e perdidas continuam contando. Contar só as concluídas é mudança de modelo que precisa de revisão farmacológica (sua decisão de 24/09).
> *Opções:* **A)** como está. **B)** para o passado (depois que o protocolo foi criado), usar o Registro de doses — só as concluídas; o histórico informado antes da criação e o futuro seguem o planejado. **C)** curva planejada, mas as doses puladas ou perdidas aparecem marcadas de outro jeito (vazadas), sem mudar o número.
> *Recomendação:* **B depois da revisão farmacológica, e C até lá** — o Registro de doses da própria pessoa é a fonte honesta do passado, e a curva é o carro-chefe do app.
>
> **Hoje: doses perdidas antigas**
>
> **18. Doses marcadas como perdidas por engano**
> *Contexto:* antes das correções de doses perdidas (por exemplo, depois de trocar de fuso horário), o app marcou como "perdida" doses de pessoas reais em dias em que nenhuma dose era devida. Você corrigiu as causas e mandou não mexer nas da conta de teste; ficou como dúvida sua o que fazer com as que já existem. Não dá para separar com segurança das perdas de verdade. E hoje, no Registro de doses, uma dose perdida só pode virar "concluída" ou "pulada" — não dá para tirá-la, e uma dose antiga apagada volta como perdida na verificação seguinte. Ou seja, a pessoa não consegue corrigir um dia em que não havia dose.
> *Opções:* **A)** como está: nada é limpo; a pessoa só pode transformar a perda falsa em concluída ou pulada. **B)** colocar "Não havia dose" numa dose perdida do Registro de doses: ela vira uma marca neutra que a verificação respeita (nada é apagado, e o relatório para o profissional de saúde deixa de contar). Texto novo nos 6 idiomas, desenho antes. **C)** uma limpeza única das perdas que o app consegue provar que marcou por engano — arriscado: uma perda real pode parecer igual.
> *Recomendação:* **B** — quem decide qual perda foi real é a pessoa, não o app (nunca apagar dado na dúvida), e o relatório para o profissional deixa de mostrar uma falha que não aconteceu.
>
> **Meu corpo**
>
> **19. O alerta "Exame de sangue pendente"**
> *Contexto:* quando o último exame tem mais de 6 meses, Hoje mostra "Exame de sangue pendente · Já se passaram N meses desde seu último exame". Os 6 meses foram escolhidos pelo app, não pela pessoa — é um calendário que ela não definiu, perto da linha de "nunca orientar". E você pediu que Hoje mantenha todos os recursos.
> *Opções:* **A)** manter (mantém uma recomendação escolhida pelo app; risco regulatório). **B)** mesmo gatilho, texto só de fato: "Seu último exame foi há N meses" (sem "pendente"). **C)** a pessoa define o próprio intervalo (ou nenhum) em Meu corpo; nenhum por padrão. **D)** remover o alerta (Hoje perde um recurso).
> *Recomendação:* **B** — mantém o lembrete útil sem o app decidir o que está pendente; o revisor regulatório confere a frase.
>
> **20. Duas melhorias pequenas em Meu corpo**
> *(a) Quantas leituras já foram usadas.* Quem está no grátis só vê o limite ("3 leituras grátis por mês…") antes da primeira leitura que trouxe valores — no Diário de exames vazio e no cartão do plano grátis; depois disso Meu corpo não mostra mais número nenhum, o limite só aparece na tela do Premium e nas perguntas frequentes, e ninguém nunca vê quantas leituras já usou ou quantas faltam. A pessoa só descobre que acabou quando uma leitura é recusada. Para o Premium, mostraria só quantas usou, sem o limite (segue a sua regra de não mostrar número no Premium).
> *(b) Mudar a data do exame.* Quando a IA lê a data invertida (dia/mês × mês/dia), hoje é preciso corrigir valor por valor. Criar "Mudar a data deste exame", que move todos os valores de uma vez?
> *Opções para (a) e (b), cada uma:* **sim na 1.3.0 / sim no build seguinte / não**.
> *Recomendação:* **(a) e (b) sim, no build seguinte** — as duas tiram um incômodo real, mas nunca foram aprovadas, então ganham alvo (pergunta 1), com desenho antes.
> (A dúvida sobre mostrar "20 por mês" para o Premium não é pergunta: você já decidiu em 01/10 que os textos do Premium não mostram número. E achei um erro: o Diário de exames vazio mostra "3 leituras grátis por mês" também para quem é Premium — eu corrijo.)
>
> **Conta e Premium**
>
> **21. Gerenciar a assinatura pelos Ajustes**
> *Contexto:* os Ajustes só mostram Premium ou Grátis: não dá para ver quando o teste grátis termina, quando renova ou se há problema de cobrança, e não dá para gerenciar nem cancelar a assinatura dentro do app. Quem paga e reinstala recupera o Premium só de entrar na conta, e quem paga mas aparece como grátis chega ao "Restaurar compras" pelo cartão do Premium nos Ajustes. Não achei regra da loja que obrigue um botão de cancelar dentro do app — é recomendação minha, não exigência.
> *Opções:* **A)** linhas "Gerenciar assinatura" (abre a página da loja) e "Restaurar compras", mais a situação da assinatura (teste grátis até…, renova em…) quando a loja informar. **B)** só "Gerenciar assinatura". **C)** deixar como está.
> *Recomendação:* **A** — a pessoa vê o estado real e chega ao cancelamento num toque. (À parte: o aviso de cobrança ao excluir a conta é o item 6 da pergunta 2.)
>
> **22. Outra conta entrando no mesmo celular**
> *Contexto:* hoje, quando outra conta entra num celular, os dados da conta anterior que ainda estão nele são descartados — inclusive o que nunca chegou ao servidor. Quem decidiu isso fui eu (coordenação), em 03/10, sem te perguntar ("privacidade acima de manter dado não enviado de outra pessoa"), e isso bate de frente com a sua regra "nunca perder dado da pessoa". Acontece quando a sessão da conta anterior acabou sem a pessoa sair de propósito (quem sai de propósito já é avisado sobre o que não foi enviado) e depois alguém entra com outra conta naquele celular.
> *Opções:* **A)** como está: descarta sem avisar (privacidade primeiro; o que não foi enviado se perde). **B)** antes de descartar, se a conta anterior tem coisas não enviadas, avisar e oferecer "Entrar como {conta anterior} primeiro, para salvar" ou "Descartar e continuar" (o mesmo jeito do "Sair mesmo assim"). **C)** guardar escondido no celular o que não foi enviado e mandar quando aquela conta voltar.
> *Recomendação:* **B** — a conta nova continua sem ver nada da anterior, e uma perda silenciosa vira uma escolha consciente; C deixaria dado de saúde de outra pessoa no celular por tempo indeterminado.
>
> **O que foi construído diferente do que você aprovou ou assinou**
>
> **23. Manter como está ou mudar?**
> *Contexto:* as escolhas que a equipe fez sozinha entram numa lista só, que você confere e assina no build de teste. Estas cinco vão contra uma linha sua ou um checklist assinado, então preciso da direção agora:
> **(a) Linhas das misturas na curva:** em 18–24/09 você definiu linhas tracejadas "(est.)" para os componentes de uma mistura; o app desenha como qualquer composto (passado contínuo, futuro tracejado) e já mostra o "(est.)". O protótipo não tem mistura na curva, então não resolve. Te mostro os dois desenhos.
> **(b) Dia "não registrado":** o checklist da comida que você assinou diz que um dia marcado assim quebra a sequência de 7 dias; nada mais grava essa marca ("Só fechar o dia" faz o mesmo papel).
> **(c) Limites de IA que a equipe acrescentou:** no Registro de comida com IA, 25 respostas de acompanhamento por dia e 60 usos da IA em qualquer janela de 24 h — a sua regra diz que as respostas não contam e que as 25 anotações de comida que a IA interpreta por dia zeram à meia-noite (quem anota muito pode ser recusado antes das 25); no assistente de protocolos, 40 respostas por conversa, conversa que dura 24 h e 200 respostas em 24 h — o que você assinou fala só em 10 conversas por semana, e quando esses limites estouram o app diz só "A IA não está disponível agora".
> **(d) Animação do anel de Hoje e da curva:** em 24/09 você aprovou a versão B das animações ("aplicar tudo"), com o anel de Hoje enchendo e a curva se desenhando, e disse que o anel "carrega do zero"; em 29/09 ficou escrito "contar só quando o valor muda"; se o anel conta do zero e se a curva se desenha a cada abertura nunca foi fechado, e hoje nada anima em Hoje.
> **(e) Totais da semana e da medição inteira:** a sua regra e o checklist assinado dizem totais de comida por dia, por semana e da medição inteira; depois do novo quadro em Evolução, só o total do dia aparece, e tirar os outros nunca foi confirmado.
> *Opções para cada um:* **manter** ou **mudar** — (a) tracejado; (b) voltar a ter um jeito de marcar o dia como "não registrado"; (c) só os limites aprovados (respostas livres, 25 por dia zerando à meia-noite, 10 conversas por semana no assistente); (d) o anel enche do zero e a curva se desenha a cada abertura; (e) mostrar de novo os totais da semana e da medição.
> *Recomendação:* (a) manter (um visual só para todas as linhas; o "(est.)" já avisa que é estimativa — confirmo com os desenhos); (b) manter e aposentar a marca, ajustando o checklist com a sua assinatura; (c) manter os tetos contra abuso, mas cada um com uma mensagem verdadeira quando estoura (nos 6 idiomas); (d) seguir a linha mais nova — contar só quando o valor muda, manter o "Tudo em dia por hoje" e o pulso do dia completo, e a curva se desenha uma vez por sessão (como a abertura de Meu corpo); (e) mudar: mostrar o total da semana embaixo do total do dia (com desenho antes).
>
> **O que falta você fazer (não são perguntas)**
> 1. **Dar o "pode aplicar" no servidor** (sempre com um ensaio que é desfeito antes de aplicar de verdade): o ajuste que faz as mudanças de "Seus números reais" chegarem ao outro aparelho; completar a limpeza do "Excluir para sempre" (ainda ficam no servidor o intervalo, as doses por dia, a unidade e se divide); a nova versão do Registro de comida com IA no servidor (o limite de 25 contado pelo dia em que a pessoa pede, recusar uso de IA sem acesso, e o que você decidir na pergunta 23 (c)); a leitura de exames devolvendo a leitura quando não acha valor nenhum, e os campos da carteira de vacinação; a exclusão de conta apagando todo tipo de dado da pessoa (hoje a lista do servidor não inclui o uso do Assistente de IA); e o que a pergunta 1 decidir sobre a sincronização. Já dados, só falta fazer: tirar do ar a versão antiga do Registro de comida com IA no servidor, e publicar as partes do assistente de protocolos no servidor.
> 2. **Aprovar textos corrigidos nos 6 idiomas** (textos que existem e hoje não dizem a verdade): a curva "a partir do seu registro" (4 textos — ela segue o planejado); lembretes persistentes (são duas repetições, em 5 e 10 minutos); a sequência no relatório para o profissional (doses, não dias); o nome do interruptor "Alertas de frasco"; a linha do Premium "Seus números reais e seu progresso" (o progresso é grátis); "anônimo" virando "não ligado à sua conta" no consentimento, nos Ajustes e na política de privacidade; a política de privacidade dentro do app igual à do site, cobrindo toda IA; o aviso de excluir protocolo sem "7 dias" e o texto do "Retomar" para cada escolha; a pergunta "A mesma dose há N semanas?" com o nome do composto; a linha do IMC sem "faixa saudável" e o limite do assistente sem "esta semana"; as mensagens de "Seus números reais" para "todos os dias sem comida" e para "improvável" alto e baixo; o aviso de foto grande sem "PDF"; os termos de lembrete em português e espanhol; "dias grátis" (nunca "teste") para os 7 dias do Registro de comida com IA; plurais no lugar de "(s)"; títulos de erro que dizem o que aconteceu; o Diário de exames vazio para o Premium sem número; e o texto que explica a sequência, no topo do Registro de doses.
> 3. **Ver os desenhos de coisas que você já aprovou**, antes do código: "Adicionar valores à mão" em Meu corpo (aprovado em 30/09 e prometido pelo próprio app — entra na 1.3.0); "Encerrar protocolo" na página do protocolo e o aviso de frasco vazio com "Mais tarde"; os números e rótulos da curva que você aprovou em 04/10; o gráfico de exames bloqueado para o plano grátis (tira um recurso de quem usa grátis hoje); a linha do horário no resumo do assistente de protocolos.
> 4. **Autorizar baixar a arte oficial da Apple** para o "Continuar com a Apple" no Android (a sua regra é seguir 100% as regras das lojas; hoje é um desenho nosso).
> 5. **Renovar a chave da Apple antes de 04/04/2027** — é um passo seu no painel da Apple, com o arquivo .p8 que só você tem; sem isso, ninguém consegue entrar com a Apple no Android a partir desse dia.
> 6. **Atualizar os rótulos de privacidade nas lojas** (Apple e Google: identificador do aparelho e interação com o produto, não ligados à conta) — passo seu nos dois painéis.
> 7. **Assinar três checklists que nunca foram assinados:** a página da direita do Fold, Premium e login, e o painel de administração. (A conferência automática de antes do build hoje deixa passar checklist sem assinatura — é um erro que eu corrijo.)
> 8. **Olhar no build de teste:** o "Concluir" no cartão de Meus protocolos; o contorno e o texto "Do seu lembrete" nos 6 idiomas; o texto do alerta de vencimento do frasco; os textos de sair da conta com coisas não enviadas e do aviso sem internet.
> 9. **Levar ao advogado**, como você mesmo pediu, antes de ir para as lojas: o dado sensível no perfil obrigatório (lei europeia), o contrato com a Anthropic para texto livre, a política para quem estiver em crise, a prova no servidor de que a pessoa consentiu com a IA, a análise de uso ligada por padrão com um identificador do aparelho, e apagar o cliente na RevenueCat quando a conta é excluída.
>
> É isso. Assim que você responder, escrevo tudo nas suas decisões no mesmo dia e sigo.
