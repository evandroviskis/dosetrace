'use strict';
// Fold 2026-11-26 (open, book layout): with expo-video in the binary the system resized the app
// window ~80 times a second on EVERY screen (even signed out) and the how-to video showed no picture.
// expo-video pulls androidx.fragment 1.6.2 over the 1.6.1 the rest of the app uses; forcing 1.6.1
// brought it to 0 with the video playing (measured on the Fold). android/ is generated at prebuild,
// so a config plugin keeps the pin in every build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { addFragmentPin, PIN } = require('../plugins/withFragmentPin');

test('the plugin adds the fragment 1.6.1 pin to app/build.gradle once', () => {
  const base = 'android {\n}\n';
  const once = addFragmentPin(base);
  assert.ok(once.includes('force "androidx.fragment:fragment:1.6.1", "androidx.fragment:fragment-ktx:1.6.1"'));
  assert.equal(addFragmentPin(once), once, 'idempotent');
  assert.ok(once.startsWith(base));
  assert.ok(PIN.includes('resolutionStrategy'));
});

test('app.json runs the plugin', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const names = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(names.includes('./plugins/withFragmentPin'));
});
