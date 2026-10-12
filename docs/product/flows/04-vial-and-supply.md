# 04 — Vial and supply: mix, use, low, expiry, new vial, bottle refill, empty

> Draft for founder review, written 2026-10-12 from `docs/product/research/01-protocols.md` (§3.12, §5.2–5.3, §6.2–6.11), `02-doses-today.md` (§3.7, alerts), `03-reminders.md` (§3.5–3.6), `docs/decisions.md` (Protocols & dose math; Today) and `docs/specs/fixes-1.2.5.md` (FX-1, FX-6, FX-11, FX-22). Code @ 4dade55.
> Shows the **intended** behaviour; **Divergence today** notes cite the dossier.

---

## 1. Goal

Tell the user, truthfully and without advice, how much is left in the container they are using and until when they set it to be good — so they are never surprised by an empty vial or a vial past their own window — and let them start the next container in one step, keeping every logged dose in history.

## 2. Actors and containers

| Container | Type | Where it lives | "Left" means |
|---|---|---|---|
| Mixed vial | recon (lyophilized) | `vials` row: `mixed_on`, `water_ml`, `total_doses`, `doses_taken`, `active` | doses left = capacity − taken; days left = `mixed_on + vial_valid_days (30)` − today |
| Ready-to-use vial | rtu | `vials` row: `water_ml` = bottle ml, `total_doses`, `doses_taken`, `expires_on` (last day of the box month) | doses left; days left to `expires_on` |
| Bottle | oral | on the protocol row: `container_units`, `units_taken` | units left = container − taken; days of supply |

Other actors: Today (alerts, dose card vial cells, "+ Add vial", vial prompt), My Protocols (card cells, page vial block, "New vial" / "New bottle", hero low-supply line), notifications (`vial_low` immediate once per vial, `vial_expiry` 09:00 at 7 days and on the day), Mark complete / Undo / Delete dose (flow 03).

## 3. Preconditions

- An active injectable protocol (recon / rtu) or an oral protocol with a container size.
- Supply alerts: "Vial expiry alerts" switch on (it also gates "Vial running low" — 03 G4).

## 4. What may already have happened before

| # | Prior state | What the flow must do |
|---|---|---|
| P1 | Vial mixed days before installing | Step 5 / assistant ask the mix date; days left count from it. |
| P2 | Vial half used before installing | **OPEN-01 (A-08/F7):** no field for doses already used; count starts at 0 → doses left over-reported. |
| P3 | Never logged a mix ("skip") | Today card "+ Add vial"; Protocols shows "M doses per vial" capacity only. |
| P4 | Mixed a second vial early (two open at once) | Screens use the newest active vial per protocol; the push looks at every active vial (01 D-04). |
| P5 | Dose changed mid-vial (recon) | Capacity should follow the new dose (01 D-13 — see flow 02). |
| P6 | rtu vial ran out last week | Intended: a way to start a new vial from Protocols; today none (01 D-12). |
| P7 | Recon vial past its window but not empty | Intended: user can start a new vial; today only when empty or absent (01 D-12b, A-08 "needs a founder decision"). |
| P8 | Bottle with no container size | Not tracked; no supply line. |
| P9 | Oral every other day | Days of supply must use the interval (01 D-14). |
| P10 | Protocol restarted | New container question: New vial / Keep using the same vial (flow 05). |
| P11 | Another device took the last dose | Vial arrives inactive after pull; this phone's push may still announce low (once per vial id). |

## 5. Happy path (recon vial, 20 doses, daily)

```mermaid
flowchart TD
  A["Create protocol, step 5 mix date (flow 02)"] --> B["vials row: total 20, taken 0, mixed_on, valid 30 days"]
  B --> C["Each Mark complete: taken +1, cells and 'N of 20 doses left'"]
  C --> D{"Doses left"}
  D -->|"4 or more"| C
  D -->|"1 to 3"| E["LOW: Today alert Supply low, amber Low tag, hero line, one push Vial running low"]
  E --> C
  D -->|"0 after the last take"| F["vial active 0, Today prompt All doses logged"]
  F -->|Log new vial| G["Mix date pills Yesterday / Today or month + day, new vials row, protocol untouched"]
  F -->|Protocol finished| H["Prompt closes (intended: offers end with a Later way out, picture pending)"]
  G --> C
  B --> X{"Days left"}
  X -->|"8 or more"| B
  X -->|"7 to 1"| Y["Today alert Vial expiring soon, push 09:00 at 7 days, days coloured attention then risk"]
  X -->|"0 or less"| Z["Past window tag, alert name expired, push 09:00 on the day, vial still counts doses"]
```

## 6. States and transitions

### 6.1 Vial (recon / rtu)

```mermaid
stateDiagram-v2
    [*] --> None
    None --> Active: new protocol vial step or rtu fields, Today + Add vial or Log new vial, Edit rtu vial field with no vial, Restart with New vial
    state Active {
        [*] --> Ok
        Ok --> Low: remaining 1 to 3
        Low --> Ok: Undo or Delete dose gives doses back
        Ok --> Expiring: days left 7 or less
        Low --> Expiring: days left 7 or less
        Expiring --> PastWindow: days left 0 or less
        Ok --> PastWindow: days left 0 or less
    }
    Active --> Active: Mark complete +1, Undo -1, Delete dose -1, rtu New vial resets the same row
    Active --> Finished: last dose taken (taken >= capacity), active 0
    Finished --> Active: Undo or Delete of that dose, no other active vial
    Finished --> Replaced: Log new vial (new row)
    Active --> Replaced: New vial while not empty (intended for recon, rtu today resets the same row)
    Active --> PutAway: protocol ended or deleted, Restart with New vial
    PutAway --> Active: same-day Restore, Restart keep same vial (moves to the new run)
    Active --> Tombstoned: Delete forever of the protocol
    Finished --> Tombstoned: Delete forever of the protocol
    PutAway --> Tombstoned: Delete forever of the protocol
    Replaced --> [*]: stays as history
    Tombstoned --> [*]
```

Note: Low, Expiring and Past window are **derived**, never stored. An expired vial stays active and keeps counting doses (the window is the user's own tracking, never advice).

### 6.2 Oral bottle

```mermaid
stateDiagram-v2
    [*] --> NotTracked: container units empty
    [*] --> Tracking: container units set
    NotTracked --> Tracking: Edit sets container units
    Tracking --> Tracking: Mark complete +units, Undo or Delete -units
    Tracking --> Low: units left cover 1 to 3 doses (intended, by logic)
    Low --> Tracking: units given back
    Low --> Empty: units left 0
    Tracking --> Empty: units left 0
    Tracking --> Full: New bottle (units taken 0)
    Low --> Full: New bottle
    Empty --> Full: New bottle
    Full --> Tracking: next Mark complete
```

### 6.3 Supply alert on Today (generic alert machine)

```mermaid
stateDiagram-v2
    [*] --> Hidden: no active vial with 1 to 3 left
    Hidden --> Visible: a take brings a vial to 3, 2 or 1
    Visible --> SnoozeStrip: snooze round tapped
    SnoozeStrip --> Snoozed: Tomorrow or In 3 days (until 09:00)
    Snoozed --> Visible: time reached and Today refetches
    Visible --> Hidden: vial empty (0 is not low) or new vial or undo
    Visible --> ProtocolPage: tap, one protocol named (intended)
    Visible --> ProtocolsList: tap, several protocols
```

## 7. Alternative and exception paths

### 7.1 Low supply (one rule everywhere, decision 2026-10-01 FX-11)
- Low = 1, 2 or 3 doses left; 0 is not "low" (it is finished). Capacity = stored `total_doses`, else derived floor(amount ÷ dose).
- Surfaces: Today alert "Supply low" ("{name} — {n} doses left" / one name / "{names} running low" / "{count} protocols running low"), Protocols card amber tag "Low · {n} left", page vial block, Protocols hero line, one push "Vial running low" / "{name} has {n} doses left" — **once per vial**, only with the app running (BR-7).
- **Intended (decision 2026-09-29):** an alert that names one protocol opens that protocol.
  - **Divergence today (01 D-23, 02 D23):** Today alerts open the Protocols tab with no protocol (heroes). The push does open the protocol.
- **Divergence today (01 D-04):** the push evaluates every active vial while screens use the newest per protocol — two open vials can produce a push the screens never show.
- **Divergence today (01 D-05, 03 D-19):** the push names `protocol.name` (creation language) while Today and the expiry push use the translated compound name.
- **Divergence today (03 G4):** the switch "Vial expiry alerts" also silences "Vial running low" (copy says expiry only).
- **Divergence today (01 D-15 / G-19):** oral bottles have no low-supply anywhere. → OPEN-02.

### 7.2 Expiry
- Recon: `mixed_on + vial_valid_days` (default 30, "Days the vial stays good", hint "A general reference (~30 days). Adjust it to match your storage — this is your own tracking, not medical advice."). RTU: `expires_on` from the box month + year (last day of that month).
- Today alert ≤ 7 days: "Vial expiring soon" / "{name} — {n} days left" / "{name} — expired" / "{count} vials expiring soon". Protocols: days coloured attention (≤ 7) and risk (≤ 3); "Past window" tag at ≤ 0.
- Push (A-45, behind the vial switch): 09:00 local, 7 days before and on the day, only the next one per vial, counted inside the iPhone budget.
- **Divergence today (01 D-06):** days-left colour differs: Today card ok-green above 7, Protocols plain ink2. Decision Q9 = B ("days coloured by deadline") does not say which → DL-16 (one function, the Protocols style).
- **Divergence today (01 D-06b, 08 D6):** three copies of the rtu days-left rule (ceil from now vs whole days) can differ by one day near midnight; push at 09:00 while "Past window" shows from 00:00.
- **Divergence today (03 G19):** a snoozed expiry push moves to the check-in channel and keeps the compound name with names off.

### 7.3 Empty / finished
- Recon: the take that reaches capacity deactivates the vial and opens **All doses logged** / "All doses from this vial have been logged. Would you like to log a new vial?" with mix date and "New vial: ~{n} doses (from your vial size and dose)." → **Log new vial** / **Protocol finished** / Not now.
  - **Intended (decision 2026-10-04 + correction):** "Protocol finished" ends the protocol, but only once a picture with a "Later" way out is approved ("I'll mix the next vial tomorrow" is the common case). Until then it only closes the prompt.
  - **Divergence today (02 G12):** finishing a vial from the Dose log (Missed → Complete) deactivates it silently, no prompt.
- RTU empty:
  - **Intended (by logic from "RTU New vial", F-035):** the user can always start a new rtu vial (new box date) from the protocol page and from Today, even when the old one is empty.
  - **Divergence today (01 D-12 / G-8, device unverified):** no prompt; "New vial" needs an ACTIVE vial with doses taken > 0, so an empty rtu vial cannot be replaced except by Edit → change the vial size or box date.
- Oral empty: units left 0 shown; no flag, no prompt (OPEN-02).

### 7.4 New vial / new bottle
- Ask first (decision 2026-09-29/10-02): "Start counting from a full vial? The doses already logged stay in your history." (Cancel / **Start new**). Bottle: same with "bottle".
- A new vial **never rewrites the protocol's start date** (S-01) — history, curve and adherence keep their past.
- Recon new vial: only through Today's prompt (after the last dose) or "+ Add vial" (no active vial) — mix date "Yesterday / Today" pills or month + day; capacity derived; water read with comma decimals.
  - **Divergence today (01 D-12b, G-7; A-08 "needs a founder decision"):** no recon "New vial" on My Protocols, and none while a vial is still active (e.g. past window). → DL-22 (decided by logic).
- RTU New vial today resets the **same** row (`doses_taken 0`, expiry and size kept).
  - **Intended (by logic):** a new rtu vial is a new row with its own box date (asked), so the old vial stays as history and expiry alerts follow the new box. → DL-22.
- Oral New bottle: `units_taken = 0` on the protocol.

### 7.5 Undo / delete give doses back
- Undo of a take: −1 from the current count; reopens a vial this dose closed if no other vial is active.
- Dose log Delete: −1 only when the dose can be attributed to the vial; reopens only if the vial was finished by doses.
- **Divergence today (01 D-17):** Undo reopens a vial that an END or DELETE deactivated; Delete would not.

### 7.6 Offline / killed / second device
- All supply changes are local writes; pushed later. The low push needs the app running (never from the background refresh, BR-7) — it is "owed" until the next foreground.
- **SUSPECTED (02 §7.3):** app killed between the dose row and the vial update → dose saved, supply not moved.
- Two devices: vial counts merge row-level (last push wins on the whole row); **Divergence today (01 G-3, A-87b):** another phone's offline dose can push `active = 1` on a vial an end deactivated.

### 7.7 Timezone / DST
- Mix date and box month are local calendar days. Recon days left uses whole local days; rtu uses ceil from now (D-06b). The expiry push fires at 09:00 local on its date.

### 7.8 Notification tap
- "Vial running low" and expiry pushes → Protocols opening that protocol (`openProtocolId`; older alerts via `openVialId`). Snooze "In 1 hour" / "Tomorrow" available (general category).

### 7.9 Fold
- Today's right page for a recon protocol with no vial: "No mixed vial right now" / "Without a vial the app doesn't know the concentration, so it can't show the syringe or what's left. Add the vial you're going to use." + "+ Add vial" (FR-3). Refill and zoom on the right page open the protocol in My Protocols (FR-2). My Protocols book: right page = protocol page with the vial block.

### 7.10 Free vs Premium
- Supply tracking, alerts and pushes are free.

### 7.11 Report
- **Divergence today (01 D-02, 08 D3):** the adherence report's "doses remaining" uses `total_doses − doses_taken` without the derived capacity — can read 0 or negative for older vials.

## 8. What every surface shows

| State | Today | My Protocols card / page | Notifications | Settings report |
|---|---|---|---|---|
| Ok | dose card vial cells (recon) "N doses remaining", days left in ok colour | cells + "N of M doses left" · "{n} days left" | — | doses remaining |
| Low (1–3) | Alert "Supply low · {name} — {n} doses left" (amber) | amber "Low · {n} left"; hero line | one "Vial running low" (app running) | — |
| Expiring (≤ 7 days) | Alert "Vial expiring soon · {name} — {n} days left" | days in attention / risk | 09:00 at 7 days | — |
| Past window (≤ 0) | Alert "{name} — expired" | "Past window" tag, risk | 09:00 on the day | — |
| Finished (recon) | Prompt "All doses logged" | "M doses per vial" (no cells) | — | — |
| Finished (rtu) | nothing (intended: + Add vial) | "M doses per vial"; New vial missing (D-12) | — | — |
| No vial (recon skipped) | card "+ Add vial"; Fold right page "No mixed vial right now" | "M doses per vial" | — | — |
| Bottle tracking | — | serving hero "Take N", "Left", "Days left", **New bottle** when taken > 0 | — | — |
| Bottle empty | — | Left 0 | — (no rule) | — |

## 9. Data written at each step

| Step | Table | Write | Synced |
|---|---|---|---|
| Create recon / rtu | `vials` | insert (flow 02) | yes |
| Mark complete | `vials.doses_taken + 1`; `active 0` at capacity; or `protocols.units_taken += units` | yes |
| Undo / Delete dose | `vials.doses_taken − 1`, maybe `active 1`; or units back | yes |
| Log new vial / + Add vial | `vials` insert via `newVialRecords` (mixed_on past occurrence, water_ml, total_doses, doses_taken 0, active 1); protocol untouched | yes |
| RTU New vial (today) | `vials` same row `doses_taken 0, active 1` | yes |
| New bottle | `protocols.units_taken = 0` | yes |
| Low push sent | AsyncStorage `dosetrace_vial_low_sent` `{vialId:true}` | no (survives sign-out — 03 G28) |
| Expiry push | OS queue `vial-exp-{vialId}-{7|0}` | — |
| Alert snooze | AsyncStorage `dosetrace_alert_snooze` | no |

## 10. Rules (with sources)

R-38 one low rule 1–3 (2026-10-01). R-39 low push once per vial, app running only. R-40 low amber, days coloured by deadline (Q9 = B). R-41 recon validity default 30, the user's own window. R-42 expiry push 7 days before and on the day 09:00, next only, inside the iPhone budget (A-45/RC-7). R-43 new vial never rewrites start_date (S-01). R-44 New vial / New bottle ask first; logged doses stay. R-45 mix date = most recent past occurrence. R-46 last dose deactivates; undo reopens unless another is active. R-21 rtu total = conc × ml; expiry = last day of the box month (`01 §4`).

## 11. Divergences today (summary)

| ID | Intended | Today | Source | DV |
|---|---|---|---|---|
| D04-1 | Alert naming one protocol opens it | Opens the list | `01 D-23`, `02 D23`, decision 2026-09-29 | DV-089 |
| D04-2 | Empty rtu vial can be replaced | No path except Edit | `01 D-12`, `G-8` | DV-027 |
| D04-3 | Recon new vial from Protocols / before empty | Only via Today when empty or absent | `01 D-12b`, `G-7` (A-08 open) | DV-093 |
| D04-4 | rtu New vial = a new row with its own box date | Same row reset, old expiry kept | `01 G-7` (A-08 open) | DV-027 |
| D04-5 | Oral low supply + interval-aware days left | No low rule; days ÷ doses/day only | `01 D-14, D-15, G-19` | DV-020, DV-092 |
| D04-6 | One capacity rule (supplyLow) everywhere | 3 inline copies + report negative | `01 D-02, D-03` | DV-017, DV-121 |
| D04-7 | Push and screens look at the same vial | Push = all active vials | `01 D-04` | DV-016 |
| D04-8 | One name per protocol in pushes | stored name vs translated | `01 D-05`, `03 D-19` | DV-013 |
| D04-9 | One days-left colour and formula | Two colours, three formulas | `01 D-06, D-06b`, `08 D6` | DV-018 |
| D04-10 | Vial switch label matches what it silences | Also silences low | `03 G4` | DV-140 |
| D04-11 | Dose log finishing a vial shows the prompt | Silent | `02 G12` | DV-038 |
| D04-12 | Undo and Delete give doses back by one rule | Two rules | `01 D-17` | DV-021 |
| D04-13 | Restore does not reactivate an empty vial | It does | `01 D-18`, `G-21` | DV-022 |
| D04-14 | "Protocol finished" ends with a Later way out | Only closes (picture pending) | decision 2026-10-04 correction | DV-090 |
| D04-15 | "Vial age" sort uses the user's window and rtu box dates | mixed_on only | `01 D-07` | DV-122 |

## 12. Founder questions (canonical IDs — `docs/product/OPEN-DECISIONS.md`)

Reconciled 2026-10-12: every question this flow raised has one canonical ID in `OPEN-DECISIONS.md` — **OPEN-xx** waits for the founder (asked in the one Portuguese round there), **AD-xx** is already decided by the ledger or a signed spec, **DL-xx** is decided by product logic (recorded in `docs/decisions.md`; the founder may override). DV-xxx is the defect row in `DIVERGENCES.md`.

- **DL-22 — Manual "New vial" (A-08).** Decided by logic: recon gets "New vial" on the protocol page at any time (asks the mix date); an rtu New vial is a new row that asks the new box date; an empty rtu vial can be replaced (picture first). → DV-027, DV-093.
- **OPEN-01 — Doses already used on a vial** (same question as flow 02). → DV-094.
- **OPEN-02 — Oral low supply.** Waits for the founder (option A there applies the 1–3 rule to bottles in the alert, the push and the badge). The interval-aware days of supply is a plain bug, fixed regardless. → DV-092, DV-020.
- **AD-11 — "Protocol finished" with "Later" and the deliberate End.** Already approved (A-85); the picture comes before code (CLAUDE.md). → DV-090.
- **DL-16 — Days-left colour above 7 days.** Decided by logic: one days-left function and one colouring, the Protocols style (Q9 = B colours by deadline). → DV-018.

## 13. Acceptance checks (agent-device QA script)

Account Test03. Protocols: **BPC-157** recon 5 mg / 2 ml, dose 250 mcg (20 doses), daily; **Test Cyp** rtu 200 mg/ml, 10 ml, 100 mg weekly (20 doses), box expiry next month; **Zinc** oral, 1 capsule, container 60. Light and dark; PT via Settings → Preferências → Idioma.

**F04-01 — Vial block after create**
- Expect on BPC-157 page: vial cells + "20 of 20 doses left" / "20 de 20 doses restantes" · "30 days left" / "30 dias restantes".

**F04-02 — Doses count down**
- Do: Mark complete once (flow 03).
- Expect: "19 of 20 doses left"; Today card vial cells −1.

**F04-03 — Low at 3**
- Setup: set BPC-157 to 17 taken (via 17 takes on past days in a test DB, test account only).
- Do: Mark complete → 3 left.
- Expect: Today alert "Supply low" / "Estoque baixo" + "BPC-157 — 3 doses left" / "BPC-157 — restam 3 doses"; Protocols tag "Low · 3 left" / "Baixo · 3 restantes"; one notification "Vial running low" / "Frasco acabando" + "BPC-157 has 3 doses left" / "BPC-157 tem 3 doses restantes". A second take → alert "2 doses left"; **no second push** for the same vial.

**F04-04 — Alert tap opens the protocol (intended)**
- Do: tap the Supply low alert.
- Expect (intended): My Protocols opens on BPC-157's page. **Today: lands on the heroes** — record D04-1.
- Do: tap the push instead → opens BPC-157's page (works today).

**F04-05 — Snooze an alert**
- Do: snooze round → "Tomorrow" / "Amanhã".
- Expect: alert hidden; returns after 09:00 next day on Today focus. Options are only "Tomorrow" and "In 3 days" / "Em 3 dias".

**F04-06 — Last dose → All doses logged**
- Do: take the last dose.
- Expect: "All doses logged" / "Todas as doses registradas" + "All doses from this vial have been logged. Would you like to log a new vial?"; mix date (Yesterday / Today pills, month + day); "New vial: ~20 doses (from your vial size and dose)." / "Novo frasco: ~20 doses…"; **Log new vial** / "Registrar novo frasco"; **Protocol finished** / "Protocolo concluído".
- Log new vial with "Today" → page shows "20 of 20 doses left", "30 days left"; protocol start date unchanged; Dose log keeps the 20 old doses.

**F04-07 — Protocol finished button (today)**
- Expect today: closes the prompt; protocol stays active; card shows "+ Add vial" / "+ Adicionar frasco". Intended after the picture: offers End with a Later option — record.

**F04-08 — + Add vial with no vial**
- Do: tap "+ Add vial" on the card.
- Expect: the same prompt asking the mix date; Save creates the vial.

**F04-09 — Invalid mix date on Today**
- Do: + Add vial → month February, day 31.
- Expect: "Invalid date" / "Data inválida" sheet. (Wizard step 5 clamps the same input — D02-6.)

**F04-10 — Expiry alert and push (recon)**
- Setup: BPC-157 mixed 24 days ago (valid 30).
- Expect: Today alert "Vial expiring soon" / "Frasco vencendo" + "BPC-157 — 6 days left" / "BPC-157 — vence em 6 dias"; Protocols days in attention colour; Reminder check unaffected. Mixed 31 days ago → "BPC-157 — expired" / "BPC-157 — vencido", "Past window" / "Fora do prazo" tag; vial still counts doses.
- Push: with the vial mixed 20 days ago (expiry in 10 days), the OS queue holds `vial-exp-{vialId}-7` at 09:00 in 3 days and nothing else for that vial; after that one fires, the next resync schedules `vial-exp-{vialId}-0` at 09:00 on the expiry day (check with adb `dumpsys alarm` on Android or the Reminder check count on iPhone).

**F04-11 — RTU box expiry**
- Setup: Test Cyp box expiry = this month.
- Expect: days left counts to the last day of this month; "Past window" from 00:00 of the first day after.

**F04-12 — RTU New vial**
- Setup: Test Cyp with 3 taken.
- Do: page → **New vial** / "Novo frasco".
- Expect: "Start counting from a full vial? The doses already logged stay in your history." / "Começar a contar a partir de um frasco cheio?…" → **Start new** / "Começar um novo" → "20 of 20 doses left". Intended (D04-4): asks the new box date and keeps the old vial as history — record today's behaviour (same row reset, old expiry kept).

**F04-13 — RTU empty cannot be replaced (divergence check)**
- Setup: take all 20 Test Cyp doses.
- Expect (intended): a way to start a new vial. **Today:** no prompt, no New vial button, card "20 doses per vial" — record D04-2.

**F04-14 — Oral New bottle**
- Setup: Zinc with 10 taken.
- Expect: serving hero "Left 50" / "Restam 50", "Days left"; **New bottle** / "Novo frasco" → "Start counting from a full bottle?…" → Left 60.

**F04-15 — Oral every other day days-left (divergence check)**
- Setup: Zinc interval 2 days, 30 left.
- Expect (intended): ~60 days left. **Today: 30** — record D04-5.

**F04-16 — Undo gives the dose back**
- Do: Mark complete → Undo.
- Expect: count back; if that take had finished the vial, the vial is active again and the prompt closes.

**F04-17 — Vial switch off**
- Do: Settings → Notifications → "Vial expiry alerts" / "Alertas de vencimento de frasco" off.
- Expect: no vial-exp alarms in the OS queue; Today alerts still show (in-app). Note: low pushes also stop (D04-10).

**F04-18 — Fold: no-vial page**
- Do (unfolded Fold): tap BPC-157 with no active vial.
- Expect: right page "No mixed vial right now" / "Nenhum frasco reconstituído agora" + body + "+ Add vial"; tapping it opens Today's vial prompt.

**F04-19 — Both themes**
- Alerts, Low tag, days colours, vial cells, prompt, New vial sheet, Past window tag: readable in light and dark; low stays amber in both.
