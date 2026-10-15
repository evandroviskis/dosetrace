# 09 — Protocol dates: every consumer, the A-121 end date, and what a date change must do

- Date: 2026-10-15. Branch `redesign/graduated` (HEAD 9ce7622 + uncommitted A-122 files). Read-only investigation.
- Asked by the founder (A-121): "tenha certeza de que você faz o wiring dessas datas corretamente, em todos os lugares que pode influenciar — uma mudança de data de protocolo."
- Inputs: `docs/specs/still-going-end-date.md` (SG-1..SG-10, not signed yet), `docs/decisions.md` 2026-10-15 (A-121, "a restarted run has no end date", AD-77, AD-82 = Q5, AD-95 = Q16), DL-07, DL-21, DL-86, DL-87, DL-99, TRD §4.1 (S-01, S-11, S-12, S-13, S-15, S-30, S-33, S-61, S-78), `docs/review/app-map.md`, `docs/product/DIVERGENCES.md`, flows 02, 03, 05, 06, 10.
- Name used below: the new column is called **`ends_on`** (a local day `YYYY-MM-DD`, like `start_date`, `mixed_on`, `expires_on`). Call it the **planned end** in code and docs. TRD S-33's "end date" already means `ended_at`, the date an inactivity end is stamped. Two meanings for one word will cause wrong edits.
- Evidence scripts (scratchpad, not committed) called the real `lib/missedDoses.js`, `lib/pendingYesterday.js`, `lib/adherenceRings.js` and `lib/doseStreak.js`. Their results are quoted in §4.

## 0. The rules that apply (from the ledger, not re-asked)

| Rule | Source | What it means for dates |
|---|---|---|
| The planned end silences "Still going?" until that day; reminders, doses, the curve and every count are unchanged; nothing ends by itself | A-121 items 3, SG-3, SG-4 | `ends_on` must never reach S-01, the reminders or the curve |
| On the end date Today asks "Ciclo concluído — encerrar {name}?"; End = Ended dated at the tap; Continuar removes the end date | A-121 item 4, DL-99, AD-82 | one course-end question shared with the legacy `schedule_total` |
| A restarted run has no end date | decisions.md 2026-10-15, SG-7 | `restartAsNew` must not copy `ends_on` |
| A course's total stops expected doses everywhere and asks the same question | AD-82 (Q5 = B) | the total DOES change S-01; the planned end does NOT. Different semantics, one question |
| From now on every protocol change is stored with the date it took effect, and the past uses the old values | AD-95 (Q16 = B; interim: curve notice) | an edit of start, interval, doses/day or time must not rewrite past days. The PRD files this under the curve (PRD-CURVE-13), but the rule is worded for every past value (see §4 D1-D4) |
| An inactivity end is dated at the last logged Taken dose; app-written Missed rows after that end are removed on every phone, never a user row | DL-87 | the precedent for removing app-written rows the schedule no longer owes |
| A deliberate end is dated at the tap | DL-99 | the course-end "Encerrar" |
| "Still going?" and its end use logged Taken rows only | DL-21 (DV-026) | declared rows never count |
| A legacy protocol with no start date is anchored on its creation day everywhere | DL-07 (DV-014) | |
| The "Same dose for the last N weeks?" answer is asked again when an edit moves the start earlier; "Yes" clears `history_from` | DL-86 (DV-091) | a clear must sync (§4 D6) |
| Edit writes only what the user changed | decisions.md:179 | the form must never carry `ends_on` |
| A new vial never rewrites `start_date` | decisions.md:181 | L-13 in app-map.md is stale (DV-177) |
| One active device per account; a replaced phone cannot write | AD-77 | stale whole-row pushes from a second phone stop being a real risk |
| "Still going?" waits for the session's first download | A-122, SG-10 | the course-end question needs the same wait (§3 SG-22) |

## 1. Consumer map

Status: **OK** = right today and unaffected by A-121 (keep it that way; a guard test is enough). **BUG** = wrong today, apart from A-121 (start-date or schedule edits; existing DV ids cited). **NEW** = work A-121 needs.
"Past rows never rewritten" = AD-95 / DL-87 / DL-99 as above.

### 1.1 Schedule core

| # | Consumer (file:line) | Dates read | What it does today | With an end date (before / on / after) | When start / end / interval / time change | Status |
|---|---|---|---|---|---|---|
| C01 | `lib/schedule.js:31-108` `expectedDosesOn` / `expectedSlotTimesOn` (S-01) | `start_date`, `interval_days`, `doses_per_day`, `reminder_time`, `created_at`, `ended_at` (`endedAtMs`, falls back to `updated_at`) | Counts and times of a protocol's doses on a day; nothing before start or after the end; creation-day rule; no `schedule_total` (DV-012) | Ignores `ends_on` completely, on every day (SG-4). Guard test: same output with and without an end date | Uses the CURRENT values for every past day, so any edit changes what the past "owed". That is the root of D1-D4. Per AD-95, past days must read the version in force on that day | BUG (AD-95 class) |
| C02 | `lib/schedule.js:111` `nextDueDate`, `:163` `nextDoseAt` (S-13) → Today order `TodayScreen.js:1495`, Upcoming/Tomorrow `:1503`, `:2046`; Protocols "Due next" `lib/protocolSort.js:19` | as C01 | Next dose moment | Unchanged. Doses after the planned end keep showing until the person taps End | Future only, correct after any edit | OK |
| C03 | `lib/schedule.js:127` `existedOn` | `created_at` | Days before creation are never owed | — | — | OK |
| C04 | `lib/schedule.js:192` `elapsedDoseSlots` | `start_date`, interval, times | Dead code (no caller since A-30 removed the backfill); also ignores `ended_at` | Must not be revived as a consumer | — | OK (dead code, 1.3.1 hygiene) |

### 1.2 Reminders (client and server)

| # | Consumer | Dates read | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C05 | `lib/notificationPlan.js:35-53` `dueDateKeys` (S-02) | `start_date` (else **today**), `interval_days`, `schedule_total` | Due days in the rolling window; honours the total; no creation/end rule | Unchanged: reminders continue on and after the planned end until End (SG-4, PRD-REM-16) | Re-planned on the editing phone (`ProtocolsScreen.js:1869`). A pulled edit is not re-planned (DV-052). No start date = anchored on "today" (DV-014) | BUG (existing DV-014, DV-052) |
| C06 | `lib/notifications.js:217-331` `scheduleDoseReminder`, `:435-470` `syncAllDoseReminders`, `:412` `cancelDoseReminder`, `:333` `dismissDeliveredDoseReminders` | C05 + today's Taken count | Schedules, keeps or cancels each slot | Unchanged until End. **Encerrar** (course end) must cancel and clear delivered banners, as `endInactiveProtocol` does (`TodayScreen.js:584-587`) | Edit: re-scheduled from the saved row and banners dismissed when timing moved (`ProtocolsScreen.js:1853-1873`). OK | NEW (End path) |
| C07 | `lib/notificationPlan.js:72` `morningSummaryPlan` / `notifications.js:750` | via C05 | 07:00 list | Unchanged | via C05 | OK |
| C08 | `lib/reminderHealth.js:23` `dueInWindow`; `notifications.js:1162-1167` `activeWithTime` | via C05 | Reminder health | Unchanged | via C05 | OK |
| C09 | `supabase/functions/send-reminders/index.ts:118` (explicit column list) + `plan.ts:60-78` `dueDateKeys` (port) | `start_date`, `interval_days`, `schedule_total`, `reminder_time`, `active`, `deleted_at`, `purged_at` | Android server push | Must NOT select or read `ends_on` (SG-4); the parity test `__tests__/serverPlanParity.test.js` stays green | A cloud edit is read on the next run | OK |
| C10 | `lib/reminderRefresh.js:13-40` (daily background refresh / server wake) → `syncAllNotifications` | via C06 | Re-plan with the app closed | Unchanged | Re-plans from the local row | OK |

### 1.3 Today

| # | Consumer | Dates read | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C11 | `screens/TodayScreen.js:539-575` `checkTreatmentStillActive` (S-33; waits on `lib/stillGoingGate.js` A-122) | `start_date` (skip if future, `:558`), `interval_days` (threshold max(7, 3×), `:559`), last Taken in 90 days, else `created_at`, else `start_date` (`:560`), local snooze `dosetrace_tx_check_{id}` | Asks "Still going?" | **Before** `ends_on`: never asks (SG-3). **On/after**: does not ask "Still going?"; the course-end question asks instead (C13). After "Continuar" or "Sem data de fim": the normal rule, with the span starting at that tap (otherwise Goli, with no logs, is asked again at once; see SG-15) | **D5:** the reference ignores a start date later than `created_at`, so a future-start protocol is asked on its first day. Interval edit → new threshold (correct). Declared rows still count (DV-026); shares no "sheet open" owner (DV-202) | BUG + NEW |
| C12 | `TodayScreen.js:578-594` `endInactiveProtocol` → `lib/protocolEnd.js:57-69` `endAtLastDose` (DL-87) | last Taken, else `created_at` | Ends at the last logged dose, removes app-written Missed after it | Cannot happen before the planned end (C11) | **D5b:** a protocol never taken ends at `created_at`, even when its start is later (the end is before the start) | BUG (minor) |
| C13 | **New:** Today course-end question "Ciclo concluído — encerrar {name}?" (AD-82 + A-121) | `ends_on` (and legacy `schedule_total`) via S-15 | — | Shown on the first Today open on or after `ends_on` (see risk 4: when on the day). **Encerrar** → `protocolEnd.endProtocol` (`:45`, dated at the tap, DL-99) + `deactivateVialsByProtocol` + `cancelDoseReminder` + `dismissDeliveredDoseReminders` + snooze key removed; `ends_on` stays on the Ended row as history. **Continuar** → `ends_on = NULL` (must sync, C55) + inactivity span restarted | A new or moved `ends_on` → re-evaluated on the next Today open; a cleared one → no question | NEW |
| C14 | `TodayScreen.js:1319-1325` header "x of y" (S-06) | via C01 (today) | | Unchanged | Today only | OK |
| C15 | `TodayScreen.js:1492-1510`, `:2046-2066` list order, Tomorrow, Next 5 days | via C02 | | Unchanged; doses after the planned end are still listed (SG-4) | Future only | OK |
| C16 | `lib/dosePageState.js:43-48` `cardPlan` / dose page | via C01 (today) | Card slots | Unchanged | Today only | OK |
| C17 | `TodayScreen.js:1715-1724` `getProgress` "Day X of Y" (S-15) | `start_date`, `interval_days`, `schedule_total` | Calendar index, capped (DV-012: "Day 12 of 12" forever) | No "Day X of Y" from the planned end (not in the approved picture) | Start moved → index moves (expected). Owner: S-15 | BUG (existing DV-012) |
| C18 | `lib/pendingYesterday.js:35-80` (S-12) → `TodayScreen.js:689-705` | via C01 (yesterday), `created_at` | "Did you take yesterday's dose?" | Unchanged | **D3:** after an interval or start edit, yesterday is judged by the NEW schedule (script: 1 false pending) | BUG |
| C19 | `lib/doseActions.js:174-212` `scanMissedDoses` → `lib/missedDoses.js:83-150` (S-11), 14-day lookback, `created_at` − 1 h floor, watermark | via C01 | Writes `Missed` rows | Unchanged before the planned end. Between `ends_on` and a late "Encerrar", Missed rows keep being written (SG-4 + DL-99); see Q2 | **D1:** an interval or start edit writes Missed rows for up to 14 past days that were not dose days then (script: weekly→daily = 12 rows; weekly start +3 days = 2 rows). **D2:** a start moved later leaves earlier app-written Missed rows | BUG |
| C20 | `lib/adherenceRings.js:22-77` (S-07) | via C01, `created_at`, `ended_at` | Today / 7 d / 30 d rings | Unchanged | **D4:** past recomputed (script: month 3/3 → 3/21 after weekly→daily) | BUG (AD-95 class) |
| C21 | `lib/doseStreak.js:10-28` (S-09) via `TodayScreen.js:645-667` | via C01, `existedOn` | Card streak | Unchanged | **D4:** streak 3 → 0 after weekly→daily (script) | BUG (AD-95 class) |
| C22 | `TodayScreen.js:792-830` tracker streak + week circles (S-10, inline) | via C01, `existedOn` | Flame / circles | Unchanged | D4 class | BUG (AD-95 class) |
| C23 | `lib/markTaken.js:72` daily cap | via C01 (that day, floor 1) | | Unchanged | Edit → a dose on a now-rest day is still loggable (floor 1) | OK |
| C24 | `lib/doseActions.js:113-121` `isDoseAlreadyLogged` / `recordDoseTaken` refuse an inactive protocol | `active`, `deleted_at` | | After "Encerrar" on the end date, a still-open slot of that day can no longer be logged, so the cycle's last dose is lost if the question comes before it (risk 4 / Q1) | — | NEW (ordering) |
| C25 | `TodayScreen.js:1838-1847` Fold right page `ProtocolDetail` (A-115; every action → `toProtocol`) | as C32 | Protocol page on Today's right page | Shows the "Termina em" row; its tap opens the protocol in My Protocols, like the page's other actions there (logic: A-115 routes every action) | — | NEW |
| C26 | Today sheet order (`inactivePromptOpenRef`, `:1023-1029`, `openNextQuestion` `:1026`) | — | One prompt at a time (incomplete: DV-202) | The course-end question joins the same "a sheet is open" owner; never over another sheet; never together with "Still going?" for the same protocol | — | NEW |
| C27 | `lib/stillGoingGate.js` (A-122, uncommitted) | — | "Still going?" waits for the first sync | The course-end question waits too: `ends_on` may have been cleared or moved on the other phone | — | NEW |

### 1.4 Protocols tab, form, wheel, lifecycle

| # | Consumer | Dates read / written | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C28 | `screens/ProtocolsScreen.js:1830-1873` `saveProtocol` (edit) via `lib/protocolForm.js:159` `editPatch` | writes `start_date`, `interval_days`, `doses_per_day`, `reminder_time` | Writes the changed columns, re-schedules reminders, clears delivered banners. Nothing else | Never touches `ends_on`. Must refuse a start date after the saved `ends_on` (SG-14) | Must also (a) record the AD-95 version, (b) settle app-written Missed/pending rows the edit no longer owes (D1-D3), (c) re-ask "Same dose…" when the start moves earlier (DV-091) | BUG + NEW |
| C29 | `ProtocolsScreen.js:1888-1935` save (new) + `lib/declared.js:41` `historyQuestion` | writes `start_date`; `history_from` = today on "No" | | New protocols start with `ends_on` NULL (no form field: option A) | — | OK |
| C30 | `lib/protocolForm.js:63` `formFromProtocol`, `:126` `protocolPayload` | — | The form's columns | Must NOT include `ends_on`, so a wizard Edit or the AI handback can never write or clear it. Extend the existing "save with no changes alters nothing" test to a row with `ends_on` | — | NEW (guard) |
| C31 | `lib/wheelPick.js:11-38` `dateColumns`/`dateAfter` (used at `ProtocolsScreen.js:3293`, `SerumCurveScreen.js:1082`, `ProtocolAssistant.js:268`, `CalculatorSection.js:1809`, `:1858`) | — | Years from 10 back to 2 ahead; no lower bound | End wheel: at least 5 years ahead (SG-8), first valid day = max(tomorrow, `start_date`), opens one month ahead (picture note). The other five uses keep their range (an option, not a new default) | — | NEW |
| C32 | `ProtocolsScreen.js:697-731` `ProtocolDetail` `scheduleRows` | `interval_days`, `reminder_time`, `schedule_total` | No start-date row | "Termina em" row under Schedule & reminders: date in the app's format, or "Sem data"; tap → wheel + "Salvar data de fim" + "Sem data de fim" (SG-6). Active protocols only | Re-renders on `data_changed` / pull | NEW |
| C33 | `ProtocolsScreen.js:1371-1385` sort (added = `created_at`, due = C02, vial = `mixed_on`) | | | Unchanged | Restart = newest (created now) | OK |
| C34 | `lib/protocolEnd.js:24-31` `SQL_ACTIVE` / `SQL_ENDED` / `SQL_HISTORY` / Recently deleted / `SQL_ALL_LOGS` (S-30) | `active`, `deleted_at`, `ended_at`, `purged_at` | List sections and every query | A planned end never changes status (nothing ends by itself) | — | OK |
| C35 | `ProtocolsScreen.js:2193` Ended row "Encerrado em {date}" | `ended_at` | | After a course-end End shows the tap date | — | OK |
| C36 | `lib/protocolEnd.js:138-169` `restartAsNew` | copies **every column not in `NOT_COPIED`** through `PRAGMA table_info` | New run, start = today | **`ends_on` would be copied unless added to `NOT_COPIED`, which breaks SG-7 with no error.** Today the copy also carries `history_from` (harmless because start = today, but the same trap) | — | NEW (critical) |
| C37 | `lib/protocolEnd.js:107-121` `restoreDeleted` | `ended_at`, `deleted_at` | Ended → Ended; same-day → active | Keeps `ends_on` (Restore is an undo). A same-day active restore whose planned end has passed → course-end question on the next Today open | — | NEW (test) |
| C38 | `lib/protocolEnd.js:93-98` `softDeleteRow`, `:79-88` `purgeProtocol`; server trigger `protocols_blank_purged` (`supabase/migrations/20261004010000_protocol_delete_guard.sql:28-41`); tombstone payload `lib/syncCore.js:237` | | Delete forever blanks every content column in the cloud | The trigger must blank `ends_on`; the tombstone push drops it, as it does `history_from` | — | NEW |
| C39 | `lib/protocolEnd.js:45-50` `endProtocol` (no caller today, DV-090) | writes `ended_at` = tap | — | First caller: course-end "Encerrar" (and A-85's "End protocol"). One End function for all three entry points | — | NEW |
| C40 | Free limit `ProtocolsScreen.js:1879-1885` (S-31, AD-84) | active count | | Unchanged; an End frees a slot | — | OK |
| C41 | `lib/analytics.js:59-65` `protocolDeactivated` (delete only, `ProtocolsScreen.js:2020`) | `created_at` | | No new event (none approved); never send the date | — | OK |
| C42 | AI assistant `lib/protocolAssistant.js:104`, `:577`; `supabase/functions/protocol-assistant/schema.ts:35,39` (`day_offset` −730..365) | start only | Builds a new protocol | Never sets `ends_on` (not approved; also the AI hard line) | — | OK |

### 1.5 Curve, Journey, My Body

| # | Consumer | Dates read | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C43 | `lib/serumModel.js:95-130` `scheduledDoses` (→ `estimatedLevelNow` `:143`, `upcomingDoseDays` `:204`, `SerumCurveScreen.js:419`, `:507` estimate on a date next to labs) | `start_date`, `history_from`, via C01 (`ended_at`, creation-day rule) | Schedule-based curve, past and projected | Unchanged: the projection goes past the planned end until End (SG-4); after End it stops at the tap | Edit rewrites the past curve (DV-005 → AD-95: versions, or the interim notice) | BUG (existing DV-005) |
| C44 | `lib/serumModel.js:226-238` `estimatedBeforeMs` | `start_date`, `created_at`, `history_from` | Dashed "estimated before" marker | Unchanged | Start moved earlier → the marker appears, but a stale `history_from` ("No") hides it, and the question is not asked again (DV-091) | BUG (existing DV-091) |
| C45 | `lib/serumModel.js:240-247` `curveHistoryProtocols` (S-61) | `ended_at` (365 d) | Active + recently ended | Unchanged | — | OK |
| C46 | `SerumCurveScreen.js:316-510` (picker, est. level, readout date) | via C43 | | Unchanged | via C43 / AD-95 | OK (AD-95 tracked in DV-005) |
| C47 | `JourneyScreen.js:109`, `BodyScreen.js:402` `defaultCurveLevel(getActiveProtocols)` | via C43 | Tile / My Body number | Unchanged | via C43 (S-61 divergence 05:D1 existing) | OK |

### 1.6 Report, export, supply

| # | Consumer | Dates read | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C48 | `screens/SettingsScreen.js:360-440` 30-day report: `reportProtocols` (`protocolEnd.js:173`), `adherenceStats` (`lib/adherenceReport.js:24`, `created_at`), inline calendar-day streak, "Encerrado em" from `ended_at` | | Provider report | Unchanged: no "ends on" line, every count the same (SG-4) | **D2:** Missed rows left before a start moved later still count as missed (D1's retroactive rows too) | BUG |
| C49 | `lib/database.js:834-841` `getAllDataForExport` (`SELECT *`) | all columns | Data export | Carries `ends_on` automatically (portability, the user's own data) | — | OK |
| C50 | `lib/supplyLow.js`, `ProtocolsScreen.js:191` `vialDaysLeftFor`, `lib/vialExpiry.js`, `lib/oralMath.js` | `mixed_on`, `expires_on`, `vial_valid_days`, interval (oral) | Supply / days left / expiry | Unchanged (a vial can outlive the plan; nothing ends by itself) | — (oral days left ignore the interval: S-24, existing) | OK |
| C51 | `lib/notifications.js:476` `syncVialAlerts` | vials | | Unchanged | — | OK |

### 1.7 Storage and sync

| # | Consumer | Dates read / written | Today | With an end date | On changes | Status |
|---|---|---|---|---|---|---|
| C52 | `lib/schema.js:30-50`; `lib/database.js:77-81` (ALTER ADD COLUMN on start) | | Local schema | `ends_on TEXT` added both ways (fresh install + update), like `history_from` | — | NEW |
| C53 | `lib/database.js:130-146` `insertProtocol` (explicit column list) | | | New rows: `ends_on` NULL (no change needed) | — | OK |
| C54 | `lib/database.js:150-166` `updateProtocol` | | Sets `status_at` only for `active`/`deleted_at`/`ended_at` | `ends_on` is content, not status: it must NOT set `status_at` (it does not) | — | OK |
| C55 | `lib/syncMappers.js:11-30` `CLOUD_FIELDS`, `:39-40` `OPTIONAL_COLUMNS`, `:60-104` `toCloudPayload` | | `history_from` is optional: sent only when set (`:100`) | `ends_on` must be sent always, **including NULL**, so "Continuar" / "Sem data de fim" reach the cloud and the other phone. It must NOT copy the `history_from` pattern | **D6:** clearing `history_from` (DL-86 "Yes clears it") never syncs | NEW + BUG |
| C56 | `lib/syncCore.js:322-329` `applyOptionalColumns` (a cloud NULL is ignored), `:405-415` pull UPDATE, `:488-500` pull INSERT / full import | | Explicit column lists | Add `ends_on` to the UPDATE and INSERT lists, and write the cloud value including NULL | A pulled edit of `ends_on` → Today re-evaluates on `sync_complete` (`TodayScreen.js:441-452` already re-fetches) | NEW |
| C57 | `lib/syncCore.js:237` tombstone payload | | Drops `ended_at`, `history_from` | Drop `ends_on` too | — | NEW |
| C58 | Supabase migration `protocols.ends_on date null` + trigger (C38) | | | A regular column: the production migration must be live BEFORE the build ships. `writeWithOptionalRetry` (`syncCore.js:387-398`) drops only OPTIONAL columns on PGRST204, so a missing regular column fails every protocol push. Founder's "pode aplicar" required | — | NEW |
| C59 | `supabase/functions/delete-user` | rows | Deletes every table | No column list: nothing to change | — | OK |
| C60 | Whole-row push vs A-87 `status_at` (`syncMappers.js:92-99`, `syncCore.js:630-685`) | | Content columns go up as a whole row | A stale push from a second phone could put back an old `ends_on`. AD-77 (one writer) closes this; until A-119 ships, two phones (last write wins) | — | OK (with AD-77) |

**Counts:** 60 consumers. OK = 28. BUG today = 15 (C01, C05, C11, C12, C17, C18, C19, C20, C21, C22, C28, C43, C44, C48, C55). NEW for A-121 = 20 (17 NEW only + C11, C28, C55, which are also BUG).

## 2. One owner per date-derived state (A-121 adds the end date in ONE place)

| State | Owner (TRD id) | What A-121 / a date change adds there | Never in |
|---|---|---|---|
| What a protocol owes on a day (count, times, creation and end rules) | S-01 `lib/schedule.js doseSlotsOn` (PROPOSED; today `expectedDosesOn` / `expectedSlotTimesOn`) | Nothing from A-121. For AD-95: past days read the protocol version in force that day (PROPOSED `lib/protocolVersions.js versionOn(p, versions, dayKey)`), which fixes D1-D4 together | — |
| Course state: legacy total AND planned end; "ask the course-end question?" | **S-15** `lib/schedule.js courseState(p, todayKey)` (PROPOSED) → `{ kind: 'total' \| 'planned' \| null, askToday, dayX, ofY }` | **The only reader of `ends_on`** (with the write owner, sync and the page row). `kind:'total'` makes S-01 expect nothing after the total (AD-82). `kind:'planned'` changes nothing in S-01 (SG-4). Earliest wins if a row has both | S-01, S-02, `dueDateKeys`, `plan.ts`, `scheduledDoses` |
| "Still going?" eligibility | **S-33** `lib/protocolEnd.js inactivityDue(p, loggedTaken, now, snoozeAt)` (PROPOSED, extract from `TodayScreen.js:539-575`) | Returns false while `courseState` has a planned end (before, on and after it; the course-end question owns on/after). Reference = max(last logged Taken, `created_at`, `start_date`) (D5). Logged rows only (DL-21) | Today inline code |
| Writing the planned end | PROPOSED `lib/protocolEnd.js setPlannedEnd(db, id, dayKey \| null, nowIso)` | Validates dayKey ≥ max(tomorrow, `start_date`); a clear also restarts the inactivity span (the same key "Continua" writes); pending sync | Screens writing `ends_on` themselves |
| Ending a protocol (deliberate) | `lib/protocolEnd.js endProtocol` (S-30) wrapped by PROPOSED `endNow(db, id)` = end + vial deactivation (S-23) + the screen's reminder cancel | One End for the course-end "Encerrar", A-85's "End protocol" and the vial "Protocol finished" (DL-99) | Three copies |
| Restart / Restore | `restartAsNew` / `restoreDeleted` (S-30) | `ends_on` in `NOT_COPIED`; better an allow-list of copied columns (D7) | — |
| Missed rows (writer) + reconciling after a schedule edit | S-11 `computeMissedDoses` / `scanMissedDoses` + PROPOSED `settleAppRowsAfterEdit(db, p, before, after, nowIso)` | No change from `ends_on`. Edit: tombstone app-written Missed rows the new schedule no longer owes, user rows never (DL-87 analog, D1/D2) | Screens |
| Pending from yesterday | S-12 `pendingFromYesterday` | Via S-01 versions (D3) | — |
| Rings / streaks / week circles / report adherence | S-07, S-09, S-10, S-08 | Via S-01 versions (D4); no planned-end input | — |
| Curve (past + projection, estimate at a date) | S-62 / `scheduledDoses` | Via S-01 versions (AD-95); no planned-end input | — |
| Reminders (client + server) | S-02 `dueDateKeys` (+ `plan.ts` port, parity test) | No planned-end input; the AD-82 total via S-01 | — |
| Local day keys (today vs `ends_on`) | S-78 `lib/localDate.js` | `ends_on` compared as local keys (DST/travel safe) | `toISOString().slice(0,10)` |
| Wheel range | `lib/wheelPick.js dateColumns(iso, now, labels, { minISO, yearsAhead })` | End wheel ≥ 5 years ahead, minimum = max(tomorrow, start) | Changing the default for the five other uses |
| Sync of the column | `lib/syncMappers.js CLOUD_FIELDS` (regular, NULL sent) + `syncCore` explicit lists | One column, always sent | `OPTIONAL_COLUMNS` |
| One prompt at a time on Today | PROPOSED Today "a sheet is open" owner (DV-202) + `stillGoingGate` | Course-end question checks both | — |

## 3. Proposed acceptance rows for `docs/specs/still-going-end-date.md` (SG-11 onward)

Each row needs a test (pure / sync harness) or a device check. Rows that depend on a founder answer say so.

| ID | Criterion |
|---|---|
| SG-11 | One owner reads the planned end: `lib/schedule.js courseState` (S-15). A guard test fails if `ends_on` appears outside that owner, the write owner (`lib/protocolEnd.js`), `lib/schema.js`/`lib/database.js`, the sync mappers and the protocol page row. `expectedDosesOn`, `expectedSlotTimesOn`, `dueDateKeys`, `send-reminders/plan.ts`, `scheduledDoses`, `computeMissedDoses`, `adherenceRings` and `doseStreak` return identical results for the same protocol with and without an end date, on a day before, on and after it (test). |
| SG-12 | The end date is a local calendar day ("YYYY-MM-DD"). "Before / on / after" is decided by the phone's local today (lib/localDate), also across a time-zone change and on 23 h / 25 h days (test). |
| SG-13 | An end date can be saved only when it is on or after tomorrow AND on or after the protocol's start date (a protocol starting in the future: the first valid day is its start date). The wheel cannot settle on an earlier day; it opens one month after the later of today and the start (test of the pure clamp). |
| SG-14 | Editing the start date to a day after the saved end date is never saved silently: Save stops with a notice and nothing is written (founder: or the end date is cleared, see Q3). Text ×6 and picture approved first. |
| SG-15 | "Continuar" on "Ciclo concluído" and "Sem data de fim" on the protocol page clear the end date and start the "Still going?" span from that tap, as "Continua" does. A protocol with no logged dose is not asked "Still going?" again for max(7, 3 × interval) days after the tap (test). |
| SG-16 | "Encerrar" ends the protocol through the one End function: Ended, `ended_at` = the tap (DL-99), vials deactivated, every reminder of it cancelled and delivered banners cleared, its inactivity snooze removed; the end date stays on the Ended row. The Dose log, the report, the rings and the curve keep every earlier dose (harness test + device). |
| SG-17 | The course-end question never takes away the cycle's last dose: on the end date it appears only after every dose slot of that day is logged (Taken / Skipped) or has passed its time, otherwise on the next open (per founder answer Q1). Test: daily 20:00, end date today → no question at 09:00; question after the 20:00 dose is logged. |
| SG-18 | Setting, moving and clearing the end date sync: set on phone A → phone B shows it and stays silent; cleared on A → B has NULL and never asks "Ciclo concluído"; a reinstall or full import brings back the latest value, also "no date" (sync harness: `toCloudPayload` carries `ends_on: null`; the pull writes NULL). |
| SG-19 | The cloud column (`protocols.ends_on date`, nullable) is applied to production, with the founder's "pode aplicar", and checked through the API before the build is uploaded. A protocol push never fails because of it (harness: PGRST204 path). |
| SG-20 | Restart never copies the end date (test: `restartAsNew` on a row with an end date → new row NULL, old row unchanged; the copy is an allow-list). Restore keeps it; a same-day Restore to active whose end date has passed asks "Ciclo concluído" on the next Today open (test). |
| SG-21 | Delete forever blanks the end date in the cloud (`protocols_blank_purged` trigger) and the tombstone push does not carry it (SQL check + harness). |
| SG-22 | The course-end question waits for the session's first sync result (A-122 gate) and opens only when no other Today sheet is open (the DV-202 owner). "Still going?" and "Ciclo concluído" never both appear for one protocol in one open (test). |
| SG-23 | A legacy protocol with a total (`schedule_total`, AD-82) and the planned end use the same question from the same owner. A total stops expected doses after the course (AD-82); a planned end does not (SG-4). A row with both asks at the earlier one (test). |
| SG-24 | Fold: the "Termina em" row also shows on Today's right page (A-115); its tap opens the protocol in My Protocols, like that page's other actions. On the Protocols book page the wheel opens over the book and survives fold / unfold. Both themes on every new box and row (device). |
| SG-25 | Ended and Recently deleted protocols show no "Termina em" row. The add / edit wizard and the AI protocol assistant never write or clear the end date: an Edit saved with or without changes leaves it as it was (test extends "save with no changes alters nothing"). |
| SG-26 | The data export carries the end date. The 30-day provider report, Missed rows, reminders and analytics are unchanged by it (no new line, no event, no count change) (test). |
| SG-27 | An end date passed while the app stayed closed asks on the next open, also many days later. Until "Encerrar", the days after the end date are ordinary days: reminders and Missed rows as usual (per founder answer Q2, otherwise as Q2 decides) (test). |

**App-map links that need a test for A-121** (`docs/review/app-map.md`; test file `__tests__/appMapLinks.test.js` or a new one):
- L-01 (protocol → Today due / ring / streak), L-02 (→ curve), L-03 (→ dose reminders), L-04 (→ morning summary), L-05 (→ Missed rows): each gets an "end date changes nothing" test (SG-11).
- L-40 (SQLite ↔ Supabase): `ends_on` set / moved / cleared round trip, pull of NULL, full import (SG-18).
- L-48 (server push plan): parity stays green with an `ends_on` column present (SG-11).
- **New L-51:** protocol page "Termina em" / Today "Continua até uma data…" → `protocols.ends_on` → Today "Still going?" silenced and the course-end question (SG-3, SG-5, SG-15).
- **New L-52:** Today "Encerrar" → Ended list, reminders and banners cancelled, vials deactivated, history kept (SG-16).
- **New L-53:** Restart / Restore / Delete forever ↔ `ends_on` (SG-20, SG-21).
- **New L-54 (date-change wiring, independent of A-121):** protocol edit of start / interval / time → Missed rows, pending from yesterday, rings, streaks, reminders (D1-D4).
- L-13 is stale (a new vial no longer rewrites `start_date`, `lib/newVial.js:20-23`). Refresh it (DV-177).

## 4. Bugs in how start-date and schedule edits propagate today (independent of A-121) → DV candidates

Last id in DIVERGENCES.md is DV-243. The ids below are proposals.

| Proposed | Finding | Evidence | Impact | Fix (owner) | Test |
|---|---|---|---|---|---|
| **DV-244** (S2) | An edit of interval or start date makes the Missed scan write Missed rows for up to 14 past days that were not dose days under the schedule in force then | `lib/missedDoses.js:103-150` builds every past slot from the CURRENT row; the edit path `ProtocolsScreen.js:1850-1873` reconciles nothing. Script (real module): weekly, taken every dose day, edited to daily → **12** new Missed rows; start moved 3 days later → **2** | False Missed rows (stored records) next to real history; report adherence drops; Dose log shows misses the person never had | AD-95 versions read by S-01 for past days; at least, the scan never judges a slot before the edit with the new schedule (per-protocol "schedule since" watermark) | weekly → daily edit, then scan → 0 rows before the edit |
| **DV-245** (S2) | A start date moved later leaves the app-written Missed rows dated before the new start; they keep counting | No code removes them (edit path above); `lib/adherenceReport.js:24-40` counts every logged row after `created_at` | The report and the Dose log show misses before the protocol (now) started | DL-87 analog, decided by logic (founder may override): app-written Missed rows before the new start are tombstoned on every phone; Taken / Skipped / user-edited rows never touched | start +7 days → app Missed before it gone on A and B; a Taken row kept |
| **DV-246** (S2) | After an interval or start edit, "pending from yesterday" asks about a day that was not a dose day | `lib/pendingYesterday.js:35-60` uses the current schedule. Script: weekly → daily at 07:00 → **1** pending for yesterday; start moved to yesterday → **1** | "Did you take yesterday's dose?" for a day nothing was due | via S-01 versions (AD-95) or the same "schedule since" floor as DV-244 | the two script cases → 0 pending |
| **DV-247** (S2) | Rings, the card streak and the tracker streak recompute the past with the current schedule | `lib/adherenceRings.js:22-40`, `lib/doseStreak.js:10-28`, `TodayScreen.js:817-830`. Script: weekly → daily: month ring 3/3 → **3/21**; streak 3 → **0** | A schedule edit erases a streak and makes the 30-day ring fall at once | AD-95: S-01 reads the version in force on each day (DV-005 covers only the curve; extend it, or add this row) | weekly → daily edit → ring and streak for days before the edit unchanged |
| **DV-248** (S2) | "Still going?" can open on a future-start protocol's first day, and on a protocol whose start was moved later | `TodayScreen.js:558-563`: skip only while start > now; the reference falls back to `created_at` when there are no logs. Created Oct 1 with start Oct 20, daily: on Oct 20, 19 days ≥ 7 → asked. Also `protocolEnd.js:61` ends a never-taken protocol at `created_at`, before its start | Asked "is it finished?" on the day it starts; "Sim, terminou" then dates the end before the start | S-33 `inactivityDue`: reference = max(last logged Taken, `created_at`, `start_date`); `endAtLastDose` never-taken end = max(`created_at`, start) | start 19 days after creation → no prompt on the start day |
| **DV-249** (S2, latent) | Clearing `history_from` never reaches the cloud or another phone | `lib/syncMappers.js:100` sends it only when set; `lib/syncCore.js:322-329` ignores a cloud NULL. No path clears it today, but DL-86 / DV-091's fix ("Yes clears history_from") will, and the next full import brings the old value back | The corrected answer is lost on reinstall and on the other phone; the curve keeps the denied cut | Send optional columns when they changed, including NULL (a changed-columns mark), or make `history_from` a regular column. The same rule applies to `ends_on` (C55) | harness: clear on A → cloud NULL → B NULL; full import NULL |
| **DV-250** (S3) | `restartAsNew` copies every protocol column not on a deny-list (`lib/protocolEnd.js:138-147`, `PRAGMA table_info`), so `history_from` goes to the new run and any column added later is copied by default | Code read | Harmless for `history_from` today (start = today), but it breaks SG-7 for `ends_on` with no error | Allow-list of copied columns + test | restart a row with `history_from` and `ends_on` → both NULL on the new run |
| existing | A pulled schedule edit is not re-planned (resume runs `requestSync` and `syncAllNotifications` at the same time) | DV-052 (`App.js:574`; only food / day-21 listen on `sync_complete`, `App.js:587-596`) | Reminders at the old time on the second phone until the next resync | as DV-052 | — |
| existing | No re-ask of "Same dose…" when an edit moves the start earlier | DV-091 (`ProtocolsScreen.js:1913-1935`: create only) | | as DV-091 + DV-249 | — |
| existing | Legacy row with no start date: Today daily, reminders every N days counted from "today" | DV-014 (`notificationPlan.js:38`) | | DL-07 | — |
| existing | Course total honoured only by reminders | DV-012 | | AD-82 via S-15 | — |
| existing | Curve rewrites the past after an edit | DV-005 | | AD-95 | — |
| hygiene (1.3.1) | `elapsedDoseSlots` dead (`lib/schedule.js:192-226`); string `protocols_end_estimate` "Estimated end: {date}" unused in all 6 languages (`i18n/translations.js:1827`, `:4138`, `:6449`…), a near-synonym of "Termina em" (one term per concept) | grep: no caller / no `t('protocols_end_estimate')` | Could be revived by mistake | delete both | — |

## 5. Questions only the founder can answer (everything else above is ledger or logic)

- **Q1 — When on the end date does "Ciclo concluído" appear?** The approved picture shows it on the morning of the end date, with that day's dose still open ("0 de 1"). "Encerrar" is dated at the tap (DL-99), and an ended protocol can no longer log a dose (`recordDoseTaken` refuses it). Tapping "Encerrar" in the morning therefore loses the cycle's last dose. (a) As approved: ask in the morning, and End only once that day's doses are done. (b) **Recommended:** ask on the end date only after its doses are logged or their time has passed, otherwise on the next open. The screen stays the same; only the moment changes.
- **Q2 — The question answered days late** (the app was not opened on the end date). Reminders and Missed rows continue for the days after the planned end (SG-4), and "Encerrar" is dated at the tap (DL-99). Those days stay as misses. (a) **As written:** keep them (honest: the person did not end it). (b) Treat a late "Encerrar" like the inactivity end (DL-87): date it at the later of the end date and the last logged dose, and remove the app-written Missed rows after it.
- **Q3 — Start date edited past the end date.** (a) **Recommended:** Save stops with a short notice ("The start date is after the end date — change one of them"). Nothing is lost. (b) The end date is cleared, with a notice. Either one needs text ×6 and a picture.

## 6. Top risks (ranked)

1. **Restart copies `ends_on`** (C36): the copy is column-generic, so SG-7 breaks with no error unless the column is in `NOT_COPIED` (better: an allow-list).
2. **A clear that never syncs** (C55/C56): following the `history_from` "optional, sent when set, NULL ignored on pull" pattern leaves the date on the cloud and the other phone. They ask "Ciclo concluído" for a date the person removed, and a reinstall brings it back.
3. **A regular column without the production migration** (C58): every protocol push fails (`writeWithOptionalRetry` drops only optional columns). The migration must be live, and verified, before the build.
4. **The last dose of the cycle** (C24, Q1): the question in the morning plus End at the tap means that day's dose can no longer be logged.
5. **Folding `ends_on` into S-01 / `dueDateKeys`** the way AD-82 folds the total: doses, reminders, Missed rows or the curve would then stop by themselves, against SG-4. Only the guard test of SG-11 prevents it.
6. **"Continuar" / "Sem data de fim" without restarting the inactivity span** (SG-15): Goli has no logged doses, so "Still going?" would come straight back, the exact annoyance A-121 removes.
7. **End date before the start / start edited past the end** (SG-13, SG-14, Q3): the question would come for a protocol that has not started, or never.
8. **Late answers** (Q2): misses pile up between the planned end and the tap. Decide before the build, not after reports.
9. **Schedule edits rewrite stored history** (DV-244..247): the founder's "mudança de data de protocolo" is broken today apart from A-121. The Missed rows are records written after the fact. AD-95's versions are the single fix; without them, at least DV-244/245 need the edit-time reconciliation.
10. **The course-end prompt outside the shared guards** (C26, C27, C25): it must wait for the first sync (A-122), never stack on another sheet (DV-202), and behave on the Fold right page (A-115) like the page's other actions.
