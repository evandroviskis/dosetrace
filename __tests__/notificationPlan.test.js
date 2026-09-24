'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ymd, parseYmd, addDays, dayDiff, dueDateKeys, morningSummaryPlan, foodNudgeDays } = require('../lib/notificationPlan');

const TODAY = '2026-08-11';

test('ymd/parseYmd round-trip a local date', () => {
  assert.equal(ymd(parseYmd(TODAY)), TODAY);
  assert.equal(ymd(addDays(parseYmd(TODAY), 3)), '2026-08-14');
  assert.equal(dayDiff(TODAY, '2026-08-14'), 3);
});

test('dueDateKeys: daily protocol fills every day in the window', () => {
  const p = { start_date: TODAY, interval_days: 1 };
  const keys = dueDateKeys(p, TODAY, 5);
  assert.deepEqual(keys, ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']);
});

test('dueDateKeys: every-3-days protocol lands on the right dates and skips the rest', () => {
  const p = { start_date: TODAY, interval_days: 3 };
  const keys = dueDateKeys(p, TODAY, 10);
  assert.deepEqual(keys, ['2026-08-11', '2026-08-14', '2026-08-17', '2026-08-20']);
});

test('dueDateKeys: a start_date in the past still yields correctly phased future dates', () => {
  // Started 10 days ago, every 7 days → next due is day 14 (4 days from today).
  const p = { start_date: '2026-08-01', interval_days: 7 };
  const keys = dueDateKeys(p, TODAY, 14);
  assert.deepEqual(keys, ['2026-08-15', '2026-08-22']);
});

test('dueDateKeys: a finite schedule_total stops the series', () => {
  const p = { start_date: TODAY, interval_days: 1, schedule_total: 2 };
  const keys = dueDateKeys(p, TODAY, 10);
  assert.deepEqual(keys, ['2026-08-11', '2026-08-12']);
});

test('morningSummaryPlan: a due day lists the protocol names', () => {
  const protocols = [
    { name: 'Testosterone', start_date: TODAY, interval_days: 3 },
    { name: 'BPC-157', start_date: TODAY, interval_days: 1 },
  ];
  const plan = morningSummaryPlan(protocols, TODAY, 1, 45);
  assert.equal(plan[0].kind, 'due');
  assert.deepEqual(plan[0].list.sort(), ['BPC-157', 'Testosterone']);
});

test('morningSummaryPlan: an empty day reports how many days until the next dose', () => {
  // Only one protocol, every 3 days from today → today due, tomorrow empty (next in 2), etc.
  const protocols = [{ name: 'Testosterone', start_date: TODAY, interval_days: 3 }];
  const plan = morningSummaryPlan(protocols, TODAY, 4, 45);
  assert.equal(plan[0].kind, 'due');                 // 08-11 due
  assert.deepEqual(plan[1], { dateKey: '2026-08-12', kind: 'next', days: 2 }); // next on 08-14
  assert.deepEqual(plan[2], { dateKey: '2026-08-13', kind: 'next1' });         // next is tomorrow
  assert.equal(plan[3].kind, 'due');                 // 08-14 due
});

test('morningSummaryPlan: nothing today and nothing upcoming stays quiet (kind none)', () => {
  // Series already finished (2 doses ending yesterday) → no future doses at all.
  const protocols = [{ name: 'Done', start_date: '2026-08-09', interval_days: 1, schedule_total: 2 }];
  const plan = morningSummaryPlan(protocols, TODAY, 3, 45);
  for (const day of plan) assert.equal(day.kind, 'none');
});

test('morningSummaryPlan: no protocols → every day is quiet', () => {
  const plan = morningSummaryPlan([], TODAY, 5, 45);
  assert.equal(plan.length, 5);
  for (const day of plan) assert.equal(day.kind, 'none');
});


// ── foodNudgeDays (20:00 food-log nudge: window, same-day skip, anchored backoff) ──
const S = '2026-09-01';
const day = (n) => ymd(addDays(parseYmd(S), n));

test('food nudge: daily inside the check window, none before the start or after day 21', () => {
  assert.deepEqual(foodNudgeDays(S, day(-2), new Set(), 3, 21), [day(0), day(1), day(2)]);
  // a recent log keeps it daily, so this checks only the day-21 window edge
  assert.deepEqual(foodNudgeDays(S, day(19), new Set([day(18)]), 7, 21), [day(19), day(20)]);
  assert.deepEqual(foodNudgeDays(S, day(21), new Set(), 7, 21), []);
});

test('food nudge: skips a day the user already logged', () => {
  assert.deepEqual(foodNudgeDays(S, day(0), new Set([day(0)]), 3, 21), [day(1), day(2)]);
});

test('food nudge: backoff can never start before day 5 (start day never counts as ignored)', () => {
  // days 0..3 are always daily, even with nothing logged
  assert.deepEqual(foodNudgeDays(S, day(0), new Set(), 4, 21), [day(0), day(1), day(2), day(3)]);
});

test('food nudge: after 3 ignored days, only every other day, anchored to the start', () => {
  // no logs at all: day 4 (even) yes, 5 no, 6 yes, 7 no, 8 yes
  assert.deepEqual(foodNudgeDays(S, day(4), new Set(), 5, 21), [day(4), day(6), day(8)]);
  // re-planning a day later gives the same rhythm (anchored, never drifts)
  assert.deepEqual(foodNudgeDays(S, day(5), new Set(), 4, 21), [day(6), day(8)]);
});

test('food nudge: never a 2-day gap while backed off', () => {
  const days = foodNudgeDays(S, day(4), new Set(), 17, 21);
  for (let i = 1; i < days.length; i++) assert.ok(dayDiff(days[i - 1], days[i]) <= 2, 'gap > 2 days');
});

test('food nudge: any log in the last 3 days returns it to daily', () => {
  const logged = new Set([day(3)]);
  // day 4,5,6 see day 3 logged → daily; day 7 (3 unlogged before it, odd) → skipped
  assert.deepEqual(foodNudgeDays(S, day(4), logged, 4, 21), [day(4), day(5), day(6)]);
});

test('food nudge: corrupt start date schedules nothing', () => {
  assert.deepEqual(foodNudgeDays('garbage', day(0), new Set(), 7, 21), []);
});
