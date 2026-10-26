'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-13, R13): several protocols of one compound — each line
// uses only its own protocol_id rows; the combined total is the sum of the members (per substance).
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const e = H.getHalfLifeEntry('Testosterone Cypionate');
const mk = (id, time) => ({ id, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '50', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: time, start_date: '2026-10-15', created_at: iso(at(15, 6)) });
const row = (pid, ms) => ({ protocol_id: pid, outcome: 'Taken', logged_at: iso(ms), sync_status: 'synced' });
const A = mk(11, '08:00');
const B = mk(12, '20:00');
const NOW = at(20, 22);
const LOGS = [row(11, at(16, 8)), row(11, at(18, 8, 30)), row(12, at(16, 20)), row(12, at(17, 20)), row(12, at(19, 21))];
const sum = (times, T) => times.reduce((s, t) => s + 50 * H.amountFraction(e, (T - t) / HOUR), 0);

test('PK-13: each series uses only its own protocol_id rows', () => {
  const ctxStart = M.curveGridStart(NOW, 14);
  const pa = M.curvePlan(A, e, ctxStart, NOW, NOW, { logs: LOGS, siblings: [A, B] });
  const pb = M.curvePlan(B, e, ctxStart, NOW, NOW, { logs: LOGS, siblings: [A, B] });
  assert.deepEqual([...pa.taken], [at(16, 8), at(18, 8, 30)]);
  assert.deepEqual([...pb.taken], [at(16, 20), at(17, 20), at(19, 21)]);
  // No declared part (start = creation day), so the siblings change nothing.
  assert.deepEqual([...pa.doses.filter((d) => d <= NOW)], [...pa.taken]);
});

test('PK-13: the combined total is the sum of the members (combinedLine over the members\' own lines)', () => {
  const start = M.curveGridStart(NOW, 7);
  const stepMs = M.STEP_HOURS * HOUR;
  const nSteps = Math.round((NOW + 3 * 864e5 - start) / stepMs);
  const ctx = { start, stepMs, nSteps, now: NOW, plotPx: 300, extraTimes: [] };
  const members = [A, B].map((p) => {
    const doses = M.curvePlan(p, e, start, start + nSteps * stepMs, NOW, { logs: LOGS, siblings: [A, B] }).doses;
    return { doses, doseMg: 50, entry: e, ...M.lineSamples(doses, 50, e, ctx, H.amountFraction) };
  });
  const c = M.combinedLine(members, ctx, H.amountFraction);
  const k = c.times.indexOf(NOW);
  assert.ok(k >= 0);
  const truth = sum(LOGS.map((r) => Date.parse(r.logged_at)), NOW);
  assert.ok(Math.abs(c.points[k] - truth) <= 1e-9 * truth, `${c.points[k]} vs ${truth}`);
  const a = M.estimatedLevelNow(A, NOW, { logs: LOGS }).value;
  const b = M.estimatedLevelNow(B, NOW, { logs: LOGS }).value;
  assert.ok(Math.abs(a + b - truth) <= 1e-9 * truth);
});

test('PK-13: the screen builds every line with curvePlan and its own data (logs + the charted protocols)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /curvePlan\(p, entry, start, end, now, curveData\)/);
  assert.match(src, /const curveData = \{ logs: doseLogs, siblings: protocols \}/);
  assert.ok(!/scheduledDoses\(/.test(src), 'the screen no longer draws the past from the schedule (rebuild = replace)');
});
