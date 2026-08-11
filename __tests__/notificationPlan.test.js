'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ymd, parseYmd, addDays, dayDiff, dueDateKeys, morningSummaryPlan } = require('../lib/notificationPlan');

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
