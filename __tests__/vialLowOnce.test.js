'use strict';
// Pre-build pass 2026-10-03, m10: "Vial running low" fired again on every app launch (the sync
// re-sent an immediate notification for every low vial each time it ran). It now fires ONCE per
// vial when the vial becomes low; what was sent is kept on the device. A new vial is a new row
// (new id), so a newly mixed vial alerts again when it runs low; vials that are gone are forgotten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vialLowToSend } = require('../lib/notificationPlan');

test('a low vial is announced once, never again on the next launch', () => {
  const first = vialLowToSend({ lowIds: [7], activeIds: [7, 8], sent: {} });
  assert.deepEqual(first.send, [7]);
  const second = vialLowToSend({ lowIds: [7], activeIds: [7, 8], sent: first.sent });
  assert.deepEqual(second.send, []);
  const third = vialLowToSend({ lowIds: [7], activeIds: [7, 8], sent: second.sent });
  assert.deepEqual(third.send, []);
});

test('a vial that dips back above the line and low again is not announced twice', () => {
  const a = vialLowToSend({ lowIds: [7], activeIds: [7], sent: {} });
  const b = vialLowToSend({ lowIds: [], activeIds: [7], sent: a.sent });
  const c = vialLowToSend({ lowIds: [7], activeIds: [7], sent: b.sent });
  assert.deepEqual(c.send, []);
});

test('a newly mixed vial (new id) is announced when it runs low; the finished one is forgotten', () => {
  const a = vialLowToSend({ lowIds: [7], activeIds: [7], sent: {} });
  const b = vialLowToSend({ lowIds: [9], activeIds: [9], sent: a.sent });
  assert.deepEqual(b.send, [9]);
  assert.deepEqual(Object.keys(b.sent), ['9']);
});

test('syncVialAlerts keeps what it sent and sends only the new ones', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/notifications.js'), 'utf8');
  const fn = src.slice(src.indexOf('export async function syncVialAlerts'), src.indexOf('// ── CHECK-IN REMINDERS'));
  assert.match(fn, /vialLowToSend\(/);
  assert.match(fn, /AsyncStorage\.setItem\(VIAL_LOW_SENT_KEY/);
  assert.match(fn, /if \(!toSend\.has\(v\.id\)\) continue;/);
});
