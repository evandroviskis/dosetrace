'use strict';
// Council 2026-10-01 (senior engineer, backend, regulatory):
// 1) Folding/unfolding the Galaxy Z Fold changes smallestScreenSize; without it in
//    MainActivity's configChanges Android recreates the activity, remounting the whole
//    app (navigation reset, unsaved text lost) before S-26 can move anything (BK-10).
// 2) The cross-account guard (a different user signs in after a spurious sign-out kept
//    local data) wiped SQLite but not the in-memory drafts, open right-page items or the
//    open site questions, so user B could see user A's typed weight (BK-14, S-25).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('BK-10: MainActivity handles smallestScreenSize itself (no activity restart on fold)', () => {
  const { addFoldConfigChanges } = require('../plugins/withFoldConfigChanges');
  const manifest = { manifest: { application: [{ activity: [
    { $: { 'android:name': '.MainActivity', 'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode' } },
    { $: { 'android:name': 'com.other.Activity', 'android:configChanges': 'orientation' } },
  ] }] } };
  addFoldConfigChanges(manifest);
  const main = manifest.manifest.application[0].activity[0].$['android:configChanges'].split('|');
  for (const k of ['smallestScreenSize', 'screenLayout', 'screenSize', 'orientation', 'uiMode', 'keyboard']) assert.ok(main.includes(k), k);
  assert.equal(new Set(main).size, main.length, 'no duplicates');
  assert.equal(manifest.manifest.application[0].activity[1].$['android:configChanges'], 'orientation', 'other activities untouched');
  addFoldConfigChanges(manifest);
  assert.equal(manifest.manifest.application[0].activity[0].$['android:configChanges'].split('|').length, main.length, 'idempotent');
  const plugins = JSON.parse(read('app.json')).expo.plugins;
  assert.ok(plugins.includes('./plugins/withFoldConfigChanges'), 'registered in app.json');
});

test('BK-14 / S-25: the cross-account guard also clears drafts, open items and open site questions', () => {
  const app = read('App.js');
  const marker = 'if (localUid && localUid !== session.user.id) {';
  const starts = [];
  for (let i = app.indexOf(marker); i >= 0; i = app.indexOf(marker, i + 1)) starts.push(i);
  assert.equal(starts.length, 2, 'both guards (cold start and SIGNED_IN)');
  for (const i of starts) {
    const block = app.slice(i, app.indexOf('} catch', i));
    assert.match(block, /clearAllDrafts\(\)/);
    assert.match(block, /resetAllSelections\(\)/);
    assert.match(block, /AsyncStorage\.removeItem\(QUESTIONS_KEY\)/);
  }
});

// Council (release + QA) 2026-10-01: the "preview" (internal) profile had no env, and
// `eas env:list --environment preview` is empty, so an internal APK would crash at launch
// ("supabaseUrl is required"). It carries the same public config as production and builds
// an installable APK.
test('internal builds: the preview profile has the Supabase env and builds an APK', () => {
  const eas = JSON.parse(read('eas.json'));
  const prev = eas.build.preview;
  const prod = eas.build.production;
  assert.equal(prev.distribution, 'internal');
  assert.equal(prev.env && prev.env.EXPO_PUBLIC_SUPABASE_URL, prod.env.EXPO_PUBLIC_SUPABASE_URL);
  assert.equal(prev.env && prev.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, prod.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  assert.equal(prev.android && prev.android.buildType, 'apk');
});
