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
