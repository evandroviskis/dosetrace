'use strict';
// S-13 / RL-3: the iOS build declares its 6 languages, so iOS (and the App Store page)
// lists them and system dialogs follow the app language.
const test = require('node:test');
const assert = require('node:assert/strict');

test('S-13: app.json ios.infoPlist declares CFBundleLocalizations en, es, pt, fr, de, it', () => {
  const app = require('../app.json');
  assert.deepEqual(app.expo.ios.infoPlist.CFBundleLocalizations, ['en', 'es', 'pt', 'fr', 'de', 'it']);
  assert.equal(app.expo.ios.infoPlist.CFBundleDevelopmentRegion, 'en');
});
