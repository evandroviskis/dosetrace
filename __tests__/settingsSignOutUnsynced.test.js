'use strict';
// A-46 extension / Settings part 3 and Gate B 2026-10-03 (F1, F3, F4, F7): Settings' Sign out,
// as behaviour (lib/settingsSignOut with fakes; no source pins). Pushed first; if anything is still
// not in the cloud nobody is signed out and the sheet offers the two choices with the words for
// the cause; "Sign out anyway" signs out on the user's explicit choice; a sign-out the phone could
// not complete says so; a second tap while one runs does nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runSignOut } = require('../lib/settingsSignOut');
const { createBusyGuard } = require('../lib/busyGuard');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

function harness(results) {
  const calls = []; const shown = [];
  const signOut = async (opts) => { calls.push(opts || {}); return results.shift(); };
  return { calls, shown, deps: { signOut, guard: createBusyGuard(), onFailed: () => shown.push('failed'), onBlocked: (copy, anyway) => shown.push({ copy, anyway }) } };
}

test('everything backed up: one sign-out, nothing shown', async () => {
  const h = harness([{ blocked: false }]);
  assert.equal(await runSignOut(h.deps), 'done');
  assert.deepEqual(h.calls, [{}]);
  assert.deepEqual(h.shown, []);
});

test('offline with changes not backed up: the connect-first sheet; Sign out anyway forces it', async () => {
  const h = harness([{ blocked: true, offline: true }, { blocked: false }]);
  assert.equal(await runSignOut(h.deps), 'blocked');
  const { copy, anyway } = h.shown[0];
  assert.equal(copy.settingsBody, 'settings_signout_unsynced_body');
  assert.equal(copy.stay, 'settings_signout_connect_first');
  assert.deepEqual(await anyway(), { blocked: false });
  assert.deepEqual(h.calls, [{}, { force: true }]);
});

test('online but a change could not be backed up: no internet wording', async () => {
  const h = harness([{ blocked: true, offline: false }]);
  await runSignOut(h.deps);
  assert.equal(h.shown[0].copy.settingsBody, 'settings_signout_notbacked_body');
  assert.equal(h.shown[0].copy.stay, 'settings_signout_stay');
});

test('the phone could not sign out (first try or Sign out anyway): "Couldn\'t sign out"', async () => {
  const h = harness([{ failed: true }]);
  assert.equal(await runSignOut(h.deps), 'failed');
  assert.deepEqual(h.shown, ['failed']);
  const h2 = harness([{ blocked: true, offline: true }, { failed: true }]);
  await runSignOut(h2.deps);
  await h2.shown[0].anyway();
  assert.deepEqual(h2.shown.slice(1), ['failed']);
  const h3 = harness([]);
  h3.deps.signOut = async () => { throw new Error('boom'); };
  assert.equal(await runSignOut(h3.deps), 'failed', 'an exception is never success');
});

test('a second tap while signing out does nothing', async () => {
  let release;
  const h = harness([]);
  h.deps.signOut = () => new Promise((r) => { release = () => r({ blocked: false }); });
  const first = runSignOut(h.deps);
  assert.equal(await runSignOut(h.deps), 'busy');
  release();
  assert.equal(await first, 'done');
});

test('Settings uses the flow', () => {
  const s = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');
  assert.match(s, /runSignOut\(\{/);
});

test('the strings exist in six languages and Sign out anyway says what it removes', () => {
  const removes = { en: /removes them/, es: /se borrarán/, pt: /serão apagadas/, fr: /seront supprimées/, de: /gelöscht/, it: /verranno eliminate/ };
  for (const l of Object.keys(removes)) {
    assert.match(tr[l].settings_signout_unsynced_body, removes[l], l);
    assert.match(tr[l].settings_signout_notbacked_body, removes[l], l);
    for (const k of ['settings_signout_connect_first', 'settings_signout_anyway', 'settings_signout_stay']) assert.ok(tr[l][k], `${l} ${k}`);
  }
  assert.equal(tr.en.settings_signout_anyway, 'Sign out anyway');
});
