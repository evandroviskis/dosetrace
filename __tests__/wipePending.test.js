'use strict';
// Gate B round 3, N2 (proven in the runner): the intended wipe waited for a stuck sync with no
// time limit and nothing persisted — a restart forgot it, leaving the signed-out account's health
// data on the phone. Now (lib/signedOut): a "wipe pending" marker is written first, the wipe runs
// AT ONCE (signOutCore already forced a sync, or the user chose Sign out anyway), the second pass
// after the running sync stays guarded by the sign-in generation, and the marker is cleared when
// done. A cold start with no session and the marker still there completes the wipe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/signedOut');

function deps({ stuck = false } = {}) {
  const calls = [];
  const store = { pending: false };
  const d = {
    stopSyncEngine: () => calls.push('stop'),
    waitForSyncIdle: () => (stuck ? new Promise(() => {}) : Promise.resolve()),
    getSignInGeneration: S.signInGeneration,
    setWipePending: async (v) => { store.pending = v; calls.push(`pending:${v}`); },
    isWipePending: async () => store.pending,
    clearLocalDatabase: () => calls.push('db'),
  };
  for (const k of ['cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts']) d[k] = () => calls.push(k);
  return { d, calls, store };
}

test('a stuck sync: the marker is written, then everything is wiped at once', async () => {
  const { d, calls, store } = deps({ stuck: true });
  S.afterSignedOut(true, d); // never resolves: the sync never ends
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls[1], 'pending:true', 'marker first');
  assert.ok(calls.includes('db') && calls.includes('logOutPurchases') && calls.includes('clearAllDrafts'));
  assert.equal(store.pending, true, 'the second pass is still owed: marker kept');
});

test('the sync ends: second pass, marker cleared', async () => {
  const { d, calls, store } = deps();
  assert.equal(await S.afterSignedOut(true, d), true);
  assert.equal(calls.filter((c) => c === 'db').length, 2);
  assert.equal(store.pending, false);
});

test('cold start with no session and the marker: the wipe completes; without the marker nothing happens', async () => {
  const a = deps();
  a.store.pending = true;
  assert.equal(await S.completePendingWipe(a.d, { hasSession: false }), true);
  assert.ok(a.calls.includes('db') && a.calls.includes('clearSeenOnboarding'));
  assert.equal(a.store.pending, false);
  const b = deps();
  assert.equal(await S.completePendingWipe(b.d, { hasSession: false }), false);
  assert.deepEqual(b.calls, []);
  const c = deps();
  c.store.pending = true;
  assert.equal(await S.completePendingWipe(c.d, { hasSession: true }), false, 'someone signed in: their own cross-account guard owns the data');
  assert.ok(!c.calls.includes('db'));
  assert.equal(c.store.pending, false);
});

test('App persists the marker and completes a pending wipe on a cold start', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /setWipePending: \(v\) => \(v \? AsyncStorage\.setItem\(WIPE_PENDING_KEY, '1'\) : AsyncStorage\.removeItem\(WIPE_PENDING_KEY\)\)/);
  assert.match(app, /completePendingWipe\(wipeDeps\(\), \{ hasSession: !!session, sessionUserId: session\?\.user\?\.id \|\| null \}\)/);
});
