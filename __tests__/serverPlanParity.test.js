'use strict';
// S-12 / RL-2: the server push sender (supabase/functions/send-reminders/plan.ts) must
// plan EXACTLY what the app schedules (lib/notificationPlan.js). This imports the REAL
// plan.ts (Node runs the TypeScript directly) and runs the same cases through both.
// The food rule (FL-18/41/42): daily 20:00 while a check is open, skipped for a closed
// day, no day-21 cut-off, no backoff, none for locked users.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const client = require('../lib/notificationPlan');
const server = require('../supabase/functions/send-reminders/plan.ts');

const protocols = [
  { name: 'A', start_date: '2026-09-20', interval_days: 1, reminder_time: '08:00,20:00' },
  { name: 'B', start_date: '2026-09-25', interval_days: 3, schedule_total: 4, reminder_time: '21:30' },
  { name: 'C', start_date: '2026-10-05', interval_days: 7, reminder_time: null },
];

test('RL-2: dueDateKeys is identical (daily, every 3 days with a total, starts in the future)', () => {
  for (const p of protocols) {
    for (const from of ['2026-09-28', '2026-10-01', '2026-11-01']) {
      assert.deepEqual(server.dueDateKeys(p, from, 21), client.dueDateKeys(p, from, 21), `${p.name} from ${from}`);
    }
  }
});

test('RL-2: morningSummaryPlan is identical', () => {
  assert.deepEqual(server.morningSummaryPlan(protocols, '2026-10-01', 14, 45), client.morningSummaryPlan(protocols, '2026-10-01', 14, 45));
  assert.deepEqual(server.morningSummaryPlan([], '2026-10-01', 7, 45), client.morningSummaryPlan([], '2026-10-01', 7, 45));
});

test('RL-2: reminder slots are identical (several times, none set = 08:00, bad input)', () => {
  for (const raw of ['08:00,20:00', '21:30', null, '', 'x:y']) {
    assert.deepEqual(server.reminderSlots({ reminder_time: raw }), client.reminderTimes(raw), String(raw));
  }
});

test('RL-2: the food rule is identical — daily while open, closed days skipped, no day-21 cut-off, no backoff', () => {
  const cases = [
    ['2026-09-01', '2026-10-01', new Set(), 10],                       // day 31 of the check: still asked
    ['2026-09-28', '2026-10-01', new Set(['2026-10-02', '2026-10-04']), 7],
    ['2026-10-05', '2026-10-01', new Set(), 7],                       // check starts later
    ['bad', '2026-10-01', new Set(), 3],
  ];
  for (const [start, today, closed, win] of cases) {
    assert.deepEqual(server.foodNudgeDays(start, today, closed, win), client.foodNudgeDays(start, today, closed, win), `${start} ${today}`);
  }
  assert.equal(server.foodNudgeDays('2026-09-01', '2026-10-01', new Set(), 3).length, 3, 'no backoff, no cut-off');
});

test('RL-2: none for locked users, and only until the last open day (remindersForAccess identical)', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03'];
  for (const access of [null, { canLog: false }, { canLog: true, mode: 'premium' }, { canLog: true, mode: 'trial', until: '2026-10-02' }]) {
    assert.deepEqual(server.remindersForAccess(days, access), client.remindersForAccess(days, access), JSON.stringify(access));
  }
});

test('RL-2: the server reads the open check from reality_check_open and closed days from day_closed markers', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'send-reminders', 'index.ts'), 'utf8');
  assert.match(src, /from\('reality_check_open'\)/);
  assert.match(src, /'day_closed'/);
  assert.doesNotMatch(src, /calc_reality_open/);
  assert.doesNotMatch(src, /REALITY_CHECK_DAYS\)/, 'no day-21 cut-off passed to the food rule');
  const notif = fs.readFileSync(path.join(__dirname, '..', 'lib', 'notifications.js'), 'utf8');
  assert.match(notif, /reminderTimes\(/, 'the app uses the same slot parser');
});
