'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-11, R11): no logs → the level is 0 (plus any declared
// part), the plan is drawn, never padded from the plan. (The "No doses logged yet" line waits for its
// picture — reported, not built here.)
process.env.TZ = 'Europe/Berlin';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();

test('PK-11: no logs, created today → level 0, the plan drawn ahead', () => {
  const p = { id: 1, type: 'recon', name: 'Semaglutide', compound_id: null, dose: '0.25', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '19:00', start_date: '2026-10-26', created_at: iso(at(26, 10)) };
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = at(26, 10, 5);
  assert.equal(M.estimatedLevelNow(p, now, { logs: [] }).value, 0);
  assert.equal(M.estimatedLevelNow(p, now).value, 0, 'no data at all reads as no logs');
  assert.equal(M.defaultCurveLevel([p], now, undefined, null, { logs: [], history: [p] }).value, 0, 'the Journey tile too');
  const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 30 * 864e5, now, { logs: [] });
  assert.deepEqual(plan.doses.filter((d) => d <= now), []);
  // Today's 19:00 and the next weeks are planned (dashed after Now).
  assert.deepEqual(plan.doses.slice(0, 2), [at(26, 19), new Date(2026, 10, 2, 19).getTime()]);
  assert.ok(M.levelAt(plan.doses, 0.25, e, at(27, 19)) > 0, 'the projection rises after the first planned dose');
});

test('R11: an older protocol with no logs reads 0 — never padded from the plan', () => {
  const p = { id: 2, type: 'recon', name: 'BPC-157', compound_id: 'lyo_bpc_157', dose: 250, dose_unit: 'mcg', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-01', created_at: iso(at(1, 7)) };
  const now = at(26, 9);
  assert.equal(M.estimatedLevelNow(p, now, { logs: [] }).value, 0);
});

test('R11: no logs but a declared part (start before it was added) → only the declared part', () => {
  const p = { id: 3, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '100', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-09-01', created_at: iso(at(20, 12)) };
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = at(26, 9);
  const C = at(20, 11);
  const declared = M.scheduledDoses(p, e, M.curveGridStart(now), now, now).filter((d) => d < C);
  assert.ok(declared.length >= 6);
  const lv = M.estimatedLevelNow(p, now, { logs: [] }).value;
  assert.ok(Math.abs(lv - M.levelAt(declared, 100, e, now)) < 1e-9);
});
