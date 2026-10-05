'use strict';
// Founder 2026-10-05, Fold 7 (1.3.0 test build, release + R8): no dose reminder for over a week.
// adb: 305 alarms on the phone, none from DoseTrace; every scheduleNotificationAsync failed with
// "java.io.NotSerializableException: org.json.JSONObject" — R8 stripped expo-notifications'
// private writeObject/readObject (its own keep rule is not shipped as a consumer rule), so Java
// fell back to serializing the JSONObject body. The headless app loader that runs "Mark as taken"
// with the app closed was stripped too (ClassNotFoundException RNHeadlessAppLoader).
// The app now ships the keep rules itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app.json').expo;

const props = (app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') || [])[1] || {};
const rules = (props.android && props.android.extraProguardRules) || '';

test('release builds keep expo-notifications and its Java serialization', () => {
  assert.match(rules, /-keep class expo\.modules\.notifications\.\*\* \{ \*; \}/);
  assert.match(rules, /-keepclassmembers class \* implements java\.io\.Serializable \{/);
  assert.match(rules, /private void writeObject\(java\.io\.ObjectOutputStream\);/);
  assert.match(rules, /private void readObject\(java\.io\.ObjectInputStream\);/);
});

test('release builds keep the headless app loader (notification actions with the app closed)', () => {
  assert.match(rules, /-keep class expo\.modules\.adapters\.react\.apploader\.\*\* \{ \*; \}/);
  assert.match(rules, /-keep class expo\.modules\.taskManager\.\*\* \{ \*; \}/);
});

test('minify stays on (the rules are what make it safe)', () => {
  assert.equal(props.android.enableMinifyInReleaseBuilds, true);
});
