'use strict';
// Final Gate B, G2: the plain "1" wipe-pending marker could wipe a LATER user's data at a
// no-session cold start (A signs out, the wipe is interrupted, B signs in and out... a cold start
// then wiped whatever was there). The marker now names the account it was for ("wipe:<id>",
// "deleted:<id>"), and a cold start wipes only when the local data has no owner or belongs to that
// account; any sign-in removes the marker (App's deferred SIGNED_IN block).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/signedOut');

function deps(marker) {
  const calls = [];
  const store = { v: marker };
  const d = {
    stopSyncEngine: () => {},
    waitForSyncIdle: () => Promise.resolve(),
    getLocalOwner: () => 'user-A',
    isWipePending: async () => store.v,
    setWipePending: async (v) => { store.v = v === false ? null : v; calls.push(`marker:${v}`); },
    clearLocalDatabase: () => calls.push('db'),
  };
  for (const k of ['cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts']) d[k] = () => {};
  return { d, calls, store };
}

test('the intended sign-out writes a marker naming the local data owner', async () => {
  const h = deps(null);
  await S.afterSignedOut(true, h.d);
  assert.equal(h.calls[0], 'marker:wipe:user-A');
});

test('cold start, no session: wipes only the account the marker names, or data with no owner', async () => {
  const same = deps('wipe:user-A');
  assert.equal(await S.completePendingWipe(same.d, { hasSession: false, localOwnerId: 'user-A' }), true);
  assert.ok(same.calls.includes('db'));
  const none = deps('wipe:user-A');
  assert.equal(await S.completePendingWipe(none.d, { hasSession: false, localOwnerId: null }), true);
  const later = deps('wipe:user-A');
  assert.equal(await S.completePendingWipe(later.d, { hasSession: false, localOwnerId: 'user-B' }), false, 'a later user\'s data is never wiped');
  assert.ok(!later.calls.includes('db'));
  assert.equal(later.store.v, null, 'the stale marker is dropped');
  const legacy = deps('1');
  assert.equal(await S.completePendingWipe(legacy.d, { hasSession: false, localOwnerId: 'user-B' }), false, 'an unnamed marker never wipes someone\'s data');
  const del = deps('deleted:user-A');
  assert.equal(await S.completePendingWipe(del.d, { hasSession: false, localOwnerId: 'user-A' }), true);
});

test('App: the marker names the owner, the cold start passes the owner, a sign-in removes the marker', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /getLocalOwner: \(\) => getLocalDataUserId\(\),/);
  assert.match(app, /localOwnerId: getLocalDataUserId\(\)/);
  const i = app.indexOf("if (_event === 'SIGNED_IN' && session?.user?.id) {");
  const block = app.slice(i, i + 1600);
  assert.match(block, /AsyncStorage\.removeItem\(WIPE_PENDING_KEY\)/);
});
