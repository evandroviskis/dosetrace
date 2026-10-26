'use strict';
// AD-88 (founder 2026-10-15, Q11 (a) = A; 2026-10-20 "the permission ask after protocols arrive on
// a new phone"): no notification-permission request at app open; it is asked when a protocol with a
// reminder time is first saved on the phone or ARRIVES on it by sync / import (a new phone, a
// reinstall — the iPhone case, where the SP-5 setup screen does not exist). PA rows of
// docs/specs/ad87a-ad88.md. Runs the REAL askPermissionForArrivedProtocols → askPermissionForReminders
// → askNotificationPermission chain (helpers/extractFn) with a fake phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');

const memStore = (init = {}) => { const m = { ...init }; return { m, getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = String(v); } }; };

// A phone: its OS permission state (the OS stores the answer, as iOS does) and what the import brought.
function phone({ status = 'undetermined', protocols = [], verdict = null, user = { id: 'u1' }, answer = 'granted' } = {}) {
  const st = { status, dialogs: 0, resyncs: 0, tokens: 0 };
  const N = {
    getPermissionsAsync: async () => ({ status: st.status }),
    requestPermissionsAsync: async () => { st.dialogs++; st.status = answer; return { status: answer }; },
  };
  const askNotificationPermission = loadFn('lib/notifications.js', 'export async function askNotificationPermission(', 'askNotificationPermission', {
    getNotifications: () => N, AsyncStorage: memStore(verdict ? { V: verdict } : {}), DEVICE_VERDICT_KEY: 'V', _askInFlight: null,
    syncAllNotifications: async () => { st.resyncs++; }, registerPushToken: async () => { st.tokens++; },
  });
  const askPermissionForReminders = loadFn('lib/notifications.js', 'export async function askPermissionForReminders(', 'askPermissionForReminders', {
    askNotificationPermission, reminderTimes: plan.reminderTimes,
  });
  const arrived = loadFn('lib/notifications.js', 'export async function askPermissionForArrivedProtocols(', 'askPermissionForArrivedProtocols', {
    getCachedUser: async () => user, getActiveProtocols: (uid) => (uid === 'u1' ? protocols : []), askPermissionForReminders,
  });
  return { st, arrived };
}
const TIMED = [{ id: 1, user_id: 'u1', reminder_time: '08:00' }, { id: 2, user_id: 'u1', reminder_time: '09:00,21:00' }];

test('PA-1: new phone / reinstall ("Not now" or never asked here) + the import brings timed protocols → the system dialog once', async () => {
  const p = phone({ protocols: TIMED });
  assert.equal(await p.arrived(), true);
  assert.equal(p.st.dialogs, 1);
  // The next sync passes find the answer stored by the OS: never a second dialog.
  await p.arrived(); await p.arrived();
  assert.equal(p.st.dialogs, 1);
});
test('PA-2: allowed → the reminders are planned and the push token registered right away', async () => {
  const p = phone({ protocols: TIMED });
  await p.arrived();
  assert.equal(p.st.resyncs, 1);
  assert.equal(p.st.tokens, 1);
  const denied = phone({ protocols: TIMED, answer: 'denied' });
  await denied.arrived();
  assert.equal(denied.st.dialogs, 1);
  assert.equal(denied.st.resyncs, 0, 'denied: nothing to plan');
  await denied.arrived();
  assert.equal(denied.st.dialogs, 1, 'denied is an answer too: never asked again');
});
test('PA-3: nothing arrived (a new account, no protocol yet) → no dialog; it waits for the first save or arrival', async () => {
  const p = phone({ protocols: [] });
  assert.equal(await p.arrived(), false);
  assert.equal(p.st.dialogs, 0);
  const signedOut = phone({ protocols: TIMED, user: null });
  assert.equal(await signedOut.arrived(), false);
  assert.equal(signedOut.st.dialogs, 0);
});
test('PA-4: the phone already answered (onboarding "Never miss a dose", 1.3.0, the system dialog) → no dialog', async () => {
  for (const status of ['granted', 'denied']) {
    const p = phone({ status, protocols: TIMED });
    assert.equal(await p.arrived(), false, status);
    assert.equal(p.st.dialogs, 0, status);
  }
});
test('PA-5: a phone that lost the account (A-119 verdict) → no dialog', async () => {
  const p = phone({ protocols: TIMED, verdict: 'replaced' });
  await p.arrived();
  assert.equal(p.st.dialogs, 0);
});
test('PA-6: the sync listener asks on an import or a sync that was not refused, at most once a minute; app open and sign-in never ask', () => {
  const app = read('App.js');
  const listener = app.slice(app.indexOf('const unsubSyncForFood = addSyncListener('), app.indexOf('const unsubSyncForFood = addSyncListener(') + 2400);
  assert.match(listener, /e\?\.type !== 'sync_complete' && e\?\.type !== 'import_complete'/);
  assert.match(listener, /if \(!e\.refused && nowTs - lastPermissionAsk > 60000\) \{ lastPermissionAsk = nowTs; askPermissionForArrivedProtocols\(\)\.catch/);
  assert.doesNotMatch(app, /requestNotificationPermissions|requestPermissionsAsync/, 'App.js never asks by itself');
  assert.doesNotMatch(sliceBlock(read('lib/notifications.js'), 'export async function registerPushToken('), /requestPermissionsAsync/);
  // The import notifies its listeners (lib/sync fullImportFromCloud) after the data is in.
  assert.match(sliceBlock(read('lib/sync.js'), 'export async function fullImportFromCloud('), /notifyListeners\(\{ type: 'import_complete' \}\)/);
});
test('PA-7: the same ask as a protocol saved on the phone — the one askNotificationPermission (system dialog, no new screen or copy)', () => {
  const src = read('lib/notifications.js');
  assert.match(sliceBlock(src, 'export async function askPermissionForArrivedProtocols('), /askPermissionForReminders\(getActiveProtocols\(user\.id\) \|\| \[\]\)/);
  assert.match(sliceBlock(src, 'export async function askPermissionForReminders('), /return askNotificationPermission\(\);/);
  assert.match(sliceBlock(src, 'export async function afterProtocolChange('), /askPermissionForReminders\(\[saved\]\)/);
  assert.match(sliceBlock(src, 'export async function askNotificationPermission('), /if \(status !== 'undetermined'\) return false;/);
});
