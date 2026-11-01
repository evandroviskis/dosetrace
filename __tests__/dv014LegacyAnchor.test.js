// DV-014 / DL-07 (parked-error sweep 2026-10-31): a legacy protocol without start_date was due EVERY day on
// Today (and got Missed rows) while its reminders came every N days counted from whichever day they were last
// re-planned. One anchor now: start_date, else the local day it was created (lib/schedule scheduleAnchor),
// shared by Today's count, the slots, the Missed scan's slots and the reminder plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/schedule');
const { dueDateKeys } = require('../lib/notificationPlan');

const legacy = { id: 1, interval_days: 3, doses_per_day: 1, reminder_time: '09:00', start_date: null, created_at: new Date(2026, 9, 1, 10).toISOString(), active: 1 };

test('DV-014: the anchor is start_date, else the creation day', () => {
  assert.equal(S.scheduleAnchor(legacy), '2026-10-01');
  assert.equal(S.scheduleAnchor({ ...legacy, start_date: '2026-10-05' }), '2026-10-05');
});

test('DV-014: Today and the reminders agree on the every-3-days days', () => {
  const due = [];
  for (let d = 10; d <= 16; d++) if (S.expectedDosesOn(legacy, new Date(2026, 9, d)) > 0) due.push(`2026-10-${d}`);
  assert.deepEqual(due, ['2026-10-10', '2026-10-13', '2026-10-16']);
  assert.deepEqual(dueDateKeys(legacy, '2026-10-10', 7), ['2026-10-10', '2026-10-13', '2026-10-16']);
  assert.equal(S.expectedSlotTimesOn(legacy, new Date(2026, 9, 11)).length, 0);
  assert.ok(S.elapsedDoseSlots(legacy, new Date(2026, 9, 16, 12).getTime(), 30).length > 0, 'the Missed scan has slots too');
});
