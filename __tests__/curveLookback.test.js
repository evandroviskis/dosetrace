'use strict';
// Curve fix 2 (1.3.1, founder-approved 2026-10-20; spec docs/specs/curve-logged-doses.md R15 + PK-15):
// the look-back grows with the window shown. Before, the doses were scanned from Now back
// max(16 d, window shown, 6 × t½): the window's own start had almost no earlier doses (a 90-day
// window of a 7-day t½ compound started from ~2 days of history), and the Journey tile (14-day
// model) and the screen (90-day window) counted different doses, ~1.6 % apart. Now one look-back
// per compound, used by the screen at every window, the tile and the date estimate: the history
// before the EARLIEST instant the curve can draw or estimate (the left edge of its longest window,
// or a date estimate before it) is max(16 d, 6 × t½), capped at 600 d from that instant (coordinator
// 2026-10-20, decided by logic: the curve must be right at every date it shows — the cap measured
// from Now left Undecanoate ~16 % low at the left edge of a 365-day window). Pure math, never advice.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const DAY = 864e5;
const STEP = M.STEP_HOURS * 3600e3;
const now = new Date(2026, 9, 20, 13, 7).getTime();
const iso = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

// AD-96 B (1.3.2): the level's past comes from the Dose log. These look-back guards now run through
// the logged-doses model with every planned dose logged as Taken at its slot (helpers/curveLogs) — the
// same instants, so the same numbers; PK-15's logged Undecanoate dose is a single row.
const { takenAtEverySlot } = require('./helpers/curveLogs');
const allTaken = (p, upTo, from) => ({ logs: takenAtEverySlot([p], upTo, from != null ? { from } : {}), siblings: [p] });
const tileOf = (p, at, data) => M.defaultCurveLevel([p], at, undefined, null, { logs: data.logs, history: [p] });

// The screen's numbers for a window of `pastDays` (SerumCurveScreen model: curveGridStart(now,
// pastDays) → curvePlan → levelAt / lineSamples).
function screen(p, pastDays, futureDays = 7, data = allTaken(p, now)) {
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const start = M.curveGridStart(now, pastDays);
  const end = now + futureDays * DAY;
  const nSteps = Math.round((end - start) / STEP);
  const doses = M.curvePlan(p, entry, start, end, now, data).doses;
  const doseMg = H.doseInCurveUnit(Number(p.dose), p.dose_unit, entry);
  const ctx = { start, stepMs: STEP, nSteps, now, plotPx: 330, extraTimes: [] };
  return { entry, start, doses, doseMg, nowLevel: M.levelAt(doses, doseMg, entry, now), line: M.lineSamples(doses, doseMg, entry, ctx, H.amountFraction) };
}

test('PK-15: Testosterone Undecanoate 1000 mg LOGGED 300 days ago contributes 1000 × 2^(−300/90) mg — tile, screen and date estimate', () => {
  const doseDay = dayStart(now - 300 * DAY);
  const p = { id: 'tu', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 1000, doses_per_day: 1, reminder_time: '09:00', start_date: iso(doseDay), created_at: new Date(doseDay + 8 * 3600e3).toISOString() };
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const doseAt = doseDay + 9 * 3600e3;
  const hours = (now - doseAt) / 3600e3;
  const exact = 1000 * H.amountFraction(entry, hours);
  // The model's 7-day median rise (Bateman, same area) multiplies the plain decay by kr/(kr − kd) ≈ 1.012
  // this long after the dose; the decay itself is 2^(−t/90 d).
  const plain = 1000 * Math.pow(2, -hours / 24 / 90);
  assert.ok(Math.abs(exact / plain - 1) < 0.015, `${exact} vs ${plain}`);
  // AD-96 B: one Taken row at the dose instant (no other row).
  const data = { logs: [{ protocol_id: 'tu', outcome: 'Taken', logged_at: new Date(doseAt).toISOString(), sync_status: 'synced' }], siblings: [p] };
  const tile = tileOf(p, now, data).value;
  assert.equal(tile, exact, 'Journey tile');
  for (const w of [3, 90, 365]) assert.equal(screen(p, w, 7, data).nowLevel, exact, `screen, ${w}-day window`);
  // the date estimate on a date 200 days back (a sample of the 365-day line)
  const T = M.readoutMoment(iso(now - 200 * DAY), iso(now), now);
  const s = screen(p, 365, 7, data);
  assert.equal(M.levelAt(s.doses, 1000, entry, T), 1000 * H.amountFraction(entry, (T - doseAt) / 3600e3));
});

// PK-15, the Dose log read (AD-96 B): the curve and the tile read 967 days of rows (the longest window
// + the 600-day cap), so a logged dose is read wherever the look-back reaches.
test('PK-15: the Dose log read reaches ≥ 540 days (967: the longest window + the 600-day cap), screen and tile', () => {
  assert.equal(M.CURVE_LOG_LOOKBACK_DAYS, M.CURVE_MAX_PAST_DAYS + 2 + M.LOOKBACK_CAP_DAYS);
  assert.ok(M.CURVE_LOG_LOOKBACK_DAYS >= 540 + M.CURVE_MAX_PAST_DAYS + 2);
  const tu = H.getHalfLifeEntry('Testosterone Undecanoate');
  assert.ok(M.CURVE_LOG_LOOKBACK_DAYS >= M.curveLookbackDays(tu), 'every logged row the look-back can use is read');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'screens', f), 'utf8');
  for (const f of ['SerumCurveScreen.js', 'JourneyScreen.js']) {
    assert.match(read(f), /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/, f);
  }
  // A dose logged 900 days ago is still in the Undecanoate level (367 + 540 = 907 days of look-back).
  const doseAt = new Date(now - 900 * DAY).setHours(9, 0, 0, 0);
  const p = { id: 'tu9', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 70, doses_per_day: 1, reminder_time: '09:00', start_date: iso(doseAt), created_at: new Date(doseAt - 3600e3).toISOString() };
  const logs = [{ protocol_id: 'tu9', outcome: 'Taken', logged_at: new Date(doseAt).toISOString(), sync_status: 'synced' }];
  const lv = M.estimatedLevelNow(p, now, { logs }).value;
  assert.equal(lv, 1000 * H.amountFraction(tu, (now - doseAt) / 3600e3));
  assert.ok(lv > 0);
});

test('PK-15: the dose look-back reaches ≥ 540 days for Undecanoate (540 before the longest window)', () => {
  const tu = H.getHalfLifeEntry('Testosterone Undecanoate');
  assert.equal(M.LOOKBACK_CAP_DAYS, 600);
  assert.equal(M.curveHistoryDays(tu), 540);
  assert.equal(M.curveLookbackDays(tu), M.CURVE_MAX_PAST_DAYS + 2 + 540);
  // a weekly Undecanoate protocol started 2 years ago: every dose of the last 540+ days is scanned
  const p = { id: 'tu2', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 70, doses_per_day: 1, reminder_time: '09:00', start_date: iso(now - 730 * DAY), created_at: new Date(now - 730 * DAY).toISOString() };
  const doses = M.scheduledDoses(p, tu, M.curveGridStart(now, 3), now, now);
  assert.ok(now - doses[0] >= 540 * DAY, `${(now - doses[0]) / DAY} days`);
});

test('R15: every charted compound — history before the earliest instant = max(16 d, 6 × t½), capped at 600 d from it', () => {
  for (const name of Object.keys(H.HALF_LIVES)) {
    const e = H.getHalfLifeEntry(name);
    if (!e) continue;
    const hist = M.curveHistoryDays(e);
    assert.equal(hist, Math.min(600, Math.max(16, Math.ceil(6 * e.hours / 24))), name);
    // the scan from Now covers the longest window plus that history, for every window
    assert.equal(M.curveLookbackDays(e), M.CURVE_MAX_PAST_DAYS + 2 + hist, name);
    const p = { id: name, type: 'recon', name, dose: '1', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: iso(now - 3000 * DAY), created_at: new Date(now - 3000 * DAY).toISOString() };
    for (const w of [3, 365]) {
      const start = M.curveGridStart(now, w);
      const doses = M.scheduledDoses(p, e, start, now, now);
      assert.ok(start - doses[0] >= hist * DAY - DAY, `${name}, ${w}-day window: ${(start - doses[0]) / DAY} days before its start`);
    }
  }
});

// A 7-day half-life (CJC-1295 with DAC, first-order decay), weekly 2 mg, started 400 days ago.
const cjc = { id: 'cjc', type: 'recon', name: 'CJC-1295 with DAC', dose: '2', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: iso(now - 400 * DAY), created_at: new Date(now - 400 * DAY).toISOString() };
const CJC_BOUND = Math.pow(2, -(42 - 7) / 7); // PK-2: 2^(−(H − τ)/t½) with H = 42 d, τ = 7 d
// The full history: every weekly dose since the start date (calendar days, local 08:00).
function fullLevel(T) {
  const e = H.getHalfLifeEntry('CJC-1295 with DAC');
  const sd = new Date(cjc.start_date + 'T00:00:00');
  let lv = 0;
  for (let k = 0; ; k += 7) {
    const d = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + k, 8, 0).getTime();
    if (d > T) break;
    lv += 2 * H.amountFraction(e, (T - d) / 3600e3);
  }
  return lv;
}

test('a 90-day window of a 7-day half-life: Journey tile == screen, exactly', () => {
  assert.equal(H.getHalfLifeEntry('CJC-1295 with DAC').hours, 168);
  const tile = tileOf(cjc, now, allTaken(cjc, now)).value;
  for (const w of [3, 30, 90, 365]) assert.equal(screen(cjc, w).nowLevel, tile, `${w}-day window`);
  // weekly doses, H = 42 d: what the rule leaves out is below 2^(−(H − τ)/t½) = 2^−5 of the level (PK-2)
  assert.ok(Math.abs(tile / fullLevel(now) - 1) < CJC_BOUND, `${tile} vs ${fullLevel(now)}`);
});

test('a 90-day window of a 7-day half-life: the window start and a date estimate 89 days back have their earlier doses', () => {
  const s = screen(cjc, 90);
  const edge = s.line.points[0];
  assert.equal(s.line.times[0], s.start);
  const full = fullLevel(s.start);
  assert.ok(Math.abs(edge / full - 1) < CJC_BOUND, `left edge ${edge} vs full history ${full}`);
  const T = M.readoutMoment(iso(now - 89 * DAY), iso(now), now);
  const est = M.levelAt(s.doses, 2, s.entry, T);
  assert.ok(Math.abs(est / fullLevel(T) - 1) < CJC_BOUND, `date estimate ${est} vs ${fullLevel(T)}`);
});

test('every charted compound, a daily protocol started 2 years ago: tile == screen at 3, 30, 90 and 365 days', () => {
  for (const name of Object.keys(H.HALF_LIVES)) {
    const e = H.getHalfLifeEntry(name);
    if (!e) continue;
    const p = { id: name, type: 'recon', name, dose: '1', dose_unit: e.unit === 'IU' ? 'IU' : 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: iso(now - 730 * DAY), created_at: new Date(now - 730 * DAY).toISOString() };
    const tile = tileOf(p, now, allTaken(p, now));
    assert.ok(tile, name);
    for (const w of [3, 30, 90, 365]) assert.equal(screen(p, w).nowLevel, tile.value, `${name}, ${w}-day window`);
  }
});

// A long-term Undecanoate user: 1000 mg every τ days for 4 years (the full history, hand-built).
// What the rule leaves out (pharmacometrics review 2026-10-20, PK-2): with H = 6 × t½ of history
// before the earliest instant and a dose every τ, the first left-out dose is between H and H + τ
// before it, so the share left out is between 2^(−(H+τ)/t½) and 2^(−(H−τ)/t½) of the level there,
// depending on where that instant falls in the dosing interval — NOT a flat 2^−6. Undecanoate
// (t½ 90 d, H 540 d): every 70 days ≤ 2^(−470/90) ≈ 2.7 %, every 84 days ≤ 2^(−456/90) ≈ 3.0 %. The
// signed R15 rule (6 × t½, cap 600 d) stays; the test sweeps Now across one full dosing interval.
const TU = H.getHalfLifeEntry('Testosterone Undecanoate');
// AD-96 B: added to the app the day before its first dose (a first dose logged before the protocol
// existed would be a declared row, which adds nothing — R2).
const tuPlan = (tau, base) => ({ id: 'tu' + tau, type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: tau, doses_per_day: 1, reminder_time: '09:00', start_date: iso(base - 1460 * DAY), created_at: new Date(base - 1461 * DAY).toISOString() });
function tuFull(p, T) {
  const sd = new Date(p.start_date + 'T00:00:00');
  let lv = 0;
  for (let k = 0; ; k += p.interval_days) {
    const d = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + k, 9, 0).getTime();
    if (d > T) break;
    lv += 1000 * H.amountFraction(TU, (T - d) / 3600e3);
  }
  return lv;
}
const upperBound = (tau) => Math.pow(2, -(M.curveHistoryDays(TU) - tau) / 90) * 1.05; // 5 %: the modeled rise
function sweep(tau, check) {
  for (let k = 0; k <= tau; k += 3) {
    const nowK = now + k * DAY + (k % 7) * 3600e3;
    check(nowK, tuPlan(tau, now));
  }
}

for (const tau of [70, 84]) {
  test(`Undecanoate every ${tau} days, Now swept over one dosing interval: the 365-day left edge and a date a year back are low by less than 2^(−(H − τ)/t½)`, () => {
    let worst = 0;
    sweep(tau, (nowK, p) => {
      const start = M.curveGridStart(nowK, 365);
      const end = nowK + 7 * DAY;
      const data = allTaken(p, nowK, nowK - 4 * 365 * DAY);
      const doses = M.curvePlan(p, TU, start, end, nowK, data).doses;
      const ctx = { start, stepMs: STEP, nSteps: Math.round((end - start) / STEP), now: nowK, plotPx: 330, extraTimes: [] };
      const line = M.lineSamples(doses, 1000, TU, ctx, H.amountFraction);
      assert.equal(line.times[0], start);
      const low = 1 - line.points[0] / tuFull(p, start);
      assert.ok(low >= 0 && low < upperBound(tau), `left edge ${(100 * low).toFixed(2)} % low, Now ${new Date(nowK).toISOString()}`);
      worst = Math.max(worst, low);
      const T = M.readoutMoment(iso(nowK - 365 * DAY), iso(nowK), nowK);
      const est = M.levelOnDate(p, TU, 1000, doses, T, nowK, end, data);
      const lowT = 1 - est / tuFull(p, T);
      assert.ok(lowT >= 0 && lowT < upperBound(tau), `a year back ${(100 * lowT).toFixed(2)} % low`);
      // a date before the longest window has its own history before it (the same bound)
      const T3 = M.readoutMoment(iso(nowK - 3 * 365 * DAY), iso(nowK), nowK);
      const low3 = 1 - M.levelOnDate(p, TU, 1000, doses, T3, nowK, end, data) / tuFull(p, T3);
      assert.ok(low3 >= 0 && low3 < upperBound(tau), `3 years back ${(100 * low3).toFixed(2)} % low`);
      // Now has 367 + 540 days behind it, and a date past the projection its own doses
      assert.ok(Math.abs(M.levelAt(doses, 1000, TU, nowK) / tuFull(p, nowK) - 1) < 0.01, 'Now');
      const Tf = nowK + 60 * DAY;
      assert.ok(Math.abs(M.levelOnDate(p, TU, 1000, doses, Tf, nowK, end, data) / tuFull(p, Tf) - 1) < 0.01, 'after the projection');
    });
    assert.ok(worst > 0.005, `the sweep reaches the real residual (${(100 * worst).toFixed(2)} %)`);
  });
}

test('R15 invariant: every half-life in the table has 6 × t½ within the 600-day cap (the rule is never cut short)', () => {
  for (const [name, e] of Object.entries(H.HALF_LIVES)) {
    assert.ok(6 * e.hours / 24 <= M.LOOKBACK_CAP_DAYS, `${name}: 6 × t½ = ${6 * e.hours / 24} d`);
    assert.equal(M.curveHistoryDays(e), Math.max(16, Math.ceil(6 * e.hours / 24)), name);
  }
});

test('Undecanoate, long-term user: Journey tile == screen at 3, 90 and 365 days, exactly', () => {
  const p = tuPlan(70, now);
  const tile = tileOf(p, now, allTaken(p, now)).value;
  for (const w of [3, 90, 365]) assert.equal(screen(p, w).nowLevel, tile, `${w}-day window`);
});

test('the screen reads every date estimate through levelOnDate', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const readoutLevel = \(ser, T\) => \(model \? levelOnDate\(ser\.p, ser\.entry, ser\.doseMg, ser\.doses, T, model\.now, winEnd, ser\.curveData\) : 0\);/);
});
