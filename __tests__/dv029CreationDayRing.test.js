// DV-029 / DL-04 (parked-error sweep 2026-10-31): a protocol added at 21:00 with an 08:00 dose — the header and
// the card count today's dose (the creation-day floor of 1, so the dose just taken can be marked), but the ring
// placed it at noon, before the add, dropped it and said "Nothing due" even after the dose was taken. The floor
// dose now sits at the moment of the add, so the ring counts the same dose the header does.
const test = require('node:test');
const assert = require('node:assert/strict');
const { adherenceRings } = require('../lib/adherenceRings');
const { expectedDosesOn } = require('../lib/schedule');

const p = { id: 1, user_id: 'u', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-10-31', created_at: new Date(2026, 9, 31, 21, 0).toISOString(), active: 1 };
const now = new Date(2026, 9, 31, 22, 0).getTime();

test('DV-029: creation day after the dose time — the ring has the one dose the header counts', () => {
  assert.equal(expectedDosesOn(p, new Date(now)), 1);
  const before = adherenceRings({ protocols: [p], logs: [], nowMs: now });
  assert.ok(before.today && before.today.due === 1, JSON.stringify(before.today));
  const taken = { id: 9, protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 9, 31, 21, 5).toISOString(), protocol_created_at: p.created_at };
  const after = adherenceRings({ protocols: [p], logs: [taken], nowMs: now });
  assert.equal(after.today.taken, 1);
});
