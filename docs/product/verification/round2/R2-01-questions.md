# R2-01 — Founder question list (OPEN-01…OPEN-21) and the Portuguese message

- Verifier: independent round-2 agent, 2026-10-12. Branch `redesign/graduated`, HEAD 19e4ebc. Read-only. The only file written is this one.
- Scope: `docs/product/OPEN-DECISIONS.md` lines 16–290 (OPEN-01…OPEN-21) and 634–811 (Portuguese message); `docs/product/DIVERGENCES.md` for counts and the founder column.
- Authority used: (1) `docs/decisions.md` (founder lines), (2) signed rows in `docs/specs/*.md`, (3) `docs/design/prototype.html`, (4) code. Every code claim was opened at the cited place; `node scripts/spec-audit.cjs` was run (local, read-only).
- Verdict per item = the worst factual problem found in its Context, Options or Recommendation. "Genuine?" = whether it is a real taste / money / risk / scope question under the CLAUDE.md rule "decide what is already decided".

## Summary

| Item | Verdict | Genuine founder question? | One-line why |
|---|---|---|---|
| OPEN-16 | **WRONG** | Yes (scope, risk) | Counts are stale: "216 open rows (14 S1 … 71 S4)"; the register has 218 (15 / 94 / 37 / 72). (b) never mentions the founder's AD-32 "concurrent multi-device use is not a real use case" and says "two doses … count as one" when only the vial counter loses one. |
| OPEN-01 | PARTLY | Yes | Code premises verified; but the ":578 edits the count" argument ignores the later founder line :614 (Restart → "Continue the same vial", built at ProtocolsScreen.js:1264). |
| OPEN-02 | VERIFIED | Yes (new alerts/push, scope) | Supply-low rule is vial-only (supplyLow.js; no oral path). |
| OPEN-03 | VERIFIED | Yes (partly logic) | 024c616 removed the total; Today "Day X of Y" capped (TodayScreen.js:1675-1683); BR-12 is a deviation-column approval. |
| OPEN-04 | VERIFIED | Yes (risk) | AUTO_PURGE_PAUSED = true (protocolEnd.js:188); multi-select Delete forever exists. |
| OPEN-05 | VERIFIED | Yes (money) | Four phone-only limit checks at the cited lines; nothing ends protocols on lapse. |
| OPEN-17 | **WRONG** | Yes | The tracker ALREADY skips days with nothing due (TodayScreen.js:801); option A is the as-built rule + 365 days. A weekly-only user would still read "2 days without a miss" — the exact text the founder rejected. The recommendation's "solves the weekly case the founder saw" is false. |
| OPEN-19 | PARTLY | (a) mostly decided, (b) weak, (c) logic, (d) yes | Code premises verified. (a) the same-day rule is in the approved Today v2.1 handoff (F1); (b) the reason "never refuses a dose" contradicts option A, which refuses above doses_per_day (markTaken.js:53). |
| OPEN-06 | VERIFIED | Yes (money, scope) | iOS window 10 days / 40-slot budget (notificationPlan.js:301-309); spec-audit fails BR-9, BR-10, RG-6/7/8 as stated. |
| OPEN-20 | **WRONG** | (a) No — answered by signed SP-1; (b) yes; (c) yes | (a) option A is labelled "as signed" but signed SP-1 makes "notifications denied" a block unconditionally = as built. (b) the OS dialog is not shown "at every cold start" (iOS shows it once); SP-5 is Android-only, not "for anyone". (c) cites "OPEN-18 item 7" for the expiry words; item 7 does not contain A-45. |
| OPEN-07 | VERIFIED | Yes | Auto-finish runs only inside CalculatorSection (Progress) and only with canSeeResult (CalculatorSection.js:855-858). |
| OPEN-08 | VERIFIED | Yes (borderline: ledger :239 + never-lose-data point to A) | clearRealityChecks soft-deletes every result; Stop shown at :1475 and :1541 with no check open. |
| OPEN-09 | VERIFIED | Yes | energyCalc.js:262-266; only status 'ok' is saved (CalculatorSection.js:856). |
| OPEN-10 | PARTLY | Yes | Curve premise verified (serumModel.js:146-147). The reason "the edit already writes only what changed, so the moment of the change is known" is WRONG: no per-field history; updated_at moves on every write (database.js:163). |
| OPEN-11 | VERIFIED | Yes | Planned schedule (curve_disclaimer, translations.js:787); ledger :206. |
| OPEN-12 | VERIFIED | **No** — the standing rule already decides it | No manual lab entry (BodyScreen.js:630-645 only from scans). "Approved → next build" puts it in 1.3.0 unless he defers; the item itself says nothing suggests deferring. Belongs in "Para você saber", not a question. |
| OPEN-13 | VERIFIED | Yes (copy, regulatory) | BLOODWORK_INTERVAL_DAYS = 182 (TodayScreen.js:153); no ledger line. |
| OPEN-14 | PARTLY | (a) **No** for the number; (b)(c) yes | MB-10 is the FREE-plan card, not a Premium line; the "no number" rule is the founder's :104 (+ :257), which outranks the coordinator :544, so "20" is already excluded. Whether Premium gets a line at all is new UI and is not what is asked. |
| OPEN-15 | PARTLY | Yes | Code verified (purchases.js:67; SettingsScreen.js:617). "Store rules 100%" stretches the founder's :40 (sign-in buttons only); "store guidance expects cancellation" is unsourced. |
| OPEN-18 | **WRONG** | Items 1–4 yes; 5 and 6 **No** | Item 8 "spec-audit fails on them" is false (2 warnings; fold-right-page passes as "signed" through a parser bug). Item 1's "prototype draws every line the same" — the prototype curve has no blend. Item 5 follows from signed FX-11; item 6 from founder :40. |
| OPEN-21 | PARTLY | Yes as a confirmation, but 4 of 10 are DL-class | Citations hold (AD-54's ":429" is :430). Items 1, 7, 9, 10 are "by logic" lines, the same class as the 65 DL lines that are not asked. Item 4 drops "only Missed rows the app wrote after the end". |

**Counts: VERIFIED 11 (OPEN-02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 13) · PARTLY 6 (OPEN-01, 10, 14, 15, 19, 21) · WRONG 4 (OPEN-16, 17, 18, 20).**

Duplicates / ledger contradictions found: OPEN-16(b) vs AD-32 (decisions.md:199); AD-60 still lists "the supply push fires at 3" as Already decided while OPEN-18 item 5 asks it; OPEN-20(c) ↔ OPEN-18(7) broken cross-reference; DV-209 / DV-210 are "No (bug)" in the register but are offered as timing options in OPEN-16(b).

---

## Per-item findings

### OPEN-16 — Scope of 1.3.0 and sync hardening — WRONG

1. **Count premise — WRONG.** OPEN-DECISIONS.md:22: "The register holds 216 open rows (14 S1, 94 S2, 37 S3, 71 S4)". Recount of the active rows in DIVERGENCES.md (sections S1–S4, excluding "Closed by the verification"): **218 rows = 15 S1, 94 S2, 37 S3, 72 S4**, the same as the register summary (DIVERGENCES.md:55) and the Portuguese message (OPEN-DECISIONS.md:641). The English item was not updated after DV-196…DV-221 were added. (Side note: DV-150 at DIVERGENCES.md:303 contains unescaped pipes in "|Δ|", which breaks that table row; a parser reads its severity as text. It sits in the S4 section, so S4 = 72.)
2. "decisions.md:634" "Vamos resolver tudo. Sem pendência" — VERIFIED (decisions.md:634).
3. DL-55, DL-58, DL-30, DL-43, DL-49 "all picture first" — PARTLY: DL-58 (OPEN-DECISIONS.md:613) does not say picture first.
4. (b) DV-182 "a dose deleted on phone A comes back on A after phone B edits it" — VERIFIED in code path: push of a deleted row = cloud hard delete (syncCore.js:648-654); B's later push finds 0 rows and re-inserts a child with a live parent (syncCore.js:692-698).
5. (b) "two doses logged offline on two phones count as one" — PARTLY. DV-183 itself says the result is "n+1 doses taken" on the vial / bottle counter (absolute `doses_taken` / `units_taken` pushed whole, syncMappers.js:87, :109). Both Dose-log rows exist; the supply counter is wrong. The Portuguese repeats the misleading form ("duas doses … contam como uma", :655) — a founder will read that a dose disappears from his history.
6. **Ledger omission.** The founder parked concurrent multi-device use: "Concurrent multi-device use is not a real DoseTrace use case (A-48 parked)" (decisions.md:199, AD-32). DV-183 addresses it ("Sequential use (phone + Fold, an old phone still signed in) hits it, not only concurrent use (AD-32)"); OPEN-16 does not, so the S1 framing and "1.3.0 is the right moment" are argued without answering the founder's own line.
7. DV-209 / DV-210 are offered as timing options in (b) B, but their founder column is "No (bug)" (DIVERGENCES rows DV-209, DV-210). Either they are bugs that ship by the scope rule or they are part of the founder's timing choice — not both.
- Genuine: yes (scope, risk). Options distinct. Recommendation follows. No medical advice.

### OPEN-01 — Correcting the vial in use; recon "New vial" — PARTLY

- "The mix date and the 30-day window are typed once … and can never be changed" — VERIFIED: the vial step renders only on create, `step === 5 && type === 'recon' && !editingId` (ProtocolsScreen.js:3171); edit writes only an rtu vial patch (ProtocolsScreen.js:1857-1862).
- "a new protocol always starts its vial at 0 doses taken" — VERIFIED (`doses_taken: 0`, ProtocolsScreen.js:1897).
- "A recon vial can be replaced only from Today's prompt" — VERIFIED: the protocol page's New vial renders only for `p.type === 'rtu' && … doses_taken > 0` (ProtocolsScreen.js:585).
- "The founder's Restart line (decisions.md:578) already assumes the user 'edits the count' of a vial; that control does not exist" — PARTLY. :578 (2026-10-06) does say "taps New vial / edits the count", but the founder's next day answer :614 (council 3, "1 a 7 sim") gives Restart a "New vial / Continue the same vial" choice, "same = the old container moves to the new run unchanged (mix date, count)", built at ProtocolsScreen.js:1264. The "still using the old vial" case of :578 is therefore handled by a founder decision; the remaining gap is a part-used vial at FIRST creation and typo correction. The Portuguese (:661) repeats the unqualified claim.
- "Registry A-08 (F5–F7) has waited … since 2026-09-13" — VERIFIED (features.md:148, source journey-review-eval-2026-09-13).
- Genuine: yes (new controls). Options distinct. Recommendation follows.

### OPEN-02 — Low-supply warning for bottles — VERIFIED

- One rule, vial-only: `supplyState(vial, protocol)` (supplyLow.js:18-23) is the only input to the Today alert (TodayScreen.js:1531), the push (notifications.js:502) and the badge (ProtocolsScreen.js:535, :608, :2420). Orals keep `units_taken` on the protocol and only get days-left on the protocol page (oralMath.js:119 `supplyDaysLeft(unitsLeft, unitsPerDose, dosesPerDay)` — no interval, which is DV-020, as stated).
- Genuine: yes — it adds alerts, a push and strings ×6 (scope). Options distinct.

### OPEN-03 — End of a fixed course — VERIFIED

- 024c616 (2026-07-03) "Remove the 'total doses' wizard question; reminders now run open-ended" — VERIFIED (git show). protocolForm.js:143 still writes `schedule_total: null`.
- Reminders honour it (notificationPlan.js:37); Today "Day X of Y" is capped at the total (TodayScreen.js:1675-1683) — VERIFIED.
- "BR-12 (signed 2026-10-07)" — PARTLY in wording: BR-12's criterion is "no stop point"; the course-end rule is its approved deviation (background-refresh.md:25 "approved 2026-10-07 — protocols with a total number of doses end their reminders when that course ends"), from decisions.md:620. Substance correct.
- Genuine: the auto-end vs ask choice and bringing the field back are real; "Today stops expecting doses when reminders stop" follows by logic (one owner, DL-04).

### OPEN-04 — Automatic purge after 1.3.0 — VERIFIED

- `AUTO_PURGE_PAUSED = true` (protocolEnd.js:188); multi-select Delete forever (ProtocolsScreen.js:1332, :2289); A-84 "Target: the next build after 1.3.0" (features.md:223); decisions.md:506 — VERIFIED.
- Note: decisions.md:501 already records "Recently deleted gets a way to empty it by hand … — founder 2026-10-03 … (automatic purge stays paused in 1.3.0)" and :515 the founder's "Build the Recently deleted multi-select". The founder approved the by-hand path with the pause stated next to it; OPEN-21(8) asking him to confirm the pause is close to redundant.
- Genuine: yes (risk). Complements OPEN-21(8), no duplicate.

### OPEN-05 — Free limit on the server and after a lapse — VERIFIED

- Checks at ProtocolsScreen.js:1290 (restart), :1309 (restore), :1880 (save safety net), :2053 (open Add) — all four VERIFIED; `isOverFreeLimit` counts the local DB (ProtocolsScreen.js:2046-2050). Nothing ends protocols on lapse (no code path found). "3 mantém" decisions.md:465 — VERIFIED.
- Genuine: yes (money).

### OPEN-17 — Today tracker streak: days or doses — WRONG

- "the binding prototype shows '2 days without a miss'" — VERIFIED (prototype.html:970). "flame + streak" decisions.md:143 — VERIFIED. 31-day stop — VERIFIED (loop `i <= 30`, TodayScreen.js:798). "On fire!" at 7 — VERIFIED (TodayTracker.js:138; PT "Mandando bem!", translations.js:4915).
- **Recommendation / option A — WRONG.** Option A reads "days with nothing due are skipped (so a weekly-only user keeps the streak)" and the recommendation says "skipping days with nothing due solves the weekly case the founder saw". The tracker already does this: `if (dueOn(d).length === 0) continue; // rest day — neither adds nor breaks` (TodayScreen.js:801). Option A = as built + 365-day look-back. And it does NOT solve the founder's case: the founder objected to the TEXT "2 days without a miss" for a weekly protocol (commit b215b32 message). A weekly-only user's tracker, under A, still reads "2 days without a miss" (TodayTracker.js:136 `today_streak_days`). The context must say A is the status quo and that it keeps the wording he rejected on the card.
- Genuine: yes (meaning and copy ×6).

### OPEN-19 — Four dose-rule details on Today — PARTLY

- (a) Premise VERIFIED: rings match the nearest slot within ± half the interval (adherenceRings.js:48-59) → a 21:00 dose is 11 h before today's 08:00 and fills it; the Missed scan's same-day second pass gives it to yesterday (missedDoses.js:149-155). **Already decided in large part:** the founder-approved Today v2.1 build (decisions.md:140) contains "F1 a same-day dose logged > 12 h late gets a false Missed" under "Fix with it (they corrupt the rings)" (today-build-handoff.md:51-54). The same-day rule is the approved rule for the Missed side; rings must agree by DL-04 (one owner). (a) should be a DL/AD line, not a question.
- (b) Premise VERIFIED: cap = `doses_per_day` (markTaken.js:53); Dose-log fallback `writeOutcome` (LogScreen.js:145-146). **Recommendation reason contradicts the option:** "(b) An honest journal never refuses a dose the person says they took" — option A refuses any dose above doses_per_day on a calendar day (markTaken.js:53 returns `alreadyTaken`). Option B is non-viable on its own description; the choice is not real. Registry A-35 (features.md:175) does list it as a product decision, so asking is defensible, but it is logic.
- (c) Premise VERIFIED: phone 08:00 (notificationPlan.js:55 "08:00 when none are set"); form defaults now-rounded, 14:00, 21:00 (protocolForm.js:102-104). Follows by logic ("agree with what the phone already does") — weak question.
- (d) Premise VERIFIED: Undo after Mark complete and after "Didn't take" (TodayScreen.js:702, :710-717); Skip writes with `keepUndo` only, no bar (TodayScreen.js:1163-1184). Missing context: Skip is the only path that already asks first ("Skip dose?" sheet, decisions.md:150; `setSkipAsk`, TodayScreen.js:1183). Side defect found: the "Didn't take" Undo record has no `text`, so the bar says "Dose logged" (`undoData.text || t('today_dose_logged')`, TodayScreen.js:2273) after a skip — not in the register as far as this check found.
- Genuine: (d) yes (taste); (a) mostly decided; (b) and (c) logic.

### OPEN-06 — iPhone reminders without opening the app — VERIFIED

- iOS budget `total = 40 − expiry alerts`, `windowDays: 10`, per-protocol share (notificationPlan.js:301-309) — "up to 10 days, fewer with many protocols" VERIFIED. BR-11 iOS untouched (background-refresh.md:24) VERIFIED. spec-audit: BR-9, BR-10 partial FAIL; RG-6, RG-7 partial FAIL; RG-8 missing FAIL — VERIFIED (run 2026-10-12). Principle decisions.md:598, :601 VERIFIED.
- Genuine: yes (money: server push running cost; scope). Note: features.md:251 still says A-110 part C "not deployed"; decisions.md:611 says applied 2026-10-07 — registry drift, not this item's error.

### OPEN-20 — Three reminder details — WRONG

- (a) "Settings shows red … even with dose reminders off" — VERIFIED (SettingsScreen.js:244, :796). **Option A "Red while any switched-on reminder kind is blocked (as signed)" — WRONG label.** Signed SP-1 (reminder-setup-placement.md:15): "a block (notifications denied, Dose Reminders category off, or nothing scheduled although a protocol has a reminder time) in the risk color" — unconditional on what is switched on. As signed = as built. The question only exists because the withdrawn DL-45 proposed amending SP-1; with the signed row as the authority, (a) is already decided (keep as built) and need not be asked.
- (b) "the app requests the system permission at every cold start and sign-in" — PARTLY. The CALL runs at every signed-in cold start and SIGNED_IN (App.js:650, :730), but `requestPermissionsAsync` shows the OS dialog only while the status is undetermined (notifications.js:157-160): once on iOS, at most twice on Android 13+. The Portuguese "pede a permissão do sistema a cada abertura e a cada login" (:709) tells the founder the dialog appears every time — WRONG as stated. "The signed SP-5 already opens 'Make sure your reminders arrive' once for anyone with a reminder time" — WRONG scope: SP-5 is "for an Android user" (reminder-setup-placement.md:19). Consequence missed: under option A an iPhone user who said "Not now" and arrives with synced reminder protocols (new install, sign-in) never sees the system prompt — the "what already happened before" case.
- (c) A-45 "Founder to confirm the lead time and words" — VERIFIED (features.md:185; decisions.md:165, :417); 7 days + the day at 09:00 VERIFIED (notificationPlan.js:260-279). **Cross-reference WRONG:** the recommendation says "the words are seen on the test build (OPEN-18 item 7)"; item 7 lists A-42, A-44, A-46 only (OPEN-DECISIONS.md:265). The Portuguese makes it worse: "pergunta 18" (:711), which in the Portuguese numbering is OPEN-14 (My Body scans); OPEN-18 is Portuguese question 20.
- Genuine: (a) no; (b) yes (with the iPhone gap added); (c) yes.

### OPEN-07 — "Seus números reais" finishes by itself; one start weight — VERIFIED

- Q-A / Q-B (decisions.md:233), Conflict 25 (decisions.md:426) VERIFIED. Auto-finish only for `outcomeResult.status === 'ok'` and `rcAccess.canSeeResult`, in an effect inside CalculatorSection (CalculatorSection.js:855-858), which is mounted only by ProgressScreen (ProgressScreen.js:17, :62) — "only when Progress is opened, and only for users who may see the result" VERIFIED. Start weight kept as that day's weigh-in only if the day has none (CalculatorSection.js:963-964) VERIFIED. A-24 open (features.md:164) VERIFIED.
- Genuine: yes (the founder never OK'd auto-finish).

### OPEN-08 — Does Stop erase earlier results? — VERIFIED

- `clearRealityChecks` soft-deletes every row (database.js:579-583); Stop rendered in the locked branch when results exist (CalculatorSection.js:1475) and on the finished-result view (:1541) — VERIFIED. Ledger :239 VERIFIED. PT body "Isso apaga seus números reais…" VERIFIED (translations.js:5663). Note the English body already says "This clears your reality-check numbers" (translations.js:1041), so the deletion is disclosed in EN; the item says only that it was never approved as a decision.
- Genuine: borderline. Ledger :239 defines Stop as clearing the OPEN check, and "never lose user data / never destroy on a maybe" points to A; only C's extra "Delete my results" is new scope.

### OPEN-09 — A check with no number — VERIFIED

- `too_short` if days < 14, `maintenance` if |Δ| < 0.2 kg, `too_short` again if average ≤ 0, `implausible` outside 1000–5000 (energyCalc.js:262-266) — VERIFIED; only `ok` is saved (CalculatorSection.js:856). Option A is arithmetic (maintenance = intake when the weight does not move), not advice.

### OPEN-10 — Should a dose change rewrite the past curve? — PARTLY

- Curve uses the protocol's current dose for every dose (`doseInCurveUnit(parseDecimal(p.dose) …)`, serumModel.js:146-147) — VERIFIED. No edit-history table exists (schema.js tables at :9-227) — VERIFIED.
- **Recommendation reason — WRONG:** "the edit already writes only what changed, so the moment of the change is known". Only `protocols.updated_at` exists, and `updateProtocol` stamps it on every write (database.js:162-164), including oral takes that write `units_taken` (markTaken.js:141). The date of a past dose edit is not recoverable; option B must start from "one version" for all existing protocols (as option B itself says). The Portuguese repeats it (:735 "a edição já grava só o que mudou").
- Genuine: yes (data model, pharmacometrics, scope).

### OPEN-11 — Skipped / Missed doses and the curve — VERIFIED

- Planned schedule disclosed (translations.js:787); ledger :206 "'Count only taken doses' is a model change for pharmacometrics review" VERIFIED. Option B reverses AD-19 / FX-13 (founder); the item names FX-13, acceptable.

### OPEN-12 — Lab values by hand — VERIFIED premises, NOT a genuine question

- Values enter storage only from scans (`persistMarkers` → `insertBiomarkers`, BodyScreen.js:630-645); per-value edit exists (BodyScreen.js:673). Approved explainer PT "Digite os valores de qualquer laudo…" (translations.js:5882; EN :1260); quota message "You can still enter everything by hand." (translations.js:1201); ledger :268 and :76 — VERIFIED.
- Under CLAUDE.md "Approved → the NEXT build … The ONLY way an approved item slips … is if the founder explicitly defers it", and the item itself says "nothing suggests" a reason to defer. Asking "Defer?" with no reason is the process the rule forbids; it belongs in the "Para você saber" list ("enters 1.3.0; say so if you want to defer").
- Missing context: the signed MB-13 deliberately removed "or enter values manually" from "Scan service unavailable" (my-body.md:27; decisions.md:110) while the shared quota message (translations.js:1201) still promises it.

### OPEN-13 — "Bloodwork due" — VERIFIED

- `BLOODWORK_INTERVAL_DAYS = 182; // ~6 months` (TodayScreen.js:153), alert at :1512-1519; EN "Bloodwork due" / PT "Exame de sangue pendente" (translations.js:532, :5154). No ledger line covers it (searched decisions.md and the Today design docs). Option D (remove) should mention the founder's "I need all the features" for Today (decisions.md:139).

### OPEN-14 — My Body scan line and two additions — PARTLY

- (a) "the signed MB-10 (2026-10-03): Premium strings carry no scan number" — PARTLY. MB-10 is "Part 6 free plan card … the S-24 text with no number in the Premium line" (my-body.md:24) — the "Premium line" is the free card's "· More with Premium", not a line for Premium users. The no-number rule is the founder's :104 ("Premium strings carry no scan number … The 20 appears only in the FAQ … and in the limit-reached message") and :257 ("The scan number appears only in the limit message"). The coordinator line :544 cannot override those (authority order), so **"20 in My Body" is already excluded — not a question.** What is NOT decided is whether Premium users get a scan line in My Body at all (today none: the card renders only `!premium`, BodyScreen.js:1100-1111); option A silently proposes a new line ("Lab, vaccine & vial scans · Included with Premium") that no signed row asks for. The real question, if any, is "add a Premium line?" (new UI, picture first).
- (b) "never how many they have used" — VERIFIED (no count string; server UTC month per :275). (c) per-value date edit only (BodyScreen.js:673) — VERIFIED.
- Genuine: (a) number part no; (b) and (c) yes (unapproved scope).

### OPEN-15 — Managing the subscription — PARTLY

- `Purchases.configure({ apiKey: key, appUserID: userId })` (purchases.js:67; the item cites :68, off by one) VERIFIED. Settings shows only the plan badge (SettingsScreen.js:617); no Restore / Manage rows in Settings — VERIFIED.
- "Store guidance expects cancellation to be reachable" and the recommendation's "Store rules 100%" — PARTLY / unsourced. The founder's "Store-owned controls follow the store's rules 100%" (decisions.md:40) is about the Apple and Google sign-in buttons. No store rule is cited that requires in-app cancellation; the item should cite one or call it a recommendation.
- Genuine: yes (scope).

### OPEN-18 — Built differently from what was approved — WRONG

- Item 1: decisions.md:205 dashed "(est.)" component lines — VERIFIED; code draws past solid / future dashed for every series (SerumCurveScreen.js:129-130) — VERIFIED; but the "(est.)" label IS shown (`blend_est_marker`, serumModel.js:60) — the only difference is the past segment's dash. **Recommendation reason PARTLY:** "the prototype made binding on 2026-10-01 draws every line the same way" — the prototype's curve screen charts `['test', 'tb', 'bpc']` only (prototype.html:1877) and never draws a blend; it cannot show how blend components are drawn. It is an inference, not a prototype fact.
- Item 2: FL-3 (food-log.md:16) and "nothing writes that mark" — VERIFIED (`insertFoodDayMarker` accepts 'not_recorded', database.js:514, but no caller passes it). Note the FL-3 deviation approved 2026-10-01 already says "a manual mark still breaks the run". The options text is confusing: "Change (2: keep the mark)" vs recommendation "2 keep — retire the mark" (OPEN-DECISIONS.md:267-268; PT :778-779 "mudar … manter a marca" vs "manter, aposentando a marca").
- Item 3: parse-food caps — VERIFIED (index.ts:28-30, :160-171). The recommendation "a normal user never reaches them" is contradicted by DV-213's own impact ("A heavy logger can be refused a parse within the 25 a day (the rolling 60 spans two days)").
- Item 4: Conflict 40 (decisions.md:441), :57 — VERIFIED; tracker gauge static (no Animated in TodayTracker.js). Missing: decisions.md:74 records the founder's "Motion 'Version B' … 'Apply all' (… Today ring fill …)" — the strongest founder line for the ring and it is not cited.
- Item 5: Conflict 31 (decisions.md:432) VERIFIED; but signed FX-11 is "one supply-low rule for the Today alert and the push" (fixes-1.2.5.md:24) and decisions.md:148 states "(the push now fires at 3, was 2)". One rule ⇒ one threshold; the Today alert was already 1–3. **Follows from a signed row — not a genuine question.** AD-60 (OPEN-DECISIONS.md:543) still says "Already in the ledger: the supply push fires at 3 doses left" while pointing to OPEN-18(5): the same fact is both decided and open.
- Item 6: drawn glyph — VERIFIED (AuthScreen.js:65-73 `AppleLogo` SVG path). decisions.md:40 (founder): "Store-owned controls follow the store's rules 100%: the Apple sign-in button per Apple's HIG". The direction is decided; what the founder must give is the go to download Apple's artwork (a download needs his permission). The option "keep the drawn glyph" contradicts his own line.
- Item 7: A-42, A-44, A-46 "founder to eyeball" — VERIFIED (features.md:182, :184, :186).
- **Item 8 — WRONG:** "spec-audit fails on them". `node scripts/spec-audit.cjs`: admin-panel and premium-and-auth print "(checklist NOT signed by founder)" and count as 2 warnings, not FAILs; fold-right-page prints "(signed - committed-to: 1.3.0 …)" — the regex `checklist-signed:\s*(.+)` (spec-audit.cjs:40) crosses the empty line and reads the next line as a signature. Gate S currently passes an unsigned checklist. This is a tooling defect worth its own registry row.

### OPEN-21 — Confirm ten coordinator decisions — PARTLY

- Citations: (1) decisions.md:599 "By logic from that principle (founder may override)" VERIFIED; F6 at :417 VERIFIED. (2) :544 VERIFIED. (3) :543 VERIFIED. (4) :535, :536, :537, :558; A-86b, A-87b (features.md:226, :228) VERIFIED. (5) :542 VERIFIED. (6) BK-14 scope (book-layout.md:31) does not name the wizard — VERIFIED. (7) :545 VERIFIED. (8) :506 VERIFIED. (9) Conflict 29 is at decisions.md:430; AD-54's table row cites ":429" (Conflict 28) — off by one (also in PRD-FOOD-25). (10) :458 VERIFIED.
- Item 4 text "Missed rows removed at an inactivity end on every phone" — PARTLY: the rule is "Missed rows the APP wrote after that end are removed (never a row the user entered)" (decisions.md:536). The Portuguese (:789) "doses perdidas removidas em todos os aparelhos quando o protocolo é encerrado por inatividade" reads as deleting the missed-dose history.
- Classification: items 1 ("by logic"), 7 ("Privacy, by logic"), 9 (the AD-54 row's own source is pure logic: FL-2 0–7 days, Today = 0, Yesterday = 1) and 10 ("resolved by the ledger + logic") are the same class as the 65 DL lines that are NOT put to him. Either they move to "Para você saber" or the DL list needs the same confirmation; the current split is arbitrary.
- Genuine: as a confirmation of coordinator lines, acceptable; low cost (one "A").

---

## Portuguese message (OPEN-DECISIONS.md:634-811)

### Counts and claims

| Claim (PT) | Check | Verdict |
|---|---|---|
| "218 problemas … 15 graves … 94 … 37 … 72" (:641) | Recount: 218 = 15 / 94 / 37 / 72 | VERIFIED — but contradicts the English OPEN-16 (216 / 14 / 71). "registrados no app" includes the 7 DOCS rows, which are documentation, not the app. |
| "54 pontos já estavam decididos … 52 … 2" (:642) | AD-01…AD-65 = 65; moved out 11 (AD-04, 10, 27, 29, 35, 44, 45, 46, 50, 54, 56) → 54; AD-49, AD-57 marked coordinator | VERIFIED as counts. "52 vêm de palavras suas" is generous: AD-48 is half logic ("applying it to the Dose-log Missed → Complete path is a logic extension"); AD-51 rests partly on :570 (coordinator, "applied by logic"); AD-60 is self-contradictory (above). |
| "65 pontos resolvi pela lógica … Estão no docs/decisions.md, uma linha cada" (:643) | DL-01…DL-75 = 75; withdrawn 10 (DL-16, 24, 32, 50, 51, 66, 67, 72, 73, 74) → 65; decisions.md:646-720 holds them | VERIFIED. (decisions.md:645 header still says "DL-01…DL-74"; DL-75 is at :720.) |
| "21 perguntas" (:644) | 21 OPEN items; all 21 appear as PT 1–21 and every PT question maps back | VERIFIED |
| "26 itens … voltaram para você" + the list (:646) | 14 AD + 12 DL = 26; each maps to an OPEN item | VERIFIED |
| "dois itens caíram (DL-50 e DL-73)", "DL-28 reescrita", "DL-16 … virou AD-65" (:646) | Matches the reclassification table | VERIFIED |
| "Nada disso entra em código antes da sua resposta" (:648) | — | Ambiguous: the 65 DL lines are presented as decided ("Se discordar … eu mudo"); the sentence should say which of them wait. |

### Mismatches between English and Portuguese

1. **OPEN-16 counts**: EN 216 / 14 S1 / 71 S4 vs PT 218 / 15 / 72 (:22 vs :641, :653).
2. **OPEN-16 (b)**: PT option B (:655) "na 1.3.0 só as exclusões; a contagem de doses na 1.3.1" drops DV-210 (paging fix, 1.3.0) and DV-209 (watermark race, 1.3.1); the PT context never mentions the two other ways a synced row can be missed.
3. **OPEN-20 (c) cross-reference**: PT "(o texto você vê no build de teste, pergunta 18)" (:711) — Portuguese question 18 is My Body scans; the eyeball list is question 20, and it does not contain the vial-expiry text (EN item 7 = A-42, A-44, A-46).
4. **OPEN-14 (b)**: PT adds a concrete design ("Mostrar 'N de 3 leituras usadas este mês' perto do botão de enviar?", :756) not in EN; EN's "For Premium, (b) shows the count without the limit" is missing in PT.
5. **OPEN-21 item 4**: PT omits "only rows the app wrote after the end" (see above).
6. Everything else matches in substance (questions, options and recommendations of PT 2–19, 21).

### Claims of "done / built / proven"

- PT 9 (:703) "No Android isso já foi construído … mas ainda falta a prova no aparelho" — consistent with features.md A-110 / A-111 and spec-audit (BR-9/10, RG-6/7/8 FAIL). VERIFIED.
- PT 10 (c) (:710) "Ficou pronto em 03/10" — VERIFIED (features.md:185 "Built 2026-10-03").
- PT 21 (:785) "já estão construídas ou planejadas para a 1.3.0" — VERIFIED (A-86, A-86b, A-87, A-87b "Not started", target 1.3.0).
- PT 20 (:779) "o protótipo … desenha todas as linhas iguais" — the prototype has no blend on the curve (prototype.html:1877); presented as fact, it is an inference.
- PT 7 (:691) "pular os dias sem dose prevista resolve o caso do semanal que você viu" — WRONG (already built; the weekly user still reads "2 dias sem falhar").
- PT 14 (:735) "a edição já grava só o que mudou" as the reason B is feasible — misleading (no change history; updated_at overwritten).
- PT 10 (b) (:709) "o app pede a permissão do sistema a cada abertura e a cada login" — WRONG as the founder will read it (the dialog appears once on iPhone).
- PT 20 (:779) item 3 "quem usa normalmente nunca chega perto" — contradicted by DV-213's own impact.
- PT 19 (:766) "regra da loja é 100%" — over-extends the founder's rule about sign-in buttons.

### Literal translation, wrong meaning, jargon (the founder reads Portuguese, is not a developer)

- **"nunca destruir dado por tabela"** (:723 and :797) translates "never destroy on a maybe". "Por tabela" means "indirectly / as a side effect" — a different meaning. Natural: "nunca apagar dado na dúvida".
- **"registro" for three concepts**: the decisions ledger ("o registro de decisões", :638), the Dose log ("registro de doses", :695, :697 — matches today's app string `log_title` "Registro de doses", translations.js, but AD-59 says the decided PT name is "Histórico"), and the internal registry features.md ("alvo escrito no registro" :654/:656, "uma dúvida antiga do registro" :716, "lembrete com data no registro" :809). One term per concept is broken inside the message itself; AD-59 vs the code is also unresolved.
- **"leituras" for two concepts**: AI scans ("3 leituras grátis por mês", :756) and food parses ("as 25 leituras zeram à meia-noite" :774; "25 leituras de comida" :807). The app calls the food limit "registros" (`nutri_quota`).
- **IDs and paths the founder cannot use**: the 26 codes "AD-04, AD-07*, … DL-74" (:646), "DL-16", "AD-65", "DL-50 e DL-73", "DL-28", "docs/decisions.md" (:643). Since the message says this is the first version sent ("antes de te mandar", :638), "O que mudou desde a versão anterior" describes a version he never saw — noise for him.
- Jargon: "Gate B" (:655, glossed but still a code word), "teste no servidor desfeito antes de aplicar" (:655, awkward for "rolled-back dry run"; natural: "um ensaio no servidor que é desfeito antes de aplicar de verdade"), "a varredura de doses perdidas" (:694 — he does not know there is a "scan"; natural: "a verificação de doses perdidas"), "muda o modelo de dados sincronizado" (:734), "a correção da fila de leituras de comida (DL-28)" (:646 — DL-28 is about counting the daily limit, not a queue).
- "adianta a data de início" (:788) — "adiantar" is ambiguous (earlier or later); EN is "moves the start earlier". Natural: "muda a data de início para antes".
- App-string drift: "Continuar com Apple" (:777) vs the app's "Continuar com a Apple" (`auth_continue_apple`, translations.js PT); heading "Curva de acúmulo" (:730) vs the app's "Acúmulo de doses"; "Comida com IA" (:713) vs the app's "Registro de comida com IA".
- PT 20 item 2 options/recommendation are self-contradictory to a lay reader: "2: manter a marca" (as the CHANGE) vs "2 manter, aposentando a marca" (as the recommendation) (:778-779).
- App terms used correctly (checked against translations.js PT): "Seus números reais", "Parar a medição", "Concluir", "Pular", "Desfazer", "Ainda em andamento?", "Fora do prazo", "Excluídos recentemente", "Excluir para sempre", "Garanta que seus lembretes cheguem", "Algo está bloqueando seus lembretes", "Do seu lembrete", "Restaurar compras", "Corrigir este registro", "Seus números", "pesagens", "Meus protocolos", "Exame de sangue pendente", "Mandando bem!".

---

## Missing questions

Rows and ledger items that need the founder but are not in OPEN-01…OPEN-21 (or the PT message):

1. **Production SQL go-aheads not collected.** DIVERGENCES rows whose fix "needs the founder's go": DV-088 / DL-64 (`updated_at` trigger on `reality_checks`), DV-209 (watermark), DV-221 (wider tombstone blanking, decisions.md:540). Only DL-28 (a function deploy) and OPEN-16(b) mention "só aplico com o seu 'pode aplicar'". One line asking for (or scheduling) these approvals is missing.
2. **Wording approvals (×6) not collected.** Rows whose fix says "founder approves the wording": DV-049 (DL-48), DV-071, DV-212 (AD-19), DV-186 (AD-64), DV-190 (AD-57), DV-140 (AD-26), DV-150, DV-201, DV-215. decisions.md:85 requires founder approval for every new or changed string in all 6 languages; the message never says when he will see them.
3. **Conflict 40, second half — the curve intro on every open** (decisions.md:441). OPEN-18 item 4 covers only the ring; PRD-CURVE-25 still routes it to AD-44 (withdrawn) and AD-52.
4. **A-30 window for long depots** (decisions.md:417; features.md:378 "pending the founder's Undecanoate confirmation": 180-day cap vs max(180 d, 5 × t½)). No canonical ID in OPEN-DECISIONS (grep: A-30 appears only in DL-21).
5. **Other :417 founder items with no canonical ID**: the streak explainer text (grok/006); the 1.2.3 deferred food-nudge items; admin panel rule 4 wording and O-3 / O-4 / O-5 / O-7 (admin-panel.md:201-202 "Needs a founder-approved list or flag"). OPEN-18(8) asks him to sign the admin checklist but not to answer O-3…O-7. (A-15 → DL-37 and A-37 → decisions.md:157 are covered.)
6. **DV-211 — the Apple client secret rotation** is "the founder's console step" (register) and needs the .p8 he keeps (STATE.md:17). The PT note (:809) says "Vou deixar um lembrete" but not that the step is his.
7. **Spec-audit parser defect** (spec-audit.cjs:40 reads the line after an empty `checklist-signed:` as a signature) — not a founder question, but Gate S currently passes an unsigned checklist; it needs a registry row.

DIVERGENCES rows whose founder column names an OPEN item: 43 rows, all pointing to existing OPEN-01…OPEN-21 (13 to OPEN-21), matching the register's own statement. No row points to a non-existent OPEN ID. DV-209 and DV-210 are offered as options in OPEN-16(b) but are marked "No (bug)".
