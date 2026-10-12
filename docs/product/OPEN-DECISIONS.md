# DoseTrace — open decisions (one round)

- Compiled 2026-10-12 from the 8 dossiers in `docs/product/research/`, `docs/decisions.md`, `docs/specs/*.md` and `docs/review/features.md`, together with `docs/product/DIVERGENCES.md` (the DV-xxx rows referred to below). No code was changed.
- **This is the single list of founder questions for the PRD / TRD / flows round.** Reconciled the same day with `PRD.md` (its former §7, OPEN-1…OPEN-69), `TRD.md` (§9.1, nine questions, and the "Decision?" column of §9) and `flows/` (the README's 36-question round and every flow's §12). Each of those questions now carries a canonical ID from this file; the crosswalk is in the section "Where every earlier question went" below. Those documents no longer keep their own question lists.
- The CLAUDE.md rule "decide what is already decided" was applied to every question the dossiers, the PRD, the TRD and the flows raised:
  1. If `docs/decisions.md` or a signed spec answers it → **Already decided (applied)**, with the citation (AD-xx).
  2. If the answer follows from how the features connect and why they exist → **Decided by logic**, one-line reason (DL-xx). The founder may override any of them, as with every "by logic" line in the ledger.
  3. Only real preferences (taste, money, risk, scope) remain **OPEN** (OPEN-xx).
- Counts: **15 OPEN**, **64 Already decided (applied)**, **74 Decided by logic**. The PRD / TRD / flows reconciliation added no OPEN question: everything they asked beyond the 15 below is answered by the ledger (AD-52…AD-64) or by product logic (DL-67…DL-74).
- Every answer the founder gives goes into `docs/decisions.md` the same day. The DL list and the missing 2026-10-05 streak line (AD-07) were added to `docs/decisions.md` on 2026-10-12 ("decided by logic during PRD/TRD").
- A Portuguese version of the OPEN list, ready to send as one message, is at the end.

---

## OPEN — questions for the founder

### Protocols and supply

#### OPEN-01 — Can users correct the vial they are using now?
- **Question.** Should the protocol page let the user correct the current vial: its mix date, its validity window (days), and how many doses were already drawn from it?
- **Context.** Today the mix date and the 30-day window are typed once (wizard step 5 or Today's "Log new vial") and can never be changed; a new protocol always starts its vial at 0 doses taken, even when the person started the vial weeks before installing the app. A typo or a half-used vial gives a wrong "days left", a wrong "N of M doses left", a "Past window" tag on the wrong day and a supply alert at the wrong time, for the whole life of that vial. The AI assistant mirrors the form (AP-28 accepted), so the gap exists in both paths. Registry A-08 (F5–F7) has waited for this answer since 2026-09-13.
- **Options.**
  - A — "Edit vial" on the protocol page: mix date, validity days, doses already used (picture first). One sheet, 6-language strings, writes only the vial row; dose history untouched.
  - B — Only ask "doses already used from this vial?" when a protocol or vial is created with a past start or past mix date. Fixes the most common case (started before installing), not typos.
  - C — No change. Wrong counts stay until the next vial.
- **Recommendation: A.** The app's own supply alerts and expiry tags are computed from these numbers; under "enter once, used everywhere" (A-54) a wrong entry has to be correctable in one place.
- **Related:** DV-094 (also DV-093, DV-015).
- **Also asked as:** PRD OPEN-11 (part 3) and OPEN-12 (mix date / window); TRD §9.1 Q8; flows README #4 (flow 02 §12, flow 04 §12).

#### OPEN-02 — Should oral bottles warn when supply is low?
- **Question.** Should capsule / tablet / powder bottles get the same "running low" warning as vials?
- **Context.** The one supply rule (1–3 doses left, FX-11) drives the Today alert, the push and the Protocols badge — for vials only. A bottle can run out with no warning anywhere. (The days-of-supply math for orals every 2+ days is also wrong — DV-020 — that is a plain bug and is fixed regardless.)
- **Options.**
  - A — Same rule for bottles (1–3 servings left) in the Today alert, the push and the Protocols badge.
  - B — Only an amber "N servings left" line on the card; no alert, no push.
  - C — No change.
- **Recommendation: A.** One rule for one concept (FX-11); a bottle running out matters as much as a vial. New strings ×6.
- **Related:** DV-092, DV-020.
- **Also asked as:** PRD OPEN-14; TRD §9.1 Q8 and R-42; flows README #13 (flow 04 §12, which suggested no push — option A here includes the push, one rule for one concept).

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
- **Also asked as:** PRD OPEN-10 (it recommended "legacy totals honoured everywhere"); TRD §9.1 Q3 and R-03; flows README #16 (flow 05 §12).

#### OPEN-04 — Should Recently deleted ever empty itself again?
- **Question.** Once 1.3.0 is out, should the automatic 7-day purge of deleted protocols come back?
- **Context.** Paused in 1.3.0 because deletes made by the old "Yes, it's finished" button cannot be told from deliberate ones and the cloud cascade would erase their doses (decided 2026-10-03, A-84 "revisit in the next build"). "Delete forever" by hand, with multi-select, is built.
- **Options.**
  - A — Never purge automatically; Recently deleted keeps everything until the user deletes it forever. The delete sheet then says exactly that.
  - B — Purge after 7 days only protocols deleted from 1.3.0 on (they can be marked); keep the older ones.
  - C — Purge everything after moving dose logs off the cloud cascade. Largest change, highest risk.
- **Recommendation: A.** With "Delete forever" and multi-select already there, an automatic purge adds risk and no user value; storage is negligible ("never destroy on a maybe").
- **Related:** DV-125, DV-023.
- **Also asked as:** PRD OPEN-68; flows README #17 (flow 05 §12 recommended B; this list recommends A for the reason above).

#### OPEN-05 — Enforce the 3-protocol free limit on the server?
- **Question.** Should the server refuse a 4th active protocol for a free user?
- **Context.** The limit (3, "3 mantém") is checked only on the phone at add / restart / restore, so a second phone or an old build can go over it. A Premium user who stops paying keeps all active protocols (decided by logic, DL-24: ending them would stop their reminders).
- **Options.**
  - A — Phone-only, as today; accept the rare bypass.
  - B — The server refuses the insert of a 4th active protocol for free users. In an offline-first app the refusal arrives at sync, after the protocol was created on the phone: a health record left in limbo.
  - C — B plus a downgrade rule for lapsed Premium.
- **Recommendation: A.** No revenue need (20–50k users in 5 years); a server refusal of an offline-created protocol risks losing a health record; the bypass needs two devices or an old build.
- **Related:** DV-095.
- **Also asked as:** PRD OPEN-15 (limit part; the lapse part is DL-24); TRD §9.1 Q6 (protocol-limit part; the food-access part is AD-16) and R-16; flows README #7 for the lapse (DL-24).

### Reminders

#### OPEN-06 — iPhone reminders for someone who stops opening the app
- **Question.** How should iPhone keep reminding a person who keeps taking something but does not open the app?
- **Context.** Founder principle 2026-10-07: reminders continue for as long as the person takes it, opened or not. Android now has a background refresh, a daily silent wake-up and a rebuild after updates/reboots. iPhone has none (BR-11 kept iOS untouched by an earlier decision): its reminders are scheduled up to 10 days ahead (Apple's 64-notification cap) and simply stop after that, with no warning.
- **Options.**
  - A — Keep local scheduling, and make the last notification of the window a notice "Open DoseTrace to keep your reminders coming", plus a Today line when the window is short. Small; still relies on the person opening the app once.
  - B — Server push for iPhone (send-reminders with everything it lacks: Silent mode, Show names, action buttons, repeats, food access — A-62). The real guarantee; large work, running cost.
  - C — iOS background app refresh. iOS runs it rarely and never after a force-quit; no guarantee.
  - D — No change.
- **Recommendation: A now, B as its own item next.** A closes the silent failure cheaply; B is the only real guarantee and deserves its own spec.
- **Related:** DV-097.
- **Also asked as:** PRD OPEN-19; TRD §9.1 Q7 and R-15; flows README #18 (flow 06 §12).

### Food log, reality check, Progress

#### OPEN-07 — Reality check: confirm "finishes by itself" and one start weight
- **Question.** Is the reality check that finishes by itself (as built) what you want, and should its start weight be the weigh-in of that day?
- **Context.** Ledger 2026-09-29 (Q-A, Q-B): the check uses the latest weigh-in for its start and final weight, has no weight fields of its own, and offers result buttons from day 14. What was built: a start sheet with its own weight field, no buttons; the check finishes by itself at the first weigh-in on or after day 21 once there are 7 food days in a row (or typed calories). Conflict 25 notes the self-finishing check never got your explicit OK, although the A-118 texts you approved on 2026-10-09 ("Your reality check is ready — tap to see it") are built on it. Today the start weight can differ from that day's weigh-in, so the check and the chart can use two different weights.
- **Options.**
  - A — As built (own start weight, finishes by itself at day 21+). Two start weights stay possible.
  - B — Back to Q-A / Q-B: no weight field, buttons from day 14. Rebuild; results under 14 days are less accurate.
  - C — Finishes by itself as built, but the start sheet's weight IS that day's weigh-in (a different number updates the weigh-in after a confirm, like Your numbers).
- **Recommendation: C.** It keeps the flow you have been testing, and one weight has one home (A-54).
- **Related:** DV-061, DV-058.
- **Also asked as:** PRD OPEN-25 (its judgement calls go to the deviation list, AD-52); flows README #23 and #24 (flow 08 §12).

#### OPEN-08 — Should "Stop" erase earlier results?
- **Question.** When the user stops the current reality check, should every earlier measured result be deleted too?
- **Context.** Today Stop deletes ALL saved reality-check results (the measured daily burn goes back to Estimated). The ledger (2026-09-10 / 09-27) says Stop "clears the open check, cancels the reminders and keeps the logged food" — it does not mention earlier results.
- **Options.**
  - A — Stop ends only the running check; earlier results stay.
  - B — As built: Stop wipes every result (the copy already says so).
  - C — A, plus a separate "Delete my results" that asks first.
- **Recommendation: A (or C if you want a way to wipe).** Never destroy on a maybe; a past measurement is user data.
- **Related:** DV-004.
- **Also asked as:** PRD OPEN-27; flows README #22 (flow 08 §12).

#### OPEN-09 — A reality check whose math gives no number
- **Question.** What should happen when the weigh-in and the 7 food days are complete but the math cannot give a saved result?
- **Context.** Three cases: "maintenance" (weight changed less than 0.2 kg — the person eats at maintenance), "implausible" (outside 1,000–5,000 kcal), "too short" (under 14 days, or an average of 0 kcal). Only a normal result is saved; in the three cases the check never closes, the 8 PM question keeps coming and Today keeps saying "ready — tap to see it".
- **Options.**
  - A — Save "maintenance" as a real result (daily burn = average intake); for implausible / too short, show the reason and close the check once the user has seen it, offering Start over.
  - B — Keep it open, but stop the 8 PM question and show the reason on Today and Progress.
  - C — As built.
- **Recommendation: A.** A weight that does not move while eating X kcal is a measurement of maintenance; a check that never ends breaks the daily loop. A changes a health number shown, so the energy-math check runs before the build.
- **Related:** DV-104, DV-058.
- **Also asked as:** PRD OPEN-28 (the "ready" wording itself is DL-26); flows README #25 (flow 08 §12).

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
- **Also asked as:** PRD OPEN-33; flows README #28, first half (flow 10 §12).

#### OPEN-11 — Should skipped and missed doses lower the curve?
- **Question.** Should the curve use the doses actually logged for the past, instead of the plan?
- **Context.** The curve follows the planned schedule (FX-13; the disclaimer says so). Skipped and Missed doses still count. Ledger 2026-09-24: "count only taken doses" is a model change for pharmacometrics review (registry A-31).
- **Options.**
  - A — As built (planned schedule, disclosed).
  - B — Past doses after the protocol was created come from the Dose log (Taken only); declared history before creation and the future stay planned.
  - C — Planned curve, but skipped / missed dose ticks are drawn differently (hollow); the number does not change.
- **Recommendation: B after the pharmacometrics review; C until then.** The user's own log is the honest source for the past, and the curve is the flagship.
- **Related:** DV-072.
- **Also asked as:** PRD OPEN-32; flows README #28, second half (flow 10 §12).

### My Body

#### OPEN-12 — Typing lab values by hand: build now or defer?
- **Question.** Typing lab values by hand was approved but never built. Build it in 1.3.0, or defer it explicitly?
- **Context.** Approved: "the lab test journal typed by hand is free" (ledger 2026-09-30), the approved explainer ("Type in values from any lab report…") and the scan-limit message ("You can still enter everything by hand"). There is no such screen; the only way to add a lab value is a scan (3 free a month). Under "approved → next build" only you can defer it.
- **Options.**
  - A — Build "Add values by hand" in 1.3.0 (date, marker, value, unit; picture first).
  - B — Defer to the next build, and correct the strings that promise it now.
  - C — Drop the feature; correct the strings.
- **Recommendation: A.** It is approved, the copy already promises it, and it is the free plan's only way to keep a lab journal after the 3 monthly scans.
- **Related:** DV-107.
- **Also asked as:** PRD OPEN-39; TRD §9.1 Q9 and R-21; flows README #30 (flow 11 §12).

#### OPEN-13 — The "Bloodwork due" alert
- **Question.** Should the app keep telling users their bloodwork is "due" after 6 months?
- **Context.** Today shows "Bloodwork due · It's been N months since your last panel" when the latest test is 6+ months old. The 6 months were chosen by the app; no decision covers it. It is a schedule the user never set — close to the never-advise line.
- **Options.**
  - A — Keep as is.
  - B — Same trigger, factual words: "Last lab test N months ago" (no "due").
  - C — The user sets their own interval (or none) in My Body; none by default.
  - D — Remove the alert.
- **Recommendation: B.** It keeps the useful nudge without the app deciding what is due; the regulatory reviewer confirms the wording.
- **Related:** DV-111.
- **Also asked as:** PRD OPEN-44; flows README #32 (flow 11 §12).

#### OPEN-14 — Two small My Body additions (not approved anywhere)
- **Question.** (a) Show "N of 3 scans used this month" near Upload? (b) Add "Change the date of this test" (moves every value of the test at once)?
- **Context.** (a) Users learn the monthly limit only when a scan is refused (the count is server-side, UTC month). (b) When the AI reads a date in the wrong order (DD/MM vs MM/DD), the only fix today is editing every value one by one.
- **Options per item.** Yes in 1.3.0 / Yes in the next build / No.
- **Recommendation: both yes, next build.** Neither is in 1.3.0's scope; both remove a real annoyance.
- **Related:** DV-110.
- **Also asked as:** PRD OPEN-42 and OPEN-43; flows README #33 (flow 11 §12).

### Account and Premium

#### OPEN-15 — Subscription management in Settings
- **Question.** Should Settings have "Manage subscription" and "Restore purchases"?
- **Context.** Restore exists only on the paywall, which Premium users are sent away from; Settings shows only Premium / Free (no trial end, no billing problem). A paying user who reinstalls has nowhere obvious to restore.
- **Options.**
  - A — Settings rows "Manage subscription" (opens the store page) and "Restore purchases" for everyone, plus a state line (trial until…, renews on…) when the store provides it.
  - B — Only "Restore purchases".
  - C — No change.
- **Recommendation: A.** Store guidance expects Restore to be easy to find and cancellation reachable. (Separately, by logic DL-60, the delete-account sheet warns that the store subscription keeps billing.)
- **Related:** DV-112, DV-087.
- **Also asked as:** PRD OPEN-48 (its delete-account warning part is DL-60); flows README #36 (flow 13 §12).

---

## Where every earlier question went (PRD, TRD, flows)

The PRD, the TRD and the flows were written in parallel and each kept its own question list. Those lists are retired; every question is mapped here to its canonical ID. Where an earlier document recommended differently, the reason for the canonical answer is in the OPEN item or the AD / DL line.

### PRD (former §7, OPEN-1 … OPEN-69)

| Former PRD ID | Topic | Canonical |
|---|---|---|
| PRD OPEN-1 | Site-question age limit | DL-01 |
| PRD OPEN-2 | Skip: reminders and Undo | DL-08 |
| PRD OPEN-3 | Today changes built inside the approved proposal (grok/184) | AD-38 (grey tag) · AD-52 (the rest) |
| PRD OPEN-4 | "As-needed doses are excluded" | DL-65 |
| PRD OPEN-5 | One meaning of streak and missed | DL-02, DL-03 (AD-07) |
| PRD OPEN-6 | Undo / Dose-log delete re-arms reminders | DL-09 |
| PRD OPEN-7 | Tracker visual and ring animations | AD-44 · AD-52 (gauge visual) |
| PRD OPEN-8 | Daily caps and late doses (A-35) | DL-67 |
| PRD OPEN-9 | Open site questions device-only | AD-34 |
| PRD OPEN-10 | Courses with a total number of doses | OPEN-03 |
| PRD OPEN-11 | Vial lifecycle holes (A-08 F5–F7) | DL-22 (1, 2, 4) · OPEN-01 (3) |
| PRD OPEN-12 | Editing a powder vial after creation | DL-15 (capacity) · OPEN-01 (mix date, window) |
| PRD OPEN-13 | Deliberate End + empty-vial prompt picture | AD-11 |
| PRD OPEN-14 | Oral supply warnings | OPEN-02 |
| PRD OPEN-15 | Free limit after a lapse; where enforced | DL-24 · OPEN-05 |
| PRD OPEN-16 | Half-filled wizard on a kill | AD-35 |
| PRD OPEN-17 | Protocols judgement calls (grok/199) | AD-52 |
| PRD OPEN-18 | Delete-a-dose layout | AD-52 |
| PRD OPEN-19 | iPhone reminders when never opened | OPEN-06 |
| PRD OPEN-20 | Persistent reminders copy | DL-48 |
| PRD OPEN-21 | "Not now" for notification permission | AD-27 |
| PRD OPEN-22 | One "blocked" rule | DL-45 |
| PRD OPEN-23 | Does finishing a check end the 20:00 question (A-24) | DL-51 |
| PRD OPEN-24 | "Not recorded" day | DL-66 |
| PRD OPEN-25 | Self-finishing check and Journey part 8 | OPEN-07 · AD-52 (judgement calls) |
| PRD OPEN-26 | Grace week | AD-14 |
| PRD OPEN-27 | Stop deletes measured history? | OPEN-08 |
| PRD OPEN-28 | Today wording when ready but locked / unsavable | DL-26 · OPEN-09 |
| PRD OPEN-29 | Measured burn hidden when inputs incomplete | AD-45 |
| PRD OPEN-30 | AI answer chips and meal slots | AD-53 |
| PRD OPEN-31 | "Earlier day" range | AD-54 |
| PRD OPEN-32 | Missed / skipped doses dip the curve | OPEN-11 |
| PRD OPEN-33 | Edited dose rewrites the past curve | OPEN-10 |
| PRD OPEN-34 | Fixed dose hours on the curve | DL-31 |
| PRD OPEN-35 | Enanthate / Nandrolone time-to-peak | DL-37 |
| PRD OPEN-36 | Future PK split | AD-47 |
| PRD OPEN-37 | Blend component lines | DL-32 |
| PRD OPEN-38 | Second curve default | DL-36 |
| PRD OPEN-39 | Manual lab entry | OPEN-12 |
| PRD OPEN-40 | Lab charts Premium or free | AD-24 |
| PRD OPEN-41 | Favourites and labels to synced tables | AD-02 |
| PRD OPEN-42 | Change a test's date | OPEN-14 (b) |
| PRD OPEN-43 | Show the scan budget | OPEN-14 (a) |
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
| PRD OPEN-54 | Apple delete: residual data on a second device | AD-04 |
| PRD OPEN-55 | A-116 scope | AD-31 |
| PRD OPEN-56 | Unsigned checklists and open deviations | AD-42 · AD-52 |
| PRD OPEN-57 | PT name of the Dose log | AD-59 |
| PRD OPEN-58 | Language-aware number parsing | DL-69 |
| PRD OPEN-59 | Minor confirmations (FX-11, pop-up style, A-33) | AD-60 |
| PRD OPEN-60 | Who users are pointed to | AD-61 |
| PRD OPEN-61 | iPad / supportsTablet | DL-70 |
| PRD OPEN-62 | Landscape everywhere | AD-62 |
| PRD OPEN-63 | Hard-coded Premium accounts | AD-58 |
| PRD OPEN-64 | Target ETA staleness, body-fat targets | DL-68 |
| PRD OPEN-65 | Existing false Missed rows | DL-71 |
| PRD OPEN-66 | My Body small differences | AD-52 |
| PRD OPEN-67 | Scan numbers in My Body copy | AD-56 |
| PRD OPEN-68 | Purging soft-deleted protocols again (A-84) | OPEN-04 |
| PRD OPEN-69 | Edit "What you track" | DL-58 |

### TRD §9.1 (nine questions)

| TRD Q | Topic | Canonical |
|---|---|---|
| 1 | Deletes across devices: server tombstones (R-01) | DL-72 (the migration itself needs the founder's go) |
| 2 | No-time and fewer-times protocols (R-03) | DL-06 |
| 3 | Courses: keep with a UI, or retire (R-03 / BR-12) | OPEN-03 |
| 4 | Report streak / adherence = Today; lift the 31-day cap (R-09) | DL-02, DL-03 |
| 5 | Skip stops reminders + Undo (R-17) | DL-08 |
| 6 | Server enforcement of food access and the 3-protocol limit (R-16) | AD-16 (food) · OPEN-05 (limit) |
| 7 | iPhone reminders without opening the app (R-15) | OPEN-06 |
| 8 | Recon vial edit / manual new vial (R-13, A-08); oral low supply (R-42) | OPEN-01 · DL-22 · OPEN-02 |
| 9 | Lab charts Premium; manual lab entry (R-21) | AD-24 · OPEN-12 |

### Flows (README round of 36, plus one question asked only in a flow)

| Flows # | Topic | Flow | Canonical |
|---|---|---|---|
| 1 | AI consent per device or per account | 01, 11, 12 | DL-55 (server proof: AD-51) |
| 2 | OS prompt after "Not now" | 01, 06 | AD-27 |
| 3 | Year-only 18+ test | 01 | AD-43 |
| 4 | Doses already taken from this vial | 02, 04 | OPEN-01 |
| 5 | Half-filled protocol after a kill | 02 | AD-35 |
| 6 | Recon dose changed mid-vial | 02, 04 | DL-15 |
| 7 | Lapsed Premium with more than 3 active | 02, 13 | DL-24 |
| 8 | Skip cancels reminders + Undo bar | 03 | DL-08 (cancel yes, no Undo bar) |
| 9 | "All caught up" with a skip | 03 | DL-12 |
| 10 | Grey "reminder" tag before Due | 03 | AD-38 |
| 11 | Tracker streak cap; report streak rule | 03, 12 | DL-03, DL-02 |
| 12 | Manual recon New vial; rtu New vial as a new row | 04 | DL-22 |
| 13 | Oral bottles: low rule, interval-aware days | 04 | OPEN-02 (days left: DV-020 bug) |
| 14 | Pictures: End protocol; "Protocol finished" with Later | 04, 05 | AD-11 |
| 15 | Days-left colour above 7 days | 04 | DL-16 |
| 16 | Course total reached | 05 | OPEN-03 |
| 17 | Resume the 7-day purge for 1.3.0+ deletes | 05 | OPEN-04 |
| 18 | iPhone users who never open the app | 06 | OPEN-06 |
| 19 | Settings "blocked" neutral when reminders are off | 06 | DL-45 |
| 20 | Persistent reminders copy | 06 | DL-48 |
| 21 | Drop the "not recorded" mark | 07 | DL-66 |
| 22 | Stop keeps or deletes results | 08 | OPEN-08 |
| 23 | One start weight | 08 | OPEN-07 |
| 24 | Confirm the self-finishing check | 08 | OPEN-07 |
| 25 | Today lines for locked / unsavable results | 08 | DL-26 · OPEN-09 |
| 26 | Lower date bound for a past weigh-in | 09 | DL-73 |
| 27 | Curve dose times vs the fixed grid | 10 | DL-31 |
| 28 | Dose edits forward only; count only logged doses | 10 | OPEN-10 · OPEN-11 |
| 29 | Blend lines solid past | 10 | DL-32 |
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
| AD-04 | When the server confirms the account was deleted or the session revoked, scheduled reminders are cancelled; a network failure never cancels anything. | decisions.md:599 (2026-10-07) | DV-009 |
| AD-05 | A real sign-out clears unsaved drafts. | decisions.md:378 (BK-14) | DV-081 |
| AD-06 | Rings: a late dose matches its own slot within ± half the interval; an extra log never adds. | decisions.md:144 (2026-09-29) | DV-030 |
| AD-07 | A streak counts doses in a row, never days (founder 2026-10-05). Added to decisions.md on 2026-10-12 (it was missing). | lib/doseStreak.js:2; TodayScreen.js:610; commit b215b32 | DV-032, DV-180 |
| AD-08 | An alert that names one protocol opens that protocol. | decisions.md:146 (2026-09-29) | DV-089 |
| AD-09 | Copy must be true: the delete sheet does not promise "7 days" and says the doses leave the Dose log while deleted; the history question names the compound; Restart with the same container moves it unchanged. | decisions.md:544 (2026-10-04); decisions.md:614 | DV-023, DV-024, DV-091 |
| AD-10 | The "Same dose?" answer can be corrected: asked again when an edit moves the start earlier; "Yes" clears `history_from`. | decisions.md:543 (2026-10-04) | DV-091 |
| AD-11 | dt-council 2026-10-04 items targeted 1.3.0: A-85 (End + vial prompt with "Later", picture first), A-86b, A-87b, A-90, A-96 (pictures first), A-98. | features.md:224–239; decisions.md:533–558 | DV-021, DV-025, DV-090, DV-096, DV-105 |
| AD-12 | A-118: every reality-check message follows the check's real state, never the date alone. | features.md:258 (founder 2026-10-09) | DV-056, DV-057 |
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
| AD-26 | One "Vial alerts" switch covers low supply and expiry. | features.md A-45 | DV-140 |
| AD-27 | Someone who said "Not now" to notifications is not asked for more. | decisions.md:623 (2026-10-07 evening) | DV-054 |
| AD-28 | The in-app privacy policy (×6) has the same content as the website. | features.md:257 (A-117) | DV-085 |
| AD-29 | The 18+ and profile gates can be answered offline (saved later) and offer "Sign out anyway". | decisions.md:542 (A-94) | DV-114 |
| AD-30 | "Continue with Apple" also on Android; the server setup steps are the founder's. | decisions.md:483 ("3 sim"); premium-and-auth.md manual setup | DV-115 |
| AD-31 | A-116 (Fold: every tap and notification on the right page) waits for the PRD / TRD / flows, then resumes for 1.3.0 ("Vamos resolver tudo. Sem pendência" — no production submit while an item is open). | decisions.md:639 (2026-10-12); decisions.md:634 (2026-10-07) | DV-117 |
| AD-32 | Concurrent multi-device use is not a real use case (A-48 parked). | decisions.md:199 | DV-041 |
| AD-33 | The remembered curve view is device-local and not synced. | decisions.md:208, :380 | DV-159 |
| AD-34 | Open site questions stay on the device only, kept until answered. | decisions.md:379 | DV-137 |
| AD-35 | Unsaved drafts are kept until saved or the app closes (BK-14); the assistant's conversation lost on a kill is accepted (AP-33). | decisions.md:378; ai-protocol-assistant.md AP-33 | DV-127 |
| AD-36 | If RevenueCat is unreachable the server applies the Premium scan cap. | decisions.md:275 | DV-165 |
| AD-37 | Server push stays OFF; send-reminders is activated only after A-62. | decisions.md:350, :589 | DV-145 |
| AD-38 | Today tags: only "Due". | decisions.md:133 | DV-131 |
| AD-39 | "Taken" became "Complete" in counts and labels. | decisions.md:99 | DV-179 (BK-16) |
| AD-40 | Free plan: 3 active protocols. | decisions.md:465 ("3 mantém") | DV-181 (comment), OPEN-05 |
| AD-41 | Theme tokens only; hard-coded colours only on fixed surfaces. | decisions.md:41 | DV-170 |
| AD-42 | Done = the signed checklist with evidence; spec-audit passes; full-functionality pass before every build. | CLAUDE.md; decisions.md:339–340 | DV-118 |
| AD-43 | The 18+ test uses the birth year only (counsel flag stands). | premium-and-auth.md:133; decisions.md:388 | DV-168 |
| AD-44 | Motion: count-ups only when values change; keep the caught-up card and the day-complete pulse. | decisions.md:57, :164 | DV-132 |
| AD-45 | The daily burn shows only with weight + height + age + sex. | progress-one-card.md PO-12 | DV-149 |
| AD-46 | `ai_assistant_usage` is named in delete-user (privacy by logic, recorded). | decisions.md:545 | DV-011 |
| AD-47 | Dose accumulation stays Premium; a future free/Premium PK split is not scheduled. | decisions.md:279, :292 | (05:G13 context) |
| AD-48 | The vial-finished prompt follows the write on every injectable take path. | decisions.md:152–153 (S-25); fixes-1.2.5.md FX-22 | DV-038 |
| AD-49 | iOS and Play have a configured 7-day trial; a trial is claimed only when the store says the person is eligible. | decisions.md:451, :478; premium-and-auth.md PA-9 | DV-126 |
| AD-50 | The automatic purge stays paused in 1.3.0 (A-84, revisit after). | decisions.md:506 | DV-125 (OPEN-04 decides the "after") |
| AD-51 | Counsel items stay with counsel: server proof of consent (A-95), GDPR Art. 9 wording, the Anthropic DPA, the crisis-resource policy, default-on analytics under ePrivacy. | decisions.md:388, :570; features.md A-95 | DV-007, DV-167, DV-168 |
| AD-52 | Builder judgement calls and small differences from an approved picture are not founder questions: they go on the one deviation list he eyeballs on the test build and signs before the store build (A-97). Carried there: the Today items built inside the approved Today proposal (alert "Remove" gone, snooze "Tomorrow / In 3 days", no "Add site" on the toast, the "Injection site" title in the Dose-log editor, dose-notes explainer hidden, notification snoozes "In 1 hour / Tomorrow"); the tracker gauge visual; the delete-a-dose layout A; the Protocols judgement calls of grok/199; the Journey part 8 judgement calls of grok/205; the My Body small differences (warning triangle, no icon on "imported", 22 pt preview title); the unsigned checklists (fold-right-page, premium-and-auth, admin-panel). | decisions.md:554 (2026-10-04 "Open deviations: the founder eyeballs them on the test build and signs one list"); decisions.md:142 (Today proposal approved as shown) | DV-118 |
| AD-53 | AI-suggested short answer chips (≤ 40 characters) in food follow-ups are allowed and there are no strict meal slots; STATE.md's "pending" line is stale. | decisions.md:319, :245; food-log.md FL-16, FL-4 (signed 2026-09-27) | — |
| AD-54 | "Earlier day" in Fix this entry covers 2–7 days back. | decisions.md:244 (food is logged up to 7 days back, FL-2); Today = 0, Yesterday = 1 | — |
| AD-55 | Lab values never show a reference range, band, colour or verdict; the unused live columns `biomarkers.reference_min/max/status` are never written. | decisions.md:266; CLAUDE.md AI hard line | DV-119 |
| AD-56 | My Body's scan line shows each plan's real number (3 free / 20 Premium); this later line replaces S-24's "no number for Premium" on that screen. | decisions.md:544 (2026-10-04) over decisions.md:104 (2026-10-01) | — |
| AD-57 | Analytics wording becomes "not linked to your account" (the install id is pseudonymous), with the web + in-app policy rewrite and the Apple / Play labels (Device ID + Product interaction, not linked) in the store build. | decisions.md:570 (2026-10-05) | DV-190 |
| AD-58 | The founder's own extra accounts keep Premium through `DEVELOPER_EMAILS`; Test03 gets Premium only through a temporary RevenueCat promo. No move to promotional grants is scheduled. | decisions.md:290 | — |
| AD-59 | The PT name of the Dose log is "Histórico" (the grok/227 question "PT 'Registro'" was answered by the 2026-10-03 "Aprovado / Siga" block, grok/228). | decisions.md:88, Conflict 27; grok/227, grok/228 | DV-193 |
| AD-60 | Already in the ledger: the supply push fires at 3 doses left (one rule, decisions.md:148); the vial-finished pop-up style is the approved Today proposal's (decisions.md:142); the A-33 energy test is closed by the fully-green-suite rule (decisions.md:341). | decisions.md:142, :148, :341 | — |
| AD-61 | Users are pointed to "a health professional"; gym body-composition scans are a measurement source, not advice. | decisions.md:316, :458 | — |
| AD-62 | Landscape stays on every screen (content in a centred column); no portrait revert. | decisions.md:77 (founder 2026-09-11 "do it correctly, take your time") | — |
| AD-63 | `parse-food-next` is removed from production (founder "2 sim" 2026-10-03, RL-1). | decisions.md:513 | DV-188 |
| AD-64 | Honest paywall: only real Premium features; the reality check is sold as "reality-check results", never "progress tracking" (weigh-ins, their chart and Progress are free). | decisions.md:283, :107, :229 | DV-186 |

## Decided by logic — no question to the founder

One line of reason each. The founder may override any line.

| ID | Decision | Reason | Rows |
|---|---|---|---|
| DL-01 | Site questions are never dropped for their age (code as built); decisions.md:459 and the FX-25 evidence are corrected. | The founder's S-25 line says open site questions are "kept until answered" (decisions.md:379, grok/145); the later 2026-10-03 "let go after 7 days" line (decisions.md:459) was a by-logic reading of FX-25, and "never lose user-entered data" outranks it. | DV-175 |
| DL-02 | The report's streak uses `doseStreak` and its adherence uses the rings' slots; the week circles' "missed" and the report's Missed rows are labelled by what each counts. | One concept, one number: the report goes to a provider and must match what the user sees (AD-07). | DV-032, DV-033 |
| DL-03 | The Today tracker streak follows the same rule (doses in a row over due days) and looks back 365 days (no 31-day cap). | AD-07 is about the word "streak", not one card; the founder gave the protocol streak a year "so a weekly protocol keeps counting", and the same reason applies to the overall streak. | DV-034 |
| DL-04 | One "due today" owner for header, card, ring and streak. | Today counts doses (2026-07-23); three answers on one screen is the A-118 class of bug. | DV-029 |
| DL-05 | The Missed scan covers ended protocols up to their end. | Ended protocols keep their history (A-83); rings already count them. | DV-031 |
| DL-06 | Protocols with no or fewer reminder times use one slot list everywhere (the same default the form writes). | The user already receives the 08:00 reminder; every other surface must agree with what the phone does. | DV-028 |
| DL-07 | A legacy protocol without a start date is anchored on its creation day everywhere. | Reminders and Today must count the same days. | DV-014 |
| DL-08 | Skip cancels that slot's reminders; no Undo bar for Skip. | A reminder for a dose the user declared skipped is noise; a skip is already recoverable ("you can still log it", Dose log delete). | DV-035, DV-130 |
| DL-09 | Undo and the Dose-log delete re-arm the slot's future reminders. | Reminder principle 2026-10-07: a dose still owed must still be reminded. | DV-040 |
| DL-10 | A reminder tap acts on the reminder's own slot and cancels what the button would cancel. | Two entry points for the same notification must do the same thing. | DV-036 |
| DL-11 | "Tomorrow" / "Next 5 days" count doses, not protocols. | Today counts doses, not protocols (2026-07-23). | DV-037 |
| DL-12 | "All caught up" shows when no open slot remains (a skip counts as handled); the skipped line stays visible (picture first). | The card exists to say nothing is left to act on. | DV-129 |
| DL-13 | One display name per protocol everywhere (translated compound, blend label), and notifications are re-planned on a language change. | One term per concept; the app language rules every surface. | DV-013, DV-050 |
| DL-14 | Never two active vials per protocol. | S-20 rule "never two active vials"; screens already assume it. | DV-016 |
| DL-15 | A dose edit recomputes the recon vial's capacity from the mass left. | One capacity rule (FX-11); the vial's real content does not change with the dose. | DV-015 |
| DL-16 | One days-left function and one colouring (the Protocols style). | Q9 = B colours by deadline; the same number must read the same everywhere. | DV-018 |
| DL-17 | "Vial age" sort = days left. | The sort exists to put the vial closest to expiry first. | DV-122 |
| DL-18 | Mix dates: an impossible date is refused, never silently changed; at most 365 days back. | Honest journal: never store a date the user did not type. | DV-019 |
| DL-19 | Custom interval 1–365 days in the form and the assistant. | The longest ester in the catalogue is ~12 weeks; one bound everywhere. | DV-123 |
| DL-20 | Restore reopens a vial only if it was not finished by doses and is not a tombstone. | An empty vial cannot be in use. | DV-022 |
| DL-21 | "Still going?" and its end date use logged Taken doses only. | Declared history never counts as logged (A-30 option C). | DV-026 |
| DL-22 | An empty rtu vial can be replaced; an rtu new vial asks for the new box date; recon gets "New vial" on the protocol page (picture first). | F-035's New vial exists to start a fresh container; a new box has a new printed date; "Past window" must offer a next step. | DV-027, DV-093 |
| DL-23 | Today's empty-state "Add a protocol" opens the wizard. | The button says Add. | DV-124 |
| DL-24 | A lapsed Premium user keeps all active protocols. | Ending them would stop their reminders (principle 2026-10-07) and hold data hostage (A-89 spirit). | DV-095 |
| DL-25 | One reality-check assembler (`readCheckNow`) for Today, the food card, Progress and the schedulers; Progress listens to sync; the day-21 reminder is re-planned on a weigh-in. | A-118 showed what happens when each screen assembles the state itself. | DV-059 |
| DL-26 | Today says what Progress will actually show (no "ready" when there is no result to see). | Same rule as A-118: follow the real state. | DV-058 |
| DL-27 | One weigh-in validation (25–300 kg, 3–70 %, 30–250 cm) on every entry path. | PO-21 limits exist for the same data from another door. | DV-065 |
| DL-28 | A quota refusal on an offline re-parse marks the row, explains, keeps the text and retries after local midnight. | FL-20 behaviour applies to retries; nothing stuck forever. | DV-066 |
| DL-29 | `calc_inputs` is merged per key on push. | `mergeCalcInputs` already exists locally; never-lose-data. | DV-010 |
| DL-30 | Each "days" count on Progress is labelled by what it counts (picture first). | Three correct numbers that look contradictory are a bug. | DV-146 |
| DL-31 | The curve places doses at the user's own times (fixed hours only without times); pharmacometrician check. | "Planned schedule" (FX-13) includes the time the user planned. | DV-069 |
| DL-32 | Blend lines stay like any compound (solid past, dashed future, "(est.)"); decisions.md:205 annotated. | The later approval (2026-09-29, decisions.md:209; prototype binding 2026-10-01) wins over 2026-09-24. | DV-156 |
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
| DL-45 | Settings "blocked" uses the same order as Today (Silent, off, nothing needed first); Today's blocked card excludes Silent. | One concept, one rule; BR-4 says Silent is never "blocked". | DV-042 |
| DL-46 | Reminders read "OK" only when every timed protocol due in the window has its reminders; the setup bar shows "None scheduled". | "All set" must be true. | DV-043, DV-044 |
| DL-47 | Refresh health is honest: never-ran warns after 2 days; OK only when reminders were rebuilt; the count is kept. | A-110 exists to catch the silent failure. | DV-045, DV-046 |
| DL-48 | The persistent-reminders text describes the two repeats (+5, +10). | Copy must be true; no new behaviour without approval. | DV-049 |
| DL-49 | The Reminder check covers the channel of every reminder kind the user has switched on (picture first). | Its purpose: "a reminder that never arrives is invisible" — the food question included. | DV-098 |
| DL-50 | The Android setup step still shows after a denied permission dialog; SP-4 wording amended. | The step's first row shows the block with its fix — the app keeps reminding until items are OK. | DV-142 |
| DL-51 | A-24 is closed: the 8 PM question follows the open check, and a check cannot be saved early any more. | The self-finishing check removed the case. | DV-144 |
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
| DL-66 | The `not_recorded` marker is retired (legacy rows still read); FL-3 amended. | FL-47's "Just close the day" is today's way to break a run on purpose. | DV-151 |
| DL-67 | One daily cap on every path = the doses expected that day (Today, notification action, Dose log); a snoozed dose tapped after slot + 12 h is logged as today. | One owner for "due today" (DL-04); A-40 defines "yesterday" only inside slot + 12 h, and S-25 makes the dose time the tap time outside it. | DV-029 |
| DL-68 | The target ETA has no extra staleness cutoff: it always names the weigh-in window it is computed from; body-fat-only targets are supported. | The ETA was approved "labelled with its weigh-in window" and the target as "weight and/or body-fat" (decisions.md:241): an old window is shown, never hidden or guessed. | — |
| DL-69 | Typed numbers are parsed in the app language (pt/es/fr/de/it: comma = decimal, "5.000" = 5000; English as in CLAUDE.md), via `parseDecimal(text, language)`. | The founder approved displaying numbers in the app language (decisions.md:92) and prefilled fields must round-trip; a field that shows "86,0" must read "86,0" back. | — |
| DL-70 | iPad stays off (`supportsTablet: false`) for 1.3.0; enabling it is a registry item for a later build. | 1.3.0's scope is closed (evolution rule 2); iPad was never approved, and the foldable book layout is the approved large-screen work. | — |
| DL-71 | Existing false Missed rows of real users are not migrated away; users can correct or delete them in the Dose log; Test03's rows stay untouched. | They cannot be told apart from real misses safely — never destroy on a maybe (CLAUDE.md); decisions.md:197, :387. | — |
| DL-72 | A delete reaches every device: every synced table gets a positive tombstone instead of a cloud hard DELETE (TR-SYNC-2). The production migration still needs the founder's go, as every migration does. | Every delete is a deliberate user act (AD-01) and a deleted dose that still counts on another phone is a wrong health record; the founder already chose positive tombstones for protocols (decisions.md:519-531). | DV-182 |
| DL-73 | "+ Add a past weigh-in" accepts any past date back to the profile's birth year, never a future date. | Past weigh-ins were approved with no limit (decisions.md:241) and serve history before install; only an impossible date is refused (same rule as mix dates, DL-18). | DV-194 |
| DL-74 | Dose counters sync as events and pushes carry only the fields changed since the last sync (TR-SYNC-3). | Never lose user-entered data: a whole-row push from a stale copy reverts another device's edit, and two offline doses must count as two. | DV-183 |

---

## Versão em português — para mandar ao fundador numa rodada só

Cobre o PRD, o TRD e os fluxos desenhados (uma rodada só, como manda o CLAUDE.md).

> Oi! Terminei o levantamento completo do app para o PRD, o TRD e os 14 fluxos desenhados (8 áreas, 195 pontos registrados). Antes de te perguntar qualquer coisa, conferi tudo contra as suas decisões anteriores e a lógica do produto:
> - **64 pontos** já estavam respondidos por você (no registro de decisões ou num checklist assinado) — eu só aplico.
> - **74 pontos** se resolvem pela lógica do produto (por exemplo: "nunca perder dado do usuário", "um termo por conceito", "lembrete até a pessoa apagar o protocolo", "na página da direita do Fold só se acrescenta, nunca se repete"). Deixei cada um registrado em uma linha, com o motivo, no `docs/decisions.md` — se discordar de algum, é só dizer que eu mudo.
> - Sobraram **15 perguntas** que só você pode responder, porque são de gosto, dinheiro, risco ou escopo.
>
> Para cada pergunta deixo o contexto, as opções e a minha recomendação. Se concordar com tudo, basta responder **"siga as recomendações"**. Se quiser mudar alguma, mande só o número e a letra (ex.: "3 C, 7 A"). Nada disso entra em código antes da sua resposta.
>
> **Protocolos e estoque**
>
> **1. Corrigir o frasco que está em uso.**
> *Contexto:* a data em que a pessoa misturou o frasco e a validade dele (30 dias, por padrão) são digitadas uma vez só e depois não dá mais para corrigir. E todo protocolo novo começa o frasco com zero doses usadas, mesmo quando a pessoa já está no meio dele. Um erro de digitação ou um frasco pela metade deixa errados o "faltam X doses", o "vence em X dias", a etiqueta "Fora da validade" e o alerta de estoque — até o frasco acabar.
> *Opções:* **A)** botão "Editar frasco" na página do protocolo, para corrigir a data da mistura, a validade e as doses já usadas (te mostro o desenho antes). **B)** só perguntar "quantas doses você já usou deste frasco?" quando o protocolo ou o frasco começa no passado — resolve o caso mais comum, mas não corrige erro de digitação. **C)** deixar como está.
> *Recomendação:* **A** — os alertas do próprio app saem desses números; o que a pessoa informa tem que poder ser corrigido num lugar só.
>
> **2. Aviso de estoque baixo para cápsulas, comprimidos e pó.**
> *Contexto:* o aviso de "acabando" (faltam de 1 a 3 doses) existe só para frascos injetáveis — no alerta de Hoje, na notificação e no selo da tela Protocolos. Um pote de cápsulas pode acabar sem nenhum aviso. (A conta de "dias de estoque" dos potes tomados em dias alternados também está errada; isso é bug e eu corrijo de qualquer jeito.)
> *Opções:* **A)** a mesma regra dos frascos para os potes: alerta em Hoje, notificação e selo. **B)** só uma linha âmbar no card ("faltam N porções"), sem alerta nem notificação. **C)** deixar como está.
> *Recomendação:* **A** — uma regra só para o mesmo conceito; ficar sem o suplemento importa tanto quanto ficar sem o frasco.
>
> **3. O que acontece quando termina um ciclo com número fixo de doses.**
> *Contexto:* você aprovou em 07/10 que protocolos com total de doses param os lembretes quando o ciclo termina. Só que o formulário não deixa mais ninguém definir esse total — só protocolos antigos têm. Nesses, o lembrete para, mas Hoje continua pedindo a dose, mostra "Dia 12 de 12" para sempre e vai acumulando doses "perdidas" até aparecer o "Ainda em andamento?".
> *Opções:* **A)** no fim do ciclo o protocolo é encerrado sozinho, sem perguntar (quem continua além do previsto perde os lembretes sem aviso). **B)** no fim do ciclo o app para de esperar doses em todo lugar (como os lembretes) e Hoje pergunta: "Ciclo concluído — encerrar {nome}?" com Encerrar / Continuar (Continuar tira o total). **C)** ignorar o total em todo lugar e manter os lembretes (vai contra o que você aprovou em 07/10).
> E uma pergunta junto: quer o campo "total de doses" de volta no formulário? **Sim / Não.**
> *Recomendação:* **B, sem trazer o campo de volta por enquanto** — pergunta antes de encerrar, igual ao "Ainda em andamento?", e respeita a sua regra de lembrar até a pessoa encerrar.
>
> **4. "Excluídos recentemente" deve voltar a se esvaziar sozinho?**
> *Contexto:* a limpeza automática depois de 7 dias está pausada na 1.3.0 por segurança: os protocolos apagados pelo antigo botão "Sim, terminou" não dá para diferenciar das exclusões de propósito, e a limpeza levaria junto o histórico de doses deles. Já existe "Excluir para sempre" com seleção múltipla.
> *Opções:* **A)** nunca limpar sozinho: o protocolo fica lá até a pessoa excluir para sempre (e o aviso de exclusão diz exatamente isso). **B)** voltar a limpar depois de 7 dias só o que for excluído a partir da 1.3.0 (dá para marcar). **C)** voltar a limpar tudo, depois de tirar as doses da exclusão em cascata na nuvem — a mudança maior e mais arriscada.
> *Recomendação:* **A** — com "Excluir para sempre" já pronto, a limpeza automática só traz risco e nenhum ganho para a pessoa; o espaço ocupado é desprezível.
>
> **5. Conferir no servidor o limite de 3 protocolos do plano grátis?**
> *Contexto:* hoje o limite é conferido só no celular. Com dois aparelhos ou uma versão antiga do app dá para passar de 3. (Quem deixa de pagar o Premium continua com todos os protocolos ativos — senão os lembretes parariam; isso já decidi pela lógica.)
> *Opções:* **A)** continuar conferindo só no celular. **B)** o servidor recusa o 4º protocolo — mas, como o app funciona offline, a recusa chegaria depois, com o protocolo já criado no celular, e um registro de saúde ficaria no limbo. **C)** B + uma regra de rebaixamento para quem deixou de pagar.
> *Recomendação:* **A** — não há necessidade de receita agora, e o risco de perder um registro de saúde não compensa um desvio raro.
>
> **Lembretes**
>
> **6. Lembretes no iPhone de quem para de abrir o app.**
> *Contexto:* seu princípio (07/10) é que o app avisa enquanto a pessoa estiver tomando, abrindo o app ou não. No Android isso já está resolvido (renovação em segundo plano, despertar diário e reconstrução depois de atualização ou reinício). No iPhone os lembretes ficam agendados por no máximo 10 dias (limite de 64 notificações da Apple) e depois simplesmente param, sem nenhum aviso.
> *Opções:* **A)** manter o agendamento no celular, mas a última notificação do período vira o aviso "Abra o DoseTrace para continuar recebendo seus lembretes", e Hoje avisa quando o período estiver acabando. **B)** notificações enviadas pelo servidor para o iPhone — é a única garantia de verdade, mas é um projeto grande e com custo mensal (precisa ter tudo o que os lembretes do celular têm: modo silencioso, esconder nomes, botões, repetições). **C)** atualização em segundo plano do iOS — o iPhone roda quando quer e nunca depois que a pessoa fecha o app à força; sem garantia. **D)** não mudar.
> *Recomendação:* **A agora e B como projeto próprio logo em seguida** — A fecha a falha silenciosa gastando pouco; B é a garantia de verdade e merece a própria especificação.
>
> **Diário alimentar com IA, "Seus números reais" e Progresso**
>
> **7. "Seus números reais": fechar sozinho e um peso só no início.**
> *Contexto:* em 29/09 ficou combinado: sem campo de peso próprio (a checagem usa as pesagens) e botões de resultado a partir do dia 14. O que foi construído: uma tela de início com campo de peso próprio, sem botões, e a checagem fecha sozinha na primeira pesagem a partir do dia 21, quando há 7 dias seguidos de comida registrada (ou calorias digitadas). Os textos que você aprovou em 09/10 já partem desse fechamento automático, mas o seu OK explícito para ele nunca foi registrado. Hoje o peso do início pode ser diferente da pesagem daquele dia — e aí a conta e o gráfico usam pesos diferentes.
> *Opções:* **A)** como está (peso próprio, fecha sozinho; os dois pesos continuam possíveis). **B)** voltar ao combinado de 29/09 (sem peso próprio, botões a partir do dia 14) — exige refazer, e resultados com menos de 14 dias são menos precisos. **C)** fecha sozinho como está, mas o peso do início É a pesagem daquele dia (digitar outro número atualiza a pesagem, com confirmação, igual em "Seus números").
> *Recomendação:* **C** — mantém o fluxo que você já vem testando e cada peso passa a ter um lugar só.
>
> **8. "Parar" apaga os resultados anteriores?**
> *Contexto:* hoje, ao parar a checagem em andamento, o app apaga TODOS os resultados já medidos e o gasto diário volta a aparecer como "Estimado". A sua decisão falava só em encerrar a checagem aberta, cancelar os lembretes e manter a comida registrada — não falava dos resultados antigos.
> *Opções:* **A)** "Parar" encerra só a checagem atual; os resultados antigos ficam. **B)** como está (apaga tudo; o texto de confirmação já avisa). **C)** A + um botão separado "Apagar meus resultados", que pergunta antes.
> *Recomendação:* **A** (ou **C**, se quiser dar o jeito de apagar) — nunca destruir dado por tabela; um resultado medido é dado da pessoa.
>
> **9. Quando a conta não gera um número.**
> *Contexto:* com a pesagem e os 7 dias de comida completos, às vezes a conta dá: "manutenção" (o peso mudou menos de 0,2 kg — a pessoa está comendo exatamente o que gasta), "improvável" (fora de 1.000 a 5.000 kcal) ou "curto demais" (menos de 14 dias, ou média zero). Hoje só o resultado normal é salvo: nesses três casos a checagem nunca termina, a pergunta das 20h continua chegando e Hoje fica dizendo "pronto — toque para ver" sem ter nada para ver.
> *Opções:* **A)** salvar "manutenção" como resultado de verdade (gasto diário = média ingerida); nos outros dois casos, mostrar o motivo e encerrar a checagem depois que a pessoa vir, oferecendo recomeçar. **B)** manter a checagem aberta, mas parar a pergunta das 20h e mostrar o motivo em Hoje e em Progresso. **C)** como está.
> *Recomendação:* **A** — peso parado comendo X kcal é justamente a medida da manutenção, e uma checagem que nunca termina quebra o hábito diário. Como muda um número de saúde exibido, a revisão da conta de energia roda antes do build.
>
> **Curva de acúmulo**
>
> **10. Mudar a dose reescreve o passado da curva?**
> *Contexto:* hoje a curva aplica a dose atual (e o intervalo, a data de início e as doses por dia) a todas as doses passadas. Baixou de 250 para 125 mg? Meses de histórico são redesenhados em 125 mg — inclusive a "estimativa numa data" ao lado de exames antigos. Está em aberto desde 13/09.
> *Opções:* **A)** como está, com um aviso na curva quando o protocolo foi editado ("usa a dose atual para as datas passadas"). **B)** guardar o histórico das mudanças com a data em que cada uma passou a valer; o passado usa os valores antigos (muda o modelo de dados sincronizado e passa por revisão farmacológica). **C)** editar a dose encerra o ciclo antigo e começa um novo (pesado para a pessoa e divide o histórico).
> *Recomendação:* **B** (e **A** como solução provisória se B não ficar bom a tempo do build) — um diário honesto mostra o que estava planejado em cada época, e a edição já grava só o que mudou.
>
> **11. Doses puladas ou perdidas devem baixar a curva?**
> *Contexto:* a curva segue o planejado — o aviso na tela já diz isso — e por isso as doses puladas e perdidas continuam contando. Contar só as tomadas é uma mudança de modelo que precisa de revisão farmacológica (decisão de 24/09).
> *Opções:* **A)** como está. **B)** para o passado (depois que o protocolo foi criado), usar o registro de doses — só as tomadas; o histórico informado antes da criação e o futuro seguem o planejado. **C)** curva planejada, mas as doses puladas ou perdidas aparecem marcadas de outro jeito (vazadas), sem mudar o número.
> *Recomendação:* **B depois da revisão farmacológica, e C até lá** — o registro da própria pessoa é a fonte honesta do passado, e a curva é o carro-chefe do app.
>
> **Meu corpo**
>
> **12. Digitar exames à mão: fazer agora ou adiar?**
> *Contexto:* foi aprovado ("o diário de exames digitado à mão é grátis", 30/09), a animação explicativa aprovada diz "digite os valores de qualquer exame" e a mensagem de limite de leituras diz "você ainda pode digitar tudo à mão" — mas essa tela nunca foi construída. Hoje o único jeito de registrar um exame é a leitura por IA (3 grátis por mês). Pela regra "aprovado → próximo build", só você pode adiar.
> *Opções:* **A)** construir "Adicionar valores à mão" na 1.3.0 (data, marcador, valor, unidade; desenho antes). **B)** adiar para o build seguinte e corrigir já os textos que prometem. **C)** desistir e corrigir os textos.
> *Recomendação:* **A** — está aprovado, os textos já prometem, e é o único caminho do plano grátis depois das 3 leituras do mês.
>
> **13. O alerta "Exame de sangue pendente".**
> *Contexto:* quando o último exame tem mais de 6 meses, Hoje mostra "Exame de sangue pendente · Já se passaram N meses desde seu último exame". Os 6 meses foram escolhidos pelo app, não pela pessoa, e nenhuma decisão cobre isso — é um calendário que ela não definiu, perto da linha de "nunca orientar".
> *Opções:* **A)** manter. **B)** mesmo gatilho, texto só de fato: "Seu último exame foi há N meses" (sem "pendente"). **C)** a pessoa define o próprio intervalo (ou nenhum) em Meu corpo; nenhum por padrão. **D)** remover o alerta.
> *Recomendação:* **B** — mantém o lembrete útil sem o app decidir o que está "pendente"; o revisor regulatório confere a frase.
>
> **14. Duas melhorias pequenas no Meu corpo** (não aprovadas em lugar nenhum):
> *Contexto:* (a) a pessoa só descobre o limite mensal de leituras quando uma é recusada; (b) quando a IA lê a data do exame invertida (dia/mês × mês/dia), hoje é preciso corrigir valor por valor.
> *Opções, para cada uma:* (a) mostrar "N de 3 leituras usadas este mês" perto do botão de enviar; (b) "Mudar a data deste exame", que move todos os valores de uma vez — **sim na 1.3.0 / sim no build seguinte / não**.
> *Recomendação:* **as duas sim, no build seguinte** — nenhuma está no escopo da 1.3.0 e as duas tiram um incômodo real.
>
> **Conta e Premium**
>
> **15. Gerenciar a assinatura pelos Ajustes.**
> *Contexto:* "Restaurar compras" só existe na tela de assinatura, e quem já é Premium é mandado embora dela; os Ajustes só mostram Premium/Grátis (sem fim do teste grátis, sem problema de cobrança). Quem paga e reinstala o app não acha onde restaurar.
> *Opções:* **A)** linhas "Gerenciar assinatura" (abre a página da loja) e "Restaurar compras" para todos, mais o status (teste grátis até…, renova em…) quando a loja informar. **B)** só "Restaurar compras". **C)** deixar como está.
> *Recomendação:* **A** — as lojas esperam que restaurar seja fácil de achar e que cancelar esteja ao alcance. (À parte, pela lógica, a tela de excluir conta vai avisar que a assinatura da loja continua cobrando até ser cancelada lá.)
>
> **Para você saber (já decidido pela lógica, sem precisar responder):** exclusões passam a chegar a todos os aparelhos (hoje uma dose apagada no celular continua contando no Fold); duas doses registradas offline em dois aparelhos passam a contar como duas; a sequência ("streak") conta doses seguidas em todo lugar, inclusive no relatório para o profissional de saúde; "Pular" cancela os lembretes daquela dose. As duas mudanças no servidor que isso exige (marcas de exclusão em todas as tabelas e o carimbo de atualização em "Seus números reais") só são aplicadas com o seu "pode aplicar", como sempre.
>
> É isso. Assim que você responder, registro tudo nas decisões no mesmo dia e sigo.
