'use strict';
// DV-068 (spec R4: "drawing samples the exact instants"). Without the 6 h snap a dose at 10:30 falls
// between the 6 h samples; a fast compound (BPC-157, t½ 0.5 h) would draw as a flat line near zero. The
// curve therefore samples the 6 h grid PLUS every dose instant PLUS Now: each dose draws as a vertical
// jump at its own time, and the solid line ends exactly at the Now dot with the number it shows.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const { sampleLevels, sampleLevelsAt } = require('../lib/curveSampling');

const STEP = M.STEP_HOURS * 3600000;

test('the sample times are the 6 h grid, every dose instant inside the window and Now — sorted, no duplicates', () => {
  const start = new Date(2026, 9, 17, 12).getTime();
  const nSteps = 4 * 5;
  const now = new Date(2026, 9, 20, 13, 7).getTime();
  const doses = [new Date(2026, 9, 16, 10, 30).getTime(), new Date(2026, 9, 18, 10, 30).getTime(), new Date(2026, 9, 18, 18).getTime(), new Date(2026, 9, 30).getTime()];
  const times = M.curveSampleTimes(start, STEP, nSteps, [doses, [new Date(2026, 9, 18, 10, 30).getTime()]], now);
  for (let i = 0; i <= nSteps; i++) assert.ok(times.includes(start + i * STEP), `grid ${i}`);
  assert.ok(times.includes(doses[1]) && times.includes(now));
  assert.ok(!times.includes(doses[0]), 'before the window: not a sample');
  assert.ok(!times.includes(doses[3]), 'after the window: not a sample');
  assert.deepEqual(times, [...new Set(times)].sort((a, b) => a - b));
  assert.equal(times[0], start);
  assert.equal(times[times.length - 1], start + nSteps * STEP);
});

test('sampleLevelsAt on the plain grid gives exactly the old sampleLevels numbers', () => {
  const entry = { hours: 24 };
  const doses = [3 * 3600000, 30 * 3600000, 55 * 3600000];
  const af = (e, dt) => (dt >= 0 ? Math.exp(-Math.LN2 / e.hours * dt) : 0);
  const a = sampleLevels(doses, 2, entry, 0, STEP, 20, af);
  const times = Array.from({ length: 21 }, (_, i) => i * STEP);
  const b = sampleLevelsAt(doses, 2, entry, times, af);
  assert.deepEqual(b, a);
});

test('a BPC-157 dose at 10:30 draws its full spike at 10:30 (level includes it, "before" excludes it)', () => {
  const p = { id: 1, type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg', interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', created_at: '2026-10-01T00:00:00', reminder_time: '10:30' };
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const start = M.curveGridStart(now, 3);
  const nSteps = Math.round((now + 7 * 864e5 - start) / STEP);
  const doses = M.scheduledDoses(p, e, start, now + 7 * 864e5, now);
  const times = M.curveSampleTimes(start, STEP, nSteps, [doses], now);
  const { points, pre } = sampleLevelsAt(doses, 0.25, e, times, H.amountFraction);
  const i = times.indexOf(new Date(2026, 9, 19, 10, 30).getTime());
  assert.ok(i > 0);
  assert.ok(Math.abs(points[i] - 0.25) < 1e-9, `spike ${points[i]}`);
  assert.ok(pre[i] < 1e-9, 'the line jumps at the dose, it does not ramp in');
  // The Now sample carries the same number as the Est. level.
  const k = times.indexOf(now);
  // AD-96 B: with every planned dose logged as Taken at its slot the Est. level is the planned one.
  const { takenAtEverySlot } = require('./helpers/curveLogs');
  assert.ok(Math.abs(points[k] - M.estimatedLevelNow(p, now, { logs: takenAtEverySlot([p], now) }).value) < 1e-9);
  // The peak of the drawn curve is a full dose (the scale is set by the real spike).
  assert.ok(Math.abs(Math.max(...points) - 0.25) < 1e-9);
});

test('the curve screen draws on these samples: x = the exact time, Now = its exact sample, ticks hollow per log', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  // since the review: the per-line samples come from lib/serumModel lineSamples / combinedLine
  // (curveSampleTimes + sampleLevelsAt inside)
  assert.match(src, /lineSamples\(/);
  assert.match(src, /combinedLine\(/);
  assert.match(src, /doseTicks\(/);
  assert.match(src, /readoutMoment\(/);
  assert.doesNotMatch(src, /Math\.round\(\(readoutRaw - model\.start\) \/ stepMs\) \* stepMs/, 'no readout snap');
  const lib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'serumModel.js'), 'utf8');
  assert.doesNotMatch(lib, /const snap = /, 'no grid snap in the model');
  assert.doesNotMatch(lib, /DOSE_SLOTS\[cnt\]/, 'no fixed grid hours for doses');
});
