'use strict';
// Pre-existing curve bug B (re-review 2026-10-20, waiting for the founder — NOT in 1.3.1 unless he
// says yes): on the creation day, after every slot already passed, the day keeps one loggable dose
// (lib/schedule expectedDosesOn floor of 1). Today shows that dose as the LAST slot (lib/dosePageState
// daySlots: ti = dpd − expected), e.g. the 20:00 dose of an 08:00 / 20:00 protocol created at 21:30;
// the curve placed it at the protocol's FIRST time (08:00). Fix: the extra dose uses the protocol's
// slot at position dpd − 1 (the same slot Today shows), the first time only when there is none.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const { daySlots } = require('../lib/dosePageState');

const p = {
  id: 7, type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg',
  interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-18',
  created_at: new Date(2026, 9, 18, 21, 30).toISOString(),
};

test('creation day after every slot passed: the curve places the one dose at the slot Today shows (20:00)', () => {
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = new Date(2026, 9, 19, 12, 0).getTime();
  const day18 = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now, now).filter((d) => new Date(d).getDate() === 18);
  const today = daySlots({ protocol: p, dayKey: '2026-10-18' });
  assert.equal(today.length, 1);
  assert.deepEqual(day18, [today[0].slotMs]);
  assert.equal(new Date(day18[0]).getHours(), 20);
});

test('the legacy rules stay: one time × 2 → two at that time; no times → 08:00', () => {
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = new Date(2026, 9, 20, 12, 0).getTime();
  const on19 = (q) => M.scheduledDoses(q, e, M.curveGridStart(now, 3), now, now).filter((d) => new Date(d).getDate() === 19).map((d) => new Date(d).getHours());
  assert.deepEqual(on19({ ...p, reminder_time: '08:00', created_at: '2026-10-18T00:00:00' }), [8, 8]);
  assert.deepEqual(on19({ ...p, reminder_time: null, created_at: '2026-10-18T00:00:00' }), [8, 8]);
});
