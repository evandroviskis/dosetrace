'use strict';
// A-111 (found on the founder's Fold 2026-10-07): the Play update 47 -> 48 left 8 of 245 alarms —
// expo-notifications re-arms after an update from its own store, which silently dropped every dose
// reminder. A reboot on the same version restored them all (238 after reboot, app not opened). The app
// must not depend on that store: after an update (and a reboot) Android runs the app's own reminder
// refresh headless, which rebuilds every reminder from the app's data (non-destructive scheduling).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');

const MOD = 'modules/dt-exact-alarm/android';

test('A-111: the module declares a receiver for app updates and reboots', () => {
  const m = read(`${MOD}/src/main/AndroidManifest.xml`);
  assert.match(m, /<receiver[^>]*android:name="expo\.modules\.dtexactalarm\.RefreshOnUpdateReceiver"/);
  assert.match(m, /android:exported="false"/);
  assert.match(m, /android\.intent\.action\.MY_PACKAGE_REPLACED/);
  assert.match(m, /android\.intent\.action\.BOOT_COMPLETED/);
});

test('A-111: the receiver runs the app\'s own refresh now through expo-background-task\'s worker', () => {
  const k = read(`${MOD}/src/main/java/expo/modules/dtexactalarm/RefreshOnUpdateReceiver.kt`);
  assert.match(k, /Intent\.ACTION_MY_PACKAGE_REPLACED/);
  assert.match(k, /Intent\.ACTION_BOOT_COMPLETED/);
  assert.match(k, /"expo\.modules\.backgroundtask\.BackgroundTaskWork"/);
  assert.match(k, /putString\("appScopeKey", context\.packageName\)/);
  assert.match(k, /enqueueUniqueWork\(/);
  assert.match(k, /ExistingWorkPolicy\.REPLACE/);
  assert.doesNotMatch(k, /setRequiredNetworkType/, 'the refresh needs no network (stored session, local data)');
  assert.match(k, /catch \(e: Throwable\)/, 'a missing worker never crashes the receiver');
  const g = read(`${MOD}/build.gradle`);
  assert.match(g, /androidx\.work:work-runtime-ktx:2\.9\.1/);
});

test('A-111: the refresh task the worker runs is the reminder refresh, registered with the task manager', () => {
  const b = read('lib/backgroundTasks.js');
  assert.match(b, /registerTaskAsync\(REFRESH_TASK/);
  assert.match(b, /TaskManager\.defineTask\(REFRESH_TASK/);
  assert.match(read('index.js'), /defineReminderRefreshTask\(\)/);
});

test('A-111: release builds keep the worker class the receiver starts by name', () => {
  assert.match(read('app.json'), /-keep class expo\.modules\.backgroundtask\.\*\* \{ \*; \}/);
});
