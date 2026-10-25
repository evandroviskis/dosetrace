'use strict';
// A-138 (founder 2026-10-20, picture docs/design/a138-splash.html, option A): the splash sits on the
// app's own ground — light #DDE0DB, dark #121416 (lib/theme.js ground) — with the droplet only, so a
// cold start no longer flashes navy #0C2340 before the A-135 skeleton. iOS and Android both get a dark
// variant (ios.splash.dark / android.splash.dark, read by Expo's prebuild splash plugin); the droplet
// image is the same in both; the app icon and the store icon do not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app.json').expo;
const fs = require('node:fs');
const path = require('node:path');

const themeSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'theme.js'), 'utf8');
const grounds = [...themeSrc.matchAll(/ground: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());

test('A-138: the two ground tokens are the light and dark palettes', () => {
  assert.deepEqual(grounds, ['#DDE0DB', '#121416']);
});

for (const platform of ['ios', 'android']) {
  test(`A-138: ${platform} splash = app ground, light and dark, droplet only`, () => {
    const s = app[platform] && app[platform].splash;
    assert.ok(s, `${platform}.splash`);
    assert.equal(String(s.backgroundColor).toUpperCase(), grounds[0]);
    assert.equal(s.image, './assets/splash-icon.png');
    assert.ok(s.dark, `${platform}.splash.dark`);
    assert.equal(String(s.dark.backgroundColor).toUpperCase(), grounds[1]);
    assert.equal(s.dark.image, './assets/splash-icon.png');
  });
}

test('A-138: no navy splash left; the app icon is unchanged', () => {
  assert.notEqual(String(app.splash.backgroundColor).toUpperCase(), '#0C2340');
  assert.equal(app.icon, './assets/icon.png');
  assert.equal(app.android.adaptiveIcon.backgroundColor, '#0C2340'); // icon, not the splash
  assert.equal(app.userInterfaceStyle, 'automatic'); // the dark splash follows the phone
});

// Release review 2026-10-21: without the expo-splash-screen plugin, prebuild takes the LEGACY Android
// path (windowBackground layer-list), so Android 12+ (the Fold) shows the system splash with the navy
// launcher icon before the ground appears. The plugin, with the same image and both grounds, gives the
// Android 12+ splash API its background and dark variant; iOS reads the same props.
test('A-138: the expo-splash-screen plugin carries the droplet on both grounds (Android 12+ splash API)', () => {
  const entry = (app.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(entry, 'expo-splash-screen plugin entry');
  const c = entry[1];
  assert.equal(c.image, './assets/splash-icon.png');
  assert.equal(c.imageWidth, 200);
  assert.equal(String(c.backgroundColor).toUpperCase(), grounds[0]);
  assert.equal(String(c.dark.backgroundColor).toUpperCase(), grounds[1]);
  assert.equal(c.dark.image, './assets/splash-icon.png');
  assert.ok(require('../package.json').dependencies['expo-splash-screen'], 'dependency installed');
});
