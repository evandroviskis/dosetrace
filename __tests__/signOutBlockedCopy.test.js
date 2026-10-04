'use strict';
// Gate B F3 (MEDIUM): a row the server will never accept (or a child whose protocol has no cloud
// id) stays "not backed up" forever, and the sign-out then blamed the internet even online. The
// connection is named only when the phone is actually offline (isOnlineNow() === false);
// otherwise "Some changes could not be backed up." with the same two choices.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signOutCore, blockedCopy } = require('../lib/signOutCore');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

const deps = (online) => ({
  auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }) },
  forceSync: async () => {}, pendingCount: () => 1, isOnline: () => online,
  removePushToken: async () => {}, signOutGoogle: async () => {}, intent: { mark() {}, consume() { return false; } },
});

test('a block says whether the phone is offline (unknown connectivity is not "offline")', async () => {
  assert.deepEqual(await signOutCore(deps(false)), { blocked: true, offline: true });
  assert.deepEqual(await signOutCore(deps(true)), { blocked: true, offline: false });
  assert.deepEqual(await signOutCore(deps(null)), { blocked: true, offline: false });
});

test('the words follow the cause, for Settings, the 18+ sheet and the reset link', () => {
  assert.deepEqual(blockedCopy({ offline: true }), { settingsBody: 'settings_signout_unsynced_body', stay: 'settings_signout_connect_first', sheet: 'auth_signout_unsynced', link: 'offline' });
  assert.deepEqual(blockedCopy({ offline: false }), { settingsBody: 'settings_signout_notbacked_body', stay: 'settings_signout_stay', sheet: 'auth_signout_notbacked', link: 'notbacked' });
});

test('the online wording never mentions the internet, in six languages', () => {
  const net = /internet|connexion|Internet|conexión|conexão/i;
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['settings_signout_notbacked_body', 'settings_signout_stay', 'auth_signout_notbacked', 'reset_switch_notbacked']) {
      assert.ok(tr[l][k], `${l} ${k}`);
      assert.doesNotMatch(tr[l][k], net, `${l} ${k}`);
    }
  }
  assert.match(tr.en.settings_signout_notbacked_body, /^Some changes could not be backed up\./);
});

test('the screens use blockedCopy', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('screens/SettingsScreen.js'), /blockedCopy\(r\)/);
  assert.match(read('screens/AgeConfirmScreen.js'), /blockedCopy\(r\)\.sheet/);
  assert.match(read('App.js'), /blockedCopy\(r\)\.link/);
});
