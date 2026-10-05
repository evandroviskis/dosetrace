'use strict';
// docs/specs/reminder-check.md RC-7 (founder's Fold 2026-10-04: no dose reminder for over a week;
// 10 active protocols + persistent reminders left each protocol 1–2 upcoming reminders, because
// Android shared iPhone's 64-notification budget). Android has no 64 cap; iPhone keeps its budget
// and the vial-expiry alerts now count inside it (senior review 2026-10-04).
const test = require('node:test');
const assert = require('node:assert/strict');
const { doseBudget } = require('../lib/notificationPlan');

test('Android, 10 protocols with persistent reminders: each keeps well over a week of daily reminders', () => {
  const b = doseBudget({ os: 'android', protocolCount: 10, expiryAlerts: 3 });
  assert.ok(b.windowDays >= 14);
  assert.ok(b.perProtocol >= 3 * 10, `per protocol ${b.perProtocol}: 10 days × (dose + 2 follow-ups)`);
  assert.ok(b.perProtocol * 10 <= 450, 'under Android\'s 500 alarms per app');
});

test('iPhone keeps the 64 cap: dose budget + expiry alerts + the rest stay under 64', () => {
  for (const n of [1, 4, 10]) {
    for (const exp of [0, 3, 8, 20]) {
      const b = doseBudget({ os: 'ios', protocolCount: n, expiryAlerts: exp });
      const doses = Math.min(b.perProtocol * n, b.total);
      assert.ok(doses + Math.min(exp, 8) + 16 + 4 <= 64, `n=${n} exp=${exp}: ${doses}`);
      assert.ok(b.perProtocol >= 2);
    }
  }
});

test('iPhone with no expiry alerts keeps the old numbers (40 shared, at most 24 each)', () => {
  const b = doseBudget({ os: 'ios', protocolCount: 1, expiryAlerts: 0 });
  assert.equal(b.perProtocol, 24);
  assert.equal(b.windowDays, 10);
  assert.equal(doseBudget({ os: 'ios', protocolCount: 4, expiryAlerts: 0 }).perProtocol, 10);
});
