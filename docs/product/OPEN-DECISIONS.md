# DoseTrace — open decisions (one round)

- Compiled 2026-10-12 from the 8 dossiers in `docs/product/research/`, `docs/decisions.md`, `docs/specs/*.md` and `docs/review/features.md`, together with `docs/product/DIVERGENCES.md` (the DV-xxx rows referred to below). No code was changed.
- **This is the single list of founder questions for the PRD / TRD / flows round.** Reconciled the same day with `PRD.md` (its former §7, OPEN-1…OPEN-69), `TRD.md` (§9.1, nine questions, and the "Decision?" column of §9) and `flows/` (the README's 36-question round and every flow's §12). Each of those questions carries a canonical ID from this file; the crosswalk is in "Where every earlier question went" below.
- **Verified 2026-10-12.** Independent agents opened every AD citation, checked every DL against the earlier ledger lines and signed rows, and checked every OPEN premise against the code (`docs/product/verification/01…07`, above all `07-consistency.md`). Items that were not genuinely decided went back to OPEN, merged into as few questions as possible; wrong premises were fixed. What changed is listed in "Reclassified on 2026-10-12 (verification)".
- The CLAUDE.md rule "decide what is already decided" was applied to every question:
  1. If `docs/decisions.md` or a signed spec answers it → **Already decided (applied)**, with the citation (AD-xx).
  2. If the answer follows from how the features connect and why they exist → **Decided by logic**, one-line reason (DL-xx). The founder may override any of them, as with every "by logic" line in the ledger.
  3. Only real preferences (taste, money, risk, scope) remain **OPEN** (OPEN-xx).
- **Counts after the verification: 21 OPEN** (OPEN-01…OPEN-21; OPEN-16…OPEN-21 are new), **54 Already decided in force** (11 of the earlier 64 moved out, 4 narrowed, AD-65 added), **65 Decided by logic in force** (10 of the earlier 74 withdrawn or moved, 5 narrowed, DL-28 rewritten, DL-75 added). Of the 54 AD, 52 rest on the founder's own words, answers, signed checklist rows or CLAUDE.md directives; 2 (AD-49, AD-57) are coordinator lines that apply a founder answer or a store rule (marked in the table).
- Every answer the founder gives goes into `docs/decisions.md` the same day. The DL list and the 2026-10-05 streak line were added to `docs/decisions.md` on 2026-10-12; the verification corrected that section the same day (withdrawn and corrected lines are marked there).
- A Portuguese version of the OPEN list, ready to send as one message, is at the end.

---

## OPEN — questions for the founder

### Scope

#### OPEN-16 — What enters 1.3.0, and when the sync hardening ships
- **Question.** (a) Which of this round's fixes enter 1.3.0, and which go to the next build with a target written in the registry? (b) Does the sync hardening (DL-72, DL-74) ship in 1.3.0 or the next build?
- **Context.** (a) The register holds 216 open rows (14 S1, 94 S2, 37 S3, 71 S4) and no DL or DV row has a target build yet. Some logic decisions add new UI that was never approved, only derived (AI-consent withdraw row in Settings DL-55, the "what you track" editor DL-58, the labelled day counts DL-30, lab charts per unit DL-43, the extra Reminder-check rows DL-49, all picture first). Two founder rules meet here: "Vamos resolver tudo. Sem pendência" (2026-10-07: no production submit while any item is open, decisions.md:634) and evolution rule 2 (a build's scope is closed; new items get a target build and are never slipped in silently). "Approved → next build" covers what the founder approved.
  (b) Two S1 sync holes need a change in how deletes and edits travel between devices: every synced table gets a delete marker ("tombstone") instead of a hard cloud delete (DL-72, DV-182 — verified: a dose deleted on phone A comes back on A after phone B edits it), and dose counters sync as events with pushes carrying only changed fields (DL-74, DV-183 — two doses logged offline on two phones count as one). The principle is logic; the timing and risk are the founder's: it changes delete and push semantics on every table, needs production migrations (probably a server function for the counters), Gate B and a two-device test of update-over-old-version. DV-209 and DV-210 (two newly found ways a synced row can be missed by another phone) live in the same engine.
- **Options.**
  - (a) A — Everything in 1.3.0 ("Sem pendência"); the store release waits for all of it. B — 1.3.0 = every S1 and S2 row, every item the founder already approved, every copy fix; S3 / S4 rows that add a screen or control nobody approved yet, and code hygiene (dead code, source guards, doc drift), get a 1.3.1 target in the registry. C — 1.3.0 = S1 rows and approved items only; the rest 1.3.1.
  - (b) A — DL-72 + DL-74 (+ DV-209, DV-210) in 1.3.0, behind Gate B, rolled-back dry runs and a two-device device test. B — Tombstones (DL-72) and the paging fix (DV-210) in 1.3.0; counters (DL-74) and the watermark race (DV-209) in 1.3.1. C — All sync hardening in 1.3.1; 1.3.0 ships with the holes documented.
- **Recommendation: (a) B, (b) A.** (a) B ships every approved item in the next build (the standing rule) and keeps every user-visible error out of the store, without slipping unapproved new screens into a closed build; every 1.3.1 target is written down, so nothing is dropped. B fits "Sem pendência" only if a written, founder-accepted target counts as decided rather than pending — if not, A. (b) A: a deleted dose that comes back, or two doses counted as one, is a wrong health record (S1); 1.3.0 is the build every phone updates to, so it is the right moment — but only with the full Gate B and device proof.
- **Related:** every DV row; DV-182, DV-183, DV-209, DV-210.
- **Replaces:** DL-72 and DL-74 (withdrawn 2026-10-12); consistency findings Q-06, D-03, D-10.

### Protocols and supply

#### OPEN-01 — Correcting the vial in use, and "New vial" for powder protocols
- **Question.** Should the protocol page let the user correct the current vial (mix date, validity window, doses already drawn), and should powder (recon) protocols get a "New vial" button there?
- **Context.** The mix date and the 30-day window are typed once (wizard step 5 or Today's "Log new vial") and can never be changed; a new protocol always starts its vial at 0 doses taken, even when the person started the vial weeks before installing the app. A typo or a half-used vial gives a wrong "days left", a wrong "N of M doses left", a "Past window" tag on the wrong day and a supply alert at the wrong time, for the whole life of that vial. The founder's Restart line (decisions.md:578, 2026-10-06) already assumes the user "edits the count" of a vial; that control does not exist. A recon vial can be replaced only from Today's prompt when it is finished or missing, so an expired but not empty vial ("Past window") has no next step (DV-093). The AI assistant mirrors the form (AP-28). Registry A-08 (F5–F7) has waited for this answer since 2026-09-13.
- **Options.**
  - A — On the protocol page: "Edit vial" (mix date, validity days, doses already used) and, for recon, "New vial" (the same prompt as Today). Picture first; one sheet each, strings ×6; writes only the vial row.
  - B — Only ask "doses already used from this vial?" when a protocol or vial starts in the past; recon "New vial" stays on Today. Fixes the commonest case, not typos.
  - C — No change.
- **Recommendation: A.** The app's own supply alerts and expiry tags come from these numbers; under "enter once, used everywhere" (A-54) a wrong entry must be correctable in one place.
- **Related:** DV-094, DV-093, DV-015. **Merged here:** the recon part of DL-22 (verification 01).
- **Also asked as:** PRD OPEN-11 and OPEN-12; TRD §9.1 Q8; flows README #4 and #12 (recon part).

#### OPEN-02 — Should oral bottles warn when supply is low?
- **Question.** Should capsule / tablet / powder bottles get the same "running low" warning as vials?
- **Context.** The one supply rule (1–3 doses left, FX-11) drives the Today alert, the push and the Protocols badge — for vials only. A bottle can run out with no warning anywhere. (The days-of-supply math for orals every 2+ days is also wrong — DV-020 — a plain bug, fixed regardless.)
- **Options.**
  - A — Same rule for bottles (1–3 servings left) in the Today alert, the push and the Protocols badge.
  - B — Only an amber "N servings left" line on the card; no alert, no push.
  - C — No change.
- **Recommendation: A.** One rule for one concept (FX-11); a bottle running out matters as much as a vial. New strings ×6.
- **Related:** DV-092, DV-020.
- **Also asked as:** PRD OPEN-14; TRD §9.1 Q8 and R-42; flows README #13.

#### OPEN-03 — What happens when a fixed course of doses ends?
- **Question.** For protocols that have a total number of doses: should the end of the course end the protocol, and should the form offer "total doses" again?
- **Context.** BR-12 (signed 2026-10-07): protocols with a total number of doses end their reminders when the course ends. But the form has not let anyone set a total since commit 024c616; only older protocols carry one. For those, reminders stop while Today keeps asking for the dose, shows "Day 12 of 12" forever, and Missed rows pile up until "Still going?" appears.
- **Options.**
  - A — When the course ends the protocol ends automatically (Ended, dated at the last dose). Silent: someone who continues past the planned count loses reminders and the Today card without being asked.
  - B — When the course ends, Today, the Missed scan and the curve stop expecting doses (like the reminders), and Today asks "Course complete — end {name}?" with End / Keep going (like "Still going?"). Keep going removes the total.
  - C — Retire courses: ignore the total everywhere (reminders continue). Contradicts BR-12.
  - Sub-question: bring "total doses" back to the form? Yes / No.
- **Recommendation: B, and do not bring the field back for now.** It keeps BR-12, asks before ending (as the inactivity prompt does), and matches the reminder principle "remind until the user ends it".
- **Related:** DV-012.
- **Also asked as:** PRD OPEN-10; TRD §9.1 Q3 and R-03; flows README #16 (flow 05 §12; its "intended by logic" note is not a decision).

#### OPEN-04 — Should Recently deleted ever empty itself again?
- **Question.** Once 1.3.0 is out, should the automatic 7-day purge of deleted protocols come back?
- **Context.** Paused in 1.3.0 because deletes made by the old "Yes, it's finished" button cannot be told from deliberate ones and the cloud cascade would erase their doses (a coordinator decision of 2026-10-03, A-84 "revisit in the next build"; the pause itself is in OPEN-21 for confirmation). "Delete forever" by hand, with multi-select, is built and approved.
- **Options.**
  - A — Never purge automatically; Recently deleted keeps everything until the user deletes it forever. The delete sheet then says exactly that.
  - B — Purge after 7 days only protocols deleted from 1.3.0 on (they can be marked); keep the older ones.
  - C — Purge everything after moving dose logs off the cloud cascade. Largest change, highest risk.
- **Recommendation: A.** With "Delete forever" and multi-select already there, an automatic purge adds risk and no user value; storage is negligible ("never destroy on a maybe").
- **Related:** DV-125, DV-023.
- **Also asked as:** PRD OPEN-68; flows README #17.

#### OPEN-05 — The 3-protocol free limit: on the server, and after Premium ends
- **Question.** Should the server refuse a 4th active protocol for a free user, and what happens to a Premium user who stops paying with more than 3 active protocols?
- **Context.** The limit (3, "3 mantém") is checked only on the phone at add / restart / restore. A protocol that arrives by sync, was created while Premium or is revived is never checked when it arrives; it only counts against that phone's next add, so a second phone or an old build can go over it. Today a lapsed Premium user keeps every active protocol (nothing ends them). The earlier draft settled the lapse "by logic" (DL-24); it is a money rule, so it is the founder's (verification 07, D-02).
- **Options.**
  - A — Phone-only, as today; a lapsed Premium user keeps every active protocol and cannot add or restart one above 3 until paying again.
  - B — The server refuses the insert of a 4th active protocol for free users. In an offline-first app the refusal arrives at sync, after the protocol was created on the phone: a health record in limbo.
  - C — B plus a downgrade rule on lapse (e.g. protocols beyond 3 become Ended — their reminders stop).
- **Recommendation: A.** Ending protocols on lapse would stop reminders for something the person still takes (principle 2026-10-07) and holds data hostage; a server refusal risks losing an offline health record; no revenue need today.
- **Related:** DV-095. **Merged here:** DL-24 (withdrawn).
- **Also asked as:** PRD OPEN-15; TRD §9.1 Q6 (limit part; food access is AD-16) and R-16; flows README #7.

### Today and doses

#### OPEN-17 — The Today tracker's streak: days or doses?
- **Question.** Should the Today tracker's streak (the flame) keep counting days ("N days without a miss", "On fire!" at 7) or count doses in a row like the protocol card?
- **Context.** On 2026-10-05 the founder changed the streak on a protocol's card to count doses, because a weekly protocol showed "2 days without a miss" (commit b215b32) — applied, AD-07. The earlier draft extended it by logic to the Today tracker (DL-03). That changes visible copy ×6 and the meaning of the tracker; the binding prototype shows "2 days without a miss" and the approved Today tracker has "the flame + streak" (decisions.md:143). "Doses in a row" across several protocols is also undefined. The tracker stops at 31 days today; the 365-day look-back is decided by logic either way (DL-03). The provider report's streak follows the card rule (DL-02).
- **Options.**
  - A — Keep days for the tracker: a day counts when every protocol due that day is complete; days with nothing due are skipped (so a weekly-only user keeps the streak); 365 days back.
  - B — Doses in a row on the tracker too (new strings ×6).
- **Recommendation: A, with a picture of both first.** The tracker answers "how many days have I kept everything on track"; the card answers per protocol; skipping days with nothing due solves the weekly case the founder saw.
- **Related:** DV-034. **Replaces:** the unit part of DL-03; the "applies to every streak" sentence of decisions.md:642 (corrected).
- **Also asked as:** PRD OPEN-5; TRD §9.1 Q4; flows README #11.

#### OPEN-19 — Four dose-rule details on Today
- **Question.** (a) Which day does a late dose count for? (b) What is the daily cap for marking a dose complete? (c) Which default time do protocols without a reminder time use? (d) Does Skip get an Undo bar?
- **Context.**
  - (a) A daily 08:00 dose taken yesterday at 21:00 (13 h late): the rings credit it to today's 08:00 slot (today shows 100 % at 07:00 while the card still says "Mark complete"), and the Missed scan counts it for yesterday — two answers for one row (DV-030). The founder's rule "a late dose matches its own slot within ± half the interval" (decisions.md:144) does not reach 13 h on a daily dose.
  - (b) Every path caps at "doses per day" today (except the Dose-log fallback, DV-204). The earlier draft (DL-67) changed the cap to "the doses expected that day", which would refuse a dose recorded on a rest day (e.g. an every-3-days protocol taken a day early) and contradicted its own snooze clause (verification 02).
  - (c) Protocols without a reminder time (legacy / imported) get 08:00 reminders on the phone but no time anywhere else (DV-028). One slot list everywhere is decided (DL-06); the earlier text named two different defaults — the form's own default for a new protocol is "now" rounded to 5 minutes, then 14:00 and 21:00.
  - (d) Today shows an Undo bar after every "Mark complete" and after "Didn't take" on yesterday's pending dose, but none after "Skip" (the skipped line offers "Mark complete"; the Dose log can delete it). The earlier draft decided "no Undo bar for Skip" (DL-08), a UX preference.
- **Options.**
  - (a) A — Same calendar day: a dose belongs to the latest slot of its own day (yesterday 21:00 → yesterday's 08:00), never to a later day; rings and the Missed scan share the rule. B — Strict ± half interval: beyond it the dose fills no slot (yesterday stays missed, today stays open). C — As built (the next slot).
  - (b) A — Keep the "doses per day" cap on every path (the Dose log included). B — The doses expected that day (a dose on a rest day is refused).
  - (c) A — 08:00 everywhere (what the phone already does). B — The form's defaults.
  - (d) A — An Undo bar after Skip too (one pattern on Today; Undo re-arms the reminders, DL-09). B — No Undo after Skip, and none after "Didn't take" either. C — As built (mixed).
- **Recommendation: (a) A, (b) A, (c) A, (d) A.** (a) matches the Missed scan and how people think ("I took yesterday's dose late"), and never credits a future slot with a past dose. (b) An honest journal never refuses a dose the person says they took. (c) Every surface should agree with what the phone already does. (d) One Undo pattern on one screen.
- **Related:** DV-030 (a), DV-029 / DV-204 (b), DV-028 (c), DV-130 (d). **Replaces:** DL-67; the default part of DL-06; the Undo part of DL-08.
- **Also asked as:** PRD OPEN-2, OPEN-8; TRD §9.1 Q2, Q5; flows README #8.

### Reminders

#### OPEN-06 — iPhone reminders for someone who stops opening the app
- **Question.** How should iPhone keep reminding a person who keeps taking something but does not open the app?
- **Context.** Founder principle 2026-10-07: reminders continue for as long as the person takes it, opened or not ("É obrigação do aplicativo que avise até a pessoa entrar no aplicativo e deletar esse protocolo"). Android has it **built** (background refresh, daily silent wake-up, rebuild after update / reboot) but **not yet proven on a device**: the A-110 / A-111 device proof is pending and spec-audit still fails BR-9, BR-10 and RG-6/7/8. iPhone has none (BR-11 kept iOS untouched): its reminders are scheduled up to 10 days ahead at most (fewer with many protocols; Apple's 64-notification cap) and simply stop, with no warning.
- **Options.**
  - A — Keep local scheduling; the last notification of the window becomes "Open DoseTrace to keep your reminders coming", plus a Today line when the window is short. Small; it still needs the person to open the app once, so on its own it does not meet the principle.
  - B — Server push for iPhone (send-reminders with everything it lacks: Silent mode, Show names, action buttons, repeats, food access — A-62). The only option that meets the principle; large work, running cost.
  - C — iOS background app refresh. iOS runs it rarely and never after a force-quit; no guarantee.
- **Recommendation: A now, B as its own item right after (target per OPEN-16).** A closes the silent failure cheaply; only B meets the principle, and it deserves its own spec. ("No change" was removed: it breaks the 2026-10-07 principle.)
- **Related:** DV-097.
- **Also asked as:** PRD OPEN-19; TRD §9.1 Q7 and R-15; flows README #18.

#### OPEN-20 — Three reminder details
- **Question.** (a) Should Settings stay red when dose reminders are off but another switched-on reminder is blocked? (b) When should the system ask for notification permission after "Not now"? (c) Are the vial-expiry alert's lead time and words right?
- **Context.**
  - (a) Settings shows red "Something is blocking your reminders" when the permission is denied even with dose reminders off or no protocol (DV-042). The earlier draft made Settings neutral then (DL-45), but the permission also blocks the 8 PM food question, the weekly check-in, the day-21 weigh-in and vial alerts, and the signed SP-1 / RC-1 define Settings by blocks. Silent mode is never "blocked" — that part stays decided (BR-4).
  - (b) Today the app requests the system permission at every cold start and sign-in, seconds after the person said "Not now" in onboarding (DV-054). The earlier draft cited a ledger line that does not say this (AD-27). The signed SP-5 already opens "Make sure your reminders arrive" once for anyone with a reminder time.
  - (c) Built 2026-10-03: a push 7 days before and on the expiry day at 09:00 (Today's own 7-day rule and words), the next one per vial; the registry says "Founder to confirm the lead time and words" (features.md A-45; decisions.md:417).
- **Options.**
  - (a) A — Red while any switched-on reminder kind is blocked (as signed). B — Neutral when dose reminders are off or there is no protocol (amends SP-1 / RC-1).
  - (b) A — No system prompt at start; it comes when the first protocol with a reminder time is saved, and on Android through the SP-5 screen. B — Ask once more at the next start, then never. C — As built.
  - (c) A — As built (7 days before + the day; Today's words). B — 3 days before + the day. C — Only on the day.
- **Recommendation: (a) A, (b) A, (c) A.** (a) follows the signed rows and keeps the food question visible. (b) Respects "Not now" and asks when the person has just asked for a reminder. (c) One 7-day rule for the Today alert and the push; the words are seen on the test build (OPEN-18 item 7).
- **Related:** DV-042 (a), DV-054 (b), A-45 (c). **Replaces:** the Settings half of DL-45; AD-27.
- **Also asked as:** PRD OPEN-21, OPEN-22; flows README #2, #19.

### Food log, Seus números reais, Progress

#### OPEN-07 — "Seus números reais": confirm "finishes by itself" and one start weight
- **Question.** Is the reality check that finishes by itself (as built) what the founder wants, and should its start weight be that day's weigh-in?
- **Context.** Ledger 2026-09-29 (Q-A, Q-B): the check uses the weigh-ins for its start and final weight, has no weight field of its own, and offers result buttons from day 14. What was built: a start sheet with its own weight field and no buttons; the check finishes by itself at the first weigh-in on or after day 21 once there are 7 food days in a row (or typed calories) — but only when Progress is opened, and only for users who may see the result. Conflict 25 notes the self-finishing check never got an explicit OK, although the A-118 texts approved on 2026-10-09 ("Your reality check is ready — tap to see it") build on it. The start weight can differ from that day's weigh-in, so the check and the chart can use two different weights. The answer also settles registry A-24 ("does saving early end the 8 PM question?"): with A or C there is no early save and A-24 closes; with B it reopens.
- **Options.**
  - A — As built (own start weight, finishes by itself at day 21+). Two start weights stay possible.
  - B — Back to Q-A / Q-B: no weight field, result buttons from day 14. Rebuild; a result taken between day 14 and day 21 is less precise than a 21-day one.
  - C — Finishes by itself as built, but the start sheet's weight IS that day's weigh-in (a different number updates the weigh-in after a confirm, like Your numbers).
- **Recommendation: C.** It keeps the flow the founder has been testing, and one weight has one home (A-54).
- **Related:** DV-061, DV-058, DV-144. **Merged here:** DL-51 (withdrawn).
- **Also asked as:** PRD OPEN-23, OPEN-25; flows README #23 and #24.

#### OPEN-08 — Should "Stop" erase earlier results?
- **Question.** Should "Stop reality check" delete every earlier measured result, or only end the running check?
- **Context.** Today Stop deletes ALL saved results (the measured daily burn goes back to "Estimated"). The same Stop link also sits on the finished-result screen and in the locked view **with no check running**, and one tap there wipes everything (verification 04). The ledger (2026-09-10 / 09-27) says Stop "clears the open check, cancels the reminders and keeps the logged food" — nothing about earlier results. The confirmation text was never approved as a decision to delete results, and in Portuguese ("Isso apaga seus números reais") it reads as ending the feature, not as deleting past measurements.
- **Options.**
  - A — Stop shows only while a check is running and ends only that check; earlier results stay.
  - B — As built: Stop wipes every result, wherever it is tapped.
  - C — A, plus a separate "Delete my results" that asks first.
- **Recommendation: A (or C if a way to wipe is wanted).** Never destroy on a maybe; a past measurement is user data.
- **Related:** DV-004.
- **Also asked as:** PRD OPEN-27; flows README #22.

#### OPEN-09 — A reality check whose math gives no number
- **Question.** What should happen when the weigh-in and the 7 food days are complete but the math cannot give a saved result?
- **Context.** Three cases: "maintenance" (weight changed less than 0.2 kg — the person eats at maintenance), "implausible" (outside 1,000–5,000 kcal) and "too short", which in practice only happens when every day was "I ate nothing" (an average of 0 kcal; the result weigh-in is always on day 21 or later, so "under 14 days" cannot occur). Only a normal result is saved; in the three cases the check never closes, Today keeps saying "ready — tap to see it", and the 8 PM question keeps coming while the person can still log (a free user after the free days gets none). (The "implausible" text always says "too low", even for a high value — DV-205, a plain bug fixed regardless.)
- **Options.**
  - A — Save "maintenance" as a real result (daily burn = average intake); for implausible / too short, show the reason and close the check once the user has seen it, offering Start over.
  - B — Keep it open, but stop the 8 PM question and show the reason on Today and Progress.
  - C — As built.
- **Recommendation: A.** A weight that does not move while eating X kcal is a measurement of maintenance; a check that never ends breaks the daily loop. A changes a health number shown, so the energy-math check runs before the build.
- **Related:** DV-104, DV-058, DV-150, DV-205.
- **Also asked as:** PRD OPEN-28; flows README #25.

### Dose accumulation curve

#### OPEN-10 — Should a dose change rewrite the past curve?
- **Question.** When the user edits the dose (or interval, start date, doses per day), should the curve keep the old values for the past?
- **Context.** The curve applies today's values to every past dose: lower a dose from 250 to 125 mg and months of history are redrawn at 125 mg, including "Estimate on a date" next to old blood tests. Open since 2026-09-13 (F2).
- **Options.**
  - A — As built, plus a note on the curve when the protocol was edited ("uses your current dose for past dates").
  - B — Keep a history of changes with the date each took effect; the past uses the old values. Data-model change (synced), migration (existing protocols = one version), pharmacometrics review.
  - C — Editing the dose ends the old run and starts a new one (like Restart). Heavy for users; splits the history.
- **Recommendation: B; A as a stop-gap if B cannot be built well in time.** An honest journal shows what was planned at the time; the edit already writes only what changed, so the moment of the change is known.
- **Related:** DV-005.
- **Also asked as:** PRD OPEN-33; flows README #28, first half.

#### OPEN-11 — Should skipped and missed doses lower the curve?
- **Question.** Should the curve use the doses actually logged for the past, instead of the plan?
- **Context.** The curve follows the planned schedule (FX-13; the disclaimer says so). Skipped and Missed doses still count. Ledger 2026-09-24: "count only taken doses" is a model change for pharmacometrics review (registry A-31).
- **Options.**
  - A — As built (planned schedule, disclosed).
  - B — Past doses after the protocol was created come from the Dose log (Taken only); declared history before creation and the future stay planned.
  - C — Planned curve, but skipped / missed dose ticks are drawn differently (hollow); the number does not change.
- **Recommendation: B after the pharmacometrics review; C until then.** The user's own log is the honest source for the past, and the curve is the flagship.
- **Related:** DV-072.
- **Also asked as:** PRD OPEN-32; flows README #28, second half.

### My Body

#### OPEN-12 — Typing lab values by hand: build in 1.3.0 (the default) or defer?
- **Question.** Typing lab values by hand was approved but never built. Under "approved → next build" it goes into 1.3.0 unless the founder defers it. Defer?
- **Context.** Approved: "the lab test journal typed by hand is free" (ledger 2026-09-30), the approved explainer ("Type in values from any lab report…") and the scan-limit message ("You can still enter everything by hand"). There is no such screen; the only way to add a lab value is a scan (3 free a month). A deferral would only make sense if the new screen (picture first) cannot be built well in time for 1.3.0 (see OPEN-16); nothing suggests that today.
- **Options.**
  - A — Build "Add values by hand" in 1.3.0 (date, marker, value, unit; picture first). The default.
  - B — Defer to the next build, and correct the strings that promise it now.
  - C — Drop the feature; correct the strings.
- **Recommendation: A.** It is approved, the copy already promises it, and it is the free plan's only way to keep a lab journal after the 3 monthly scans.
- **Related:** DV-107.
- **Also asked as:** PRD OPEN-39; TRD §9.1 Q9 and R-21; flows README #30.

#### OPEN-13 — The "Bloodwork due" alert
- **Question.** Should the app keep telling users their bloodwork is "due" after 6 months?
- **Context.** Today shows "Bloodwork due · It's been N months since your last panel" when the latest test is 6+ months old. The 6 months were chosen by the app; no decision covers it. It is a schedule the user never set — close to the never-advise line.
- **Options.**
  - A — Keep as is. This keeps an app-chosen recommendation (regulatory risk; the product never advises, decisions.md:20).
  - B — Same trigger, factual words: "Last lab test N months ago" (no "due").
  - C — The user sets their own interval (or none) in My Body; none by default.
  - D — Remove the alert.
- **Recommendation: B.** It keeps the useful nudge without the app deciding what is due; the regulatory reviewer confirms the wording.
- **Related:** DV-111.
- **Also asked as:** PRD OPEN-44; flows README #32.

#### OPEN-14 — My Body's scan line and two small additions
- **Question.** (a) Does the Premium scan line show a number? (b) Show how many scans were used this month? (c) Add "Change the date of this test"?
- **Context.**
  - (a) The founder's line of 2026-10-01 (decisions.md:104) and the signed MB-10 (2026-10-03): Premium strings carry no scan number; the 20 appears only in the FAQ and the limit message. A coordinator line of 2026-10-04 (decisions.md:544, "no question to the founder") reversed it for My Body ("each plan's real number, 3 free / 20 Premium"), and the earlier draft listed that as already decided (AD-56). Today My Body has no Premium scan line at all; only free users see "3 free scans a month…".
  - (b) Free users see the limit ("3 free scans a month…", empty state and free card), but never how many they have used; they find out the month is used up only when a scan is refused (the count is on the server, UTC month).
  - (c) When the AI reads a test date in the wrong order (DD/MM vs MM/DD), the only fix today is editing every value one by one.
- **Options.**
  - (a) A — The founder's rule: the Premium line has no number ("Lab, vaccine & vial scans · Included with Premium"). B — Show "20 a month" to Premium (the coordinator line).
  - (b) and (c), each: Yes in 1.3.0 / Yes in the next build / No.
- **Recommendation: (a) A; (b) yes and (c) yes, next build.** (a) A coordinator line cannot override the founder's line and a signed row. (b) and (c) remove a real annoyance but were never approved, so they take a target (OPEN-16). For Premium, (b) shows the count without the limit, following (a).
- **Related:** DV-110. **Merged here:** AD-56 (moved).
- **Also asked as:** PRD OPEN-42, OPEN-43, OPEN-67; flows README #33.

### Account and Premium

#### OPEN-15 — Managing the subscription in Settings
- **Question.** Should Settings show the subscription and let the person manage or cancel it?
- **Context.** Settings shows only Premium / Free: no trial end date, no renewal date, no billing problem, and no way to manage or cancel inside the app. (Corrected 2026-10-12: a payer who reinstalls gets Premium back by signing in — RevenueCat is keyed to the account, `lib/purchases.js:68`; a payer the app shows as free reaches "Restore purchases" through the Settings Premium card → paywall. Restore is not the gap.) Store guidance expects cancellation to be reachable.
- **Options.**
  - A — Settings rows "Manage subscription" (opens the store page) and "Restore purchases", plus a state line (trial until…, renews on…) when the store provides it.
  - B — Only "Manage subscription".
  - C — No change.
- **Recommendation: A.** Store rules 100%: cancellation within reach, the state honest. (Separately, by logic DL-60, the delete-account sheet warns that the store subscription keeps billing.)
- **Related:** DV-112, DV-087.
- **Also asked as:** PRD OPEN-48; flows README #36.

### Built differently from what was approved or signed

#### OPEN-18 — Keep as built, or change? (and what to sign)
- **Question.** For items 1–6: keep as built (it joins the deviation list the founder signs on the test build, AD-52) or change? Items 7–8 need only a look and a signature.
- **Context.** Builder judgement calls go on one deviation list the founder eyeballs and signs before the store build (decisions.md:554). The verification found items that reverse one of the founder's own lines or a signed checklist row, so they need a direction now, not only a signature later.
  1. **Blend component lines** (DV-156): the line of 2026-09-18/24 (decisions.md:205) says dashed "(est.)" lines; the code draws them like any compound (solid past, dashed future). Two pictures first.
  2. **"Not recorded" day** (DV-151): the signed FL-3 says a "not recorded" day breaks the run; nothing writes that mark any more ("Just close the day" does the same job).
  3. **AI food caps** (DV-213): the builder added 25 follow-up answers a day and 60 AI calls in any 24 h (shared); the founder's line says follow-up answers don't count and the 25 parses reset at midnight.
  4. **Ring animation** (DV-132): on 2026-09-24 the founder said the ring "loads from zero"; on 2026-09-29 "count-ups only when values change" was recorded (decisions.md:57); Conflict 40 is still open. Nothing animates today.
  5. **Supply push at 3 doses left** (was 2): a side effect of "one supply-low rule" with no dated approval (Conflict 31).
  6. **"Continue with Apple" on Android** uses a drawn Apple glyph; downloading Apple's official artwork is the founder's call (decisions.md:497), and store-owned buttons follow the store's rules 100%.
  7. **Look on the test build:** A-42 ("Mark complete" on the Protocols card), A-44 (the "From your reminder" outline and text ×6), A-46 (sign-out with unsynced data, offline copy ×6).
  8. **Sign three checklists never signed:** fold-right-page (signature empty), premium-and-auth and admin-panel ("pending"); spec-audit fails on them.
- **Options (per item 1–6).** Keep as built / Change (1: dashed lines; 2: keep the mark; 3: follow-ups free and only the 25 a day; 4: count up from zero on every open; 5: back to 2; 6: keep the drawn glyph).
- **Recommendation:** 1 keep (the prototype made binding on 2026-10-01 draws every line the same way; picture to confirm); 2 keep — retire the mark, FL-3 amended with the founder's signature; 3 keep both as abuse ceilings (a normal user never reaches them; the copy stays); 4 the later line: count up only when a value changes, keep the caught-up card and the day-complete pulse, close Conflict 40; 5 keep 3; 6 change to Apple's official artwork. 7 and 8: look and sign on the test build.
- **Related:** DV-156, DV-151, DV-213, DV-132, DV-118. **Replaces:** DL-32, DL-66, AD-44; the AD-52 note on unsigned checklists; consistency Q-08, Q-10, Q-11, A-10.
- **Also asked as:** PRD OPEN-7, OPEN-24, OPEN-37, OPEN-56, OPEN-59; flows README #21, #29.

### Lines decided without asking the founder

#### OPEN-21 — Confirm ten coordinator decisions
- **Question.** The earlier draft listed these as "already decided by the founder". The verification showed the coordinator wrote them (or wrote them "by logic") in the ledger with no question to the founder. Confirm them?
- **Context.** All ten are built or planned for 1.3.0 and follow from the founder's principles, but they were never his answer:
  1. **AD-04** — When the server confirms the account was deleted or the session revoked, reminders are cancelled; a network failure never cancels anything (decisions.md:599, "by logic"). The same rule covers what stays on a second phone after an Apple-account delete (PRD OPEN-54; decisions.md:417 F6).
  2. **AD-09 (copy part)** — the delete sheet no longer promises "7 days" and says the doses leave the Dose log while deleted; the history question names the compound; the three A-90 strings (decisions.md:544).
  3. **AD-10** — "Same dose for the last N weeks?" is asked again when an edit moves the start earlier; "Yes" clears the history marker (decisions.md:543).
  4. **AD-11 (the rules)** — the founder put A-85…A-98 in 1.3.0; the rules inside were coordinator / Gate B lines: A-85 (End on the protocol page; the empty-vial prompt gets "Later", picture first, decisions.md:558), A-86b (Missed rows removed at an inactivity end on every phone), A-87b (vials follow the "status wins" rule).
  5. **AD-29** — the 18+ and profile gates can be answered offline and offer "Sign out anyway" (decisions.md:542).
  6. **AD-35** — a half-filled new protocol is lost if the app is killed (by analogy with BK-14, whose scope does not name the wizard).
  7. **AD-46** — `ai_assistant_usage` is named in delete-user (decisions.md:545).
  8. **AD-50** — the automatic purge stays paused through 1.3.0 (decisions.md:506; OPEN-04 decides what comes after).
  9. **AD-54** — "Earlier day" in "Fix this entry" covers 2–7 days back (the coordinator's reading of the prototype, Conflict 29).
  10. **AD-61 (part)** — gym body-composition scans are a measurement source, not advice (decisions.md:458).
- **Options.** A — Confirm all ten. B — Confirm all except the numbers named.
- **Recommendation: A.** Each follows from a founder principle (never destroy on a maybe, copy must be true, privacy, the AI line); confirming them makes them founder decisions.
- **Related:** DV-009, DV-011, DV-021, DV-023, DV-025, DV-090, DV-091, DV-096, DV-105, DV-114, DV-125, DV-127, DV-192.
- **Also asked as:** PRD OPEN-16, OPEN-31, OPEN-54; flows README #5.

---

## Reclassified on 2026-10-12 (verification)

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
| PRD OPEN-1 | Site-question age limit | DL-01 |
| PRD OPEN-2 | Skip: reminders and Undo | DL-08 (cancel) · OPEN-19 (d) (Undo bar) |
| PRD OPEN-3 | Today changes built inside the approved proposal (grok/184) | AD-38 (grey tag) · AD-52 (the rest) |
| PRD OPEN-4 | "As-needed doses are excluded" | DL-65 |
| PRD OPEN-5 | One meaning of streak and missed | DL-02 · DL-03 (look-back) · OPEN-17 (tracker unit) · AD-07 (card) |
| PRD OPEN-6 | Undo / Dose-log delete re-arms reminders | DL-09 |
| PRD OPEN-7 | Tracker visual and ring animations | OPEN-18 (4) (ring) · AD-52 (gauge visual) |
| PRD OPEN-8 | Daily caps and late doses (A-35) | OPEN-19 (b) |
| PRD OPEN-9 | Open site questions device-only | AD-34 |
| PRD OPEN-10 | Courses with a total number of doses | OPEN-03 |
| PRD OPEN-11 | Vial lifecycle holes (A-08 F5–F7) | DL-22 (rtu parts) · OPEN-01 (recon New vial, doses used) |
| PRD OPEN-12 | Editing a powder vial after creation | DL-15 (capacity) · OPEN-01 (mix date, window) |
| PRD OPEN-13 | Deliberate End + empty-vial prompt picture | AD-11 |
| PRD OPEN-14 | Oral supply warnings | OPEN-02 |
| PRD OPEN-15 | Free limit after a lapse; where enforced | OPEN-05 (limit and lapse; DL-24 withdrawn) |
| PRD OPEN-16 | Half-filled wizard on a kill | OPEN-21 (6) |
| PRD OPEN-17 | Protocols judgement calls (grok/199) | AD-52 |
| PRD OPEN-18 | Delete-a-dose layout | AD-52 |
| PRD OPEN-19 | iPhone reminders when never opened | OPEN-06 |
| PRD OPEN-20 | Persistent reminders copy | DL-48 |
| PRD OPEN-21 | "Not now" for notification permission | OPEN-20 (b) |
| PRD OPEN-22 | One "blocked" rule | DL-45 (Silent) · OPEN-20 (a) (Settings) |
| PRD OPEN-23 | Does finishing a check end the 20:00 question (A-24) | OPEN-07 (DL-51 withdrawn) |
| PRD OPEN-24 | "Not recorded" day | OPEN-18 (2) |
| PRD OPEN-25 | Self-finishing check and Journey part 8 | OPEN-07 · AD-52 (judgement calls) |
| PRD OPEN-26 | Grace week | AD-14 |
| PRD OPEN-27 | Stop deletes measured history? | OPEN-08 |
| PRD OPEN-28 | Today wording when ready but locked / unsavable | DL-26 · OPEN-09 |
| PRD OPEN-29 | Measured burn hidden when inputs incomplete | DL-75 |
| PRD OPEN-30 | AI answer chips and meal slots | AD-53 |
| PRD OPEN-31 | "Earlier day" range | OPEN-21 (9) |
| PRD OPEN-32 | Missed / skipped doses dip the curve | OPEN-11 |
| PRD OPEN-33 | Edited dose rewrites the past curve | OPEN-10 |
| PRD OPEN-34 | Fixed dose hours on the curve | DL-31 |
| PRD OPEN-35 | Enanthate / Nandrolone time-to-peak | DL-37 |
| PRD OPEN-36 | Future PK split | AD-47 |
| PRD OPEN-37 | Blend component lines | OPEN-18 (1) |
| PRD OPEN-38 | Second curve default | DL-36 |
| PRD OPEN-39 | Manual lab entry | OPEN-12 |
| PRD OPEN-40 | Lab charts Premium or free | AD-24 |
| PRD OPEN-41 | Favourites and labels to synced tables | AD-02 |
| PRD OPEN-42 | Change a test's date | OPEN-14 (c) |
| PRD OPEN-43 | Show the scan budget | OPEN-14 (b) |
| PRD OPEN-44 | "Bloodwork due" after 6 months | OPEN-13 |
| PRD OPEN-45 | Vaccine next-due reminders | DL-44 |
| PRD OPEN-46 | Lab reference-range band | AD-55 |
| PRD OPEN-47 | AI consent per account + withdraw | DL-55 (server proof: AD-51) |
| PRD OPEN-48 | Subscription management in Settings | OPEN-15 · DL-60 (delete warning) |
| PRD OPEN-49 | Display name from Google / Apple | DL-57 |
| PRD OPEN-50 | Offline cold start, expired token | DL-54 |
| PRD OPEN-51 | Reinstall behaviour | DL-63 |
| PRD OPEN-52 | Lawyer items | AD-51, AD-43 |
| PRD OPEN-53 | Analytics | DL-62 · AD-57 · AD-51 |
| PRD OPEN-54 | Apple delete: residual data on a second device | OPEN-21 (1) |
| PRD OPEN-55 | A-116 scope | AD-31 |
| PRD OPEN-56 | Unsigned checklists and open deviations | AD-42 · AD-52 · OPEN-18 (7, 8) |
| PRD OPEN-57 | PT name of the Dose log | AD-59 |
| PRD OPEN-58 | Language-aware number parsing | DL-69 |
| PRD OPEN-59 | Minor confirmations (FX-11, pop-up style, A-33) | AD-60 · OPEN-18 (5) |
| PRD OPEN-60 | Who users are pointed to | AD-61 |
| PRD OPEN-61 | iPad / supportsTablet | DL-70 |
| PRD OPEN-62 | Landscape everywhere | AD-62 |
| PRD OPEN-63 | Hard-coded Premium accounts | AD-58 |
| PRD OPEN-64 | Target ETA staleness, body-fat targets | DL-68 |
| PRD OPEN-65 | Existing false Missed rows | DL-71 |
| PRD OPEN-66 | My Body small differences | AD-52 |
| PRD OPEN-67 | Scan numbers in My Body copy | OPEN-14 (a) |
| PRD OPEN-68 | Purging soft-deleted protocols again (A-84) | OPEN-04 |
| PRD OPEN-69 | Edit "What you track" | DL-58 |

### TRD §9.1 (nine questions)

| TRD Q | Topic | Canonical |
|---|---|---|
| 1 | Deletes across devices: server tombstones (R-01) | OPEN-16 (b) (DL-72 withdrawn; the migration itself needs the founder's go) |
| 2 | No-time and fewer-times protocols (R-03) | DL-06 · OPEN-19 (c) |
| 3 | Courses: keep with a UI, or retire (R-03 / BR-12) | OPEN-03 |
| 4 | Report streak / adherence = Today; lift the 31-day cap (R-09) | DL-02, DL-03 (look-back) · OPEN-17 (tracker unit) |
| 5 | Skip stops reminders + Undo (R-17) | DL-08 (cancel) · OPEN-19 (d) (Undo) |
| 6 | Server enforcement of food access and the 3-protocol limit (R-16) | AD-16 (food) · OPEN-05 (limit) |
| 7 | iPhone reminders without opening the app (R-15) | OPEN-06 |
| 8 | Recon vial edit / manual new vial (R-13, A-08); oral low supply (R-42) | OPEN-01 (incl. recon New vial) · DL-22 (rtu) · OPEN-02 |
| 9 | Lab charts Premium; manual lab entry (R-21) | AD-24 · OPEN-12 |

### Flows (README round of 36, plus one question asked only in a flow)

| Flows # | Topic | Flow | Canonical |
|---|---|---|---|
| 1 | AI consent per device or per account | 01, 11, 12 | DL-55 (server proof: AD-51) |
| 2 | OS prompt after "Not now" | 01, 06 | OPEN-20 (b) |
| 3 | Year-only 18+ test | 01 | AD-43 |
| 4 | Doses already taken from this vial | 02, 04 | OPEN-01 |
| 5 | Half-filled protocol after a kill | 02 | OPEN-21 (6) |
| 6 | Recon dose changed mid-vial | 02, 04 | DL-15 |
| 7 | Lapsed Premium with more than 3 active | 02, 13 | OPEN-05 |
| 8 | Skip cancels reminders + Undo bar | 03 | DL-08 (cancel) · OPEN-19 (d) (Undo bar) |
| 9 | "All caught up" with a skip | 03 | DL-12 |
| 10 | Grey "reminder" tag before Due | 03 | AD-38 |
| 11 | Tracker streak cap; report streak rule | 03, 12 | DL-03 (look-back), DL-02 · OPEN-17 (unit) |
| 12 | Manual recon New vial; rtu New vial as a new row | 04 | DL-22 (rtu) · OPEN-01 (recon) |
| 13 | Oral bottles: low rule, interval-aware days | 04 | OPEN-02 (days left: DV-020 bug) |
| 14 | Pictures: End protocol; "Protocol finished" with Later | 04, 05 | AD-11 |
| 15 | Days-left colour above 7 days | 04 | AD-65 (DL-16 corrected) |
| 16 | Course total reached | 05 | OPEN-03 |
| 17 | Resume the 7-day purge for 1.3.0+ deletes | 05 | OPEN-04 |
| 18 | iPhone users who never open the app | 06 | OPEN-06 |
| 19 | Settings "blocked" neutral when reminders are off | 06 | OPEN-20 (a) |
| 20 | Persistent reminders copy | 06 | DL-48 |
| 21 | Drop the "not recorded" mark | 07 | OPEN-18 (2) |
| 22 | Stop keeps or deletes results | 08 | OPEN-08 |
| 23 | One start weight | 08 | OPEN-07 |
| 24 | Confirm the self-finishing check | 08 | OPEN-07 |
| 25 | Today lines for locked / unsavable results | 08 | DL-26 · OPEN-09 |
| 26 | Lower date bound for a past weigh-in | 09 | No change (DL-73 withdrawn: the wheel already stops 10 years back) |
| 27 | Curve dose times vs the fixed grid | 10 | DL-31 |
| 28 | Dose edits forward only; count only logged doses | 10 | OPEN-10 · OPEN-11 |
| 29 | Blend lines solid past | 10 | OPEN-18 (1) |
| 30 | Manual lab entry | 11 | OPEN-12 |
| 31 | Lab charts Premium or free | 11, 13 | AD-24 |
| 32 | Bloodwork due | 11 | OPEN-13 |
| 33 | "x of 3 scans used" | 11 | OPEN-14 |
| 34 | Delete account warns about billing | 12 | DL-60 |
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
| AD-04 | **→ OPEN-21 (1), moved 2026-10-12 (by-logic ledger line).** When the server confirms the account was deleted or the session revoked, scheduled reminders are cancelled; a network failure never cancels anything. | decisions.md:599 (2026-10-07) | DV-009 |
| AD-05 | A real sign-out clears unsaved drafts. | decisions.md:378 (BK-14) | DV-081 |
| AD-06 | Rings: a late dose matches its own slot within ± half the interval; an extra log never adds. | decisions.md:144 (2026-09-29) | DV-030 |
| AD-07 | The streak on a protocol's card counts doses in a row, never days (founder 2026-10-05: a weekly protocol showed "2 days without a miss"). **Narrowed 2026-10-12:** the founder line covers the card; the report following it is DL-02; the Today tracker is OPEN-17. | lib/doseStreak.js:2; TodayScreen.js:610; commit b215b32; decisions.md:641-642 (corrected 2026-10-12) | DV-032, DV-180 |
| AD-08 | An alert that names one protocol opens that protocol. | decisions.md:146 (2026-09-29) | DV-089 |
| AD-09 | Restart with the same container moves it unchanged (mix date, count) — founder, council 3 "1 a 7 sim". **Narrowed 2026-10-12:** the copy rules (delete sheet without "7 days", doses leave the Dose log, the history question names the compound, the A-90 strings) are a coordinator line → OPEN-21 (2). | decisions.md:614 (founder); decisions.md:544 (coordinator) | DV-024 (DV-023, DV-091, DV-192 → OPEN-21) |
| AD-10 | **→ OPEN-21 (3), moved 2026-10-12 (coordinator line).** The "Same dose?" answer can be corrected: asked again when an edit moves the start earlier; "Yes" clears `history_from`. | decisions.md:543 (2026-10-04) | DV-091 |
| AD-11 | The founder put the 2026-10-04 council items A-85…A-98 in 1.3.0 ("1 agora … council fixes A-85…A-98 in parallel"). **Narrowed 2026-10-12:** the rules inside them — A-85 (End + vial prompt with "Later", picture first; the "Later" is the Gate B correction decisions.md:558), A-86b and A-87b (from the Gate B review, features.md:226, :228), A-90, A-96, A-98 — are coordinator lines → OPEN-21 (4). | decisions.md "Founder answers 2026-10-04"; features.md:224–239; decisions.md:533–558 | DV-021, DV-025, DV-090, DV-096, DV-105 |
| AD-12 | A-118: the Today alert and the food card line follow the check's real state, never the date alone (founder 2026-10-09; the line is in features.md only — it should be added to decisions.md). Extending it to the Progress status line and the day-21 notification is logic (DL-25). | features.md:258 (founder 2026-10-09) | DV-056, DV-057 |
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
| AD-26 | One "Vial alerts" switch covers low supply and expiry. The new label "Vial alerts" ×6 is new copy (founder approves the wording); the ledger keeps the switch's scope only. | features.md A-45 | DV-140 |
| AD-27 | **→ OPEN-20 (b), moved 2026-10-12.** (Was: someone who said "Not now" to notifications is not asked for more.) decisions.md:623 does not say this; :626 and the signed SP-5 re-open the setup screen for "Not now" users with a reminder time. | decisions.md:623 (2026-10-07 evening) | DV-054 |
| AD-28 | The in-app privacy policy (×6) has the same content as the website. | features.md:257 (A-117) | DV-085 |
| AD-29 | **→ OPEN-21 (5), moved 2026-10-12 (coordinator line).** The 18+ and profile gates can be answered offline (saved later) and offer "Sign out anyway". | decisions.md:542 (A-94) | DV-114 |
| AD-30 | "Continue with Apple" also on Android (founder "3 sim"). The server setup was done 2026-10-03 and the button is live (STATE.md:17; probe 302; the founder signed in on the Fold 2026-10-07). The Apple client secret expires 2027-04-04 (DV-211). | decisions.md:483; STATE.md:17 | DV-115, DV-211 |
| AD-31 | A-116 (Fold: every tap and notification on the right page) waits for the PRD / TRD / flows, then resumes for 1.3.0 ("Vamos resolver tudo. Sem pendência" — no production submit while an item is open). | decisions.md:639 (2026-10-12); decisions.md:634 (2026-10-07) | DV-117 |
| AD-32 | Concurrent multi-device use is not a real use case (A-48 parked). | decisions.md:199 | DV-041 |
| AD-33 | The remembered curve view is device-local and not synced. | decisions.md:208, :380 | DV-159 |
| AD-34 | Open site questions stay on the device only, kept until answered. | decisions.md:379 | DV-137 |
| AD-35 | **→ OPEN-21 (6), moved 2026-10-12.** A half-filled new protocol is lost if the app is killed (BK-14 keeps drafts of the note, the Progress forms and the food chat field, and does not name the wizard; the assistant's conversation lost on a kill is AP-33, signed). | decisions.md:378; ai-protocol-assistant.md AP-33 | DV-127 |
| AD-36 | If RevenueCat is unreachable the server applies the Premium scan cap. | decisions.md:275 | DV-165 |
| AD-37 | Server push stays OFF; send-reminders is activated only after A-62. | decisions.md:350, :589 | DV-145 |
| AD-38 | Today tags: only "Due". | decisions.md:133 | DV-131 |
| AD-39 | "Taken" became "Complete" in counts and labels. | decisions.md:99 | DV-179 (BK-16) |
| AD-40 | Free plan: 3 active protocols. | decisions.md:465 ("3 mantém") | DV-181 (comment), OPEN-05 |
| AD-41 | Theme tokens only; hard-coded colours only on fixed surfaces. | decisions.md:41 | DV-170 |
| AD-42 | Done = the signed checklist with evidence; spec-audit passes; full-functionality pass before every build. | CLAUDE.md; decisions.md:339–340 | DV-118 |
| AD-43 | The 18+ test uses the birth year only (counsel flag stands). | decisions.md:300 (age floor 18 for the typed birth year, 2026-09-15); counsel flag decisions.md:388 (re-cited 2026-10-12: premium-and-auth.md:133 is a note in an unsigned spec) | DV-168 |
| AD-44 | **→ OPEN-18 (4), moved 2026-10-12.** (Was: motion count-ups only when values change; keep the caught-up card and the day-complete pulse — decisions.md:57, :164.) The ring's count-from-zero is the open Conflict 40 (decisions.md:441; the founder said "ring loads from zero" on 2026-09-24). | decisions.md:57, :164 | DV-132 |
| AD-45 | **→ DL-75, moved 2026-10-12.** (Was: the daily burn shows only with weight + height + age + sex.) PO-12 gates the formula estimate; decisions.md:240 makes a measured number the hero once it exists — applying PO-12 to the measured number was not a ledger answer. | progress-one-card.md PO-12 | DV-149 |
| AD-46 | **→ OPEN-21 (7), moved 2026-10-12 (coordinator line, "Privacy, by logic").** `ai_assistant_usage` is named in delete-user. | decisions.md:545 | DV-011 |
| AD-47 | Dose accumulation stays Premium; a future free/Premium PK split is not scheduled. | decisions.md:279, :292 | (05:G13 context) |
| AD-48 | The vial-finished prompt follows the write on every injectable take path. (Today's order is the founder's S-25 line; applying it to the Dose-log Missed → Complete path is a logic extension.) | decisions.md:152–153 (S-25); fixes-1.2.5.md FX-22 | DV-038 |
| AD-49 | iOS and Play have a configured 7-day trial; a trial is claimed only when the store says the person is eligible. (Coordinator line applying the store configuration and the store's own eligibility rule.) | decisions.md:451, :478; premium-and-auth.md PA-9 | DV-126 |
| AD-50 | **→ OPEN-21 (8), moved 2026-10-12 (coordinator line, round 4).** The automatic purge stays paused in 1.3.0 (A-84, revisit after). | decisions.md:506 | DV-125 (OPEN-04 decides the "after") |
| AD-51 | Counsel items stay with counsel: server proof of consent (A-95), GDPR Art. 9 wording, the Anthropic DPA, the crisis-resource policy, default-on analytics under ePrivacy. | decisions.md:388, :570; features.md A-95 | DV-007, DV-167, DV-168 |
| AD-52 | Builder judgement calls and small differences from an approved picture are not founder questions: they go on the one deviation list he eyeballs on the test build and signs before the store build (A-97). Carried there: the Today items built inside the approved Today proposal (alert "Remove" gone, snooze "Tomorrow / In 3 days", no "Add site" on the toast, the "Injection site" title in the Dose-log editor, dose-notes explainer hidden, notification snoozes "In 1 hour / Tomorrow"); the tracker gauge visual; the delete-a-dose layout A; the Protocols judgement calls of grok/199; the Journey part 8 judgement calls of grok/205; the My Body small differences (warning triangle, no icon on "imported", 22 pt preview title). (Corrected 2026-10-12: the line does not cover the unsigned checklists — fold-right-page, premium-and-auth, admin-panel — nor the eyeball items A-42, A-44, A-46: those are OPEN-18 items 7–8.) | decisions.md:554 (2026-10-04 "Open deviations: the founder eyeballs them on the test build and signs one list"); decisions.md:142 (Today proposal approved as shown) | DV-118 |
| AD-53 | AI-suggested short answer chips (≤ 40 characters) in food follow-ups are allowed and there are no strict meal slots; STATE.md's "pending" line is stale. | decisions.md:319, :245; food-log.md FL-16, FL-4 (signed 2026-09-27) | — |
| AD-54 | **→ OPEN-21 (9), moved 2026-10-12.** "Earlier day" in Fix this entry covers 2–7 days back (decisions.md:429, Conflict 29: the assistant's reading of the prototype, not the founder's statement). | decisions.md:244 (food is logged up to 7 days back, FL-2); Today = 0, Yesterday = 1 | — |
| AD-55 | Lab values never show a reference range, band, colour or verdict; the unused live columns `biomarkers.reference_min/max/status` are never written. | decisions.md:266; CLAUDE.md AI hard line | DV-119 |
| AD-56 | **→ OPEN-14 (a), moved 2026-10-12.** (Was: My Body's scan line shows each plan's real number, 3 free / 20 Premium.) decisions.md:544 is a coordinator line ("no question to the founder") that overrides the founder's line decisions.md:104 and the signed MB-10 ("no number in the Premium line"). | decisions.md:544 (2026-10-04) over decisions.md:104 (2026-10-01) | — |
| AD-57 | Analytics wording becomes "not linked to your account" (the install id is pseudonymous), with the web + in-app policy rewrite and the Apple / Play labels (Device ID + Product interaction, not linked) in the store build. (Coordinator line applying the founder's "4 anônima" and the council's regulatory review.) | decisions.md:570 (2026-10-05) | DV-190 |
| AD-58 | The founder's own extra accounts keep Premium through `DEVELOPER_EMAILS`; Test03 gets Premium only through a temporary RevenueCat promo. No move to promotional grants is scheduled. | decisions.md:290 | — |
| AD-59 | The PT name of the Dose log is "Histórico" (the grok/227 question "PT 'Registro'" was answered by the 2026-10-03 "Aprovado / Siga" block, grok/228). | decisions.md:88, Conflict 27; grok/227, grok/228 | DV-193 |
| AD-60 | Already in the ledger: the supply push fires at 3 doses left (one rule, decisions.md:148); the vial-finished pop-up style is the approved Today proposal's (decisions.md:142); the A-33 energy test is closed by the fully-green-suite rule (decisions.md:341). The push threshold 2 → 3 has no dated approval (Conflict 31, decisions.md:432) → OPEN-18 (5). | decisions.md:142, :148, :341 | — |
| AD-61 | Users are pointed to "a health professional" (AI hard line, founder). **Narrowed 2026-10-12:** "gym body-composition scans are a measurement source, not advice" is a ledger-logic line (decisions.md:458) → OPEN-21 (10). | decisions.md:316; :458 | — |
| AD-62 | Landscape stays on every screen (content in a centred column); no portrait revert. | decisions.md:77 (founder 2026-09-11 "do it correctly, take your time") | — |
| AD-63 | `parse-food-next` is removed from production (founder "2 sim" 2026-10-03, RL-1). | decisions.md:513 | DV-188 |
| AD-64 | Honest paywall: only real Premium features; the reality check is sold as "reality-check results", never "progress tracking" (weigh-ins, their chart and Progress are free). | decisions.md:283, :107, :229 | DV-186 |
| AD-65 | One days-left function and one colouring everywhere, in the Today card's style: days coloured by deadline (≤ 3 risk, ≤ 7 attention, above 7 ok green), My Protocols included — the founder's Q9 = B, re-confirmed over the grey V10 fix. Added 2026-10-12 (verification 01): it replaces DL-16, which had picked the Protocols' grey style by mistake. | decisions.md:147; grok/182, grok/183; TodayScreen.js:1956-1957 | DV-018, DV-200 |

## Decided by logic — no question to the founder

One line of reason each. The founder may override any line.

| ID | Decision | Reason | Rows |
|---|---|---|---|
| DL-01 | Site questions are never dropped for their age (code as built); decisions.md:459 and the FX-25 evidence are corrected. | The founder's S-25 line says open site questions are "kept until answered" (decisions.md:379, grok/145); the later 2026-10-03 "let go after 7 days" line (decisions.md:459) was a by-logic reading of FX-25, and "never lose user-entered data" outranks it. | DV-175 |
| DL-02 | The report's streak uses `doseStreak` and its adherence uses the rings' slots; the week circles' "missed" and the report's Missed rows are labelled by what each counts. | One concept, one number: the report goes to a provider and must match what the user sees (AD-07). | DV-032, DV-033 |
| DL-03 | The Today tracker streak looks back 365 days (no 31-day cap). **Narrowed 2026-10-12:** whether it counts days or doses → OPEN-17. | The founder gave the protocol streak a year "so a weekly protocol keeps counting"; the same reason applies to the tracker. The unit is a visible copy and meaning change, so it is the founder's. | DV-034 |
| DL-04 | One "due today" owner for header, card, ring and streak. | Today counts doses (2026-07-23); three answers on one screen is the A-118 class of bug. | DV-029 |
| DL-05 | The Missed scan covers ended protocols up to their end. | Ended protocols keep their history (A-83); rings already count them. | DV-031 |
| DL-06 | Protocols with no or fewer reminder times use one slot list everywhere (reminders, Today, rings, warnings). **Narrowed 2026-10-12:** which default (08:00, what the phone does, or the form's defaults) → OPEN-19 (c). | Every surface must agree with what the phone does; the earlier text named two different defaults (the form fills "now" rounded, then 14:00, 21:00 — `protocolForm.js:102-105`). | DV-028 |
| DL-07 | A legacy protocol without a start date is anchored on its creation day everywhere. | Reminders and Today must count the same days. | DV-014 |
| DL-08 | Skip cancels that slot's reminders. **Narrowed 2026-10-12:** the Undo bar after Skip → OPEN-19 (d) (the pending "Didn't take" already shows one). | A reminder for a dose the user declared skipped is noise. | DV-035 (DV-130 → OPEN-19) |
| DL-09 | Undo and the Dose-log delete re-arm the slot's future reminders. | Reminder principle 2026-10-07: a dose still owed must still be reminded. | DV-040 |
| DL-10 | A reminder tap acts on the reminder's own slot and cancels what the button would cancel. | Two entry points for the same notification must do the same thing; flow 03 §7.2 and the card model (A-78 / A-43) must say the same (verification 02). | DV-036 |
| DL-11 | "Tomorrow" / "Next 5 days" count doses, not protocols. | Today counts doses, not protocols (2026-07-23). | DV-037 |
| DL-12 | "All caught up" shows when no open slot remains (a skip counts as handled); the skipped line stays visible (picture first). | The card exists to say nothing is left to act on. | DV-129 |
| DL-13 | One display name per protocol everywhere (translated compound, blend label), and notifications are re-planned on a language change. | One term per concept; the app language rules every surface. | DV-013, DV-050 |
| DL-14 | Never two active vials per protocol. | S-20 rule "never two active vials" (features.md:329, S-20 notes); screens already assume it. | DV-016 |
| DL-15 | A dose edit recomputes the recon vial's capacity from the mass left. | One capacity rule (FX-11); the vial's real content does not change with the dose. | DV-015 |
| DL-16 | **→ AD-65, corrected 2026-10-12.** The earlier text picked "the Protocols style" (grey above 7 days), which reverses the founder's Q9 = B coloured days; the decision is the founder's and lives in AD-65. | decisions.md:147 (verification 01) | DV-018 |
| DL-17 | "Vial age" sort = days left. | The sort exists to put the vial closest to expiry first. | DV-122 |
| DL-18 | Mix dates: an impossible date is refused, never silently changed; at most 365 days back. | Honest journal: never store a date the user did not type. | DV-019 |
| DL-19 | Custom interval 1–365 days in the form and the assistant. | The longest-acting compound in the catalogue (Testosterone Undecanoate, depot t½ ~90 days, lib/halfLives.js:39) is dosed every 10–14 weeks; 365 is the assistant's existing bound (assistantSchema.js:53); one bound everywhere. | DV-123 |
| DL-20 | Restore reopens a vial only if it was not finished by doses and is not a tombstone. | An empty vial cannot be in use. | DV-022 |
| DL-21 | "Still going?" and its end date use logged Taken doses only. | Declared history never counts as logged (A-30 option C). | DV-026 |
| DL-22 | An empty rtu vial can be replaced, and an rtu new vial is a new row that asks for the new box date. **Narrowed 2026-10-12:** the recon "New vial" on the protocol page → OPEN-01 (registry A-08 F5 waits for the founder). | F-035's New vial exists to start a fresh container; a new box has a new printed date. | DV-027, DV-199 (DV-093 → OPEN-01) |
| DL-23 | Today's empty-state "Add a protocol" opens the wizard. | The button says Add. | DV-124 |
| DL-24 | **Withdrawn 2026-10-12 → OPEN-05.** (Was: a lapsed Premium user keeps all active protocols.) | A money rule, and OPEN-05 option C offered the same choice (verification 07, D-02). | DV-095 |
| DL-25 | One reality-check assembler (`readCheckNow`) for Today, the food card, Progress and the schedulers; Progress listens to sync; the day-21 reminder is re-planned on a weigh-in. | A-118 showed what happens when each screen assembles the state itself. | DV-059 |
| DL-26 | Today says what Progress will actually show (no "ready" when there is no result to see). | Same rule as A-118: follow the real state. | DV-058 |
| DL-27 | One weigh-in validation (25–300 kg, 3–70 %, 30–250 cm) on every entry path. | PO-21 limits exist for the same data from another door. | DV-065 |
| DL-28 | **Rewritten 2026-10-12.** `parse-food` counts the 25 daily parses by the user's local day of the request, not by the entry's date; a re-parse refused by the cap marks the row "not read yet — daily limit reached", keeps the text, explains, and retries the next day. | decisions.md:251: "25 AI parses per user per day … resets at local midnight"; counting per `entry_date` (`index.ts:161-171`) leaves a refused row stuck forever, so the earlier "retry after local midnight" could never succeed (verification 04). | DV-066 |
| DL-29 | `calc_inputs` is merged per key on push. | `mergeCalcInputs` already exists locally; never-lose-data. | DV-010 |
| DL-30 | Each "days" count on Progress is labelled by what it counts (picture first). | Three correct numbers that look contradictory are a bug. | DV-146 |
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
| DL-43 | Lab charts: one series per unit; x by date (picture first). | Honesty lines: never mix scales or distort time on a health value. | DV-080 |
| DL-44 | No vaccine due reminder. | The next-due date is user-entered and never advice; nothing promised it. | DV-161 |
| DL-45 | Today's "blocked" card excludes Silent mode, and Silent is never "blocked" anywhere. **Narrowed 2026-10-12:** whether Settings stays red when dose reminders are off but another switched-on kind is blocked → OPEN-20 (a). | BR-4 says Silent is never "blocked". The Settings half would amend the signed SP-1 / RC-1, so it is the founder's (verification 03). | DV-042 |
| DL-46 | Reminders read "OK" only when every timed protocol due in the window has its reminders; the setup bar shows "None scheduled". | "All set" must be true. | DV-043, DV-044 |
| DL-47 | Refresh health is honest: never-ran warns after 2 days; OK only when reminders were rebuilt; the count is kept. | A-110 exists to catch the silent failure. | DV-045, DV-046 |
| DL-48 | The persistent-reminders text describes the two repeats (+5, +10). | Copy must be true; no new behaviour without approval. | DV-049 |
| DL-49 | The Reminder check covers the channel of every reminder kind the user has switched on (picture first). | Its purpose: "a reminder that never arrives is invisible" — the food question included. | DV-098 |
| DL-50 | **Withdrawn 2026-10-12 (moot).** (Was: the Android setup step still shows after a denied dialog; SP-4 wording amended.) | The code already matches the signed SP-4 ("right after 'Turn on notifications' is answered"; a denial is an answer); nothing to amend; DV-142 closed (verification 03, 07 X-05). | — |
| DL-51 | **Withdrawn 2026-10-12 → OPEN-07.** (Was: A-24 closed; a check cannot be saved early any more.) | Whether a check can be saved early is exactly what OPEN-07 asks (verification 04). | DV-144 |
| DL-52 | Account-scoped device keys are removed on the intended sign-out and the cross-account guard; per-phone keys stay. | Privacy over convenience (cross-account guard, 2026-10-03). | DV-081 |
| DL-53 | The entitlement cache is bound to the session user at sign-in, before any read. | One account must never see another's Premium. | DV-082 |
| DL-54 | Offline with a stored session = signed in. | CLAUDE.md: distinguish "signed out" from "session changed". | DV-083 |
| DL-55 | AI consent per account, recorded with version and date, cleared on sign-out, withdrawable in Settings (picture first). | "Consent before every AI call" (decisions.md:323) means the person sending; GDPR Art. 7(3) requires withdrawal. | DV-007 |
| DL-56 | Profile and analytics writes report failures and keep the typed values. | Never lose user-entered data; same pattern as the notification switches. | DV-008 |
| DL-57 | A sign-in fills the display name only when missing (Apple or Google). | "Fill ONLY the missing fields, never overwrite" (2026-10-03, PA-71…73). | DV-084 |
| DL-58 | Settings › Edit profile can edit every field the gate requires ("what you track"). | Enter once, correct anywhere; the gate cannot be the only editor. | DV-113 |
| DL-59 | Someone who chose "Sign in" returns to Sign in after a restart. | They told the app what they wanted. | DV-163 |
| DL-60 | Deleting the account warns Premium users that the store subscription keeps billing, with a link. | Apple / Google account-deletion guidance (store rules 100%). | DV-087 |
| DL-61 | The 7 free food-log days are called "free days", never "trial". | One term per concept; "trial" is the store's offer. | DV-164 |
| DL-62 | No analytics before sign-in for now. | Default-on install-id analytics is a counsel question (ePrivacy 5(3)). | DV-167 |
| DL-63 | Reinstall behaviour is written into the TRD and checked on a device before any change. | Unspecified states are where data leaks or gets lost. | DV-116 |
| DL-64 | Add the `updated_at` trigger to `reality_checks` (production SQL with the founder's go). | The pull depends on it; every other synced table has it. | DV-088 |
| DL-65 | "As-needed doses are excluded" is a note, no code. | The app has no as-needed protocol type. | DV-133 |
| DL-66 | **Withdrawn 2026-10-12 → OPEN-18 (2).** (Was: the `not_recorded` marker is retired; FL-3 amended.) | It amends the signed FL-3; a signed row changes only with the founder's signature (verification 07, D-05). | DV-151 |
| DL-67 | **Withdrawn 2026-10-12 → OPEN-19 (b).** (Was: one daily cap = the doses expected that day; a snoozed dose after slot + 12 h logged as today.) | It would refuse a real dose recorded on a rest day and contradicts its own snooze clause (verification 02, R5). | — |
| DL-68 | The target ETA has no extra staleness cutoff: it always names the weigh-in window it is computed from; body-fat-only targets are supported. | The ETA was approved "labelled with its weigh-in window" and the target as "weight and/or body-fat" (decisions.md:241): an old window is shown, never hidden or guessed. | — |
| DL-69 | Typed numbers are parsed in the app language (pt/es/fr/de/it: comma = decimal, "5.000" = 5000; English as in CLAUDE.md), via `parseDecimal(text, language)`. | The founder approved displaying numbers in the app language (decisions.md:92) and prefilled fields must round-trip; a field that shows "86,0" must read "86,0" back. | — |
| DL-70 | iPad stays off (`supportsTablet: false`) for 1.3.0; enabling it is a registry item for a later build. | 1.3.0's scope is closed (evolution rule 2); iPad was never approved, and the foldable book layout is the approved large-screen work. | — |
| DL-71 | Existing false Missed rows of real users are not migrated away; users can correct or delete them in the Dose log; Test03's rows stay untouched. | They cannot be told apart from real misses safely — never destroy on a maybe (CLAUDE.md); decisions.md:197, :387. | — |
| DL-72 | **Withdrawn 2026-10-12 → OPEN-16 (b).** (Was: every synced table gets a positive tombstone instead of a cloud hard DELETE.) The principle — a delete reaches every device — stays logic and is restated in OPEN-16. | Timing and risk of a delete-semantics change on every table are the founder's. The old reason misattributed decisions.md:519-530 (a coordinator decision, Gate B) to the founder; he approved applying that migration (:531) (verification 01, 07 D-03). | DV-182 |
| DL-73 | **Withdrawn 2026-10-12 (false premise).** (Was: "+ Add a past weigh-in" accepts any past date back to the birth year.) | The wheel already stops 10 years back (`lib/wheelPick.js:16`); "back to the birth year" would widen the range; decisions.md:241 only says past weigh-ins can be backfilled. DV-194 closed (verification 04). | — |
| DL-74 | **Withdrawn 2026-10-12 → OPEN-16 (b).** (Was: dose counters sync as events; pushes carry only changed fields.) The principle — two offline doses count as two — stays logic and is restated in OPEN-16. | Same as DL-72; it may also need a server RPC (verification 07, D-03). | DV-183 |
| DL-75 | A measured daily burn shows whenever a measured result exists, even when the formula inputs (weight, height, age, sex) are incomplete; PO-12's gate applies to the formula estimate only. Added 2026-10-12 (replaces AD-45). | decisions.md:240: "a measured maintenance becomes the hero number once it exists"; PO-12 governs the estimate (verification 04). | DV-149 |

---

## Versão em português — para mandar ao fundador numa rodada só

Cobre o PRD, o TRD e os fluxos desenhados, já corrigidos pela verificação independente de 12/10 (uma rodada só, como manda o CLAUDE.md). A numeração da mensagem segue a ordem de leitura; entre parênteses vai o ID do documento.

> Oi! Terminei o levantamento completo do app (PRD, TRD e os 14 fluxos desenhados) e, antes de te mandar, pedi para agentes independentes conferirem tudo contra o código, o registro de decisões e o estado real do servidor. Eles acharam erros meus — inclusive coisas que eu tinha dado como "já decididas por você" e que na verdade não eram. Esta é a versão corrigida.
>
> **Os números, com honestidade:**
> - **218 problemas registrados** no app (15 graves — perda de dado, registro de saúde errado ou privacidade; 94 de informação errada ou contraditória na tela; 37 de recurso aprovado faltando; 72 de acabamento, texto ou código).
> - **54 pontos já estavam decididos** e eu só aplico: 52 vêm de palavras suas, respostas suas ou checklists que você assinou; 2 são linhas que o coordenador escreveu aplicando uma resposta sua ou uma regra das lojas (o período de teste grátis só para quem a loja diz que tem direito, e o texto de "análise de uso" da revisão regulatória).
> - **65 pontos resolvi pela lógica do produto** (por exemplo: "nunca perder dado da pessoa", "um termo por conceito", "o texto tem que ser verdade", "uma regra só para estoque baixo"). Estão no `docs/decisions.md`, uma linha cada, com o motivo. Se discordar de algum, é só dizer que eu mudo.
> - Sobram **21 perguntas** que só você pode responder (gosto, dinheiro, risco ou escopo), agrupadas abaixo.
>
> **O que mudou desde a versão anterior:** 26 itens que eu tinha dado como resolvidos voltaram para você (alguns só em parte, marcados com *): AD-04, AD-07*, AD-09*, AD-10, AD-11*, AD-27, AD-29, AD-35, AD-44, AD-46, AD-50, AD-54, AD-56, AD-61*, DL-03*, DL-06*, DL-08*, DL-22*, DL-24, DL-32, DL-45*, DL-51, DL-66, DL-67, DL-72, DL-74. Além disso: a cor dos dias de validade (DL-16) estava contra a sua escolha dos dias coloridos e virou decisão sua (AD-65); dois itens caíram porque não havia o que decidir (DL-50 e DL-73); e a correção da fila de leituras de comida (DL-28) foi reescrita, porque a primeira versão não teria funcionado.
>
> Para cada pergunta deixo o contexto, as opções e a minha recomendação. Se concordar com tudo, basta responder **"siga as recomendações"**. Se quiser mudar alguma, mande só o número e a letra (ex.: "1a C, 6 B"). Nada disso entra em código antes da sua resposta.
>
> **Escopo**
>
> **1. O que entra na 1.3.0** (OPEN-16)
> *Contexto:* são 218 problemas, e parte das correções pela lógica cria tela ou controle novo que você nunca aprovou (por exemplo: retirar o consentimento de IA nos Ajustes, editar "o que você acompanha" no perfil). Duas regras suas se encontram aqui: "Vamos resolver tudo. Sem pendência" (07/10) e "cada build tem escopo fechado; o que é novo ganha um build-alvo, nunca entra escondido".
> *(a) Opções:* **A)** tudo na 1.3.0 — a ida para as lojas espera tudo ficar pronto. **B)** na 1.3.0 entram todos os problemas graves e de informação errada, tudo o que você já aprovou e todas as correções de texto; o que cria tela nova ainda não aprovada e a limpeza interna de código vão para a 1.3.1, com o alvo escrito no registro. **C)** na 1.3.0 só os graves e o que você já aprovou; o resto na 1.3.1.
> *(b) A sincronização entre aparelhos.* Hoje uma dose apagada no celular pode voltar a aparecer nele depois que o Fold edita essa mesma dose, e duas doses registradas offline em dois aparelhos contam como uma. Corrigir isso muda como exclusões e edições viajam entre aparelhos em todas as tabelas e exige alterações no servidor (que só aplico com o seu "pode aplicar"). *Opções:* **A)** tudo na 1.3.0, com revisão completa de segurança (Gate B), teste no servidor desfeito antes de aplicar e teste em dois aparelhos atualizando de uma versão antiga. **B)** na 1.3.0 só as exclusões; a contagem de doses na 1.3.1. **C)** tudo na 1.3.1, com o problema documentado.
> *Recomendação:* **(a) B e (b) A.** B coloca tudo o que você aprovou no próximo build e tira da loja todo erro que a pessoa vê, sem enfiar tela nova não aprovada num build fechado; nada some, porque cada item adiado fica com alvo escrito. Se para você "sem pendência" quer dizer que nem item com alvo pode ficar para depois, a resposta é A. Na sincronização, A: dose que volta depois de apagada, ou duas doses contadas como uma, é registro de saúde errado, e a 1.3.0 é o build que todo mundo vai instalar.
>
> **Protocolos e estoque**
>
> **2. Corrigir o frasco em uso, e "Novo frasco" para protocolos em pó** (OPEN-01)
> *Contexto:* a data em que a pessoa misturou o frasco e a validade dele (30 dias, por padrão) são digitadas uma vez só e depois não dá para corrigir; e todo protocolo novo começa o frasco com zero doses usadas, mesmo quando a pessoa já está no meio dele. Um erro de digitação ou um frasco pela metade deixa errados o "faltam X doses", os dias restantes, a etiqueta "Fora do prazo" e o alerta de estoque, até o frasco acabar. Na sua decisão do Reiniciar (06/10) você já contava com a pessoa "corrigindo a contagem" — esse controle não existe. E no protocolo em pó só dá para começar um frasco novo pelo aviso de Hoje, quando o frasco acaba: um frasco vencido mas não vazio fica sem saída.
> *Opções:* **A)** na página do protocolo: "Editar frasco" (data da mistura, validade e doses já usadas) e, para pó, "Novo frasco" (te mostro o desenho antes). **B)** só perguntar "quantas doses você já usou deste frasco?" quando o protocolo ou o frasco começa no passado; o "Novo frasco" do pó continua só em Hoje. **C)** deixar como está.
> *Recomendação:* **A** — os alertas do próprio app saem desses números; o que a pessoa informa tem que poder ser corrigido num lugar só.
>
> **3. Aviso de estoque baixo para cápsulas, comprimidos e pó** (OPEN-02)
> *Contexto:* o aviso de "acabando" (faltam de 1 a 3 doses) existe só para frascos — no alerta de Hoje, na notificação e no selo de Meus protocolos. Um pote de cápsulas pode acabar sem nenhum aviso. (A conta de dias de estoque dos potes tomados em dias alternados também está errada; isso é bug e eu corrijo de qualquer jeito.)
> *Opções:* **A)** a mesma regra dos frascos para os potes: alerta em Hoje, notificação e selo. **B)** só uma linha âmbar no card ("faltam N porções"), sem alerta nem notificação. **C)** deixar como está.
> *Recomendação:* **A** — uma regra só para o mesmo conceito; ficar sem o suplemento importa tanto quanto ficar sem o frasco.
>
> **4. O que acontece quando termina um ciclo com número fixo de doses** (OPEN-03)
> *Contexto:* você aprovou em 07/10 que protocolos com total de doses param os lembretes quando o ciclo termina. Só que o formulário não deixa mais ninguém definir esse total — só protocolos antigos têm. Nesses, o lembrete para, mas Hoje continua pedindo a dose, mostra "Dia 12 de 12" para sempre e vai acumulando doses perdidas até aparecer o "Ainda em andamento?".
> *Opções:* **A)** no fim do ciclo o protocolo é encerrado sozinho, sem perguntar (quem continua além do previsto perde os lembretes sem aviso). **B)** no fim do ciclo o app para de esperar doses em todo lugar e Hoje pergunta "Ciclo concluído — encerrar {nome}?", com Encerrar / Continuar (Continuar tira o total). **C)** ignorar o total em todo lugar e manter os lembretes (vai contra o que você aprovou em 07/10).
> E junto: quer o campo "total de doses" de volta no formulário? **Sim / Não.**
> *Recomendação:* **B, sem trazer o campo de volta por enquanto** — pergunta antes de encerrar, igual ao "Ainda em andamento?", e respeita a sua regra de lembrar até a pessoa encerrar.
>
> **5. "Excluídos recentemente" deve voltar a se esvaziar sozinho?** (OPEN-04)
> *Contexto:* a limpeza automática depois de 7 dias está pausada na 1.3.0 por segurança: os protocolos apagados pelo antigo botão "Sim, terminou" não dá para diferenciar das exclusões de propósito, e a limpeza levaria junto o histórico de doses deles. "Excluir para sempre", com seleção múltipla, já existe.
> *Opções:* **A)** nunca limpar sozinho: o protocolo fica lá até a pessoa excluir para sempre (e o aviso de exclusão diz exatamente isso). **B)** voltar a limpar depois de 7 dias só o que for excluído a partir da 1.3.0. **C)** voltar a limpar tudo, depois de tirar as doses da exclusão em cascata na nuvem — a mudança maior e mais arriscada.
> *Recomendação:* **A** — com "Excluir para sempre" pronto, a limpeza automática só traz risco e nenhum ganho para a pessoa.
>
> **6. O limite de 3 protocolos do plano grátis: no servidor, e depois que o Premium acaba** (OPEN-05)
> *Contexto:* hoje o limite é conferido só no celular, na hora de adicionar, reiniciar ou restaurar; com dois aparelhos ou uma versão antiga dá para passar de 3. E quem deixa de pagar o Premium continua com todos os protocolos ativos. Na versão anterior eu tinha decidido esta segunda parte "pela lógica" — mas é regra de dinheiro, então é sua.
> *Opções:* **A)** continuar conferindo só no celular; quem deixa de pagar fica com todos os protocolos ativos, mas não adiciona nem reinicia nenhum acima de 3 até assinar de novo. **B)** o servidor recusa o 4º protocolo — como o app funciona offline, a recusa chegaria depois, com o protocolo já criado no celular, e um registro de saúde ficaria no limbo. **C)** B + ao deixar de pagar, os protocolos acima de 3 são encerrados (e os lembretes deles param).
> *Recomendação:* **A** — encerrar protocolos pararia lembretes de algo que a pessoa ainda toma (seu princípio de 07/10), e recusar no servidor arrisca perder um registro de saúde; hoje não há necessidade de receita que justifique.
>
> **Hoje e doses**
>
> **7. A sequência de Hoje: dias ou doses?** (OPEN-17)
> *Contexto:* em 05/10 você mudou a sequência do card de cada protocolo para contar doses seguidas, porque um protocolo semanal mostrava "2 dias sem falhar" — isso está aplicado. Na versão anterior eu estendi a regra, pela lógica, para a sequência geral de Hoje (a da chama, "Mandando bem!" com 7). Isso muda o texto em 6 idiomas e o sentido da chama, e o protótipo que você aprovou mostra "dias sem falhar". Hoje a chama para de contar em 31 dias; passar para 1 ano vale nos dois casos.
> *Opções:* **A)** a chama continua contando dias: conta o dia em que todos os protocolos daquele dia foram concluídos, e dia sem nada previsto não quebra a sequência (assim o semanal não perde nada); até 1 ano. **B)** a chama também passa a contar doses seguidas (textos novos nos 6 idiomas).
> *Recomendação:* **A, com o desenho das duas antes** — a chama responde "quantos dias mantive tudo em dia"; o card responde por protocolo; e pular os dias sem dose prevista resolve o caso do semanal que você viu.
>
> **8. Quatro detalhes das doses em Hoje** (OPEN-19)
> *(a) Dose atrasada.* Uma dose diária das 08h tomada ontem às 21h (13 h depois): os anéis de Hoje contam essa dose para hoje (às 7h já aparece 100 %, enquanto o card ainda pede "Concluir"), e a varredura de doses perdidas conta para ontem. A sua regra de 29/09 (a dose atrasada vale para o próprio horário até a metade do intervalo) não chega a 13 h numa dose diária. *Opções:* **A)** vale o mesmo dia: a dose conta para o último horário do próprio dia (ontem às 21h → a dose de ontem), nunca para um dia seguinte. **B)** só até a metade do intervalo; depois disso a dose não preenche nenhum horário. **C)** como está.
> *(b) Limite diário para concluir doses.* Hoje todo caminho limita a "doses por dia". Na versão anterior eu tinha trocado para "as doses previstas para aquele dia", o que recusaria uma dose registrada num dia sem dose prevista (por exemplo, um protocolo de 3 em 3 dias tomado um dia antes). *Opções:* **A)** manter "doses por dia" em todo caminho (o registro de doses inclusive). **B)** "doses previstas para aquele dia".
> *(c) Protocolo sem horário de lembrete* (antigos ou importados): o celular lembra às 08h, mas o resto do app não mostra horário nenhum. Vai ser um horário só em todo lugar; qual? *Opções:* **A)** 08h em todo lugar (o que o celular já faz). **B)** os horários padrão do formulário (a hora atual arredondada, depois 14h e 21h).
> *(d) Desfazer depois de "Pular".* Depois de "Concluir" aparece a barra "Desfazer"; depois de marcar como não tomada a dose pendente de ontem também; depois de "Pular", não (dá para concluir pela linha da dose pulada ou apagar no registro de doses). *Opções:* **A)** "Desfazer" depois de "Pular" também (um jeito só na tela; desfazer religa os lembretes). **B)** nenhum "Desfazer" depois de "Pular" nem depois de marcar a dose de ontem como não tomada. **C)** como está.
> *Recomendação:* **(a) A, (b) A, (c) A, (d) A** — a dose vale para o dia em que a pessoa a tomou; um diário honesto nunca recusa uma dose que a pessoa diz que tomou; todo lugar concorda com o que o celular já faz; e um jeito só de desfazer na mesma tela.
>
> **Lembretes**
>
> **9. Lembretes no iPhone de quem para de abrir o app** (OPEN-06)
> *Contexto:* seu princípio (07/10) é que o app avisa enquanto a pessoa estiver tomando, abrindo o app ou não. No Android isso **já foi construído** (renovação em segundo plano, despertar diário e reconstrução depois de atualização ou reinício), mas **ainda falta a prova no aparelho** no próximo build de teste. No iPhone os lembretes ficam agendados por no máximo 10 dias (menos, com muitos protocolos, por causa do limite de 64 notificações da Apple) e depois simplesmente param, sem aviso.
> *Opções:* **A)** manter o agendamento no celular, mas a última notificação do período vira "Abra o DoseTrace para continuar recebendo seus lembretes", e Hoje avisa quando o período estiver acabando — barato, mas ainda depende de a pessoa abrir o app uma vez, então sozinho não cumpre o seu princípio. **B)** notificações enviadas pelo servidor para o iPhone — a única opção que cumpre o princípio; é um projeto grande, com custo mensal (precisa ter tudo o que os lembretes do celular têm: modo silencioso, esconder nomes, botões, repetições). **C)** atualização em segundo plano do iOS — o iPhone roda quando quer e nunca depois que a pessoa fecha o app à força; sem garantia.
> *Recomendação:* **A agora e B como projeto próprio logo em seguida** (o alvo segue a pergunta 1).
>
> **10. Três detalhes dos lembretes** (OPEN-20)
> *(a) Ajustes em vermelho com os lembretes de dose desligados.* Quando a permissão de notificação está negada, os Ajustes mostram "Algo está bloqueando seus lembretes" mesmo para quem desligou os lembretes de dose ou não tem protocolo. Só que a mesma permissão bloqueia a pergunta das 20h sobre comida, o lembrete semanal de peso, a pesagem do dia 21 e os alertas de frasco — e os checklists que você assinou definem os Ajustes pelos bloqueios. (O modo silencioso nunca aparece como "bloqueado"; isso continua decidido.) *Opções:* **A)** vermelho enquanto qualquer lembrete ligado estiver bloqueado (como você assinou). **B)** neutro quando os lembretes de dose estão desligados ou não há protocolo (muda o que você assinou).
> *(b) Quando o celular pede permissão depois do "Agora não".* Hoje o app pede a permissão do sistema a cada abertura e a cada login — segundos depois de a pessoa dizer "Agora não" no começo. *Opções:* **A)** não pedir ao abrir; pedir quando a pessoa salvar o primeiro protocolo com horário de lembrete (e, no Android, pela tela "Garanta que seus lembretes cheguem", que já abre uma vez para quem tem horário). **B)** pedir mais uma vez na abertura seguinte e depois nunca mais. **C)** como está.
> *(c) Alerta de vencimento do frasco.* Ficou pronto em 03/10: avisa 7 dias antes e no dia do vencimento, às 9h, com as mesmas palavras do alerta de Hoje; ficou pendente você confirmar a antecedência e o texto. *Opções:* **A)** como está (7 dias antes + no dia). **B)** 3 dias antes + no dia. **C)** só no dia.
> *Recomendação:* **(a) A, (b) A, (c) A** — segue o que você assinou e não esconde a pergunta das 20h; respeita o "Agora não" e pede quando a pessoa acabou de pedir um lembrete; e uma regra só de 7 dias para o alerta de Hoje e para a notificação (o texto você vê no build de teste, pergunta 18).
>
> **Comida com IA, "Seus números reais" e Progresso**
>
> **11. "Seus números reais": fechar sozinho e um peso só no início** (OPEN-07)
> *Contexto:* em 29/09 ficou combinado: sem campo de peso próprio (a medição usa as pesagens) e botões de resultado a partir do dia 14. O que foi construído: uma tela de início com campo de peso próprio, sem botões, e a medição fecha sozinha na primeira pesagem a partir do dia 21, quando há 7 dias seguidos de comida registrada (ou calorias informadas) — mas só quando a pessoa abre Progresso, e só para quem pode ver o resultado. Os textos que você aprovou em 09/10 já partem desse fechamento automático, mas o seu OK para ele nunca foi registrado. Hoje o peso do início pode ser diferente da pesagem daquele dia, e aí a conta e o gráfico usam pesos diferentes. A sua resposta também fecha uma dúvida antiga do registro ("salvar antes encerra a pergunta das 20h?").
> *Opções:* **A)** como está (peso próprio, fecha sozinho; os dois pesos continuam possíveis). **B)** voltar ao combinado de 29/09 (sem peso próprio, botões a partir do dia 14) — exige refazer, e um resultado tirado entre o dia 14 e o 21 é menos preciso que um de 21 dias. **C)** fecha sozinho como está, mas o peso do início É a pesagem daquele dia (digitar outro número atualiza a pesagem, com confirmação, igual em "Seus números").
> *Recomendação:* **C** — mantém o fluxo que você já vem testando e cada peso passa a ter um lugar só.
>
> **12. "Parar a medição" apaga os resultados anteriores?** (OPEN-08)
> *Contexto:* hoje "Parar a medição" apaga TODOS os resultados já medidos, e o gasto diário volta a aparecer como "Estimado". O mesmo link aparece também na tela do resultado pronto e na tela bloqueada, **sem nenhuma medição em andamento** — e um toque ali apaga tudo. A sua decisão falava só em encerrar a medição aberta, cancelar os lembretes e manter a comida registrada. O texto de confirmação ("Isso apaga seus números reais") nunca foi aprovado como "apagar os resultados antigos" e, em português, soa como desligar o recurso.
> *Opções:* **A)** "Parar a medição" só aparece com uma medição em andamento e encerra só ela; os resultados antigos ficam. **B)** como está (apaga tudo, de onde for tocado). **C)** A + um botão separado "Apagar meus resultados", que pergunta antes.
> *Recomendação:* **A** (ou **C**, se quiser dar um jeito de apagar) — nunca destruir dado por tabela; um resultado medido é dado da pessoa.
>
> **13. Quando a conta não gera um número** (OPEN-09)
> *Contexto:* com a pesagem e os 7 dias de comida completos, às vezes a conta dá "manutenção" (o peso mudou menos de 0,2 kg — a pessoa come o que gasta), "improvável" (fora de 1.000 a 5.000 kcal) ou "curto demais" — este, na prática, só quando todos os dias foram "Não comi nada" (média zero). Hoje só o resultado normal é salvo: nesses três casos a medição nunca termina, Hoje fica dizendo "prontos — toque para ver" sem ter nada para ver, e a pergunta das 20h continua chegando enquanto a pessoa ainda pode registrar comida. (O texto do "improvável" sempre diz "baixo demais", mesmo quando o número é alto — isso é bug e eu corrijo de qualquer jeito.)
> *Opções:* **A)** salvar "manutenção" como resultado de verdade (gasto diário = média ingerida); nos outros dois casos, mostrar o motivo e encerrar a medição depois que a pessoa vir, oferecendo recomeçar. **B)** manter a medição aberta, mas parar a pergunta das 20h e mostrar o motivo em Hoje e em Progresso. **C)** como está.
> *Recomendação:* **A** — peso parado comendo X kcal é justamente a medida da manutenção, e uma medição que nunca termina quebra o hábito diário. Como muda um número de saúde exibido, a revisão da conta de energia roda antes do build.
>
> **Curva de acúmulo**
>
> **14. Mudar a dose reescreve o passado da curva?** (OPEN-10)
> *Contexto:* hoje a curva aplica a dose atual (e o intervalo, a data de início e as doses por dia) a todas as doses passadas. Baixou de 250 para 125 mg? Meses de histórico são redesenhados em 125 mg — inclusive a "Estimativa em uma data" ao lado de exames antigos. Está em aberto desde 13/09.
> *Opções:* **A)** como está, com um aviso na curva quando o protocolo foi editado ("usa a dose atual para as datas passadas"). **B)** guardar o histórico das mudanças com a data em que cada uma passou a valer; o passado usa os valores antigos (muda o modelo de dados sincronizado e passa por revisão farmacológica). **C)** editar a dose encerra o ciclo antigo e começa um novo (pesado para a pessoa e divide o histórico).
> *Recomendação:* **B** (e **A** como solução provisória se B não ficar bom a tempo do build) — um diário honesto mostra o que estava planejado em cada época, e a edição já grava só o que mudou.
>
> **15. Doses puladas ou perdidas devem baixar a curva?** (OPEN-11)
> *Contexto:* a curva segue o planejado — o aviso na tela já diz isso — e por isso as doses puladas e perdidas continuam contando. Contar só as concluídas é mudança de modelo que precisa de revisão farmacológica (decisão de 24/09).
> *Opções:* **A)** como está. **B)** para o passado (depois que o protocolo foi criado), usar o registro de doses — só as concluídas; o histórico informado antes da criação e o futuro seguem o planejado. **C)** curva planejada, mas as doses puladas ou perdidas aparecem marcadas de outro jeito (vazadas), sem mudar o número.
> *Recomendação:* **B depois da revisão farmacológica, e C até lá** — o registro da própria pessoa é a fonte honesta do passado, e a curva é o carro-chefe do app.
>
> **Meu corpo**
>
> **16. Digitar exames à mão: entra na 1.3.0, a não ser que você adie** (OPEN-12)
> *Contexto:* foi aprovado ("o diário de exames digitado à mão é grátis", 30/09), a animação explicativa aprovada diz "digite os valores de qualquer laudo" e a mensagem de limite de leituras diz "você ainda pode inserir tudo à mão" — mas essa tela nunca foi construída. Hoje o único jeito de registrar um exame é a leitura por IA (3 grátis por mês). Pela regra "aprovado → próximo build", ela entra na 1.3.0; só você pode adiar, e não vejo motivo técnico para adiar.
> *Opções:* **A)** construir "Adicionar valores à mão" na 1.3.0 (data, marcador, valor, unidade; desenho antes) — o padrão. **B)** adiar para o build seguinte e corrigir já os textos que prometem. **C)** desistir e corrigir os textos.
> *Recomendação:* **A** — está aprovado, os textos já prometem, e é o único caminho do plano grátis depois das 3 leituras do mês.
>
> **17. O alerta "Exame de sangue pendente"** (OPEN-13)
> *Contexto:* quando o último exame tem mais de 6 meses, Hoje mostra "Exame de sangue pendente · Já se passaram N meses desde seu último exame". Os 6 meses foram escolhidos pelo app, não pela pessoa — é um calendário que ela não definiu, perto da linha de "nunca orientar".
> *Opções:* **A)** manter (mantém uma recomendação escolhida pelo app; risco regulatório). **B)** mesmo gatilho, texto só de fato: "Seu último exame foi há N meses" (sem "pendente"). **C)** a pessoa define o próprio intervalo (ou nenhum) em Meu corpo; nenhum por padrão. **D)** remover o alerta.
> *Recomendação:* **B** — mantém o lembrete útil sem o app decidir o que está pendente; o revisor regulatório confere a frase.
>
> **18. A linha de leituras do Meu corpo e duas melhorias pequenas** (OPEN-14)
> *(a) Número no Premium.* Em 01/10 você decidiu, e assinou no checklist de Meu corpo em 03/10: os textos do Premium não mostram número de leituras; o 20 só aparece nas perguntas frequentes e na mensagem de limite. Em 04/10 o coordenador escreveu, sem te perguntar, que Meu corpo mostraria "3 grátis / 20 Premium", e eu tinha listado isso como decisão sua. Hoje Meu corpo nem tem linha para o Premium. *Opções:* **A)** a sua regra: a linha do Premium sem número ("Leituras de exames, vacinas e frascos · Incluídas no Premium"). **B)** mostrar "20 por mês" para o Premium.
> *(b) Leituras usadas.* Quem está no grátis vê o limite ("3 leituras grátis por mês…"), mas nunca quantas já usou — só descobre que acabou quando uma leitura é recusada. Mostrar "N de 3 leituras usadas este mês" perto do botão de enviar?
> *(c) Data do exame.* Quando a IA lê a data invertida (dia/mês × mês/dia), hoje é preciso corrigir valor por valor. Criar "Mudar a data deste exame", que move todos os valores de uma vez?
> *Opções para (b) e (c):* **sim na 1.3.0 / sim no build seguinte / não**.
> *Recomendação:* **(a) A; (b) e (c) sim, no build seguinte** — o coordenador não pode passar por cima de uma decisão sua e de um checklist assinado; as duas melhorias tiram um incômodo real, mas nunca foram aprovadas, então ganham alvo (pergunta 1).
>
> **Conta e Premium**
>
> **19. Gerenciar a assinatura pelos Ajustes** (OPEN-15)
> *Contexto:* os Ajustes só mostram Premium ou Grátis: não dá para ver quando o teste grátis termina, quando renova ou se há problema de cobrança, e não dá para gerenciar nem cancelar a assinatura dentro do app. (Corrigindo o que eu disse antes: quem paga e reinstala o app recupera o Premium só de entrar na conta; e quem paga mas aparece como grátis chega ao "Restaurar compras" pelo card do Premium nos Ajustes. Restaurar não é o problema.)
> *Opções:* **A)** linhas "Gerenciar assinatura" (abre a página da loja) e "Restaurar compras", mais o status (teste grátis até…, renova em…) quando a loja informar. **B)** só "Gerenciar assinatura". **C)** deixar como está.
> *Recomendação:* **A** — as lojas esperam que cancelar esteja ao alcance; regra da loja é 100%. (À parte, pela lógica, a tela de excluir conta vai avisar que a assinatura continua cobrando até ser cancelada na loja.)
>
> **O que foi construído diferente do que você aprovou ou assinou**
>
> **20. Manter como está ou mudar? (e o que falta assinar)** (OPEN-18)
> *Contexto:* as escolhas que a equipe fez sozinha entram numa lista só, que você confere e assina no build de teste. Estas seis contrariam uma linha sua ou um checklist assinado, então preciso da direção agora:
> 1. **Linhas das misturas na curva:** em 18–24/09 você definiu linhas tracejadas "(est.)" para os componentes; o app desenha como qualquer composto (passado contínuo, futuro tracejado). Te mostro os dois desenhos.
> 2. **Dia "não registrado":** o checklist da comida diz que um dia marcado assim quebra a sequência de 7 dias; nada mais grava essa marca ("Só fechar o dia" faz o mesmo papel).
> 3. **Limites da IA da comida:** a equipe acrescentou 25 respostas de acompanhamento por dia e 60 chamadas em qualquer janela de 24 h; a sua regra diz que as respostas não contam e que as 25 leituras zeram à meia-noite.
> 4. **Animação do anel de Hoje:** em 24/09 você disse que o anel "carrega do zero"; em 29/09 ficou registrado "contar só quando o valor muda"; o conflito nunca foi fechado, e hoje nada anima.
> 5. **Notificação de estoque com 3 doses** (antes eram 2): veio junto com "uma regra só para estoque baixo", sem aprovação com data.
> 6. **"Continuar com Apple" no Android** usa um desenho próprio do logo da Apple; baixar a arte oficial da Apple é decisão sua, e botão de loja segue a regra da loja 100%.
> *Opções para cada um:* **manter** ou **mudar** (1: tracejado; 2: manter a marca; 3: respostas livres e só as 25 por dia; 4: contar do zero a cada abertura; 5: voltar para 2; 6: manter o desenho próprio).
> *Recomendação:* 1 manter (o protótipo que você tornou obrigatório em 01/10 desenha todas as linhas iguais — confirmo com o desenho); 2 manter, aposentando a marca e ajustando o checklist com a sua assinatura; 3 manter os dois como teto contra abuso (quem usa normalmente nunca chega perto); 4 seguir a linha mais nova — contar só quando o valor muda, mantendo o card "tudo em dia" e o pulso do dia completo; 5 manter 3; 6 mudar para a arte oficial da Apple.
> E no build de teste, só para você olhar e assinar: o botão "Concluir" no card de Meus protocolos; o contorno e o texto "Do seu lembrete" nos 6 idiomas; os textos de sair da conta com dados não enviados e do aviso de offline; e três checklists que nunca foram assinados (página da direita do Fold, Premium e login, painel de administração).
>
> **Decisões que o coordenador tomou sem te perguntar**
>
> **21. Confirmar dez decisões** (OPEN-21)
> *Contexto:* na versão anterior estas apareciam como "decididas por você". A verificação mostrou que foi o coordenador que escreveu (ou escreveu "pela lógica") no registro, sem te perguntar. Todas seguem princípios seus e já estão construídas ou planejadas para a 1.3.0:
> 1. Quando o servidor confirma que a conta foi apagada ou a sessão revogada, os lembretes são cancelados; falha de rede nunca cancela nada (vale também para o que fica num segundo aparelho depois de apagar uma conta Apple).
> 2. O aviso de excluir protocolo para de prometer "7 dias" e diz que as doses saem do registro de doses enquanto ele estiver excluído; a pergunta "A mesma dose há N semanas?" diz o nome do composto; os três textos corrigidos em 04/10 ("fornecedor", "abaixo da faixa saudável", "nos últimos 7 dias").
> 3. Essa mesma pergunta volta quando a pessoa edita o protocolo e adianta a data de início; "Sim" apaga a marca de histórico.
> 4. Dentro dos itens que você colocou na 1.3.0 em 04/10: "Encerrar protocolo" na página do protocolo e um "Mais tarde" no aviso de frasco vazio (desenho antes); doses perdidas removidas em todos os aparelhos quando o protocolo é encerrado por inatividade; o estado do frasco segue a mesma regra de "quem mudou o status vence".
> 5. A confirmação de 18+ e do perfil pode ser respondida offline (grava depois) e tem "Sair mesmo assim".
> 6. Um protocolo novo preenchido pela metade se perde se o app for fechado à força (como os outros rascunhos).
> 7. O uso do assistente de IA entra na lista do que é apagado com a conta.
> 8. A limpeza automática de "Excluídos recentemente" fica pausada até a 1.3.0 sair (a pergunta 5 decide o depois).
> 9. "Outro dia" em "Corrigir este registro" vai de 2 a 7 dias atrás.
> 10. Exames de composição corporal de academia são uma fonte de medida, não orientação.
> *Opções:* **A)** confirmar as dez. **B)** confirmar todas, menos os números que você indicar.
> *Recomendação:* **A** — cada uma sai de um princípio seu (nunca destruir dado por tabela, texto tem que ser verdade, privacidade, a linha da IA); confirmando, viram decisões suas.
>
> **Para você saber (decidido pela lógica, sem precisar responder — se discordar de algum, me diga):**
> - Perguntas de local de aplicação em aberto nunca somem por idade — ficam até a pessoa responder. Isso substitui uma linha de 03/10 ("depois de 7 dias são descartadas") e segue a sua regra de 01/10 ("ficam até serem respondidas").
> - Doses marcadas como perdidas por engano em contas reais não são apagadas automaticamente: não dá para distinguir com segurança das perdidas de verdade; a pessoa corrige ou apaga no registro de doses. (Isso também aparece no relatório para o profissional de saúde.)
> - A sequência do relatório para o profissional de saúde passa a seguir a regra do card (doses seguidas).
> - "Pular" cancela os lembretes daquela dose; "Desfazer" e apagar uma dose no registro religam os lembretes.
> - A meta de peso mostra sempre de qual janela de pesagens saiu a previsão, sem prazo de validade.
> - O iPad continua desligado na 1.3.0 (nunca foi aprovado; o Fold é o trabalho de tela grande aprovado).
> - O consentimento de IA passa a ser por conta (com versão e data), apaga ao sair da conta e pode ser retirado nos Ajustes (desenho antes; o alvo segue a pergunta 1).
> - O limite diário de 25 leituras de comida passa a contar pelo dia em que a pessoa pede, não pela data da refeição — senão uma refeição digitada offline podia ficar travada para sempre. É uma mudança no servidor: só aplico com o seu "pode aplicar".
> - O gasto diário medido aparece sempre que existe uma medição, mesmo se faltar altura ou idade no perfil (a sua linha de 13/09: "a manutenção medida vira o número principal").
> - Achamos também um risco com data: a chave que faz o "Continuar com Apple" funcionar no Android vence em **04/04/2027**. Vou deixar um lembrete com data no registro para renovar antes.
>
> É isso. Assim que você responder, registro tudo nas decisões no mesmo dia e sigo.
