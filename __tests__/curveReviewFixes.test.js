'use strict';
// Curve 1.3.1 — the two reviews of the curve fixes (2026-10-20: engineering = merge, pharmacometrics =
// GO WITH CONDITIONS). Each finding is a test here (PK-1 and PK-2 live in curveDrawTolerance and
// curveLookback). Pure math, never advice.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const { sampleLevelsAt } = require('../lib/curveSampling');

const DAY = 864e5;
const HOUR = 3600e3;
const STEP = M.STEP_HOURS * HOUR;
const now = new Date(2026, 9, 20, 13, 7).getTime();
const iso = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function brute(doses, mg, entry, times, af = H.amountFraction) {
  const ok = doses.filter(Number.isFinite);
  const points = [], pre = [];
  for (const ts of times) {
    let level = 0, before = 0;
    for (const d of ok) { if (d > ts) continue; const c = mg * af(entry, (ts - d) / HOUR); level += c; if (d < ts) before += c; }
    points.push(level); pre.push(before);
  }
  return { points, pre };
}
const close = (a, b, msg, tol = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])), `${msg} ${i}: ${v} vs ${b[i]}`));

// ── PK-3: a NaN (or any non-finite) dose is left out; it never stops the one pass or breaks the sort
test('PK-3: non-finite doses are left out — same numbers as the plain sum over the finite doses, both paths', () => {
  const doses = [];
  for (let t = 0; t < 40 * 24 * HOUR; t += 13 * HOUR) doses.push(t + 5 * HOUR);
  const dirty = [...doses.slice(0, 10), NaN, ...doses.slice(10, 30), undefined, Infinity, null, ...doses.slice(30)];
  const times = [];
  for (let t = 0; t < 45 * 24 * HOUR; t += 7 * HOUR) times.push(t);
  for (const entry of [{ hours: 4 }, { hours: 168, tmaxHours: 48 }]) {
    const fast = sampleLevelsAt(dirty, 2, entry, times, H.amountFraction);
    const ref = brute(doses, 2, entry, times);
    close(fast.points, ref.points, `fast t½ ${entry.hours} point`);
    close(fast.pre, ref.pre, `fast t½ ${entry.hours} pre`);
    const plainAf = (e, dt) => H.amountFraction(e, dt);
    const slow = sampleLevelsAt(dirty, 2, entry, times, plainAf);
    close(slow.points, ref.points, `slow t½ ${entry.hours} point`, 1e-8); // the moving window drops shares < 1e-9 per dose
    assert.ok(fast.points.every(Number.isFinite) && slow.pre.every(Number.isFinite));
  }
});

// ── PK-4: riseRate has no solution when Tmax ≥ 1/kd; the fast path is chosen by an explicit marker
test('PK-4: riseRate returns null when no first-order rise can peak at that Tmax (Tmax · kd ≥ 0.999), and the model then has no rise', () => {
  const kd = Math.LN2 / 10;
  assert.equal(H.riseRate(10, 20), null, 'Tmax 20 h beyond 1/kd = 14.4 h');
  assert.equal(H.riseRate(10, 0.9995 / kd), null);
  const kr = H.riseRate(10, 0.95 / kd);
  assert.ok(Number.isFinite(kr) && kr > kd);
  assert.ok(Math.abs(Math.log(kr / kd) / (kr - kd) - 0.95 / kd) < 1e-6, 'it peaks at the Tmax asked for');
  const e = { hours: 10, tmaxHours: 20 };
  for (const dt of [0, 1, 5, 40]) assert.equal(H.amountFraction(e, dt), Math.exp(-kd * dt), `no rise at ${dt} h`);
  const doses = [0, 6 * HOUR, 30 * HOUR], times = [0, HOUR, 7 * HOUR, 30 * HOUR, 60 * HOUR];
  const fast = sampleLevelsAt(doses, 1, e, times, H.amountFraction);
  close(fast.points, brute(doses, 1, e, times).points, 'no-rise fast path');
});

test('PK-4: every Tmax in the table has a rise (Tmax · kd < 0.999)', () => {
  for (const [name, e] of Object.entries(H.HALF_LIVES)) {
    if (!e.tmaxHours) continue;
    assert.ok(e.tmaxHours * Math.LN2 / e.hours < 0.999, name);
    assert.ok(H.riseRate(e.hours, e.tmaxHours) > Math.LN2 / e.hours, name);
  }
});

test('PK-4: the one-pass path is chosen by the marker amountFraction.exactCarry, not by identity', () => {
  assert.equal(H.amountFraction.exactCarry, true);
  assert.doesNotMatch(src('lib/curveSampling.js'), /=== halfLives\.amountFraction/);
  const doses = [0, 5 * HOUR, 9 * HOUR], times = [HOUR, 6 * HOUR, 12 * HOUR];
  let calls = 0;
  const marked = (e, dt) => { calls++; return H.amountFraction(e, dt); };
  marked.exactCarry = true;
  const a = sampleLevelsAt(doses, 1, { hours: 3 }, times, marked);
  assert.equal(calls, 0, 'a marked wrapper takes the one pass');
  close(a.points, brute(doses, 1, { hours: 3 }, times).points, 'marked');
  const unmarked = (e, dt) => { calls++; return H.amountFraction(e, dt); };
  sampleLevelsAt(doses, 1, { hours: 3 }, times, unmarked);
  assert.ok(calls > 0, 'an unmarked one is called (any model)');
});

// ── PK-5: "Doses counted" counts exactly the doses the Est. level at Now sums
test('PK-5: the dose count is the doses the Est. level at Now sums (Undecanoate on the 3-day window is not 0)', () => {
  const p = { id: 'tu', type: 'rtu', name: 'Testosterone Undecanoate', dose: '1000', dose_unit: 'mg', interval_days: 70, doses_per_day: 1, reminder_time: '09:00', start_date: iso(now - 1460 * DAY), created_at: new Date(now - 1460 * DAY).toISOString() };
  const e = H.getHalfLifeEntry(M.matchName(p));
  const start = M.curveGridStart(now, 3);
  const doses = M.scheduledDoses(p, e, start, now + 7 * DAY, now);
  const c = M.doseCounts(doses, start, now);
  const summed = doses.filter((d) => d <= now);
  assert.ok(c.counted > 0);
  assert.equal(c.counted, summed.length);
  assert.equal(M.levelAt(summed, 1000, e, now), M.levelAt(doses, 1000, e, now), 'levelAt at Now sums exactly those');
  assert.equal(c.before, doses.filter((d) => d < start).length, 'before the window (counted from the first frame)');
  const scr = src('screens/SerumCurveScreen.js');
  assert.match(scr, /const \{ before: dosesBefore, counted: dosesCounted \} = doseCounts\(doses, start, now\);/);
  assert.match(scr, /width=\{numW\(single\.dosesCounted\)\}/);
  assert.match(scr, /let c = singleDosesBefore;/);
  assert.doesNotMatch(scr, /dosesInWindow/);
});

// ── ENG-1: no regeneration on a rebuild (date chip, toggle, reload in the same day)
const bpc = { id: 'b', type: 'recon', name: 'BPC-157', dose: '250', dose_unit: 'mcg', interval_days: 1, doses_per_day: 4, reminder_time: '07:00,11:00,15:00,19:00', start_date: iso(now - 500 * DAY), created_at: new Date(now - 400 * DAY).toISOString() };
test('ENG-1: scheduledDoses returns the same frozen list for the same protocol and day, a new one when either changes', () => {
  const e = H.getHalfLifeEntry('BPC-157');
  const a = M.scheduledDoses(bpc, e, M.curveGridStart(now, 3), now + 7 * DAY, now);
  const b = M.scheduledDoses({ ...bpc }, e, M.curveGridStart(now + 2 * HOUR, 30), now + 2 * HOUR + 7 * DAY, now + 2 * HOUR);
  assert.equal(a, b, 'a rebuild later the same day, another window: the same list');
  assert.ok(Object.isFrozen(a));
  const c = M.scheduledDoses({ ...bpc, reminder_time: '07:00,11:00,15:00,19:30' }, e, M.curveGridStart(now, 3), now + 7 * DAY, now);
  assert.notEqual(c, a, 'an edited protocol');
  const d = M.scheduledDoses(bpc, e, M.curveGridStart(now + DAY, 3), now + 8 * DAY, now + DAY);
  assert.notEqual(d, a, 'the next day');
  assert.notEqual(M.scheduledDoses(bpc, e, M.curveGridStart(now, 3), now + 30 * DAY, now), a, 'a longer projection');
});

test('ENG-1: a rebuild re-samples from the carried sums — the work does not grow with the look-back', () => {
  const e = H.getHalfLifeEntry('Testosterone Cypionate');
  const cyp = { ...bpc, id: 'c', name: 'Testosterone Cypionate', dose: '100', dose_unit: 'mg' };
  const doses = M.scheduledDoses(cyp, e, M.curveGridStart(now, 3), now + 7 * DAY, now);
  assert.ok(doses.length > 1500);
  const times = [now - 2 * DAY, now - DAY, now, now + DAY];
  sampleLevelsAt(doses, 1, e, times, H.amountFraction); // the first build carries the sums once
  const exp = Math.exp;
  let n = 0;
  Math.exp = (x) => { n++; return exp(x); };
  let again;
  try { again = sampleLevelsAt(doses, 1, e, [...times, now + 2 * HOUR].sort((x, y) => x - y), H.amountFraction); } finally { Math.exp = exp; }
  assert.ok(n <= 8 * 5, `${n} exponentials for 5 samples`);
  close(again.points, brute(doses, 1, e, [...times, now + 2 * HOUR].sort((x, y) => x - y)).points, 'carried');
});

// ── ENG-2: the Dose log read is the longest window again (367 days) until AD-96 B reads older rows
test('ENG-2: the Dose log read reaches the longest window (367 days); 967 days ships with AD-96 B in 1.3.2', () => {
  assert.equal(M.CURVE_LOG_LOOKBACK_DAYS, M.CURVE_MAX_PAST_DAYS + 2);
  assert.match(src('screens/SerumCurveScreen.js'), /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/);
  const row = src('docs/specs/curve-logged-doses.md').split('\n').find((l) => l.startsWith('| PK-15 |'));
  assert.match(row, /\| partial \|/);
  assert.match(row, /log read 967 d ships with AD-96 B, 1\.3\.2/);
});
