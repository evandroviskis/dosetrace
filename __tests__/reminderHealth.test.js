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
