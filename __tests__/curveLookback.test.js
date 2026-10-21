'use strict';
// Curve fix 2 (1.3.1, founder-approved 2026-10-20; spec docs/specs/curve-logged-doses.md R15 + PK-15):
// the look-back grows with the window shown. Before, the doses were scanned from Now back
// max(16 d, window shown, 6 × t½): the window's own start had almost no earlier doses (a 90-day
// window of a 7-day t½ compound started from ~2 days of history), and the Journey tile (14-day
// model) and the screen (90-day window) counted different doses, ~1.6 % apart. Now one look-back
// per compound — the longest window the screen can show plus 6 half-lives, capped at 600 days —
// is used by the screen at every window, the tile and the date estimate. Pure math, never advice.
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

test('PK-15: the look-back reaches ≥ 540 days for Undecanoate (600, the cap) and the Dose log read reaches ≥ 540 days', () => {
  const tu = H.getHalfLifeEntry('Testosterone Undecanoate');
  assert.equal(M.LOOKBACK_CAP_DAYS, 600);
  assert.equal(M.curveLookbackDays(tu), 600);
  assert.ok(M.CURVE_LOG_LOOKBACK_DAYS >= 540);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/);
  // a weekly Undecanoate protocol started 2 years ago: every dose of the last 540+ days is scanned
  const p = { id: 'tu2', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 70, doses_per_day: 1, reminder_time: '09:00', start_date: iso(now - 730 * DAY), created_at: new Date(now - 730 * DAY).toISOString() };
  const doses = M.scheduledDoses(p, tu, M.curveGridStart(now, 3), now, now);
  assert.ok(now - doses[0] >= 540 * DAY, `${(now - doses[0]) / DAY} days`);
});

test('R15: every charted compound — look-back ≥ max(16 d, the longest window, 6 × t½), never above 600 d', () => {
  for (const name of Object.keys(H.HALF_LIVES)) {
    const e = H.getHalfLifeEntry(name);
    if (!e) continue;
    const L = M.curveLookbackDays(e);
    assert.ok(L <= 600, name);
    assert.ok(L >= Math.min(600, Math.max(16, M.CURVE_MAX_PAST_DAYS + 2, Math.ceil(6 * e.hours / 24))), name);
    // and 6 half-lives before the left edge of the longest window, where the cap allows
    assert.ok(L >= Math.min(600, M.CURVE_MAX_PAST_DAYS + 2 + 6 * e.hours / 24), name);
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
