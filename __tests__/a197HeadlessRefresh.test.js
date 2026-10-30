'use strict';
// A-197 fix 2 (founder 2026-10-28, "pode fazer a correção 2"): on Android the reminder refresh runs as
// a React Native headless JS task started by our own WorkManager worker (modules/dt-exact-alarm
// HeadlessRefreshWorker) — with the app alive in the background, expo-background-task's event to JS
// was lost and JS timers stayed paused, so a replaced phone kept every reminder. A binary without the
// new native function (store 1.3.0, test vc62 receiving this JS by EAS Update) keeps the old path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const { planRefreshRegistration } = require('../lib/headlessRefreshPlan');

test('A-197: with the native headless refresh the worker is scheduled and the old expo task is unregistered', () => {
  assert.deepEqual(planRefreshRegistration({ android: true, hasHeadless: true }), { headless: true, expo: false, unregisterExpo: true });
});

test('A-197: a binary without the new native function keeps expo-background-task (EAS Update safety)', () => {
  assert.deepEqual(planRefreshRegistration({ android: true, hasHeadless: false }), { headless: false, expo: true, unregisterExpo: false });
});

test('A-197: nothing is registered on iOS', () => {
  assert.deepEqual(planRefreshRegistration({ android: false, hasHeadless: true }), { headless: false, expo: false, unregisterExpo: false });
});

test('A-197: index.js registers the headless task under the worker\'s key, before the app mounts', () => {
  const src = read('index.js');
  const worker = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/HeadlessRefreshWorker.kt');
  const key = /TASK_KEY = "([^"]+)"/.exec(worker)[1];
  assert.equal(key, 'DoseTraceReminderRefresh');
  assert.match(src, /registerHeadlessReminderRefresh\(\)/);
  assert.ok(src.indexOf('registerHeadlessReminderRefresh()') < src.indexOf('registerRootComponent(App)'));
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, new RegExp(`registerHeadlessTask\\('${key}'`));
});

test('A-197: the worker runs a headless JS task (timers run) and the update receiver uses it', () => {
  const worker = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/HeadlessRefreshWorker.kt');
  assert.match(worker, /HeadlessJsTaskContext\.getInstance\(context\)/);
  assert.match(worker, /startTask\(HeadlessJsTaskConfig\(TASK_KEY/);
  assert.match(worker, /NetworkType\.CONNECTED/);
  const receiver = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/RefreshOnUpdateReceiver.kt');
  assert.match(receiver, /HeadlessRefreshWorker\.runOnce/);
  assert.doesNotMatch(receiver, /BackgroundTaskWork/);
});

// Senior review of db739a2 (2026-10-28), each point pinned.
const W = () => read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/HeadlessRefreshWorker.kt');

test('A-197 review 1: the module depends on react-android (it imports com.facebook.react.*)', () => {
  assert.match(read('modules/dt-exact-alarm/android/build.gradle'), /implementation 'com\.facebook\.react:react-android'/);
});

test('A-197 review 2: the headless refresh never runs in the foreground (takeover screens race)', () => {
  assert.match(W(), /HeadlessJsTaskConfig\(TASK_KEY, Arguments\.createMap\(\), TASK_TIMEOUT_MS, false\)/);
});

test('A-197 review 3 + 4: only a React context with a live instance is used; getInstance runs on the UI thread', () => {
  const w = W();
  assert.match(w, /hasActiveReactInstance\(\)/);
  const post = w.slice(w.indexOf('main.post {', w.indexOf('val finished')));
  assert.match(post.slice(0, 400), /HeadlessJsTaskContext\.getInstance\(context\)/);
});

test('A-197 review 5: the expo task is unregistered only when our worker was really scheduled', () => {
  assert.deepEqual(planRefreshRegistration({ android: true, hasHeadless: true, scheduled: false }), { headless: true, expo: true, unregisterExpo: false });
  assert.deepEqual(planRefreshRegistration({ android: true, hasHeadless: true, scheduled: true }), { headless: true, expo: false, unregisterExpo: true });
});

test('A-197 review 6 + 7: after an update the periodic worker is (re)scheduled too, and UPDATE keeps it current', () => {
  assert.match(read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/RefreshOnUpdateReceiver.kt'), /HeadlessRefreshWorker\.schedule\(context, 360\)/);
  assert.match(W(), /ExistingPeriodicWorkPolicy\.UPDATE/);
  assert.doesNotMatch(W(), /ExistingPeriodicWorkPolicy\.KEEP/);
});

test('A-197 review 2: the background device check runs in the same per-account queue as claims', () => {
  assert.match(read('lib/deviceFlow.js'), /backgroundCheck\(userId\) \{\s*return serial\(userId, async \(\) => \{/);
});

test('A-197 review 15: no dead cancelRefresh in the native module', () => {
  assert.doesNotMatch(read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt'), /cancelRefresh/);
});

// Fold 2026-10-30 (local debug APK): the run finished in ~2 s but the worker waited its full 120 s,
// because React Native's NativeHeadlessJsTaskSupport is null in this app's JS ("support module",
// false), so AppRegistry never tells native the task ended. Our task tells the worker itself.
test('A-197 2026-10-30: the headless task tells the worker it finished, also when the run fails', () => {
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, /registerHeadlessTask\('DoseTraceReminderRefresh', \(\) => async \(\) => \{\s*try \{ await refreshNow\(\); \} finally \{ headlessRefreshDone\(\); \}/);
  const mod = read('modules/dt-exact-alarm/index.js');
  assert.match(mod, /export function headlessRefreshDone\(\) \{\s*if \(!Native \|\| !Native\.headlessRefreshDone\) return;/);
  assert.match(read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt'), /Function\("headlessRefreshDone"\) \{\s*HeadlessRefreshWorker\.notifyDone\(\)/);
  const w = W();
  assert.match(w, /fun notifyDone\(\)/);
  // The worker ends the RN task itself (timers pause again) once JS says it is done.
  assert.match(w, /isTaskRunning\(taskId\)\) t\.finishTask\(taskId\)/);
});
