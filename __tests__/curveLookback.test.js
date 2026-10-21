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

// The screen's numbers for a window of `pastDays` (SerumCurveScreen model: curveGridStart(now,
// pastDays) → scheduledDoses → levelAt / lineSamples).
function screen(p, pastDays, futureDays = 7) {
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const start = M.curveGridStart(now, pastDays);
  const end = now + futureDays * DAY;
  const nSteps = Math.round((end - start) / STEP);
  const doses = M.scheduledDoses(p, entry, start, end, now);
  const doseMg = H.doseInCurveUnit(Number(p.dose), p.dose_unit, entry);
  const ctx = { start, stepMs: STEP, nSteps, now, plotPx: 330, extraTimes: [] };
  return { entry, start, doses, doseMg, nowLevel: M.levelAt(doses, doseMg, entry, now), line: M.lineSamples(doses, doseMg, entry, ctx, H.amountFraction) };
}

test('PK-15: Testosterone Undecanoate 1000 mg dosed 300 days ago contributes 1000 × 2^(−300/90) mg — tile, screen and date estimate', () => {
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
  const tile = M.defaultCurveLevel([p], now).value;
  assert.equal(tile, exact, 'Journey tile');
  for (const w of [3, 90, 365]) assert.equal(screen(p, w).nowLevel, exact, `screen, ${w}-day window`);
  // the date estimate on a date 200 days back (a sample of the 365-day line)
  const T = M.readoutMoment(iso(now - 200 * DAY), iso(now), now);
  const s = screen(p, 365);
  assert.equal(M.levelAt(s.doses, 1000, entry, T), 1000 * H.amountFraction(entry, (T - doseAt) / 3600e3));
});

test('PK-15: the look-back reaches ≥ 540 days for Undecanoate (540 before the longest window) and the Dose log read reaches ≥ 540 days', () => {
  const tu = H.getHalfLifeEntry('Testosterone Undecanoate');
  assert.equal(M.LOOKBACK_CAP_DAYS, 600);
  assert.equal(M.curveHistoryDays(tu), 540);
  assert.equal(M.curveLookbackDays(tu), M.CURVE_MAX_PAST_DAYS + 2 + 540);
  assert.equal(M.CURVE_LOG_LOOKBACK_DAYS, M.CURVE_MAX_PAST_DAYS + 2 + 600, 'the longest look-back of any compound');
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/);
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
  const tile = M.defaultCurveLevel([cjc], now).value;
  for (const w of [3, 30, 90, 365]) assert.equal(screen(cjc, w).nowLevel, tile, `${w}-day window`);
  // within the 6-half-life residual of the full history (2^−6 of the steady level)
  assert.ok(Math.abs(tile / fullLevel(now) - 1) < 1 / 64, `${tile} vs ${fullLevel(now)}`);
});

test('a 90-day window of a 7-day half-life: the window start and a date estimate 89 days back have their earlier doses', () => {
  const s = screen(cjc, 90);
  const edge = s.line.points[0];
  assert.equal(s.line.times[0], s.start);
  const full = fullLevel(s.start);
  assert.ok(Math.abs(edge / full - 1) < 1 / 64, `left edge ${edge} vs full history ${full}`);
  const T = M.readoutMoment(iso(now - 89 * DAY), iso(now), now);
  const est = M.levelAt(s.doses, 2, s.entry, T);
  assert.ok(Math.abs(est / fullLevel(T) - 1) < 1 / 64, `date estimate ${est} vs ${fullLevel(T)}`);
});

test('every charted compound, a daily protocol started 2 years ago: tile == screen at 3, 30, 90 and 365 days', () => {
  for (const name of Object.keys(H.HALF_LIVES)) {
    const e = H.getHalfLifeEntry(name);
    if (!e) continue;
    const p = { id: name, type: 'recon', name, dose: '1', dose_unit: e.unit === 'IU' ? 'IU' : 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: iso(now - 730 * DAY), created_at: new Date(now - 730 * DAY).toISOString() };
    const tile = M.defaultCurveLevel([p], now);
    assert.ok(tile, name);
    for (const w of [3, 30, 90, 365]) assert.equal(screen(p, w).nowLevel, tile.value, `${name}, ${w}-day window`);
  }
});

// A long-term Undecanoate user: 1000 mg every 70 days for 4 years (the full history, hand-built).
const tuLong = { id: 'tuL', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 70, doses_per_day: 1, reminder_time: '09:00', start_date: iso(now - 1460 * DAY), created_at: new Date(now - 1460 * DAY).toISOString() };
// The spec rule keeps 6 half-lives before the earliest instant: what it leaves out is at most 2^−6
// (1.56 %) of the level there (a steady 70-day Undecanoate user: 1.3 % at the left edge of a 365-day
// window; was 19.8 % low with the cap counted from Now). Now has 367 + 540 days: well inside 1 %.
const RESIDUAL = 1 / 64;
function tuFull(T) {
  const e = H.getHalfLifeEntry('Testosterone Undecanoate');
  const sd = new Date(tuLong.start_date + 'T00:00:00');
  let lv = 0;
  for (let k = 0; ; k += 70) {
    const d = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + k, 9, 0).getTime();
    if (d > T) break;
    lv += 1000 * H.amountFraction(e, (T - d) / 3600e3);
  }
  return lv;
}

test('Undecanoate, long-term user, 365-day window: the left edge reads within the 6-half-life residual (≤ 1.56 %) of the full history (the cap counts from that edge)', () => {
  const s = screen(tuLong, 365);
  assert.equal(s.line.times[0], s.start);
  const full = tuFull(s.start);
  assert.ok(Math.abs(s.line.points[0] / full - 1) < RESIDUAL, `left edge ${s.line.points[0]} vs full history ${full}`);
  assert.ok(Math.abs(s.nowLevel / tuFull(now) - 1) < 0.01, 'and Now');
});

test('Undecanoate, long-term user: a date estimate 365 days back, and one 3 years back, within the 6-half-life residual of the full history', () => {
  const s = screen(tuLong, M.curveWindowDays(iso(now - 365 * DAY), iso(now)));
  const winEnd = now + 7 * DAY;
  const T = M.readoutMoment(iso(now - 365 * DAY), iso(now), now);
  assert.ok(T >= s.start, 'inside the 365-day window');
  const est = M.levelOnDate(tuLong, s.entry, 1000, s.doses, T, now, winEnd);
  assert.equal(est, M.levelAt(s.doses, 1000, s.entry, T), 'inside the window: the drawn doses');
  assert.ok(Math.abs(est / tuFull(T) - 1) < RESIDUAL, `${est} vs ${tuFull(T)}`);
  // before the longest window (the picker allows 10 years back): its own history before that date
  const T3 = M.readoutMoment(iso(now - 3 * 365 * DAY), iso(now), now);
  const est3 = M.levelOnDate(tuLong, s.entry, 1000, s.doses, T3, now, winEnd);
  assert.ok(Math.abs(est3 / tuFull(T3) - 1) < RESIDUAL, `3 years back: ${est3} vs ${tuFull(T3)}`);
  // after the projection: unchanged rule (its own scheduled doses up to that date)
  const Tf = now + 60 * DAY;
  assert.ok(Math.abs(M.levelOnDate(tuLong, s.entry, 1000, s.doses, Tf, now, winEnd) / tuFull(Tf) - 1) < 0.01);
});

test('Undecanoate, long-term user: Journey tile == screen at 3, 90 and 365 days, exactly', () => {
  const tile = M.defaultCurveLevel([tuLong], now).value;
  for (const w of [3, 90, 365]) assert.equal(screen(tuLong, w).nowLevel, tile, `${w}-day window`);
});

test('the screen reads every date estimate through levelOnDate', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const readoutLevel = \(ser, T\) => \(model \? levelOnDate\(ser\.p, ser\.entry, ser\.doseMg, ser\.doses, T, model\.now, winEnd\) : 0\);/);
});
