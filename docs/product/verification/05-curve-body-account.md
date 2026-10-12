# Verification 05: curve, My Body, account (independent check)

- Checked 2026-10-12 on branch `redesign/graduated` by an independent verifier. Nothing written by the PRD, TRD, flow or register authors was trusted: every row below was checked against the source code, `docs/decisions.md`, `STATE.md`, `i18n/translations.js` or a node run. No code or product doc was changed.
- Scope: (A) Dose accumulation curve and Journey (tag CURVE, flow 10, dossier 05); (B) My Body labs and vaccines (tag BODY, flow 11, dossier 06); (C) onboarding, account, Premium, Settings, AI consent (tag ACCT, flows 01, 12, 13, dossier 07).
- Verdicts: **VERIFIED** (the code/ledger says exactly this), **PARTLY** (true in substance, a detail is wrong or overstated), **WRONG** (contradicted by the code, the ledger or live state), **UNVERIFIABLE** (needs a device, live data or a visual check this pass could not do).
- Some rows group several requirements whose evidence is the same (for example strings that all exist in EN and PT). Each row counts once.

## Counts

| Domain | VERIFIED | PARTLY | WRONG | UNVERIFIABLE | Rows |
|---|---|---|---|---|---|
| A. CURVE | 62 | 13 | 0 | 6 | 81 |
| B. BODY | 61 | 1 | 1 | 2 | 65 |
| C. ACCT | 81 | 7 | 6 | 6 | 100 |
| **Total** | **204** | **21** | **7** | **14** | **246** |

(Counted mechanically from the verdict column of the tables below. The reproductions and omissions are not counted.)

## The most important errors

1. **"Continue with Apple" on Android is described as not live, but it is live.** PRD-AUTH-7 says "Today the server side is NOT configured, so the button is hidden". DV-115, G-114, flow D01-8, TRD §1.7 (line 257) and dossier 07 (§8 row, §9 item 13) say the same, and DV-115 rates the impact as "Android users with an Apple-created account cannot sign in". In fact:
   - `STATE.md:17` records the Apple side and the Supabase side as done by the founder on 2026-10-03, and the redirect `dosetrace://auth-callback` as added.
   - A live probe on 2026-10-12 of `/auth/v1/authorize?provider=apple` (the same probe `lib/appleWebCheck.js` runs) returned 302 to `appleid.apple.com/auth/authorize?client_id=io.outcom.dosetrace.signin`, so `appleWebReady` is true and the button shows.
   - The founder signed in with Apple on his Android Fold on 2026-10-07 with build 47.

   Every author copied the stale line `docs/specs/premium-and-auth.md` Manual setup step 7 ("today it answers 400"). The only true part of DV-115 left is that the ship-check Gate B allow-list text lacks `dosetrace://auth-callback` (`.claude/skills/ship-check/SKILL.md:96-97`). **A real risk is missing from every doc:** the Apple web client secret expires on **2027-04-04** (`STATE.md:17`). When it lapses, every Android Apple sign-in fails. Since Android Apple accounts are now real, the Android paths for deletion (the manual-revoke note, no `apple-link`) and for display names (DV-084) are live behaviour, not hypotheses.
2. **Two live strings still say the curve comes from the user's log, and the PRD makes one of them a requirement.** `paywall_hero_sub` ("Dose-accumulation curves from your own log…") and `settings_premium_feat_1` ("Dose accumulation curve from your own log") say this in all 6 languages, used at `PaywallScreen.js:278` and `SettingsScreen.js:642`. This contradicts AD-19 / FX-13 (decisions.md:111: the curve follows the PLANNED schedule). DV-071 / G-70 / D10-9 list only `curve_empty_sub` and `curve_combined_hint`. PRD-PREM-1 quotes the paywall hero as the required copy.
3. **OPEN-15 (PT question 15) rests on a false premise.** It says "Quem paga e reinstala o app não acha onde restaurar" (someone who pays and reinstalls the app cannot find where to restore). But RevenueCat is configured with `appUserID` = the Supabase user id (`lib/purchases.js:68`), so signing in after a reinstall brings Premium back with no Restore at all. And a payer whom the app does not see as Premium is shown the Settings Premium card, which opens the paywall with "Restore purchases" (`SettingsScreen.js:655`, `PaywallScreen.js:376`). The real gap is the missing "Manage / cancel subscription" and trial or billing state. DV-112 carries the same overstated impact.
4. **OPEN-14(a) (PT question 14) and AD-56 contradict each other.** OPEN-14 says users discover the monthly limit only when a scan is refused. But the Lab test journal always shows the limit to free users: "You get 3 free scans a month (labs, vaccine cards and vials combined)." in the empty state, and the free-plan card "3 free scans a month … · More with Premium" (`BodyScreen.js:1100-1110`). AD-56 itself says the line shows each plan's number. What is missing is the count of scans *used or left*, not the limit.
5. **The D2 (DST) evidence in flow 10 does not match its own fixture, and the curve's "—" rule has a hole nobody noted.** The mechanism is reproduced below: tile 0.0625 mg vs curve 0.25 mg at 0.5 mg; tile ≈0.0 vs 0.25 on 2027-03-19.
   - F10-12 sets up BPC-157 at **250 mcg** but expects the 0.5 mg numbers. With 250 mcg the values are 0.031 vs 0.125.
   - The divergence also runs the other way: at 11:30 the tile shows a dose the curve does not have yet (0.125 vs 0.0 mg).
   - Separately, "Estimate on a date" more than 365 days back shows "—" per compound, but the **Combined** row still prints a computed number (`SerumCurveScreen.js:1021` vs `:1031`).
6. **DV-081 / PRD-ACCT-3 overstate which keys leak between accounts.** The curve view (`dosetrace_curve_view_{userId}`) and the food chat draft (`draftKey(userId)`) are per-user keys. They stay on the phone as residue, but another account never inherits them. The PRD's "explainer flags" also contradicts PRD G-117, which closes them as consistent. The real cross-account leaks are confirmed: `dosetrace_missed_since` / `_tz` / zone history (`lib/doseActions.js:123-127`), `dosetrace_vial_low_sent` (`lib/notifications.js:474`), alert snoozes, and AI consent (`lib/aiConsent.js:19`, not in `runWipeSteps`, `lib/signedOut.js:158-170`).

Also noteworthy (smaller):
- `registry F-070` (`docs/review/features.md:107`) says "Labs: manual entry … Shipped". The code and the git history of `screens/BodyScreen.js` show no manual lab entry, ever. The registry row is wrong; DV-107's "never built" stands.
- DV-076 can be upgraded from SUSPECTED to CONFIRMED. In node, `validateExtraction({markers:[{value:'1,025'}]})` gives 1025, while `parseMeasure('1,025','en')` gives 1.025.
- DV-077 can be upgraded to CONFIRMED: `report_date '2099-01-01'` passes `validateExtraction` with `dateFallback: false`.

## Reproductions (node, plain `require` of the repo files)

**D1 (tile ≠ curve after End + Restart).** Run with `TZ=America/New_York` at 2026-10-12 12:30. Fixture: Testosterone Cypionate 100 mg every 7 days, id 10, ended 2026-10-10; restarted as id 11 (start 2026-10-10); saved view `{selectedIds:[10]}`.
- Tile / My Body (`defaultCurveLevel(getActiveProtocols…)`, i.e. active only): protocol **11**, 73.53 mg.
- Curve (`curveHistoryProtocols` → `splitCurveProtocols` → `restoreCurveView`): protocol **10**, 154.63 mg.
- The mechanism matches 05:D1. The docs' 68.53 / 10.04 mg come from another fixture and are not reproducible without it; they are illustrative, not wrong.

**D2 (DST grid).** BPC-157 0.5 mg daily (t½ 0.5 h). Tile = `estimatedLevelNow` (14-day grid); curve = `levelAt(scheduledDoses(curveGridStart(now,3)…))` (3-day grid).

| Zone, moment | Tile | Curve |
|---|---|---|
| New York 2026-11-06 12:30 | 0.0625 | 0.25 |
| New York 2027-03-19 12:30 | 3.6e-15 ("0") | 0.25 |
| Berlin 2026-11-06 12:30 | 0.0625 | 0.25 |
| New York 2026-11-06 11:30, 250 mcg | 0.125 | 0.0 |
| New York 2026-11-15 12:30, 250 mcg | 0.125 | 0.125 (equal again, about 14 days after the 2026-11-01 change) |

---

## A. CURVE (dose accumulation and Journey)

### A.1 PRD requirements (§4.7)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| PRD-JOUR-1 | Order: header → food card → two tiles (stacked at ≥130 %) → two folds; no adherence or labs tile | VERIFIED | `JourneyScreen.js:153-162` (FoodLogHero, `fontScale >= 1.3 && s.duoStack`), `:236` folds | — |
| PRD-JOUR-2 | Food card content / 7-day run line | UNVERIFIABLE | FOOD domain, not re-checked here | — |
| PRD-JOUR-3 | Progress tile daily burn and gate | UNVERIFIABLE | PROG domain (G-52), not re-checked here | — |
| PRD-JOUR-4 | Tile: Premium + charted → dot, name, Est. level, chip; free → tag + description | VERIFIED | `JourneyScreen.js:213-233` | — |
| PRD-JOUR-5 | Premium unknown reads as free, tap → paywall | VERIFIED | `premium` starts `null` (`:68`); `if (!premium) navigate('Paywall')` (`:206`) | — |
| PRD-JOUR-6 | Journey tile tap fires no analytics | VERIFIED | no Analytics import in JourneyScreen; Body `:846`, Log `:522` fire `viewed('serum_curve')` | — |
| PRD-JOUR-7 | Explainer last line; FAQ answers | VERIFIED | EN string present ×1; FAQ answers not re-read | — |
| PRD-JOUR-8 | Book layout Journey | UNVERIFIABLE | Fold device behaviour | — |
| PRD-CURVE-1 | Only recon/rtu; reasons named; orals silent | VERIFIED | `serumModel.js` `splitCurveProtocols` filters type before the reason lists | — |
| PRD-CURVE-2 | Exclusions list; label-verified half-lives | VERIFIED | `halfLives.js:173-176` CURVE_EXCLUDED; Tesamorelin 0.13, Undecanoate 2160, Cetrorelix 20.6, Sustanon 168. GDF-8 and Dermorphin are not in CURVE_EXCLUDED but were removed from the table (`getHalfLifeEntry` → null), so they are still not charted | — |
| PRD-CURVE-3 | Blend split "(est.)"; picker lacks the blend name | VERIFIED | `splitCurveProtocols` `__label`; picker `SerumCurveScreen.js:1113` | — |
| PRD-CURVE-4 | Ended offered 365 days, "· ended", most recent first | VERIFIED | `curveHistoryProtocols`; `SerumCurveScreen.js:319` | — |
| PRD-CURVE-5 | mg except IU-native; HGH mg→IU ×3; one unit per chart | VERIFIED | `halfLives.js:33` (`iuPerMg: 3`), `:263-273`; `curveView.rememberedIds` first unit | — |
| PRD-CURVE-6 | exact → alias → longest key; "excluded entries stay in the table" | PARTLY | true for the CURVE_EXCLUDED set; GDF-8 and Dermorphin were deleted from the table instead (`halfLives.js:141-145`) | "excluded entries stay in the table, except GDF-8 / Dermorphin, which were removed" |
| PRD-CURVE-10 | Doses from the schedule, calendar-day stepping, creation day ≥1 | VERIFIED | `scheduledDoses` loop; `schedule.js:57-61` | — |
| PRD-CURVE-11 | Fixed local hours | VERIFIED | `DOSE_SLOTS` `serumModel.js:28` | — |
| PRD-CURVE-12 | Skipped / Missed never change the curve | VERIFIED | no `dose_logs` read in the model | — |
| PRD-CURVE-13 | One current dose for every past dose | VERIFIED | `levelAt(doses, doseMg…)` with one `p.dose` | — |
| PRD-CURVE-14 | Look-back max(16 d, "days since start + 2", 6×t½) ≤600; 6 h samples; 30×t½+3×Tmax drop | PARTLY | the middle term is days of the **shown window** + 2 (`shown = floor((now − gridStart)/day) + 2`), not days since the protocol start; the rest matches (`curveSampling.js:8`) | "days in the shown window + 2" |
| PRD-CURVE-15 | `history_from` cut; estimated-before marker only inside the window | VERIFIED | `scheduledDoses` `history_from`; `estimatedBeforeMs` | — |
| PRD-CURVE-16 | Combined per substance; `substance_boldenone` missing ×6 | VERIFIED | `grep -c substance_boldenone` = 0; boldenone substance in `halfLives.js` | — |
| PRD-CURVE-17 | Sex-neutral | VERIFIED | no sex, weight or body-fat input in `serumModel` / `halfLives` | — |
| PRD-CURVE-20 | Screen order and stats | UNVERIFIABLE | visual order not re-checked on device | — |
| PRD-CURVE-21 | Opens on 3 days; window min(365, back+1); day letters d/d/d/j/T/gg | VERIFIED | `CURVE_DEFAULT_PAST_DAYS = 3`, `curveWindowDays`; `unit_day_short` j/T/gg | — |
| PRD-CURVE-22 | Number format | VERIFIED | `levelLabel` | — |
| PRD-CURVE-23 | Colours (one compound data blue, several protocol colours, Combined ink) | VERIFIED | `SerumCurveScreen.js:429`, `:862` | — |
| PRD-CURVE-24 | "Doses counted" counts the window only | VERIFIED | `dosesInWindow` `:424` | — |
| PRD-CURVE-25 | 2.4 s draw-in; Reduce Motion final frame | VERIFIED | `C_DRAW = 2400`; `useReducedMotion` `:525-551` | — |
| PRD-CURVE-30 | Disclaimer says planned schedule, not a medical device | VERIFIED | `curve_disclaimer` EN/ES/PT | — |
| PRD-CURVE-31 | "Estimated" chip, "Est. level" labels | VERIFIED | `hy_estimated`, `curve_current_level` | — |
| PRD-CURVE-32 | Tier tags, "Estimated — no human data" | VERIFIED | `curve_tier_*` `:760-762` | — |
| PRD-CURVE-33 | Copy never says "logged" — only two strings listed | PARTLY | also `paywall_hero_sub` and `settings_premium_feat_1` ("from your own log", ×6, live) | add both strings to G-70 / DV-071 |
| PRD-CURVE-40 | Chips; wheel 10 y back … 2 y ahead; >365 d → "—" | PARTLY | wheel `wheelPick.js:16` ✓; "—" only for per-compound rows; the Combined row shows a number (`:1031`) | add: Combined row computes a value out of window |
| PRD-CURVE-50 | Remembered view per user, written only on change; fallback newest | VERIFIED | `curveViewStore` save on change `:354`; `SQL_HISTORY ORDER BY created_at DESC` | — |
| PRD-CURVE-51 | Tile = card = curve; G-63/G-64/G-65 | VERIFIED | reproduced D1/D2 above; no listener in BodyScreen | — |
| PRD-CURVE-60 | Premium checked every focus; replace / navigate | VERIFIED | `SerumCurveScreen.js:281-292` | — |
| PRD-PREM-1 (curve copy) | Paywall hero "Dose-accumulation curves from your own log…" as the requirement | PARTLY | the string exists, but it contradicts AD-19 | require "…from your planned schedule…" (founder wording) |

### A.2 DIVERGENCES rows (CURVE)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-005 | Current dose / interval / start applied to the whole past | VERIFIED | `scheduledDoses(p…)` + one `doseMg` | — |
| DV-067 | Tile/Body active-only vs curve history (S2, script) | VERIFIED | reproduced (ids 11 vs 10) | numbers in the row are fixture-specific |
| DV-068 | DST 14-day vs 3-day grid, "tile 0.0 vs curve 0.25" | VERIFIED | reproduced (2027-03-19) | also note the reverse direction (curve 0 / tile >0) |
| DV-069 | Fixed hours; end-day dose after the end; undisclosed | VERIFIED | `DOSE_SLOTS`; `expectedDosesOn` end-day count placed at 12:00 | — |
| DV-070 | `substance_boldenone` ×6 missing | VERIFIED | grep 0 | — |
| DV-071 | `curve_empty_sub`, `curve_combined_hint` say logged | PARTLY | true, but incomplete: `paywall_hero_sub`, `settings_premium_feat_1` too | widen the row and its copy test to `paywall_*` / `settings_premium_*` |
| DV-072 | Skipped / Missed still count | VERIFIED | model never reads `dose_logs` | — |
| DV-105 | No analytics on Journey tile | VERIFIED | see JOUR-6 | — |
| DV-106 | Enanthate / Nandrolone instant | VERIFIED | `halfLives.js:37`, `:42` no `tmaxHours` | — |
| DV-152 | My Body no 'curve' listener | VERIFIED | no `addSyncListener` in BodyScreen at all | also: Body never reloads on a sync pull while focused |
| DV-153 | Picker lacks the blend | VERIFIED | `:1113` | — |
| DV-154 | Tile while Premium unknown | VERIFIED | `:206`, `:215` | — |
| DV-155 | Orals silent | VERIFIED | filter before reasons | — |
| DV-156 | Blend lines drawn like any compound | VERIFIED | `CurveLine` solid past / dashed future, no blend branch | — |
| DV-157 | "Most recent Taken dose" fallback not built | VERIFIED | `restoreCurveView` → `active[0]` | — |
| DV-158 | Wheel 10 y; >365 d "—" | PARTLY | per-compound only; Combined row shows a number | add the Combined case |
| DV-159 | View keyed by local ids | VERIFIED | `rememberedIds` compares `p.id` (SQLite autoincrement) | — |
| Summary row | CURVE = 17 rows (S1 1 / S2 6 / S3 2 / S4 8) | PARTLY | the count is right, but "Doses counted" (D10-5) sits in DV-096 tagged PROT | tag DV-096 CURVE or say so in the summary |

### A.3 AD / DL citations (CURVE)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-18 | Same compound and Est. level; decisions.md:209, :261 | VERIFIED | both lines say so | — |
| AD-19 | Planned schedule, never "logged"; :111 | VERIFIED | line 111 | its DV row misses two strings (above) |
| AD-20 | Not-charted named; :130 | VERIFIED | line 130 | — |
| AD-33 | View device-local; :208, :380 | VERIFIED | both lines | — |
| AD-47 | Curve stays Premium; :279, :292 | VERIFIED | both lines | — |
| AD-44 | Motion count-ups (cited by CURVE-25) | UNVERIFIABLE | not re-read against the intro | — |
| DL-31 | Doses at the user's times | VERIFIED | no contradiction; DOSE_SLOTS today | — |
| DL-32 | Blend lines like any compound; "later approval :209 wins" | PARTLY | decisions.md:209 does not mention blends; the reasoning rests on the prototype rule (2026-10-01), not on :209 | cite decisions.md:37 / prototype binding instead |
| DL-33…DL-37 | Picker names, tile waits, wheel 365, fallback, Tmax only with a source | VERIFIED | consistent with the ledger and the code | — |

### A.4 TRD ownership (CURVE)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S-60 | `lib/entitlement.js` one helper; divergences listed | VERIFIED | `entitlement.js`; quota.ts `unreachable` = Premium | — |
| S-61 | Screen history vs tile/Body active (05:D1) | VERIFIED | JourneyScreen:109, BodyScreen:402 `getActiveProtocols` | — |
| S-62 | `estimatedLevelNow` grid 14 d vs 3 d | VERIFIED | reproduced | — |
| S-63 | Doses counted window only | VERIFIED | `:424` | — |

### A.5 Flow 10 (diagrams, divergence notes, acceptance vs i18n)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| §6.1 | Intro → Settled at 4.8 s | VERIFIED | 2400+280+800+1300 = 4780 ms | — |
| §6.2–6.4 | Selection, window and tile state diagrams | VERIFIED | `curveView.js`, `curveWindowDays`, JourneyScreen | — |
| §7.1 | Look-back "max(16 days, 6 × t½)" | PARTLY | omits the shown-window term | add it |
| §7.2 D1 / D2 notes | Numbers 68.53 / 10.04; 0.0625 / 0.25 | VERIFIED | mechanism reproduced; D2 numbers reproduced at 0.5 mg | — |
| §7.3–7.8 | Gating, Fold, free vs Premium table | VERIFIED | code paths above | — |
| §9 | View key `dosetrace_curve_view_{userId}`; analytics Body/Log only | VERIFIED | `curveView.js:12` | — |
| F10-01…F10-09, F10-13 | EN/PT strings ("Evolução", "Acúmulo de doses", "Nível est. · agora", "Escolher compostos", "Mostrar total combinado", "Estimativa em uma data", "Outra data", "Dados clínicos", "Nenhum protocolo compatível", free-tile sentence…) | VERIFIED | every string present in `translations.js` | — |
| F10-09 | Date 400 days back → row "—" | PARTLY | true per compound; the Combined row (if on) prints a number | expect "—" on every row (or record) |
| F10-10 | "a date 2 days before today (window widens)" | PARTLY | 2 days back is inside the 3-day window (`curveWindowDays` keeps 3); a protocol created today already shows the marker | drop "window widens" |
| F10-12 | Setup BPC-157 250 mcg; "Today: tile 0.0625 vs curve 0.25" | PARTLY | with 250 mcg: 0.031 vs 0.125 (labels "0.0" / "0.1") | use 0.5 mg or halve the numbers |
| F10-14, F10-15 | Fold and both themes | UNVERIFIABLE | device | — |

### A.6 Portuguese founder questions 10–11

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| Q10 (OPEN-10) | Current dose / interval / start / doses-per-day applied to the past; open since 13/09; "a edição já grava só o que mudou" (the edit already saves only what changed) | VERIFIED | `scheduledDoses`; journey-review-eval-2026-09-13; `protocolForm.editPatch` | — |
| Q11 (OPEN-11) | Planned schedule disclosed; "count only taken" = pharmacometrics review (24/09) | VERIFIED | `curve_disclaimer`; decisions.md:206 | — |

---

## B. BODY (My Body: labs, vaccines, hub)

### B.1 PRD requirements (§4.8)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| PRD-BODY-1 | Hub title, subtitle, three cards | VERIFIED | strings present; layout not re-checked visually | — |
| PRD-BODY-2 | Count per upload; hub ≠ journal (G-92) | VERIFIED | `bodyHub.uploadKey`; node: 2 same-date batches → hub 2, `reportCards` 1 card | — |
| PRD-BODY-3 | Next due from the user's date ≥ today | VERIFIED | `nextDueVaccine` | — |
| PRD-BODY-4 | Curve card Premium / free preview | VERIFIED | `BodyScreen.js:847-953`; "See your compound build up" | — |
| PRD-BODY-10/11 | Journal header, By date / By marker, favourites first, variant merge | VERIFIED | `reportCards`, `canonicalMarker`; strings | — |
| PRD-BODY-12 | Empty state and free card texts | VERIFIED | strings ×1 each; `:1100-1110` | — |
| PRD-BODY-13 | Upload upsell sheet | VERIFIED | "Lab, vaccine & vial scans", trial lines present | — |
| PRD-BODY-14 | Typed-by-hand free, charts Premium; no manual entry; charts not gated | VERIFIED | only insert = `persistMarkers` (`:644`); `MarkerChart` with no Premium check (`:1067`) | — |
| PRD-BODY-15 | Explainer promises manual entry | VERIFIED | `xp_labsman_body`; `BodyScreen.js:189` | — |
| PRD-BODY-20 | Consent then source sheet; no client quota gate | VERIFIED | `BodyScreen.js:466-474`; quota only server-side | — |
| PRD-BODY-21 | 10 MB client, 15 MB base64 server, 413 | VERIFIED | `VaccinesSection.js:44`; `extract-bloodwork/index.ts:11`, `:205` | — |
| PRD-BODY-30 | Auto-save dated from the document; local-today fallback flagged | VERIFIED | `bodyScan.validateExtraction` (`localISO`) | — |
| PRD-BODY-31 | Error sheets; "PDF" for photos (G-104) | VERIFIED | `scanErrorSheet`; `blood_error_read` "Could not read the PDF" | — |
| PRD-BODY-32 | 200 with no usable values counted (G-99) | VERIFIED | `work: ok = status === 200` (`index.ts:358-361`); release only on failure (`quota.ts:156-162`) | — |
| PRD-BODY-33 | Future document date accepted | VERIFIED | node: 2099-01-01 kept, `dateFallback: false` | upgrade DV-077 to CONFIRMED |
| PRD-BODY-40 | Card grouping: same date joins unless a marker repeats | VERIFIED | `reportCards` `:99-121` | — |
| PRD-BODY-41 | Labels keyed by date (G-95); `user_metadata` | VERIFIED | `report_tags` by date (`:425-439`) | — |
| PRD-BODY-42 | Marker page, chart ≥2 readings, tie-break differs | VERIFIED | `:1060-1070`; `getBiomarkers ORDER BY report_date DESC, marker` vs hub `created_at` | — |
| PRD-BODY-50 | Edit value; scan "1,025" = 1025 vs edit 1.025 | VERIFIED | node: `parseDecimal('1,025')` 1025, `parseMeasure('1,025','en')` 1.025 | upgrade DV-076 to CONFIRMED |
| PRD-BODY-51/52 | Delete value / test asks first; labels cleared when nothing is left | VERIFIED | `:720-726`; `blood_value_delete_*` | — |
| PRD-BODY-53 | No whole-test date change | VERIFIED | no such action in BodyScreen | — |
| PRD-BODY-60/61 | Vaccine journal; ranges 80 y back / next due 10 back–15 ahead; untouched wheel sets today | VERIFIED | `VaccinesSection.js:48-49`, `:576` | — |
| PRD-BODY-62 | Delete vaccine asks first | VERIFIED | "Delete vaccine?" | — |
| PRD-BODY-63 | Vaccine scan; details land in Notes | VERIFIED | `VACCINE_PROMPT` JSON has only name / dates / notes (`index.ts:61-90`) | — |
| PRD-BODY-64 | No vaccine reminder | VERIFIED | none in code | — |
| PRD-BODY-65, -80 | Fold read page / book layout | UNVERIFIABLE | device | — |
| PRD-BODY-70 | Export; CSV omits vaccine details | VERIFIED | `exportRecords.js:70-71`, `:131-133` | — |
| Edge "UTC month" | Pool boundary is the UTC month | VERIFIED | `index.ts:160` `Date.UTC` | — |
| Free/Premium line | "Free: … scans within 3 a month" | VERIFIED | `quota.ts:10-11` | — |

### B.2 DIVERGENCES rows (BODY)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-006 | Favourites / labels in `user_metadata`, whole writes, errors swallowed | VERIFIED | `BodyScreen.js:410-426` `.catch(() => {})` | — |
| DV-073 | Hub per batch; biomarker `created_at` not synced → per-marker count elsewhere | VERIFIED | `syncMappers.js:117-121` (no `created_at`); push is row by row (`syncCore.js:642`) so each row gets its own server `now()`; pull copies it (`:529-531`) | — |
| DV-074 | Latest tie-break differs (SUSPECTED) | VERIFIED | SQL order vs `bodyHub.newer` | — |
| DV-075 | Labels keyed by date | VERIFIED | `report_tags[date]` | — |
| DV-076 | Scan vs edit parse (SUSPECTED) | VERIFIED | reproduced in node | mark CONFIRMED |
| DV-077 | Future report date accepted (SUSPECTED) | VERIFIED | reproduced in node | mark CONFIRMED |
| DV-078 | Unusable 200 counted | VERIFIED | see BODY-32 | — |
| DV-079 | Export omits five vaccine fields | VERIFIED | `exportRecords.js:70-71` | — |
| DV-080 | Mixed units on one axis; x by index | VERIFIED | `MarkerChart.js:46` `X = i/(n-1)` | — |
| DV-107 | No manual lab entry although promised (registry F-070) | VERIFIED | no insert path; `vial_scan_quota_sub` "You can still enter everything by hand"; git history of BodyScreen has no manual entry | also flag registry F-070 "manual entry … Shipped" as wrong |
| DV-108 | Charts free though Premium by decision | VERIFIED | `:1067` | — |
| DV-109 | Vaccine prompt lacks the detail fields | VERIFIED | `index.ts:69-70` | — |
| DV-110 | "No visible scan budget" | PARTLY | the **limit** is visible to free users (`:1100-1110`, empty state); the **used / left count** is not | reword: "scans used / left never shown" |
| DV-111 | "Bloodwork due" fixed 182 days | VERIFIED | `TodayScreen.js:153`, `:1512-1521` | — |
| DV-160 | Small defects (PDF read before size check, untouched wheel, "0 imported", "PDF" copy) | VERIFIED | `VaccinesSection.js:197-198`, `:576`; `blood_error_read` | — |
| DV-161 | No vaccine reminder | VERIFIED | — | — |

### B.3 AD / DL citations (BODY)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-02 | Never lose data; writes merge (CLAUDE.md, :369-371) | VERIFIED | CLAUDE.md rule | — |
| AD-21 | Hub counts like the journal; :259 | VERIFIED | line 259 | — |
| AD-22 | No future test dates; :265 | VERIFIED | line 265 | — |
| AD-23 | Failed extractions not counted; :275 | VERIFIED | line 275 | — |
| AD-24 | Typed-by-hand free, charts Premium; :268 | VERIFIED | line 268 | — |
| AD-56 | Scan line shows each plan's number; :544 over :104 | VERIFIED | line 544 | contradicts OPEN-14(a) (see B.5) |
| DL-38…DL-44 | Latest tie-break, labels per card, parseMeasure, vaccine fields, complete export, chart units / time, no vaccine reminder | VERIFIED | consistent with the ledger lines cited; no contradiction found | — |

### B.4 TRD ownership (BODY)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S-70a | Latest lab date, "three equivalent computations" | UNVERIFIABLE | Today `:221`, hub `labHubSummary`, curve chips seen; equivalence not proven | — |
| S-70b | Labs due inline `TodayScreen.js:153, 1512-1524` | VERIFIED | lines match | — |
| S-70c | Report grouping vs hub count; H-4 | VERIFIED | see DV-073 | — |
| S-70d | Series / favourites tie-break | VERIFIED | see DV-074 / DV-006 | — |
| S-70e | `nextDueVaccine` | VERIFIED | `bodyHub.js` | — |
| S-70f | Quota server-only (UTC month) | VERIFIED | quota.ts | — |
| TRD headline 4 / H-4 | `created_at` not sent for biomarkers, vaccines, vials… | VERIFIED | `syncMappers.js:103-131` | — |

### B.5 Flow 11 and Portuguese founder questions 12–14

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| Flow 11 divergence notes D11-1…D11-11 | as in DV rows | VERIFIED | see B.2 (D11-6 inherits DV-110's wording) | — |
| Flow 11 acceptance strings EN/PT ("Meu corpo", "Todos os seus registros em um só lugar.", "Diário de exames", "Lendo seu exame", "Exame importado", "Limite mensal de leituras atingido", "Serviço de leitura indisponível", "Primeiro, digite o nome da vacina.", "Vacinas importadas", date-fallback line, "Exame de sangue pendente"…) | VERIFIED | all present | — |
| Q12 (OPEN-12) | Approved 30/09; explainer and limit message promise typing by hand; never built; only path = AI scan | VERIFIED | decisions.md:268, :76; `xp_labsman_body` PT; PT `vial_scan_quota_sub` "Você ainda pode inserir tudo à mão" | — |
| Q13 (OPEN-13) | "Exame de sangue pendente · Já se passaram N meses…", 6 months chosen by the app, no decision | VERIFIED | PT strings; `BLOODWORK_INTERVAL_DAYS = 182`; no ledger line | — |
| Q14 (OPEN-14) (a) | "a pessoa só descobre o limite mensal de leituras quando uma é recusada" (people only discover the monthly scan limit when a scan is refused) | WRONG | free users see "3 free scans a month…" in the empty state and the free card; AD-56 says the number is shown | "a pessoa vê o limite (3 por mês), mas não quantas leituras já usou" (people see the limit of 3 a month, but not how many scans they have used) |
| Q14 (OPEN-14) (b) | Wrong DD/MM read → edit every value | VERIFIED | no whole-test date action | — |

---

## C. ACCT (onboarding, auth, account, Premium, Settings, AI consent)

### C.1 PRD requirements (§1.5, §4.1, §4.9, §4.10)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| §1.5.1 scans | 3 / 20 per UTC month, RevenueCat unreachable → Premium cap, server-enforced | VERIFIED | `quota.ts:10-11`, `:59`; `index.ts:160` | — |
| §1.5.1 assistant | 10 per rolling 7 days, server | VERIFIED | `protocol-assistant/budget.ts:8-9` | — |
| §1.5.1 food | 7 free days phone only (G-40); parse cap 25 + 25, 60 / 24 h server | VERIFIED | `parse-food/index.ts:28-30`; no Premium / free-day check in parse-food | — |
| §1.5.1 curve copy / PREM-1 | Hero "from your own log" | PARTLY | see A.1 (contradicts AD-19) | fix copy |
| §1.5.3 | One entitlement helper caching expiry | VERIFIED | `lib/entitlement.js` | — |
| PRD-ONB-1 | 8 steps in this order | VERIFIED | `onboardingSteps.js:12` | — |
| PRD-ONB-2…9 | Welcome, goals, tracking, about you (1900…year−18 note), routine (5 levels), consent (4 rows), reminders — EN/PT strings | VERIFIED | every string in flow 01 §13 found (`auth_agree_terms_privacy` is composed with placeholders) | — |
| PRD-ONB-10 | Android setup step | UNVERIFIABLE | device | — |
| PRD-ONB-11…13 | Stash fill-missing, kill resume, shared device | UNVERIFIABLE | not re-traced in this pass | — |
| PRD-ONB-14/15 | No "stays on your device"; curve animation | UNVERIFIABLE | visual | — |
| PRD-AUTH-1…6 | Create / Sign in views, checks (email regex, 6 characters), consent rules | VERIFIED | `authFlow.js:7-8`, `:17`; AuthScreen | — |
| PRD-AUTH-7 | "Today the server side is NOT configured, so the button is hidden until the founder's manual setup" → G-114 | WRONG | `STATE.md:17` (Apple and Supabase setup done 2026-10-03); live probe 2026-10-12 → 302 to Apple with Services ID → `appleWebReady` true; founder signed in with Apple on the Android Fold 2026-10-07 (build 47) | "Live since 2026-10-03; the client secret expires 2027-04-04 (regenerate with `scripts/apple-client-secret.cjs`); only the ship-check allow-list text lacks `dosetrace://auth-callback`" |
| PRD-AUTH-8…15 | Error sheets, Account created, email links, reset, no native alerts | VERIFIED | strings present (flow 01 §13 list); noNativeAlerts guard cited in STATE | — |
| PRD-AUTH-16 | SIGNED_IN deferred steps | VERIFIED | `App.js:693` etc. (`initPurchases` after await, DV-082) | — |
| PRD-GATE-1 | 8 fields, gate since 2020-01-01 | VERIFIED | `supabase.js:207-214`, `:230` | — |
| PRD-GATE-2/3 | Finish setup; display name only from Apple iOS | VERIFIED | `supabase.js:333-340` | — |
| PRD-GATE-4/5 | 18+ wheel, merge write, three actions | VERIFIED | `adultGate.js:19-24`; AgeConfirm imports | — |
| PRD-GATE-6 | Gates offline / Sign out anyway not built | VERIFIED | no `force` path in AgeConfirm / Onboarding | — |
| PRD-GATE-7 | Legacy 4-level migration | VERIFIED | `activityLevels.js:5-21`; Settings `legacyActivity` | — |
| PRD-ACCT-1 | Push first, blocked sheet, Sign out anyway only in Settings | VERIFIED | `accountActions.signOutIntended`; `SettingsScreen.js:497` | — |
| PRD-ACCT-2 | Intended sign-out wipe list; spurious keeps | VERIFIED | `signedOut.js:12-27`, `:158-170` | — |
| PRD-ACCT-3 | Leaking device keys incl. "curve view, explainer flags, food chat draft" | PARTLY | curve view and food draft are per-user keys (residue, never inherited); explainer flags were closed as consistent by PRD G-117 | split "residue" from "inherited by the next account" |
| PRD-ACCT-4 | Cross-account guard discards the prior data | VERIFIED | `App.js:622-633` | — |
| PRD-ACCT-5 | Delete: two confirmations, offline sheet, Apple revoke best-effort, every table, auth user, Android note | VERIFIED | `delete-user/index.ts:42-106` (`ai_assistant_usage` via FK cascade, migration 20261003000000) | — |
| PRD-ACCT-6 | No subscription warning on delete | VERIFIED | `settings_delete_*` strings have none | — |
| PRD-ACCT-7 | Lost response reported as offline | VERIFIED | `requestAccountDeletion` returns `{offline}` on any fetch rejection | — |
| PRD-ACCT-8 | Nothing reacts to server-confirmed deletion | VERIFIED | `user_not_found` handled only in the reset flow (`recoveryFlow.js:77`) | — |
| PRD-SET-1…3 | Order, group summaries, sentence case | VERIFIED | summaries ×1 each in EN | — |
| PRD-SET-10 | Edit profile fields, Save blocked when missing | VERIFIED | `SettingsScreen.js:303-319` | — |
| PRD-SET-11 | "What you track" not editable | VERIFIED | `tracking_types` count 0 in SettingsScreen | — |
| PRD-SET-12 | Profile / analytics write errors swallowed | VERIFIED | `:298-301` and `:321` never read `{error}` (auth-js returns, does not throw, on a network error) | — |
| PRD-SET-13 | Daily burn follows the profile | UNVERIFIABLE | PROG math not re-traced | — |
| PRD-SET-20/30 | Preferences, notification rows | VERIFIED | strings | — |
| PRD-SET-40 | Adherence report | VERIFIED | `SettingsScreen.js:358-370` | — |
| PRD-SET-41 | Download my data: no import first, no `user_metadata` | VERIFIED | `accountActions.exportMyData` vs AgeConfirm `:85` | — |
| PRD-SET-42/43 | Two policies; analytics "anonymous" | VERIFIED | Settings LegalModal vs `legalLinks.js:6` web; `consent_right_3`, `consent_analytics_toggle`, `settings_analytics_sub` | — |
| PRD-SET-50/60 | FAQ, account card | VERIFIED | strings | — |
| PRD-SET-61 | No subscription management; "Restore only on the paywall, which a Premium user is sent away from" | PARTLY | true for Manage; but Restore is reachable by anyone the app sees as non-Premium (Settings card → paywall), and a reinstall restores Premium via RevenueCat `appUserID` = uid | see OPEN-15 |
| PRD-PREM-2…10 | Paywall sections, states, outcomes, restore, legal links | VERIFIED | `paywallPlans.js:125-155`; strings in flow 13 §13 all present | — |
| PRD-PREM-9 | "Reality check & progress tracking" row (G-43) | VERIFIED | `paywallPlans.js:175`, `:182` | — |
| PRD-PREM-11…13 | Premium state everywhere / lapse | UNVERIFIABLE | runtime | — |

### C.2 DIVERGENCES rows (ACCT)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| DV-007 | AI consent device-wide, survives sign-out and guard, no version / date / withdraw | VERIFIED | `aiConsent.js:19-34`; not in `runWipeSteps`; guard `App.js:622-633` | — |
| DV-008 | Profile / analytics errors ignored | VERIFIED | see SET-12 | — |
| DV-009 | No reaction to confirmed deletion; lost response = "offline" | VERIFIED | see ACCT-7/8; also `res.json()` throws on a non-JSON body | — |
| DV-081 | Account-scoped keys survive (list incl. curve view, food draft, explainers) | PARTLY | Missed watermark / zone (`doseActions.js:123-127`), `vial_low_sent`, snoozes = device-global ✓; curve view and food draft are per-user keys (residue only); explainers closed by G-117 | narrow the list |
| DV-082 | Entitlement cache window on SIGNED_IN (SUSPECTED) | VERIFIED | `cacheUid` uses `lastUid` until `initPurchases` | — |
| DV-083 | Offline expired token → Auth (SUSPECTED) | VERIFIED | `App.js:609-617` ignores the `getSession` error; commit 495ebab confirms the auth-js behaviour | — |
| DV-084 | Apple iOS overwrites name; Google / Apple-Android never write it | VERIFIED | `supabase.js:335-340` | now live on Android too |
| DV-085 | Settings in-app policy vs web elsewhere | VERIFIED | LegalModal vs `PRIVACY_URL` | — |
| DV-086 | Settings export no import-first, no profile | VERIFIED | `accountActions.js` vs `AgeConfirmScreen.js:85` | — |
| DV-087 | No billing warning on delete | VERIFIED | strings | — |
| DV-112 | No Restore / Manage in Settings; "a paying user who reinstalls cannot find Restore" | PARTLY | Manage missing ✓; the reinstall impact is wrong (RevenueCat `appUserID` = uid; non-Premium users reach the paywall Restore via the Settings card) | impact: "no in-app way to manage or cancel; no trial / billing state" |
| DV-113 | `tracking_types` not editable | VERIFIED | — | — |
| DV-114 | Gates offline / no Sign out anyway | VERIFIED | — | — |
| DV-115 | Android Apple "not live (server setup pending)"; "users cannot sign in" | WRONG | see AUTH-7 (live since 2026-10-03; founder sign-in 2026-10-07; probe 302) | keep only the allow-list doc item (S4); add the 2027-04-04 secret-expiry risk |
| DV-116 | Reinstall unspecified (SUSPECTED) | VERIFIED | `STATE.md:128` allowBackup=false plugin; keychain behaviour untested | — |
| DV-186 | `pw_prem_reality` sells progress tracking | VERIFIED | ×6 strings; `paywallPlans.js:175`, `:182` | — |
| DV-190 | "anonymous" still in three strings | VERIFIED | strings | — |
| DV-162 | Gate checks presence only | VERIFIED | `supabase.js:207-214` | — |
| DV-163 | "Sign in" choice forgotten after restart | VERIFIED | `App.js:605-607` (`seen && !hasAnswers(stash)`) | — |
| DV-164 | "trial" = free food days in code | VERIFIED | `foodThread.js:248-267` | — |
| DV-165 | RevenueCat outage: server Premium cap, client cache | VERIFIED | `quota.ts:59` | — |
| DV-166 | Purchase result vs helper, handled | VERIFIED | `purchaseOutcome` `paywallPlans.js:125-131` | — |
| DV-167 | Analytics dropped while signed out | VERIFIED | `analytics.js:35-36` | — |
| DV-168 | 18+ by year only | VERIFIED | `adultGate.js:23` | — |
| DV-195 | Two Paywall navigations without source | VERIFIED | `CalculatorSection.js:1148`, `FoodChatScreen.js:720` | — |

### C.3 AD / DL citations (ACCT)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| AD-04 | :599 server-confirmed deletion cancels reminders | VERIFIED | line 599 | — |
| AD-05 | :378 real sign-out clears drafts | VERIFIED | line 378 | — |
| AD-28 | A-117 one policy text | VERIFIED | features.md A-117 | — |
| AD-29 | :542 gates offline | VERIFIED | line 542 | — |
| AD-30 | "server setup steps are the founder's" (implies pending) | PARTLY | decisions.md:483 ✓; the setup was done 2026-10-03 (`STATE.md:17`) | mark the setup done |
| AD-36 | :275 outage → Premium cap | VERIFIED | — | — |
| AD-43 | year-only 18+ | VERIFIED | — | — |
| AD-51 | consent proof stays with counsel | VERIFIED | :388, :570 | — |
| AD-57 | :570 analytics wording | VERIFIED | — | — |
| AD-58 | DEVELOPER_EMAILS / promo | VERIFIED | `quota.ts:19` PREMIUM_EMAILS | — |
| AD-64 | :283, :107, :229 honest paywall | VERIFIED | — | — |
| DL-52…DL-63 | Logic decisions for keys, cache, offline session, consent per account, write errors, name fill, tracking editor, Sign-in memory, delete warning, "free days", no pre-sign-in analytics, reinstall | VERIFIED | consistent with the ledger and the code; DL-55 does not contradict AD-51 (server proof stays with counsel) | — |
| DL-60 vs OPEN-15 | Delete warning decided by logic, Manage left open | VERIFIED | no overlap | — |

### C.4 TRD ownership and rows (ACCT)

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| S-71 | Settings own 8-check list without tracking | VERIFIED | `SettingsScreen.js:307-315` | — |
| S-72 | `needsAdultConfirmation` | VERIFIED | — | — |
| S-73 | `App.js:605-607` | VERIFIED | — | — |
| S-74 | `getSession` error = signed out at boot, signed in in `signOutCore.hasSession` | VERIFIED | `signOutCore.js:14` | — |
| S-75 | Local owner skips `vials` | VERIFIED | `database.js:822` | — |
| S-76 | AI consent per device | VERIFIED | — | — |
| S-77, S-79 | Unsynced count / snooze owners | UNVERIFIABLE | not re-traced | — |
| TRD §1.7 Apple row | "Android Apple web flow not configured server-side" | WRONG | see AUTH-7 | live; add secret expiry |
| R-02, R-37, R-38 | consent / offline token / write errors | VERIFIED | see DV-007/083/008 | — |

### C.5 Flows 01, 12, 13

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| Flow 01 §13 strings (EN/PT, 40+) | all quoted strings | VERIFIED | all found (two with escaped apostrophes / placeholders) | — |
| D01-1…D01-7, D01-9, D01-10 | as the DV rows | VERIFIED | see C.2 | — |
| D01-8 | "Server setup pending; button hidden by probe" | WRONG | live (see AUTH-7) | "live; F01 should test a full Android Apple sign-in" |
| Flow 12 §13 strings (sign-out, blocked, delete ×2, offline, Apple note, export, adherence; PT) | quoted texts | VERIFIED | all found | — |
| D12-1…D12-10 | as the DV rows | VERIFIED | D12-2 inherits DV-081's over-broad list | — |
| F12-09 offline "closes silently and reverts" | VERIFIED | auth-js returns `{error}`; `setShowEditProfile(false)` then `fetchUser()` | — |
| Flow 13 §13 strings (Premium card, paywall states, outcomes; PT) | quoted texts | VERIFIED | all found | — |
| D13-3 / D13-10 | Restore / Manage only on the paywall | PARTLY | see DV-112 | — |
| D13-6, D13-7, D13-8, D13-9 | charts free, "trial", cache, sources | VERIFIED | see C.2 / B.2 | — |
| Dossier 07 §8 row "Apple on Android not configured" and §9 item 13 | Button hidden, setup pending | WRONG | see AUTH-7 | — |

### C.6 Portuguese founder question 15

| ID | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| Q15 (OPEN-15) context | "Restaurar compras só existe na tela de assinatura, e quem já é Premium é mandado embora dela; os Ajustes só mostram Premium/Grátis" (Restore purchases exists only on the subscription screen, Premium users are sent away from it, and Settings shows only Premium/Free) | VERIFIED | `PaywallScreen.js:132` (`premium_already` sheet); no subscription rows in Settings | — |
| Q15 (OPEN-15) impact | "Quem paga e reinstala o app não acha onde restaurar" (someone who pays and reinstalls the app cannot find where to restore) | WRONG | after reinstall + sign-in, RevenueCat (`appUserID` = Supabase uid, `purchases.js:68`) returns Premium with no Restore; anyone shown as free has the Settings Premium card → paywall → Restore | "Não há como gerenciar ou cancelar a assinatura dentro do app, nem ver quando o teste grátis termina ou se há problema de cobrança." (There is no way to manage or cancel the subscription in the app, nor to see when the free trial ends or whether there is a billing problem.) |

---

## Omissions (true issues no register lists)

| # | Finding | Evidence | Suggested register action |
|---|---|---|---|
| O-1 | Android Apple sign-in depends on a client secret that expires **2027-04-04**; when it lapses every Android Apple sign-in fails silently (the probe hides the button or the flow errors) | `STATE.md:17`; spec PA-123 | new S2 row (ACCT) with a dated reminder; PRD-AUTH-7 mentions it |
| O-2 | `paywall_hero_sub` and `settings_premium_feat_1` say the curve comes "from your own log" ×6 | `translations.js:626`, `:1402` (+5 languages); used `PaywallScreen.js:278`, `SettingsScreen.js:642` | extend DV-071 |
| O-3 | "Estimate on a date" > 365 days back: Combined row prints a number while the compound rows show "—" | `SerumCurveScreen.js:1021` vs `:1031` | extend DV-158 |
| O-4 | My Body never reloads on a sync pull (no `addSyncListener`), not only on `'curve'` | grep BodyScreen | extend DV-152 |
| O-5 | Registry F-070 says lab "manual entry … Shipped" — false | `docs/review/features.md:107` | add to G-128 stale docs |
| O-6 | Account deletion leaves the RevenueCat customer (app user id = Supabase uid, purchase history); no doc treats it as a deletion / privacy item | `delete-user/index.ts` has no RevenueCat call | counsel / DL note next to DL-60 |
