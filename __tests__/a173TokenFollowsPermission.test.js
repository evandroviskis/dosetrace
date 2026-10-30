'use strict';
// A-173 (spec audit TM-2 / TM-6, 2026-10-22): the panel's "Aparelhos com notificações" and "enviada
// para N aparelhos" counted push tokens of phones whose notifications are OFF (TM-19: 2 accepted with
// the Fold blocked). App half: a phone with the permission off removes its own token row (once —
// only when it had one), and registers again when the permission comes back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pushRowWhenBlocked } = require('../lib/pushRow');

test('A-173: permission off with a stored token row → remove that token; nothing stored → no call', () => {
  assert.deepEqual(pushRowWhenBlocked({ token: 'ExponentPushToken[a]', at: 1 }), { remove: 'ExponentPushToken[a]' });
  assert.deepEqual(pushRowWhenBlocked(null), { remove: null });
  assert.deepEqual(pushRowWhenBlocked({ at: 1 }), { remove: null });
});

test('A-173: registerPushToken removes the row when blocked and forgets it, so turning it on registers again', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'notifications.js'), 'utf8');
  const fn = src.slice(src.indexOf('export async function registerPushToken'), src.indexOf('export async function removePushToken'));
  assert.match(fn, /if \(status !== 'granted'\) \{\s*await dropBlockedPushRow\(\);\s*return;\s*\}/);
  const drop = src.slice(src.indexOf('async function dropBlockedPushRow'), src.indexOf('export async function registerPushToken'));
  assert.match(drop, /pushRowWhenBlocked\(/);
  assert.match(drop, /from\('push_tokens'\)\.delete\(\)\.eq\('expo_token', remove\)/);
  assert.match(drop, /AsyncStorage\.removeItem\(PUSH_ROW_KEY\)/);
});
