'use strict';
// A-46 extension (founder 2026-09-28, target 1.2.6 → 1.3.0) and Settings part 3 (approved
// 2026-09-29): "signing out offline with unsynced changes warns first ('Some changes aren't
// backed up yet … Connect to the internet first', 'Sign out anyway')". Settings' own Sign out
// still pushed and then wiped the phone whatever was left. It now goes through the one deliberate
// sign-out (lib/accountActions signOutIntended): pushed first; if anything is still not in the
// cloud, nobody is signed out and the sheet asks — Connect to the internet first (stay) or Sign
// out anyway (the user's explicit choice, in the risk colour, saying what it removes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, sliceBlock } = require('./helpers/extractFn');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

test('Settings signs out through signOutIntended and asks when changes are not backed up', () => {
  const s = read('screens/SettingsScreen.js');
  const fn = sliceBlock(s, 'async function handleSignOut() {');
  assert.match(fn, /signOutGuard\.run\(\(\) => signOutIntended\(\)\)/);
  assert.match(fn, /if \(r && r\.blocked\)/);
  assert.match(fn, /\{ label: t\(blockedCopy\(r\)\.stay\), kind: 'secondary' \}/);
  assert.match(fn, /\{ label: t\('settings_signout_anyway'\), kind: 'danger', onPress: \(\) => signOutIntended\(\{ force: true \}\)/);
  assert.doesNotMatch(fn, /supabase\.auth\.signOut/, 'no second sign-out path that skips the check');
});

test('signOutIntended({ force: true }) skips the backed-up check (the user chose it); the default still blocks', async () => {
  const { signOutCore } = require('../lib/signOutCore');
  const intent = { mark() {}, consume() { return false; } };
  const auth = { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }) };
  const deps = { auth, forceSync: async () => {}, pendingCount: () => 4, isOnline: () => false, removePushToken: async () => {}, signOutGoogle: async () => {}, intent };
  assert.equal((await signOutCore(deps)).blocked, true);
  assert.deepEqual(await signOutCore({ ...deps, force: true }), { blocked: false });
});

test('the three strings exist in six languages and say what Sign out anyway removes', () => {
  const removes = { en: /removes them/, es: /se borrarán/, pt: /serão apagadas/, fr: /seront supprimées/, de: /gelöscht/, it: /verranno eliminate/ };
  for (const l of Object.keys(removes)) {
    assert.match(tr[l].settings_signout_unsynced_body, removes[l], l);
    assert.ok(tr[l].settings_signout_connect_first && tr[l].settings_signout_anyway, l);
  }
  assert.equal(tr.en.settings_signout_anyway, 'Sign out anyway');
  assert.equal(tr.en.settings_signout_connect_first, 'Connect to the internet first');
});
