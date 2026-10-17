'use strict';
// DT Council 2026-10-17 on f902a2d..8c880f4 (A-135 skeleton + A-136 Fold fixes): the fixes asked
// before the next test build, each test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// (1) Privacy: the layout memory (which blocks Today showed, keyed by the user id) is cleared with
// everything else on an intentional sign-out and on account deletion — not only later, when the
// app notices it has no session.
test('council (1): the wipe steps forget Today\'s layout memory', () => {
  const S = require('../lib/signedOut');
  const calls = [];
  const d = { stopSyncEngine: () => {} };
  for (const k of ['clearLocalDatabase', 'cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts', 'forgetTodayLayout']) d[k] = () => { calls.push(k); };
  S.registerWipe(() => d);
  S.runRegisteredWipe();
  assert.ok(calls.includes('forgetTodayLayout'), 'forgetTodayLayout is a wipe step');
  assert.ok(calls.includes('clearAllDrafts'), 'the other steps still run');
});

test('council (1): App passes forgetTodayLayout in wipeDeps; onAuthStateChange is untouched', () => {
  const app = read('App.js');
  const i = app.indexOf('const wipeDeps = () => ({');
  assert.ok(i > 0);
  const block = app.slice(i, app.indexOf('});', i));
  assert.match(block, /\bforgetTodayLayout,/);
  const cbStart = app.indexOf('onAuthStateChange(');
  const cb = app.slice(cbStart, cbStart + 6000);
  assert.ok(!cb.includes('forgetTodayLayout'), 'nothing new inside onAuthStateChange');
});
