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

// Council 4: the receiver depends on expo-background-task's class name and input key; an SDK bump
// that renames either would silently bring back 8 of 245 — this test fails first.
test('A-111: expo-background-task still has the worker class and the input key the receiver uses', () => {
  const w = read('node_modules/expo-background-task/android/src/main/java/expo/modules/backgroundtask/BackgroundTaskWork.kt');
  assert.match(w, /package expo\.modules\.backgroundtask/);
  assert.match(w, /class BackgroundTaskWork\(/);
  assert.match(w, /inputData\.getString\("appScopeKey"\)/);
});

test('A-111: the module declares the boot permission itself (not only through expo-notifications)', () => {
  assert.match(read('modules/dt-exact-alarm/android/src/main/AndroidManifest.xml'), /android\.permission\.RECEIVE_BOOT_COMPLETED/);
});
