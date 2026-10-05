'use strict';
// Founder 2026-10-05 (Fold, a weekly protocol showed "2 days without a miss"): the streak on a
// protocol's card counts DOSES taken in a row, not days — a weekly protocol taken twice is
// "2 doses without a miss", a 2-a-day protocol taken for 3 days is 6 doses. It looks back far
// enough for long intervals (a weekly protocol keeps counting past 30 days).
const test = require('node:test');
const assert = require('node:assert/strict');
const { doseStreak } = require('../lib/doseStreak');

const day = (s) => new Date(s + 'T12:00:00');
const counts = (entries) => Object.fromEntries(entries.map(([d, n]) => [day(d).toDateString(), n]));

test('weekly protocol taken on its last 2 due days: 2 doses', () => {
  const p = { interval_days: 7, doses_per_day: 1, start_date: '2026-09-21', created_at: '2026-09-21T08:00:00Z' };
  assert.equal(doseStreak(p, counts([['2026-09-28', 1], ['2026-10-05', 1]]), day('2026-10-05')), 2);
});

test('two doses a day for 3 days: 6 doses', () => {
  const p = { interval_days: 1, doses_per_day: 2, start_date: '2026-10-03', created_at: '2026-10-03T08:00:00Z' };
  assert.equal(doseStreak(p, counts([['2026-10-03', 2], ['2026-10-04', 2], ['2026-10-05', 2]]), day('2026-10-05')), 6);
});

test('a missed due day stops the count; today not yet taken does not break it', () => {
  const p = { interval_days: 1, doses_per_day: 1, start_date: '2026-09-01', created_at: '2026-09-01T08:00:00Z' };
  assert.equal(doseStreak(p, counts([['2026-10-02', 1], ['2026-10-04', 1]]), day('2026-10-05')), 1);
});

test('weekly protocol keeps counting past 30 days', () => {
  const p = { interval_days: 7, doses_per_day: 1, start_date: '2026-07-27', created_at: '2026-07-27T08:00:00Z' };
  const taken = []; for (let i = 0; i <= 10; i++) { const d = new Date('2026-07-27T12:00:00'); d.setDate(d.getDate() + 7 * i); taken.push([d.toISOString().slice(0, 10), 1]); }
  assert.equal(doseStreak(p, counts(taken), day('2026-10-05')), 11);
});
