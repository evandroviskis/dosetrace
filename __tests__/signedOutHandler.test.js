'use strict';
// Gate B 2026-10-03 F5: on SIGNED_OUT (lib/signedOut, run by App's auth callback):
//   • the synchronous part clears a queued notification-tap navigation (pendingNavRef), so a tap
//     queued for account A never opens a screen after B signs in; it stays ref writes / pure reads
//     only (the callback must never await or call supabase);
//   • the intentional wipe also removes the notifications already shown in Notification Center
//     (dismissAllNotificationsAsync), not only the scheduled ones — a delivered "Testosterone 0.5 ml"
//     banner must not stay on the phone for the next account.
// Behaviour tests with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { onSignedOutNow, afterSignedOut } = require('../lib/signedOut');

function syncDeps(intentional) {
  const calls = [];
  return {
    calls,
    d: {
      pendingNavRef: { current: { screen: 'Protocols', params: { id: 'p1' } } },
      endStashFreshness: () => calls.push('fresh'),
      consumeIntentionalSignOut: () => { calls.push('consume'); return intentional; },
      discardStashNow: () => calls.push('discard'),
      clearAuthDraft: () => calls.push('draft'),
      setSeenOnboarding: (v) => calls.push(`seen:${v}`),
    },
  };
}

test('any SIGNED_OUT clears the queued notification navigation, synchronously', () => {
  for (const intentional of [true, false]) {
    const { d } = syncDeps(intentional);
    const r = onSignedOutNow(d);
    assert.equal(r, intentional);
    assert.equal(d.pendingNavRef.current, null, `intentional=${intentional}`);
  }
});

test('the synchronous part returns no promise (nothing awaited inside the auth callback)', () => {
  const { d, calls } = syncDeps(true);
  const r = onSignedOutNow(d);
  assert.equal(typeof r, 'boolean');
  assert.deepEqual(calls, ['fresh', 'consume', 'discard', 'draft', 'seen:false']);
  const s = syncDeps(false);
  onSignedOutNow(s.d);
  assert.deepEqual(s.calls, ['fresh', 'consume'], 'a spurious sign-out keeps the answers and the route');
});

function wipeDeps({ busy = false } = {}) {
  const calls = [];
  let release;
  const idle = busy ? new Promise((r) => { release = () => { calls.push('idle'); r(); }; }) : Promise.resolve();
  const step = (name) => () => { calls.push(name); return Promise.resolve(); };
  return {
    calls,
    release: () => release && release(),
    d: {
      stopSyncEngine: () => calls.push('stop'),
      waitForSyncIdle: () => idle,
      clearLocalDatabase: () => calls.push('db'),
      cancelAllNotifications: step('cancel'),
      dismissAllNotifications: step('dismiss'),
      logOutPurchases: step('purchases'),
      clearOnboarding: step('onboarding'),
      removeRcStart: step('rc'),
      clearRealityDeviceFlags: step('reality'),
      clearSeenOnboarding: step('seen'),
      removeQuestions: step('questions'),
      resetAllSelections: () => calls.push('selections'),
      clearAllDrafts: () => calls.push('drafts'),
    },
  };
}

test('intentional: scheduled AND delivered notifications are removed at once; the database again after a running sync ends', async () => {
  // Gate B round 3 N2: the wipe no longer waits (a stuck sync could delay it forever); the
  // database is cleared once more after the running pass, in case it wrote rows meanwhile.
  const w = wipeDeps({ busy: true });
  const p = afterSignedOut(true, w.d);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(w.calls.includes('db') && w.calls.includes('cancel') && w.calls.includes('dismiss'), 'wiped at once');
  w.release();
  assert.equal(await p, true);
  assert.ok(w.calls.lastIndexOf('db') > w.calls.indexOf('idle'), 'second pass after the sync');
});

test('spurious: nothing is wiped and the delivered notifications stay', async () => {
  const w = wipeDeps();
  assert.equal(await afterSignedOut(false, w.d), false);
  assert.deepEqual(w.calls, ['stop']);
});

test('a failing step never stops the rest of the wipe', async () => {
  const w = wipeDeps();
  w.d.clearLocalDatabase = () => { throw new Error('locked'); };
  w.d.cancelAllNotifications = () => Promise.reject(new Error('x'));
  assert.equal(await afterSignedOut(true, w.d), true);
  assert.ok(w.calls.includes('dismiss') && w.calls.includes('drafts'));
});

test('App runs both parts and lib/notifications dismisses delivered notifications', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /const intentional = onSignedOutNow\(\{/);
  assert.match(app, /setTimeout\(\(\) => \{ afterSignedOut\(intentional, wipeDeps\(\)\)/);
  assert.match(app, /dismissAllNotifications,/);
  const n = fs.readFileSync(path.join(__dirname, '../lib/notifications.js'), 'utf8');
  assert.match(n, /export async function dismissAllNotifications\(\) \{[\s\S]{0,200}dismissAllNotificationsAsync\(\)/);
});
