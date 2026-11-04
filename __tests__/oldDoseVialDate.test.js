// Found 2026-11-03 (unrecorded-period design review, UP-30): marking an old Missed / Skipped dose as taken
// took it from the vial active TODAY even when the dose is older than that vial. A dose only moves the
// vial it could have come from: one dated on or after the day the vial was mixed (or added) — the same
// rule as the past-start question (founder: faithful to what the person used).
const test = require('node:test');
const assert = require('node:assert/strict');
const { planMarkTaken } = require('../lib/markTaken');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = local(2026, 11, 3, 21, 40);
const p = { id: 1, user_id: 'u1', remote_id: 'r1', type: 'recon', doses_per_day: 1, interval_days: 7, dose: '5', dose_unit: 'mg', amount: '20', unit: 'mg', reminder_time: '21:00' };
const vial = { id: 9, doses_taken: 0, total_doses: 4, mixed_on: '2026-11-01', created_at: new Date(local(2026, 11, 1, 10)).toISOString() };
const missedOld = { id: 50, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 10, 26, 21)).toISOString() };
const missedNew = { id: 51, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 11, 2, 21)).toISOString() };

test('an old Missed dose from before the vial was mixed is taken without touching that vial', () => {
  const plan = planMarkTaken({ protocol: p, vial, todayLogs: [missedOld], dayKey: '2026-10-26', slotMs: local(2026, 10, 26, 21), flipRowId: 50, nowMs: NOW });
  assert.equal(plan.update && plan.update.outcome, 'Taken');
  assert.equal(plan.vialUpdate, null, 'the 26/10 dose cannot come from a vial mixed on 1/11');
});

test('a Missed dose dated on or after the mixing day still counts against the vial', () => {
  const plan = planMarkTaken({ protocol: p, vial, todayLogs: [missedNew], dayKey: '2026-11-02', slotMs: local(2026, 11, 2, 21), flipRowId: 51, nowMs: NOW });
  assert.deepEqual(plan.vialUpdate, { id: 9, doses_taken: 1 });
});

test('a vial with no mixing date uses the day it was added', () => {
  const added = { ...vial, mixed_on: null, created_at: new Date(local(2026, 10, 30, 9)).toISOString() };
  assert.equal(planMarkTaken({ protocol: p, vial: added, todayLogs: [missedOld], dayKey: '2026-10-26', slotMs: local(2026, 10, 26, 21), flipRowId: 50, nowMs: NOW }).vialUpdate, null);
  assert.deepEqual(planMarkTaken({ protocol: p, vial: added, todayLogs: [missedNew], dayKey: '2026-11-02', slotMs: local(2026, 11, 2, 21), flipRowId: 51, nowMs: NOW }).vialUpdate, { id: 9, doses_taken: 1 });
});
