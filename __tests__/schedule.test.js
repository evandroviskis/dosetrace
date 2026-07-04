'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sortedDoseTimes, expectedDosesOn, nextDueDate, existedOn, toPastDateString,
} = require('../lib/schedule');

// A protocol created well in the past so the creation-day grace never applies.
const OLD = '2020-01-01T08:00:00';

test('sortedDoseTimes: splits, drops blanks, sorts', () => {
  assert.deepEqual(sortedDoseTimes({ reminder_time: '21:00,08:00,14:00' }), ['08:00', '14:00', '21:00']);
  assert.deepEqual(sortedDoseTimes({ reminder_time: '' }), []);
  assert.deepEqual(sortedDoseTimes({}), []);
});

test('expectedDosesOn: daily protocol expects its doses_per_day every day', () => {
  const p = { start_date: '2024-01-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', created_at: OLD };
  assert.equal(expectedDosesOn(p, new Date('2024-06-15T12:00:00')), 2);
  assert.equal(expectedDosesOn(p, new Date('2024-06-16T12:00:00')), 2);
});

test('expectedDosesOn: nothing before start_date', () => {
  const p = { start_date: '2024-06-10', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: OLD };
  assert.equal(expectedDosesOn(p, new Date('2024-06-09T12:00:00')), 0);
  assert.equal(expectedDosesOn(p, new Date('2024-06-10T12:00:00')), 1);
});

test('expectedDosesOn: every-3-days lands only on multiples of the interval', () => {
  const p = { start_date: '2024-06-01', interval_days: 3, doses_per_day: 1, reminder_time: '08:00', created_at: OLD };
  assert.equal(expectedDosesOn(p, new Date('2024-06-01T12:00:00')), 1); // day 0
  assert.equal(expectedDosesOn(p, new Date('2024-06-02T12:00:00')), 0); // day 1
  assert.equal(expectedDosesOn(p, new Date('2024-06-04T12:00:00')), 1); // day 3
  assert.equal(expectedDosesOn(p, new Date('2024-06-07T12:00:00')), 1); // day 6
});

test('expectedDosesOn: once-daily created late in the day gets creation grace (fix #2)', () => {
  // Created 2024-06-15 23:00, single 08:00 reminder — the 8 AM slot is 15h in the past.
  const p = {
    start_date: '2024-06-15', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: '2024-06-15T23:00:00',
  };
  // On the creation day, the already-passed slot is not demanded.
  assert.equal(expectedDosesOn(p, new Date('2024-06-15T23:30:00')), 0);
  // The next day it resumes normally.
  assert.equal(expectedDosesOn(p, new Date('2024-06-16T09:00:00')), 1);
});

test('expectedDosesOn: creation grace still counts a slot created just before it (1h window)', () => {
  // Created 08:30; the 08:00 slot is 30 min in the past — within the 1h grace, still counts.
  const p = {
    start_date: '2024-06-15', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: '2024-06-15T08:30:00',
  };
  assert.equal(expectedDosesOn(p, new Date('2024-06-15T09:00:00')), 1);
});

test('expectedDosesOn: multi-dose creation grace counts only upcoming slots', () => {
  // Created 16:30 with 08:00/14:00/21:00 — the 08:00 and 14:00 slots are well
  // past (beyond the 1h grace), so only the 21:00 slot remains today.
  const p = {
    start_date: '2024-06-15', interval_days: 1, doses_per_day: 3,
    reminder_time: '08:00,14:00,21:00', created_at: '2024-06-15T16:30:00',
  };
  assert.equal(expectedDosesOn(p, new Date('2024-06-15T17:00:00')), 1);
});

test('nextDueDate: finds the next interval day', () => {
  const p = { start_date: '2024-06-01', interval_days: 3, doses_per_day: 1, reminder_time: '08:00', created_at: OLD };
  const next = nextDueDate(p, new Date('2024-06-04T12:00:00')); // day 3 is due; next due is day 6
  assert.equal(next.getFullYear(), 2024);
  assert.equal(next.getMonth(), 5); // June
  assert.equal(next.getDate(), 7);
});

test('existedOn: false before creation, true on/after', () => {
  const p = { created_at: '2024-06-10T12:00:00' };
  assert.equal(existedOn(p, new Date('2024-06-09T23:00:00')), false);
  assert.equal(existedOn(p, new Date('2024-06-10T00:00:00')), true);
  assert.equal(existedOn(p, new Date('2024-07-01T00:00:00')), true);
  assert.equal(existedOn({}, new Date('2000-01-01')), true); // no created_at → always existed
});

test('toPastDateString: rejects impossible dates, formats valid ones', () => {
  assert.equal(toPastDateString(1, '31'), null);       // Feb 31 → impossible
  assert.equal(toPastDateString(3, '31'), null);       // Apr 31 → impossible
  assert.match(toPastDateString(0, '15'), /^\d{4}-01-15$/); // Jan 15 formats
});
