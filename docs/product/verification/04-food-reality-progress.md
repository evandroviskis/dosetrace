# Independent verification: AI food log, reality check ("Seus números reais"), Progress / Your numbers, weigh-ins

- Verifier: independent agent, 2026-10-12, branch `redesign/graduated`. I checked against the code (`lib/`, `screens/`, `supabase/functions/parse-food`), `i18n/translations.js`, `docs/decisions.md`, `docs/specs/food-log.md`, `docs/specs/progress-one-card.md` and `docs/review/features.md`. I trusted nothing the PRD, TRD, flows or registers say. No code and no product doc was changed.
- Reproductions use node on the pure libraries (`lib/realityCheckRules.js`, `lib/nutrition.js`, `lib/numbersWeight.js`, `lib/foodThread.js`, `lib/weighInAccess.js`, `lib/energyCalc.js`, `lib/progressTile.js`). Screen logic in `CalculatorSection.js`, `TodayScreen.js`, `FoodLogHero.js` and `lib/notifications.js` was evaluated by applying its exact predicates to the outputs of the libraries. The scripts are in the session scratchpad and are not committed.
- Verdicts: **OK** = the claim matches the evidence. **PARTLY** = the substance is right but a detail, the confidence, a citation or the proposed fix/test is wrong. **WRONG** = the claim is false.

## Counts

| Section | Items | OK | PARTLY | WRONG |
|---|---|---|---|---|
| 1. DIVERGENCES FOOD rows | 24 | 15 | 8 | 1 |
| 2. PRD food / reality check / Progress chapters (+ L-4, L-5, C-17…C-21, REM / TODAY items of this domain) | 35 | 25 | 7 | 3 |
| 3. AD / DL / OPEN items of this domain | 22 | 15 | 3 | 4 |
| 4. TRD ownership rows S-50…S-58 + §3.10 | 10 | 9 | 1 | 0 |
| 5. Flows 07 / 08 / 09 (diagrams, divergence notes, acceptance text vs i18n EN/PT) | 21 | 9 | 7 | 5 |
| 6. Portuguese founder questions 7, 8, 9 | 3 | 0 | 3 | 0 |
| **Total** | **115** | **73** | **29** | **13** |

New findings that no register row covers: 7 (§7).

---

## 0. Reproductions (node)

| # | Scenario | Result |
|---|---|---|
| S1 (A-118 class) | Start 2026-09-01 at 85 kg; weigh-in of 84 kg on the due day (09-22) at 08:00; food run of 4 | `checkOutcome` → `needs_food`. **Today alert** (`checkAlert`) → `needs_food`, left 3 ("Weight logged — 3 more days…"). **Food card** (`todayFoodHeroPolicy` day 22 > 21 + checkState) → `nutri_hero_weighed` ("· weight logged"). **Progress status line** (`CalculatorSection.js:1428`: only `state==='due'` is special) → "In progress · weigh in 22 Sep". **Day-21 notification** (`notifications.js:609-640`) → fire time 09-22 10:00 > now 08:00, so it is scheduled; the weigh-ins are never read. Result: four surfaces, two answers. On the due day the Progress date is *today*. From due+1 on it is a past date. |
| S2 (D-7) | Result saved for weigh-in W = 09-22; "Weigh in again" started on W, on W−3 and on W+1 | `checkSaved = realityLog.some(c => c.date >= start)` → **true / true / false**. With start = W and 22 days later a weigh-in + 8-day run: `checkOutcome` → `ready`, status `ok`. The auto-finish guard (`completeRealityCheck`: `getRealityChecks.some(entry_date >= startDay)`) → blocked, and `checkAlert` → `ready` ("Your reality check is ready — tap to see it"). Progress shows the old result. The new check never finishes. |
| S3 | `numbersWeight` after a same-day fix (85→84) and after deleting today's weigh-in, `weightAt` = today | Both return `null` (no adoption). Your numbers and the daily burn keep 85. The hero (`latestSnap`) shows 84, or yesterday's 86 after the delete. |
| S4 | Journey tile vs Progress hero. Saved weight 86, weigh-ins 10-01 = 86 and 10-12 = 80 | `weightAt` = 10-01 (before the newest weigh-in): tile burn **2780** (from the saved 86), hero burn **2680** (adopts 80). `weightAt` = 10-12 (on or after the newest): tile 2780 = hero 2780. **DV-063's proposed failing test uses the second fixture, which passes today.** |
| S5 | A day whose only row is `refused`, closed via the chat | `closeDay` `hasFood` (`FoodChatScreen.js:313`) → **true**, so no "I ate nothing" question. `intakeRun` → that day breaks the run (current 3). |
| S6 | 7 days that are all "I ate nothing" | Run ok, avg 0. Δ 1.0 kg → `too_short`. Δ 0.1 kg → `maintenance`. Smallest `days` that `checkOutcome` can produce: **21**, so the "< 14 days" branch of `too_short` is unreachable. Avg 4,500 kcal with −3 kg in 21 days → `implausible`, tdee 5,600 (a HIGH value). |
| S7 | Lapsed payer: Premium ended 09-10, check started 09-01, today 09-12 | `foodLogAccess` → `grace`, canLog true. `realityCheckAccess({rcFree: canLog})` → canStart **true**, canSeeResult **true**. |
| S8 | Free user at day 22 | access `locked`. `checkAlert({state:'ready'})` → `ready` whatever the status or access. |

---

## 1. DIVERGENCES.md, FOOD rows (24)

| ID | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-003 | "Remove entry" deletes with no confirm | OK | `FoodEntryEditor.js:91` `remove()` → `deleteFoodLog` directly | Add: `FoodEntryEditor.js:86`: saving with every item cleared also calls `deleteFoodLog` without asking. Cover both in the test. |
| DV-004 | Stop tombstones every `reality_checks` row | PARTLY | `CalculatorSection.js:946` `clearRealityChecks` (`database.js:579-583` tombstones all) | Scope is wider than "Stop the current check". The Stop link is also rendered **when no check is open**: on the result view (`:1531` `{stopLink}` in the `scoreCheck` branch) and in the locked branch when results exist (`:1475`). One tap there wipes the whole measured history. The test and OPEN-08 must cover this case. |
| DV-056 | Progress status line ignores "weighed in" | OK | S1; `CalculatorSection.js:1428` | Nuance: on the due day the date shown is today. It becomes a past date only from due+1. |
| DV-057 | Day-21 notification not re-planned on a weigh-in | OK | S1; `notifications.js:609-640` reads only `getRealityStart` | — |
| DV-058 | Today says "ready" for locked / unsavable | OK | S8; `realityCheckRules.js:126-132`; Progress shows `cal_rc_{status}` (`:1435-1436`) and no number | — |
| DV-059 | Progress reads the open check once per mount, no sync listener | OK | `CalculatorSection.js:213` (focus → `load`), `:297-300` after the `loadedRef` early return; `if (rcs) setRcStart(rcs)` never clears; no `addSyncListener` in `CalculatorSection`/`ProgressScreen` | Impact on other devices stays SUSPECTED. The once-per-mount read is CONFIRMED. |
| DV-060 | `checkSaved` hides the next check | PARTLY | S2 | (a) Any start **on or before** W hides it, not only "on (or backdated to)" W. (b) The 20:00 question has no day-21 cut-off (FL-42), so it runs until Stop, not "for 21 days". (c) `__tests__/journeyProgress.test.js:190` pins the buggy predicate by regex. The fix must change that test in the same change, or the suite blocks it. |
| DV-061 | Open check keeps its own start weight | PARTLY | `startRealityCheck` (`:899-924`) writes the weigh-in only `if (!existing || existing.weight_kg == null)`; `checkOutcome` uses `start.weightKg` | This is deterministic code, not runtime behaviour, so confidence should be **CONFIRMED** (it is listed as SUSPECTED). Fixing the start-day weigh-in re-aligns them (`checkStartPatch`). |
| DV-062 | Fix/delete does not refresh the Your-numbers weight | OK | S3; `saveWeighInEdit`/`deleteWeighInNow` (`:689-710`); hero uses `latestSnap` (`:750-754`), burn uses `metric.weightKg` | — |
| DV-063 | Journey tile computes weight/burn itself | PARTLY | S4; `progressTile.js:29-67` | The finding is right, but the **test in the row would pass today**. "weightAt after the latest weigh-in" gives tile = hero (2780/2780). The failing fixture is `weightAt` **before** the newest weigh-in (tile 2780 vs hero 2680). |
| DV-064 | Closing an only-refused/unparsed day skips "I ate nothing" | OK | S5 | — |
| DV-065 | Only the fix sheet validates ranges | OK in substance / PARTLY in fix | `saveTodayWeighIn` (`:569`, Save gated only by `num()!=null`, `:1102`), `saveBackfillWeighIn`, start sheet (`num(rcThen)`); only `readWeighInForm` checks `RANGES` | The fix names `lib/weighInEdit.validateWeighIn`, which does not exist. The existing validator is `readWeighInForm` / `RANGES` (`weighInEdit.js:11-45`). Name the real function, or say it is new. |
| DV-066 | Quota refusal on an offline re-parse leaves the row pending forever | PARTLY | `foodLogActions.js:72-92`: `!res.ok` → `return null` (stays `pending`); `rowsToReparse` picks it again on every open | Upgrade to **CONFIRMED** (it is deterministic). **The proposed fix (DL-28, "retry after local midnight") would not work.** `parse-food` counts the daily cap per `entry_date` (`index.ts:161-171`), and the row's `entry_date` never changes. Once that date has 25 parses, every later retry is refused forever. |
| DV-101 | Grace allows a new check and a result | OK | S7; `CalculatorSection.js:220` `setRcFree(access.canLog)` | — |
| DV-102 | Typed-calories link shown to free days / grace | OK | Link in the `rcAllowed` branch (`:1477-1481`); decisions.md:636 | — |
| DV-103 | `parse-food` never checks entitlement | OK | `parse-food/index.ts:120-171` checks only auth + quota | — |
| DV-104 | maintenance / implausible / too_short never close | OK | `completeRealityCheck` only for `status==='ok'` (`:856`) | — |
| DV-146 | Three "days" counts on one Progress screen | PARTLY | `FoodGraceNote` renders only in `FoodLogHero` and `FoodChatScreen`, never in `CalculatorSection`. `checkSoFar.run.days` = `intakeRun.current` (`nutrition.js:465-489`) | On a phone, Progress shows two counts. They are identical until a ≥ 7 run exists, then differ. All three appear side by side only in the Fold book layout (Journey + Progress). The dossier marks it SUSPECTED; the register says CONFIRMED. |
| DV-147 | Due date in 6 places; 21 hard-coded; flips 00/10/12 | OK | `FoodLogHero.js:27`; `foodThread.js:297,307`; `TodayScreen.js:1483` (12:00); `notifications.js:621-623` (10:00) | — |
| DV-148 | No minute/midnight tick on Progress or the food card | OK | No `dayChange` import in `CalculatorSection.js` or `FoodLogHero.js` (Today has one) | — |
| DV-149 | Measured burn hidden when the formula gate fails | OK in code / PARTLY in decision | Hero renders the burn only `{plan ? …}` (`:1189`) | The "No change — AD-45 (PO-12)" call is not ledger-clean. decisions.md:240 says the measured number *becomes the hero number once it exists*, and PO-12 is about the estimate. This is a real conflict (see AD-45). |
| DV-150 | All-"ate nothing" run → "too short" | OK | S6 | Nuance: with \|Δ\| < 0.2 kg the status is `maintenance` (it is checked first). |
| DV-151 | No UI writes `not_recorded` | OK | Only callers of `insertFoodDayMarker`: `ate_nothing`, `free_start`, `day_closed` | — |
| DV-194 | "+ Add a past weigh-in" has no lower date bound ("1926") | **WRONG** | `lib/wheelPick.js:16` `dateColumns`: year column runs from now − 10 to now + 2 (future clamped by `clampPast`, `CalculatorSection.js:671,1810`) | Today's floor is **10 years back** (2016), so 1926 cannot be picked. DL-73 ("back to the birth year") would **widen** the range for nearly every adult, not close a hole. Re-decide or drop. |

---

## 2. PRD: Food / Reality check / Progress (+ loops, contracts, cross-referenced REM / TODAY items)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| PRD-TODAY-53 | Alert follows the real state; date fallback only when unreadable; tap → Progress focus reality | OK | `TodayScreen.js:1482-1500`; `realityCheckNow.js` | — |
| PRD-TODAY-60 | Today hero line "… · {n} of 7 in a row" (short run words) | PARTLY | EN `nutri_hero_run_today` = "{n} of 7 days in a row"; PT "{n} de 7 seguidos" ✓ (decisions.md:114 shortens PT/ES/FR/DE/IT only) | The English is "{n} of 7 days in a row". |
| PRD-REM-50 | Weekly check-in tap → Progress → Log today's weight [#132] | PARTLY | `notificationPlan.js:182-183` (focus `weighin`); `CalculatorSection.js:1060-1064` | The code is right, but the cited decisions.md:132 says "the tap opens Body". The PRD cites it without noting the stale ledger line (flow 09 §7.6 does note it). |
| PRD-REM-51 | Day-21: 10:00 start + 21; none if past; cancelled with no open check | OK | `notifications.js:609-640` | — |
| PRD-REM-52 | Cancelled once weighed in → G-44 | OK | S1 | — |
| PRD-REM-60 | 20:00 question rules | OK (not re-verified end to end) | `notifications.js:664-725` (rolling 7, locked → none, off switch) | — |
| PRD-FOOD-3 | Thread shows the last 7 days | OK | `FoodChatScreen.js:56,478` | — |
| PRD-FOOD-17 | Model Claude Haiku; no raw-text server log | OK | `parse-food/index.ts:192` `claude-haiku-4-5-20251001` | — |
| PRD-FOOD-24 | Empty close asks; 20:00 close does not; G-54 | OK | `FoodChatScreen.js:308-321`; S5 | — |
| PRD-FOOD-25 | Remove entry deletes without asking (G-56) | OK | DV-003 | Also the "all items cleared" save (DV-003 note). |
| PRD-FOOD-40 | ≥ 7 consecutive complete days; start … yesterday + today once closed | OK | `nutrition.js:86-116` | — |
| PRD-FOOD-43 | Three day counts on one screen | PARTLY | DV-146 | Phone vs Fold, as in DV-146. |
| PRD-FOOD-50 | Offline row re-parsed by the typing device; retry after 20 s | OK | `FoodChatScreen.js:423`; `foodLogActions.js:128-160` | — |
| PRD-FOOD-51 | 25 parses / 25 follow-ups per entry_date, 60 / 24 h, reserved first, fail open; "resets at local midnight" | PARTLY | `parse-food/index.ts:28-30,152-190` | A *new date* starts at 0, but a given date's counter never resets. That is why G-59 / DV-066 can never clear itself. Say so here. |
| PRD-FOOD-60…62 | Free days from first use; locked after; grace to the end of the check week | OK | `foodThread.js:245-264`; S7 | — |
| PRD-FOOD-64 | `parse-food` checks only auth + quota (G-40) | OK | DV-103 | — |
| PRD-PROG-4 | Progress must refresh on sync / midnight; loads the check once per mount | OK | DV-059, DV-148 | — |
| PRD-PROG-10…14 | Hero, chips, formula line, sex gate, measured replaces the estimate | OK | `CalculatorSection.js:1175-1222` | — |
| PRD-PROG-23 | Newest stamped activity wins [D #232] | PARTLY | decisions.md:232 is "one 5-level activity scale" and says nothing about stamps; no ledger line has the stamp rule | Tag `[code]` (04 R-P4), not a decision. |
| PRD-PROG-24 | Your-numbers weight adopts the newest weigh-in unless typed later; G-51 | OK | `numbersWeight.js`; S3 | — |
| PRD-PROG-25 | Weight change asks (Update / Save as today / Cancel); first weigh-in only on a user save | OK | `CalculatorSection.js:487-534`; `progressCard.js:107-113` | — |
| PRD-PROG-43 | "+ Add a past weigh-in": any past date | **WRONG** | `wheelPick.js:16` | Past dates back 10 years (wheel). See DV-194. |
| PRD-PROG-44 | Only the fix sheet enforces ranges (G-55) | OK | DV-065 | — |
| PRD-PROG-50…53 | Fix in place, delete asks, start weigh-in not deletable (refused below the UI) | OK | `weighInEdit.js:48-80`; `CalculatorSection.js:680-722` | — |
| PRD-RC-2 | Start writes the open check, a weigh-in only if the day has none, the free anchor, arms both reminders | OK | `CalculatorSection.js:899-924` | — |
| PRD-RC-4 | Status line; G-42 | OK | S1 | — |
| PRD-RC-6 | First weigh-in ≥ day 21 counts | OK | `realityCheckRules.js:66-68` | — |
| PRD-RC-30 | Typed link, 500–10,000, Save dimmed; G-41 | OK | `realityCheckRules.js:92-103`; `CalculatorSection.js:1715` | — |
| PRD-RC-50 | too short (< 14 days or avg ≤ 0) | PARTLY | S6 | `< 14 days` is unreachable (days ≥ 21). Maintenance is tested before avg ≤ 0. |
| PRD-RC-51 + L-4 step 6 | Finishes when "the user may see results (Premium, or still in free days/grace)" | **WRONG** | AD-14 / DV-101 say grace must NOT see a new result | This describes today's bug as the requirement, with no `→ AD-14` marker. Change to "Premium, or still inside the free days". |
| PRD-RC-60 | Stop "stops the open check … deletes every saved result" → OPEN-08 | PARTLY | DV-004 | Missing: Stop is offered with no open check (result view, locked branch) and wipes the results there too. |
| C-17 | Status per surface after a weigh-in | OK | S1 (Today alert ✓, food card ✓, Progress line G-42, day-21 G-44, tile burn G-52) | — |
| C-20 | Start / Stop / Finish per surface | OK | code paths above | — |
| C-21 | "Progress: start allowed during free days (and grace — AD-14)" | **WRONG** | AD-14 = grace does not allow a new check (DV-101 fix: canStart false in grace) | Reads as the opposite of AD-14. Write "start allowed during free days (not in grace — AD-14)". |
| Glossary (food / RC terms) | "Reality check" PT "Seus números reais"; "free days" not "trial" | OK | decisions.md:87; i18n `cal_rc_title` PT "Seus números reais" | — |

Not re-verified here (no claim checked): PRD-FOOD-4/6/7 (chat UI behaviour), PRD-PROG-60/61/70 (target and plan math), PRD-PROG-51's sync guarantees, PRD-RC-3 (two-device open rows).

---

## 3. AD / DL / OPEN items of this domain

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-01 | Every delete asks first (decisions.md:46) | OK | decisions.md:46 | — |
| AD-12 | A-118: every RC message follows the real state (features.md:258) | PARTLY | features.md:258 covers **Today alert + food card line** only. A-118 is **not in docs/decisions.md** at all | Extending it to the Progress status line and the day-21 notification is product logic (a DL), not the ledger. Also add the 2026-10-09 founder line to decisions.md (CLAUDE.md: same-day ledger entry). |
| AD-13 | Latest weigh-in is the current weight everywhere; tile follows the same rule (decisions.md:231; PO-12/13/25) | OK | decisions.md:231 (A-54); PO-25 | — |
| AD-14 | Grace = finish logging; result needs Premium (decisions.md:274) | OK | decisions.md:274; also :229 ("starting a new check after the free days … Premium") | Cite :229 too; it carries the "no new check" half. |
| AD-15 | Typed link Premium-only (decisions.md:636) | OK | decisions.md:636 | — |
| AD-16 | Server authoritative for paid AI (decisions.md:288) | OK | decisions.md:288 | — |
| AD-17 | Empty closed day counts only after "I ate nothing" (decisions.md:237) | OK | decisions.md:237; FL-47 | — |
| AD-45 | Daily burn only with weight + height + age + sex (PO-12) → DV-149 "no change" | **WRONG (as applied)** | PO-12 governs the formula estimate. decisions.md:240: "A measured maintenance becomes the hero number once it exists" | Applied to the measured number, the two sources conflict, so it is not "already decided". Make it a DL with a reason, or a founder line. |
| AD-53, AD-54 | Chips ≤ 40, no meal slots; Earlier day = 2–7 | OK | decisions.md:319, :245, :244 | — |
| DL-25 | One assembler; Progress listens to sync; day-21 re-planned on a weigh-in | OK | logic follows A-118 | — |
| DL-26 | Today never says "ready" with nothing to see | OK | — | — |
| DL-27 | One weigh-in validation on every path | OK | PO-21 | Name the real validator (DV-065). |
| DL-28 | Quota refusal on re-parse: mark, explain, retry after midnight | **WRONG** | `parse-food` counts per `entry_date` | Retrying after midnight hits the same date's full counter forever. The decision must be: re-date and ask the user, or a server exemption for re-parses, or a permanent "not read — limit reached, tap to remove / retype" state. |
| DL-30 | Label each "days" count (picture first) | OK | — | — |
| DL-51 | A-24 closed: "a check cannot be saved early any more" (self-finishing check) | **WRONG (premise)** | The self-finishing check is exactly what OPEN-07 asks the founder to confirm. Option B restores day-14 result buttons, i.e. early saving | DL-51 must be conditional on OPEN-07 (or folded into it). Today it decides by logic on top of an open question. |
| DL-61 | "free days", never "trial" | OK | — | — |
| DL-66 | Retire `not_recorded` (legacy read) | OK | No writer (DV-151); FL-47 "Just close the day" breaks a run the same way | — |
| DL-68 | ETA labelled with its window, no staleness cutoff | OK (not deeply verified) | decisions.md:241 | — |
| DL-73 | Past weigh-in back to the birth year | **WRONG (premise)** | DV-194 | Today's floor is 10 years (wheel). The reason "approved with no limit (decisions.md:241)" over-reads :241, which only says "Past weigh-ins can be backfilled". |
| OPEN-07 | Built: own start weight, self-finishing; ledger Q-A/Q-B | OK | decisions.md:233, :426; code `:899-924`, `:853-859` | Add that the finish runs only when Progress is opened and only for users who may see results. |
| OPEN-08 | Stop deletes all results; "the copy already says so" | PARTLY | DV-004; EN/PT `cal_rc_stop_body` | (a) Stop is also offered with no running check and wipes there too. (b) "The copy already says so" is generous: PT "Isso apaga seus números reais" reads as "this ends *Seus números reais*" (the feature name), not "deletes every earlier measured result". |
| OPEN-09 | maintenance / implausible / too short (< 14 days or avg 0) | PARTLY | S6 | `< 14 days` cannot happen (≥ 21). Only avg 0 ("all ate nothing") reaches too_short. The 20:00 question continues only while the user can still log (a locked free user gets none). |

---

## 4. TRD ownership rows (§4.5) and §3.10

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| S-50 Reality-check state | OK | Line refs `CalculatorSection.js:299-304, 816-842` match; strict vs non-strict `getRealityStart` (`notifications.js:618`, `realityCheck.js:86-104`) | — |
| S-51 Due date | OK | `FoodLogHero.js:27`, `foodThread.js:297,307`; flips 00/10/12 | — |
| S-52 Weighed in | OK | S1 | — |
| S-53 Intake run | OK | `checkSoFar` own trailing average; `FoodGraceNote` → `periodTotals.loggedDays` counts kcal > 0 (`nutrition.js:383`) | — |
| S-54 Current weight | OK | hero `latestSnap` incl. weightless rows (`:750-754`); tile latest weighed, saved weight for the burn | — |
| S-55 Daily burn | OK | S4 | — |
| S-56 Food access | OK | `foodThread.js:245-264`; parse-food | — |
| S-57 Today food summary | OK | `foodThread.js:310-315`; focus-only refresh | — |
| S-58 RC access | PARTLY | `realityCheckAccess` exists, but the typed link and the branch use `rcAllowed = premium \|\| rcFree` directly (`:813`, `:1477`), not `rcAccess` | "Consumers: typed-kcal link" is the target, not today. |
| §3.10 `reality_checks` without an `updated_at` trigger | OK | `syncMappers.js:142-145` sends only entry_date / tdee / rate | — |

---

## 5. Flows 07 / 08 / 09

| Flow / ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| 08 §7.1 | "Founder line needed (**OPEN-08**)" for the start-weight question | WRONG | — | Should be **OPEN-07**. |
| 08 §7.1, F08-01, F08-03 | Start sheet field "Weight today" / "Peso de hoje" | WRONG | `CalculatorSection.js:1690`: label `cal_snap_weight ({unit})` = "Weight (kg)" / "Peso (kg)"; `cal_rc_start_weight` is unused; sheet title is "Reality check" + `cal_rc_sub` | Use "Weight (kg)" / "Peso (kg)". |
| 08 §7.5 | Result shows "That's about {x} lost / gained per week" and the generic-estimate comparison with the "why" list | WRONG | `cal_rc_rate_*` and `cal_rc_why_*` are not referenced in any screen. The result branch (`:1517-1535`) shows the prefix sentence + number, the source line, "Your checks over time" (rate per row), "Weigh in again", Stop | Describe what renders, or flag the missing parts as a gap if they were approved. |
| 08 §7.11 / F08-18 | Day-21 tap "opens the weigh-in sheet / scrolls" | PARTLY | `focus:'reality'` only scrolls (`:1036-1041`); only `focus:'weighin'` opens the sheet | Only scrolls. |
| 08 §7.2, §8, F08-05; 07 §8 | EN Today hero "{n} of 7 in a row" / "3 of 7 in a row" | PARTLY | EN `nutri_hero_run_today` "{n} of 7 days in a row"; PT ✓ | EN text. |
| 08 F08-01 | Hero "Reality check · day 1 of 21" | PARTLY | `FoodLogHero.js:72-74` appends the run | Full line "Reality check · day 1 of 21 · 0 of 7 days in a row" / PT "… · 0 de 7 seguidos". |
| 08 F08-08 | Expect "Your average: 2,400 kcal/day", then the result | PARTLY | For Premium in `needs_food`, saving makes it `ready` and auto-finish runs at once (`:853-859`); the "Your average" line disappears with the open check | Order the expectations as result + "From the average calories you entered". |
| 08 §6.1 / §6.2 / §6.3 diagrams | States and transitions | OK | `checkOutcome`, `completeRealityCheck`, reminder code | §6.3 "WeighInCancelled" is the intended state (labelled so). |
| 08 §11 D08-1…D08-12 | Divergence notes | OK | match DV rows (see §1) | D08-4 inherits the DV-060 corrections. |
| 08 F08-13, F08-14, F08-16, F08-06, F08-07 strings EN/PT | — | OK | i18n keys `cal_rc_reset_*`, `cal_rc_stop_*`, `cal_rc_next`, `today_alert_rc_*`, `nutri_hero_weigh(ed)`, `notif_rc_*` | — |
| 09 §7.2, D09-8 | Past weigh-in "no lower bound" | WRONG | `wheelPick.js:16` | 10-year floor. |
| 09 F09-05 | After F09-02 (86 today) → Log today's weight 85.4 → "Since {first}: −0.6 kg" | WRONG | Same-day saves merge into one row (`mergeWeighIn`). One weigh-in → no "Since" line (`progressSummary` needs ≥ 2) | Put F09-02 on an earlier day, or drop the Since expectation. |
| 09 §7.8 | "Progress open across midnight still writes 'today' as the old day? (verify)" | PARTLY | `saveTodayWeighIn` calls `todayISO()` at save time (`:575`) | The question can be answered by reading: writes use the new day; only displays are stale (DV-148). |
| 09 §7.1 / D09-1, D09-2 | Fix/delete; tile burn from the saved weight | OK | S3, S4 | — |
| 09 §6.3 "Unchanged under 0.005 kg"; SaveToday only when the latest is not today | OK | `progressCard.js:110-112` | — |
| 09 F09-01…F09-17 strings EN/PT | OK | All 39 EN and 36 PT acceptance strings found in `translations.js` | — |
| 07 §6.2 | Refused / nothing / too old / quota → row deleted, text back | OK | `FoodChatScreen.js:376-418` | — |
| 07 §6.1, §6.3, §6.4 diagrams | Day states, access, 20:00 | OK | `nutrition.js`, `foodThread.js:245-264`, `notifications.js:664-725` | — |
| 07 D07-8 | Quota on retry "SUSPECTED" | PARTLY | DV-066 | CONFIRMED by reading; the fix needs DL-28's correction. |
| 07 F07-15 | "…it resets tomorrow" | PARTLY | Copy `nutri_quota` | True for today's date. For a "Log it" entry on yesterday's date that is already full, it never resets. Low priority. |
| 07 F07-01…F07-19 other strings EN/PT | OK | i18n search (see 09 row) | — |

---

## 6. Portuguese founder questions (OPEN-DECISIONS.md, "Versão em português" 7, 8, 9)

| Q | Verdict | What is true | What is missing or wrong |
|---|---|---|---|
| 7 "fechar sozinho e um peso só no início" | PARTLY | The check closes at the first weigh-in from day 21 with 7 days of food or typed calories; it has its own start weight; the start weight can differ from that day's weigh-in; conflict 25 (no explicit OK) is real | (a) Omits that it closes only when Progress is opened, and only for users who may see the result. (b) Calls the feature **"checagem"** 6 times. CLAUDE.md (2026-10-02) rejects "Checagem … de realidade" and wants one term per concept. The app says "Seus números reais" / "medição" ("Parar a medição", "desta medição"). |
| 8 "Parar apaga os resultados anteriores?" | PARTLY | Stop does delete ALL measured results and the burn goes back to "Estimado"; the ledger line does not mention results | (a) "ao parar a checagem em andamento" understates it. The same "Parar a medição" link sits on the result screen with **no check running** and wipes everything there too, and option A must say what Stop does in that case. (b) "o texto de confirmação já avisa" is doubtful: "Isso apaga seus números reais" reads as the feature name. (c) "checagem". |
| 9 "Quando a conta não gera um número" | PARTLY | maintenance / implausible are described right; the check never closes; Today says "Seus números reais estão prontos — toque para ver" | (a) "curto demais (menos de 14 dias…)" cannot happen: the result weigh-in is always ≥ day 21. Only "média zero" (every day "Não comi nada") reaches it. (b) "a pergunta das 20h continua chegando" is true only while the person can still log (a free user after the free days gets none). (c) "checagem". |

---

## 7. New findings (in no register row)

| # | Finding | Severity (register scale) | Evidence |
|---|---|---|---|
| N-1 | Stop is offered with no open check (result view and locked branch) and one tap tombstones the whole measured history | S1 (extends DV-004) | `CalculatorSection.js:1475`, `:1531`, `:946` |
| N-2 | `cal_rc_implausible` says "implausibly low … intake was higher than remembered … log intake more carefully" for every implausible result, including tdee > 5,000 (S6: 5,600) | S2 | `energyCalc.js:266`; `translations.js` `cal_rc_implausible` (EN/PT) |
| N-3 | `cal_rc_too_short` says "Use weigh-ins at least 14 days apart", but its only reachable cause is an average of 0 kcal | S4 (DV-150 covers the status; the copy is wrong too) | S6 |
| N-4 | Saving "Fix this entry" with every item cleared deletes the entry without asking | S1 (extends DV-003) | `FoodEntryEditor.js:86` |
| N-5 | The A-118 founder decision (2026-10-09) is not in `docs/decisions.md`; only `features.md:258` has it, yet AD-12 treats it as ledger | S4 (process) | grep of decisions.md |
| N-6 | `journeyProgress.test.js:190-196` pins the buggy `checkSaved` predicate by regex. Fixing DV-060 test-first will turn it red; that is expected and must be stated in the fix | S4 (process) | test file |
| N-7 | Stale or unused copy: `nutri_run_rule` ("a day closed with 'That's all for today' counts") contradicts FL-47 and is unused; `cal_rc_start_weight`, `cal_rc_rate_*`, `cal_rc_why_*` are unused but described in flow 08 as shown | S4 | grep of `screens/` |

---

## 8. The five most important errors in the product docs

1. **DL-28 / DV-066: the fix cannot work.** `parse-food` caps per `entry_date`, and a pending row's date never changes, so "retry after local midnight" keeps hitting the full counter forever. The docs also call it SUSPECTED, though reading the code confirms it.
2. **DV-004 / OPEN-08 / PT question 8 understate Stop.** The data-wiping "Stop" also sits on the finished-result view with no check running. The founder is asked only about stopping a *running* check, and "the copy already says so" is doubtful in PT.
3. **DV-194 / DL-73 / PRD-PROG-43 / flow 09 D09-8 rest on a false premise.** The past-weigh-in wheel already stops 10 years back, and "back to the birth year" would widen the range.
4. **The PRD writes the grace bug as the requirement.** PRD-RC-51, L-4 step 6 and C-21 say grace users may start or see a result, which contradicts AD-14 / DV-101. Separately, DV-063's proposed failing test passes today (wrong fixture), so it would not prove the tile/hero divergence.
5. **DL-51 decides by logic on top of open question OPEN-07.** It assumes the self-finishing check stays. AD-45 likewise claims a ledger answer where decisions.md:240 and PO-12 conflict for the measured burn. In the A-118 class, AD-12 is cited to features.md only: A-118 is missing from decisions.md and covers only the Today alert and the food card.
