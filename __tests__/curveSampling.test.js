'use strict';
// A-93 (senior review 2026-10-04): the curve sampled every dose at every 6-hour step on the JS thread
// (a 365-day window with several doses a day ≈ millions of calls per protocol). lib/curveSampling
// walks sorted doses with a moving window: a dose is skipped only once it is 30 half-lives old
// (its share < 1e-9), so the curve's numbers do not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sampleLevels } = require('../lib/curveSampling');

function amountFraction(entry, dtHours) { // same model as lib/halfLives (ESM there)
  if (!(dtHours >= 0)) return 0;
  const kd = Math.LN2 / entry.hours;
  if (!entry.tmaxHours) return Math.exp(-kd * dtHours);
  const kr = Math.LN2 / (entry.tmaxHours / 3); // any kr > kd is enough for the comparison
  return (kr / (kr - kd)) * (Math.exp(-kd * dtHours) - Math.exp(-kr * dtHours));
}
function naive(doses, doseMg, entry, start, stepMs, nSteps) {
  const points = [], pre = [];
  for (let i = 0; i <= nSteps; i++) {
    const ts = start + i * stepMs; let level = 0, before = 0;
    for (const d of doses) { if (d > ts) continue; const c = doseMg * amountFraction(entry, (ts - d) / 3600000); level += c; if (d < ts) before += c; }
    points.push(level); pre.push(before);
  }
  return { points, pre };
}
const H = 3600000;

for (const entry of [{ hours: 4 }, { hours: 24 }, { hours: 168, tmaxHours: 48 }]) {
  test(`same numbers as before (t½ ${entry.hours} h)`, () => {
    const start = 0, stepMs = 6 * H, nSteps = 4 * 400;
    const doses = []; for (let t = 0; t < 380 * 24 * H; t += 8 * H) doses.push(t + 12 * H);
    const a = naive(doses, 2.5, entry, start, stepMs, nSteps);
    const b = sampleLevels(doses, 2.5, entry, start, stepMs, nSteps, amountFraction);
    for (let i = 0; i <= nSteps; i++) {
      assert.ok(Math.abs(a.points[i] - b.points[i]) <= 1e-6 * Math.max(1, a.points[i]), `point ${i}`);
      assert.ok(Math.abs(a.pre[i] - b.pre[i]) <= 1e-6 * Math.max(1, a.pre[i]), `pre ${i}`);
    }
  });
}

test('a 365-day window with 3 doses a day stays fast', () => {
  const doses = []; for (let t = 0; t < 400 * 24 * H; t += 8 * H) doses.push(t);
  const t0 = Date.now();
  let calls = 0;
  sampleLevels(doses, 1, { hours: 6 }, 0, 6 * H, 4 * 400, (e, dt) => { calls++; return amountFraction(e, dt); });
  assert.ok(calls < 200000, `calls ${calls}`);
  assert.ok(Date.now() - t0 < 500);
});

// Curve fixes 2 + 3 (1.3.1): with the model's own amountFraction the levels are carried in one pass
// (a sum of exponentials). Same numbers as the plain sum over every dose, for every table entry
// (first-order falls and the four modeled rises), at unsorted-input doses, duplicate dose instants and
// samples that sit exactly on doses.
test('one pass with the model amountFraction = the plain sum over every dose (every half-life in the table)', () => {
  const HL = require('../lib/halfLives');
  const { sampleLevelsAt } = require('../lib/curveSampling');
  const seen = new Set();
  for (const name of Object.keys(HL.HALF_LIVES)) {
    const e = HL.HALF_LIVES[name];
    const key = e.hours + ':' + (e.tmaxHours || 0);
    if (seen.has(key)) continue;
    seen.add(key);
    const doses = [];
    for (let t = 0; t < 120 * 24 * H; t += 11 * H) doses.push(t + 7 * H);
    doses.push(doses[5]); // two doses at one instant
    doses.reverse();
    const times = [];
    for (let t = 0; t < 130 * 24 * H; t += 5 * H) times.push(t);
    times.push(doses[3], doses[3] + 1);
    times.sort((a, b) => a - b);
    const b = sampleLevelsAt(doses, 2.5, e, times, HL.amountFraction);
    times.forEach((ts, i) => {
      let level = 0, before = 0;
      for (const d of doses) { if (d > ts) continue; const c = 2.5 * HL.amountFraction(e, (ts - d) / H); level += c; if (d < ts) before += c; }
      assert.ok(Math.abs(b.points[i] - level) <= 1e-9 * Math.max(1, level), `${name} point ${i}: ${b.points[i]} vs ${level}`);
      assert.ok(Math.abs(b.pre[i] - before) <= 1e-9 * Math.max(1, before), `${name} pre ${i}`);
    });
  }
});
