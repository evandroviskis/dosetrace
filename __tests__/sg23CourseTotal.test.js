'use strict';
// SG-23 / DV-012 / AD-82 (founder 2026-10-15, "siga as recomendações"): a legacy finite course
// (schedule_total) stops expecting doses after its last dose day — Today, rings, streak, the Missed
// scan and the curve read expectedDosesOn / expectedSlotTimesOn, which must agree with the
// reminders' dueDateKeys. Before the end nothing changes; a planned end (ends_on) still changes
// nothing (SG-4); "Continuar" clears the total, so doses are expected again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedDosesOn, expectedSlotTimesOn } = require('../lib/schedule');

const course = { start_date: '2026-10-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', schedule_total: 3, created_at: '2026-09-30T12:00:00Z' };
const day = (d) => new Date(2026, 9, d, 12, 0);

test('SG-23: a course of 3 daily doses expects doses on its 3 days and none after', () => {
  assert.equal(expectedDosesOn(course, day(1)), 1);
  assert.equal(expectedDosesOn(course, day(3)), 1);
  assert.equal(expectedDosesOn(course, day(4)), 0);
  assert.equal(expectedDosesOn(course, day(12)), 0);
  assert.deepEqual(expectedSlotTimesOn(course, day(12)), []);
  assert.equal(expectedSlotTimesOn(course, day(3)).length, 1);
});

test('SG-23: an every-3-days course of 2 ends on its second dose day (start + 3)', () => {
  const p = { ...course, interval_days: 3, schedule_total: 2 };
  assert.equal(expectedDosesOn(p, day(4)), 1);
  assert.equal(expectedDosesOn(p, day(7)), 0);
});

test('SG-23: without a total (or after "Continuar" cleared it) and with a planned end, doses stay expected (SG-4)', () => {
  assert.equal(expectedDosesOn({ ...course, schedule_total: null }, day(12)), 1);
  assert.equal(expectedDosesOn({ ...course, schedule_total: null, ends_on: '2026-10-05' }, day(12)), 1);
});
