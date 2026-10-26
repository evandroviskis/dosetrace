'use strict';
// AD-96 B (1.3.2, docs/specs/curve-logged-doses.md PK-1, R1, R3, R4): the Dose accumulation curve's PAST
// comes from the doses the person logged as Taken, at their exact logged_at; Skipped, Missed and
// deleted rows add nothing; the future stays the plan. A-160 "Doses in level" then counts those doses.
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600000;
const daily = (over = {}) => ({
  id: 5, type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 20, dose_unit: 'mg',
  interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-10', created_at: iso(at(10, 7)), ...over,
});
const entryOf = (p) => H.getHalfLifeEntry(M.matchName(p));
const row = (pid, outcome, ms, extra = {}) => ({ protocol_id: pid, outcome, logged_at: iso(ms), sync_status: 'synced', ...extra });
const sumOver = (times, mg, e, T) => times.reduce((s, t) => s + mg * H.amountFraction(e, (T - t) / HOUR), 0);
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

const NOW = at(19, 15);
const OUTCOMES = { 10: 'Taken', 11: 'Taken', 12: 'Skipped', 13: 'Taken', 14: 'Missed', 15: 'Taken', 16: 'Taken', 17: 'Skipped', 18: 'Taken', 19: 'Taken' };
// Taken at 09:20 (not the 09:00 slot): the curve uses the logged instant.
const LOGS = Object.entries(OUTCOMES).map(([d, o], i) => row(5, o, o === 'Missed' ? at(+d, 9) : at(+d, 9, 20), { id: i + 1 }));
const TAKEN_AT = Object.entries(OUTCOMES).filter(([, o]) => o === 'Taken').map(([d]) => at(+d, 9, 20));

test('PK-1: created 10 days ago, 7 Taken / 2 Skipped / 1 Missed → the level now is the exact sum over the 7 Taken rows only', () => {
  const p = daily();
  const e = entryOf(p);
  assert.equal(TAKEN_AT.length, 7);
  const lv = M.estimatedLevelNow(p, NOW, { logs: LOGS });
  assert.ok(near(lv.value, sumOver(TAKEN_AT, 20, e, NOW)), `level ${lv.value}`);
  // The planned level (10 doses) is higher: the skipped / missed days are no longer counted.
  const planned = M.levelAt(M.scheduledDoses(p, e, M.curveGridStart(NOW), NOW, NOW), 20, e, NOW);
  assert.ok(lv.value < planned, `${lv.value} < planned ${planned}`);
});

test('PK-1: the screen draws the same doses — the past instants are the Taken rows, never the slots', () => {
  const p = daily();
  const e = entryOf(p);
  const plan = M.curvePlan(p, e, M.curveGridStart(NOW, 14), NOW + 7 * 864e5, NOW, { logs: LOGS });
  assert.deepEqual(plan.doses.filter((d) => d <= NOW), TAKEN_AT);
  // The future is the plan, at the protocol's own 09:00 slot (today's 09:00 is already Taken).
  const ahead = plan.doses.filter((d) => d > NOW);
  assert.equal(ahead.length, 7);
  for (const d of ahead) assert.equal(new Date(d).toTimeString().slice(0, 5), '09:00');
  assert.ok(Object.isFrozen(plan.doses), 'a frozen list (lib/curveSampling keeps its carried sums)');
});

test('R3: deleted rows (sync_status or deleted_at) and other protocols\' rows add nothing', () => {
  const p = daily();
  const e = entryOf(p);
  const extra = [
    row(5, 'Taken', at(12, 21), { sync_status: 'deleted' }),
    row(5, 'Taken', at(14, 21), { deleted_at: iso(at(15, 8)) }),
    row(6, 'Taken', at(17, 21)),
  ];
  const lv = M.estimatedLevelNow(p, NOW, { logs: [...LOGS, ...extra] });
  assert.ok(near(lv.value, sumOver(TAKEN_AT, 20, e, NOW)));
});

test('A-160 under AD-96 B: "Doses in level" counts the logged doses in the past (Skipped / Missed never)', () => {
  const p = daily();
  const e = entryOf(p);
  const plan = M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW + 7 * 864e5, NOW, { logs: LOGS });
  // Every Taken dose of the last 10 days still adds ≥ 1 % of its amount (t½ 8 days).
  assert.equal(M.dosesInLevel(plan.doses, e, NOW), 7);
  // The screen's own rule (one dose at a time) gives the same doses.
  const levelDoses = plan.doses.filter((ts) => M.dosesInLevel([ts], e, NOW) === 1);
  assert.deepEqual(levelDoses, TAKEN_AT);
});

test('A-160 under AD-96 B: a fast compound counts only the logged doses still ≥ 1 % (BPC-157, t½ 0.5 h)', () => {
  const p = { id: 7, type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg', interval_days: 1, doses_per_day: 1, reminder_time: '10:00', start_date: '2026-10-18', created_at: iso(at(18, 6)) };
  const e = entryOf(p);
  const now = at(19, 12);
  const logs = [row(7, 'Taken', at(18, 10)), row(7, 'Taken', at(19, 10, 30)), row(7, 'Skipped', at(19, 11))];
  const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 864e5, now, { logs });
  // 1.5 h ago → 2^-3 = 12.5 %: in; 26 h ago: out.
  assert.equal(M.dosesInLevel(plan.doses, e, now), 1);
});
