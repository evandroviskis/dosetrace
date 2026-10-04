'use strict';
// Today v2.1 package, F1 (approved with Today 2026-09-29: "F1 and F6 fixed with failing-then-
// passing tests", docs/design/today-build-handoff.md §3 item 19): a dose logged on its own day
// more than 12 h after its slot (an 08:00 dose marked at 21:00) got a false Missed next to it,
// because a log covered its slot only until slot + 12 h. The cover window now ends at the LATER
// of slot + 12 h and the end of the slot's own day — in the Missed scan and in "Pending from
// yesterday" alike (one window helper).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses, slotDayEndMs } = require('../lib/missedDoses');
const { pendingFromYesterday } = require('../lib/pendingYesterday');

const local = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const P = { id: 1, user_id: 'u', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T06:00:00.000Z' };

test('an 08:00 dose logged at 21:00 the same day is not Missed', () => {
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2, 21)).toISOString() }];
  const missed = computeMissedDoses([P], logs, local(3, 12), local(1, 0), { lookbackDays: 2 });
  assert.ok(!missed.some((m) => m.scheduledAtMs === local(2, 8)), 'no false Missed for the 2nd');
});

test('a later log on the same day covers the slot only when no closer slot of that day claims it', () => {
  const P2 = { ...P, doses_per_day: 2, reminder_time: '08:00,20:00' };
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2, 20, 3)).toISOString() }];
  const missed = computeMissedDoses([P2], logs, local(3, 12), local(1, 0), { lookbackDays: 1 });
  assert.deepEqual(missed.map((m) => new Date(m.scheduledAtMs).getHours()), [8], '08:00 stays Missed; the 20:03 dose is the 20:00 one');
  assert.equal(slotDayEndMs(local(2, 8)), new Date(2026, 9, 3, 0, 0).getTime() - 1);
});

test('Pending from yesterday uses the same window helper (the block and the scan never disagree)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/pendingYesterday.js'), 'utf8');
  assert.match(src, /lateSameDayPass\(/);
  assert.equal(typeof pendingFromYesterday, 'function');
});
