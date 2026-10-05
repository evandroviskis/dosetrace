'use strict';
// docs/specs/reminder-check.md RC-3, RC-4, RC-6 (founder 2026-10-05 "1 B").
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/reminderHealth');

const androidOk = { os: 'android', manufacturer: 'samsung', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false };

test('RC-3 Android: every readable check, plus the two the app can only open (Samsung adds deep sleep)', () => {
  const c = R.reminderChecks(androidOk);
  assert.deepEqual(c.map((x) => [x.id, x.state]), [['notifications', 'ok'], ['channel', 'ok'], ['battery', 'ok'], ['alarms', 'open'], ['deep_sleep', 'open']]);
  const pixel = R.reminderChecks({ ...androidOk, manufacturer: 'Google' });
  assert.ok(!pixel.some((x) => x.id === 'deep_sleep'));
});

test('RC-3 iPhone: notifications only', () => {
  assert.deepEqual(R.reminderChecks({ os: 'ios', permission: 'granted' }).map((x) => x.id), ['notifications']);
});

test('RC-3 states: permission off and the category off block; battery optimized only warns', () => {
  const c = R.reminderChecks({ ...androidOk, permission: 'denied', doseChannelImportance: 0, batteryOptimized: true });
  const by = Object.fromEntries(c.map((x) => [x.id, x.state]));
  assert.equal(by.notifications, 'block');
  assert.equal(by.channel, 'block');
  assert.equal(by.battery, 'warn');
});

test('RC-4 schedule: nothing scheduled with reminders on and a protocol that needs one is a block', () => {
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 3, scheduledCount: 0 }), 'block');
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 3, scheduledCount: 12 }), 'ok');
  assert.equal(R.scheduleState({ remindersOn: false, activeWithTime: 3, scheduledCount: 0 }), 'off');
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 0, scheduledCount: 0 }), 'none_needed');
});

test('RC-6 Today warns only for a readable block, with reminders on and a protocol that needs one', () => {
  const warn = R.reminderChecks({ ...androidOk, batteryOptimized: true });
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 2, checks: warn, schedule: 'ok' }), false, 'a warning alone never alerts');
  const blocked = R.reminderChecks({ ...androidOk, doseChannelImportance: 0 });
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 2, checks: blocked, schedule: 'ok' }), true);
  assert.equal(R.shouldWarnToday({ remindersOn: false, activeWithTime: 2, checks: blocked, schedule: 'ok' }), false, 'reminders switched off in Settings');
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 0, checks: blocked, schedule: 'none_needed' }), false);
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 2, checks: R.reminderChecks(androidOk), schedule: 'block' }), true, 'nothing scheduled');
  assert.equal(R.blockingCount(blocked, 'block'), 2);
});

// Council 2 QA (2026-10-05): nothing scheduled is a block ONLY when a reminder is due inside the
// scheduling window — an every-14-days protocol on iPhone (10-day window) or a monthly one on
// Android (21 days) correctly has none yet, and must not read as "blocked".
test('RC-4/RC-6: no reminder due inside the window → not a block', () => {
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 1, scheduledCount: 0, dueInWindow: 0 }), 'none_needed');
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 1, scheduledCount: 0, dueInWindow: 2 }), 'block');
  const checks = R.reminderChecks({ os: 'ios', permission: 'granted' });
  const sched = R.scheduleState({ remindersOn: true, activeWithTime: 1, scheduledCount: 0, dueInWindow: 0 });
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 1, checks, schedule: sched }), false);
});

test('RC-4: upcoming due slots inside the window are counted from the schedule', () => {
  const now = new Date('2026-10-05T10:00:00');
  const biweekly = { interval_days: 14, doses_per_day: 1, start_date: '2026-10-05', reminder_time: '08:00', created_at: '2026-09-01T08:00:00Z' };
  assert.equal(R.dueInWindow([biweekly], now, 10), 0, 'today 08:00 passed, next in 14 days: none in a 10-day window');
  const daily = { ...biweekly, interval_days: 1 };
  assert.ok(R.dueInWindow([daily], now, 10) > 0);
});

test('RC-4: a dose already taken today is not owed (a biweekly taken this morning before its time)', () => {
  const now = new Date('2026-10-05T10:00:00');
  const p = { id: 7, interval_days: 14, doses_per_day: 1, start_date: '2026-10-05', reminder_time: '20:00', created_at: '2026-09-01T08:00:00Z' };
  assert.equal(R.dueInWindow([p], now, 10), 1);
  assert.equal(R.dueInWindow([p], now, 10, { 7: 1 }), 0);
});
