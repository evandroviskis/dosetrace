'use strict';
// A-107 step 2 (journey review AC1, AC5-AC8, AC10): what the daily background refresh may and may not
// do with the app closed. Real code via helpers/extractFn or the CommonJS module.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');

test('AC1: in the background the user is read from the stored session — no network token refresh', async () => {
  let refreshed = 0;
  const stored = { access_token: 'expired', user: { id: 'u1', user_metadata: { dose_reminders: true } } };
  const deps = {
    supabase: { auth: { storageKey: 'sb-x-auth-token', getSession: async () => { refreshed++; return { data: { session: null } }; } } },
    SecureStoreAdapter: { getItem: async (k) => (k === 'sb-x-auth-token' ? JSON.stringify(stored) : null) },
  };
  const readStoredUser = loadFn('lib/supabase.js', 'export async function readStoredUser(', 'readStoredUser', deps);
  assert.equal((await readStoredUser()).id, 'u1');
  const getCachedUser = loadFn('lib/supabase.js', 'export async function getCachedUser(', 'getCachedUser', { ...deps, storedSessionOnly: () => true, readStoredUser });
  assert.equal((await getCachedUser()).id, 'u1');
  assert.equal(refreshed, 0, 'never asks the server');
  const fg = loadFn('lib/supabase.js', 'export async function getCachedUser(', 'getCachedUser', { ...deps, storedSessionOnly: () => false, readStoredUser });
  await fg();
  assert.equal(refreshed, 1, 'the app in the foreground keeps the normal path');
  const none = loadFn('lib/supabase.js', 'export async function readStoredUser(', 'readStoredUser', { ...deps, SecureStoreAdapter: { getItem: async () => null } });
  assert.equal(await none(), null);
});

test('AC6: one resync at a time — calls during a run wait for it and coalesce into ONE more run', async () => {
  let runs = 0; let release;
  const deps = {
    _notifSyncing: null, _rerun: null, _notifSyncedOnce: false, _syncedListeners: new Set(),
    syncAllNotificationsNow: () => { runs++; return runs === 1 ? new Promise((r) => { release = r; }) : Promise.resolve(); },
  };
  const syncAll = loadFn('lib/notifications.js', 'export async function syncAllNotifications(', 'syncAllNotifications', deps);
  const a = syncAll(); const b = syncAll(); const c = syncAll();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(runs, 1, 'no second run while the first is going');
  release();
  await Promise.all([a, b, c]);
  assert.equal(runs, 2, 'exactly one follow-up run for everything asked meanwhile');
});

const R = require('../lib/reminderRefresh');
function deps(over = {}) {
  const log = [];
  return {
    log,
    isWipePending: async () => null,
    ensureDb: () => log.push('db'),
    readStoredUser: async () => ({ id: 'u1' }),
    setBackgroundRun: (v) => log.push(`bg:${v}`),
    syncAllNotifications: async () => log.push('sync'),
    countScheduled: async () => 42,
    saveLastRun: async (r) => log.push(r),
    now: () => 1000,
    ...over,
  };
}

test('AC8: a pending wipe or no stored session → nothing scheduled, and the run is recorded', async () => {
  const d1 = deps({ isWipePending: async () => '1' });
  assert.equal((await R.runReminderRefresh(d1)).reason, 'wipe_pending');
  assert.ok(!d1.log.includes('sync'));
  const d2 = deps({ readStoredUser: async () => null });
  assert.equal((await R.runReminderRefresh(d2)).reason, 'signed_out');
  assert.ok(!d2.log.includes('sync'));
  assert.ok(d2.log.some((x) => x && x.reason === 'signed_out'), 'recorded');
});

test('AC8/AC10: a normal run opens the database, runs in background mode, records when and how many', async () => {
  const d = deps();
  const r = await R.runReminderRefresh(d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.log.slice(0, 4), ['db', 'bg:true', 'sync', 'bg:false']);
  assert.deepEqual(d.log[4], { at: 1000, ok: true, reason: null, scheduled: 42 });
});

test('AC10: a run that throws still leaves background mode and records the failure', async () => {
  const d = deps({ syncAllNotifications: async () => { throw new Error('boom'); } });
  const r = await R.runReminderRefresh(d);
  assert.equal(r.ok, false);
  assert.ok(d.log.includes('bg:false'));
  assert.equal(d.log[d.log.length - 1].reason, 'error');
});

test('AC7: in the background no immediate "vial running low" alert is sent (and it stays owed)', () => {
  const s = read('lib/notifications.js');
  const fn = s.slice(s.indexOf('export async function syncVialAlerts('), s.indexOf('export async function syncCheckinReminder('));
  assert.match(fn, /if \(!_background\) \{[\s\S]*VIAL_LOW_SENT_KEY[\s\S]*trigger: null/, 'the send and its "sent" mark only with the app running');
});

test('AC5: in the background the food access read writes nothing and pushes nothing', () => {
  const f = read('lib/foodLogActions.js');
  assert.match(f, /export async function loadFoodAccess\(uid, \{ persist = true \} = \{\}\)/);
  assert.match(f, /if \(a\.persist && persist\)/);
  assert.match(read('lib/notifications.js'), /loadFoodAccess\(user\?\.id \|\| null, \{ persist: !_background \}\)/);
});

// AC11: iOS keeps no background mode (plugins/withoutIosBackgroundFetch.js). expo-background-task's
// iOS side registers its BGTask identifier at launch — on a real iPhone, without the Info.plist entry
// its plugin adds, that is a crash on open (the simulator skips it). So the package is Android only:
// excluded from iOS autolinking, its plugin not applied, and required only on Android.
test('AC11: the background task is Android only — never linked, configured or loaded on iOS', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.expo && pkg.expo.autolinking && pkg.expo.autolinking.ios && pkg.expo.autolinking.ios.exclude.includes('expo-background-task'), 'excluded from iOS autolinking');
  assert.ok(!read('app.json').includes('"expo-background-task"'), 'its iOS-only plugin is not applied');
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, /Platform\.OS !== 'android'/);
  assert.doesNotMatch(bt, /^import .*expo-background-task/m, 'never imported at the top (it would load the native module on iOS)');
  assert.match(bt, /require\('expo-background-task'\)/);
});

test('A-107: the refresh task is defined at startup and registered from the app (Android)', () => {
  assert.match(read('index.js'), /defineReminderRefreshTask\(\)/);
  assert.match(read('App.js'), /registerReminderRefresh\(\)/);
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, /minimumInterval: REFRESH_MINUTES/);
  assert.match(bt, /runReminderRefresh\(/);
});

// Council 3 QA P1 (2026-10-07): a run with no stored session returned from inside the try without
// leaving background mode — the vial-low alert, food access and the user lookup stayed in background
// mode for the rest of that JS process. Every exit leaves background mode.
test('AC8: every exit leaves background mode (no session, error, normal)', async () => {
  for (const over of [{ readStoredUser: async () => null }, { syncAllNotifications: async () => { throw new Error('x'); } }, {}]) {
    const d = deps(over);
    await R.runReminderRefresh(d);
    const on = d.log.filter((x) => x === 'bg:true').length;
    const off = d.log.filter((x) => x === 'bg:false').length;
    assert.equal(on, 1);
    assert.equal(off, 1, JSON.stringify(d.log));
    assert.ok(d.log.lastIndexOf('bg:false') > d.log.indexOf('bg:true'));
  }
});

test('AC8: the database is marked ready only when it opened', () => {
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, /try \{ initDatabase\(\); dbReady = true; \} catch/);
});
