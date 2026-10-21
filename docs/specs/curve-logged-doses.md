# Curve: the past from logged doses — AD-96 B

- source: founder 2026-10-15, OPEN-11 closed as AD-96 (C in 1.3.0: hollow ticks; B in 1.3.1 after the pharmacometrics review). Registry: DV-072, A-31.
- pharmacometrics review 2026-10-20: GO WITH CONDITIONS — the decay math is unchanged (linear superposition of first-order decay); B changes the input data. Conditions: the rules R1–R16 below, and the curve fixes that B rests on (DV-005 dated dose versions / AD-95, DV-069 the user's own times / DL-31, DV-068 no 6 h grid snap, DV-072 C hollow ticks) — found NOT built on 2026-10-20 although targeted at 1.3.0.
- still needs real validation (outside this build): the half-life table tiers (most peptides "estimated" — keep the dashed estimated style); linear superposition for dose-dependent compounds (Cetrorelix label) needs a "dose-dependent" note; logged_at is the tap time, not the dose time — a time-edit item goes to the registry.
- code (expected): lib/serumModel.js, screens/SerumCurveScreen.js, the Journey tile, lib/schedule.js (expectedSlotTimesOn, expectedDosesOn), lib/declared.js (cutoff), the curve strings ×6.
- checklist-signed: 2026-10-20 by the founder ("Pode seguir com as suas recomendações em todos", after the 1.3.1 round that listed signing this spec). Scope per the ledger "1.3.1 = option B": AD-96 B (the past from logged doses) ships in 1.3.2; 1.3.1 ships C (hollow ticks), the interim DV-005 note, exact and own times (DV-068/069) and the three curve defects.

## Rules

- R1 Boundary: cutoff C = created_at − 1 h (lib/declared.js grace). Before C the past comes from the schedule (the A-30 estimated part), or nothing when history_from is set. From C to now: Taken rows only, at their exact logged_at. After now: the plan.
- R2 Declared rows: Taken rows dated before C add nothing (the schedule covers that time; they stay in the log and export). On the creation day, scheduled slots before C plus Taken rows never exceed that day's expected count.
- R3 Skipped, Missed, "There was no dose" and deleted rows add nothing.
- R4 Time: a dose counts at its exact logged_at, no grid snap; drawing samples the exact instants; Est. level, date estimate and Journey tile use exact times.
- R5 Plan: after now, the protocol's own slot times (expectedSlotTimesOn, DL-31); fixed 08:00 only without times (DL-77); days stepped by calendar day (A-101b).
- R6 Open slot (due, no row yet): not in the level now; projected as a planned dose placed at now; drops out once a row closes it; a late Taken counts at its own time.
- R7 Counting by number: planned slots left today = max(0, expected today − today's Taken/Skipped/Missed rows), on the remaining slot times (no double count after an early dose or a zone change).
- R8 The curve is a pure function of (protocols, versions, logs, now), recomputed on focus and after sync.
- R9 Taken rows dated after now (a clock that was ahead) and unparseable logged_at are excluded, never throw (SQLite "YYYY-MM-DD HH:MM:SS" parsed).
- R10 Dose amount: the protocol version in effect at logged_at (AD-95), through doseInCurveUnit; blends split per version. Until versions exist, the AD-95 interim notice.
- R11 No logs: level 0 (plus any declared part), plan drawn, "No doses logged yet" line; never padded from the plan.
- R12 Ended: all Taken logs count; no plan after ended_at; a Restart's declared part never overlaps earlier logged-era Taken rows of the same compound.
- R13 Several protocols of one compound: each uses only its own protocol_id rows; the combined total is per substance (unchanged).
- R14 Past in absolute instants; plan in local wall-clock slots of the current zone; R7 prevents zone-change double counts.
- R15 Look-back: max(16 d, window shown, 6 × t½), capped 600 d (Testosterone Undecanoate ≈ 540 d).
- R16 Hollow tick for each planned logged-era slot without a Taken row (Skipped, Missed, unscanned days, the open slot).

User-visible copy (picture first, ×6 natively, descriptive only — never "you missed", "low", "take"): disclaimer "…the doses you logged (before Now) and your planned schedule (after Now)"; legend solid = "From your logged doses", dashed after Now = "Planned", estimated part = "Estimated from your start date", hollow tick = "Planned, not logged as taken"; note "Doses count at the time you marked them"; a one-time notice for existing users + a What's New line (levels drop for sparse loggers); "From your logged doses" labelled at the Now marker.

## Acceptance checklist

| ID | Criterion | Status | Evidence | Deviation |
|---|---|---|---|---|
| PK-1 | Daily protocol created 10 days ago, 7 Taken / 2 Skipped / 1 Missed: level now = the exact sum over the 7 Taken rows only. | missing | curvePastTaken.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-2 | A Taken row 1 h ago, BPC-157 250 mcg: level now = 0.25 × 2^(−2) mg, no snap; Journey tile = screen = date estimate (TZ America/New_York across 2026-11-01). | missing | curveExactTime.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-3 | A Taken row 30 min ago is never left out of the level now (no rounding into the future). | missing | curveExactTime.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-4 | Weekly protocol, slot 2 h ago, no row: level now excludes it; the projection at now+1 h includes a dose placed at now; after a Missed row it drops. | missing | curveOpenSlot.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-5 | The 20:00 dose logged at 15:00: no 20:00 dose projected today; twice daily with 1 logged keeps 1 planned. | missing | curveCountCover.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-6 | Zone change mid-day (UTC−3 → UTC+1) with today's dose logged: no second dose planned today. | missing | curveCountCover.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-7 | start_date 30 days ago, created 5 days ago, 5 backfill Taken rows before creation: level = schedule-before-cutoff + logs-after; backfill rows add 0. | missing | curveDeclaredBoundary.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-8 | Creation day, start in the past, today's dose marked 16:30 (slot 08:00): today counts once. | missing | curveDeclaredBoundary.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-9 | history_from set: nothing before it; Taken rows after it count. | missing | curveDeclaredBoundary.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-10 | 250 mg weekly for 8 weeks, changed to 125 mg today: the level 7 days ago is unchanged; the future uses 125 (needs AD-95 versions). | missing | curveDoseVersion.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-11 | No logs, created today: level 0, plan drawn, "no doses logged yet" note. | missing | curveNoLogs.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-12 | Ended protocol: logs before the end count; no plan after ended_at; Restart with a past start never overlaps the earlier run's logs. | missing | curveEndedRestart.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-13 | Two protocols of one compound: each series only its own protocol_id rows; combined = sum of members. | missing | curveMultiProtocol.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-14 | Future-dated Taken row and unparseable logged_at: excluded, no exception. | missing | curveBadTimestamps.test.js | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-15 | Testosterone Undecanoate 1000 mg logged 300 days ago contributes 1000 × 2^(−300/90) mg; the log query reaches ≥ 540 days back. | partial | __tests__/curveLookback.test.js (1.3.1 curve fix 2, founder 2026-10-20: one look-back per compound for the screen at every window, the Journey tile and the date estimate: the history before the earliest instant drawn or estimated (the 365-day window's left edge, or an earlier date estimate) = max(16 d, 6 × t½), capped 600 d from that instant (coordinator 2026-10-20, by logic) — so the scan from Now is 367 d + that history (TU 907 d); a long-term TU user (every 70 days) reads under 2^(−(H − τ)/t½) ≈ 2.7 % low at the left edge of a 365-day window and on a date a year back (was 34 % low); a SCHEDULED 1000 mg TU dose 300 days ago contributes 1000 × amountFraction = 1000 × 2^(−300/90) × 1.012 (the modeled 7-day rise); the Dose log read is the longest window, 367 d (engineering review ENG-2; nothing reads older rows in 1.3.1). The LOGGED-row contribution waits for AD-96 B, 1.3.2) | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 (log read 967 d ships with AD-96 B, 1.3.2) |
| PK-16 | Deterministic; a Missed→Taken flip changes the level on the next compute; curve and tile update after focus and after sync (device). | missing | curveRecompute.test.js + device | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-17 | A hollow tick for every logged-era planned slot without a Taken row, none for Taken. | partial | __tests__/curveTicks.test.js (1.3.1, DV-072 C: the level stays planned; device render in both themes owed) | |
| PK-18 | Disclaimer, legend, the "time you marked them" note and the update notice ×6, parity green; no advice words in the curve strings; both themes on device. | missing | i18n parity, curveCopyNoAdvice.test.js, render pass | approved 2026-10-20 — 1.3.1 = option B (founder "B, pode seguir"): AD-96 B ships in 1.3.2 |
| PK-19 | The plan uses the user's own times: daily 22:00 at 13:00 → today's dose not in the level now, planned at 22:00 (DV-069). | partial | __tests__/curveExactTime.test.js "DV-069: a daily 22:00 protocol is drawn at 22:00" (+ Berlin file; device check owed) | |
