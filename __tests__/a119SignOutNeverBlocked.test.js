'use strict';
// A-119 OD-9 (founder 2026-10-15: "se ela quer sair, ela tem que sair"; DL-107 / DL-108): the
// deliberate sign-out is never blocked — from Settings, the 18+ sheet, the profile gate and the
// reset-link account switch. With unsent changes the app first tries to send; what is still unsent
// opens ONE sheet (lib/deviceCopy signOutSheet: what happened, what and how many, records the server
// will never accept, the last full backup, "sign in on the new phone") with "Sign out anyway" and a
// way to stay. With nothing unsent the sign-out goes as today and releases the account on the server.
// Replaces the old blocked words and the separate discard sheet (rebuild = replace).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signOutCore } = require('../lib/signOutCore');
const { runSignOut } = require('../lib/settingsSignOut');
const { createBusyGuard } = require('../lib/busyGuard');
const { loadFn } = require('./helpers/extractFn');
const { signOutSheet } = require('../lib/deviceCopy');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tr = (() => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
})();

function deps(counts, extra = {}) {
  const calls = [];
  let i = 0;
  return {
    calls,
    d: {
      auth: { signOut: async () => { calls.push('signOut'); return { error: null }; }, getSession: async () => ({ data: { session: null }, error: null }) },
      forceSync: async () => calls.push('sync'),
      pendingCount: async () => { const v = counts[Math.min(i, counts.length - 1)]; i++; calls.push(`count:${v}`); if (v instanceof Error) throw v; return v; },
      isOnline: () => true,
      removePushToken: async () => calls.push('token'),
      restorePushToken: async () => calls.push('token-back'),
      signOutGoogle: async () => calls.push('google'),
      releaseDevice: async () => calls.push('release'),
      intent: { mark: () => calls.push('mark'), consume: () => false },
      ...extra,
    },
  };
}

test('DL-108: nothing unsent → the account is released on the server before signing out', async () => {
  const h = deps([0, 0]);
  assert.deepEqual(await signOutCore(h.d), { blocked: false });
  assert.deepEqual(h.calls, ['sync', 'count:0', 'token', 'count:0', 'release', 'mark', 'google', 'signOut']);
});

test('DL-108: a release that fails never stops the sign-out', async () => {
  const h = deps([0, 0], { releaseDevice: async () => { throw new Error('offline'); } });
  assert.deepEqual(await signOutCore(h.d), { blocked: false });
  assert.ok(h.calls.includes('signOut'));
});

test('unsent changes → the person decides (nothing signed out yet, nothing released); "Sign out anyway" signs out without releasing', async () => {
  const h = deps([3]);
  const r = await signOutCore(h.d);
  assert.equal(r.blocked, true);
  assert.ok(!h.calls.includes('release') && !h.calls.includes('mark'));
  const f = deps([3]);
  assert.deepEqual(await signOutCore({ ...f.d, force: true }), { blocked: false });
  assert.ok(!f.calls.includes('release'), 'the next phone then says what may be missing (screen 1)');
  assert.ok(f.calls.includes('signOut'));
});

test('Settings, the 18+ sheet, the profile gate and the reset link: one flow; the sheet always offers Sign out anyway', async () => {
  const results = [{ blocked: true, offline: false, summary: { count: 2, byKind: { dose: 2 }, from: '2026-10-12', to: '2026-10-12', refused: 1 }, lastBackup: null }, { blocked: false }];
  const calls = [];
  const shown = [];
  const outcome = await runSignOut({
    signOut: async (opts) => { calls.push(opts || {}); return results.shift(); },
    guard: createBusyGuard(),
    onFailed: () => shown.push('failed'),
    onBlocked: (r, anyway) => shown.push({ r, anyway }),
  });
  assert.equal(outcome, 'blocked');
  const { r, anyway } = shown[0];
  assert.equal(r.summary.count, 2, 'the sheet gets the count, kinds, dates and refused rows');
  const t = (k) => tr.en[k];
  const sheet = signOutSheet({ t, language: 'en', offline: r.offline, summary: r.summary, lastBackup: r.lastBackup, onAnyway: anyway, onStay: () => {} });
  assert.deepEqual(sheet.buttons.map((b) => [b.label, b.kind]), [['Stay signed in', 'secondary'], ['Sign out anyway', 'danger']]);
  assert.match(sheet.body, /One of them belongs to a protocol deleted forever on another device/);
  await sheet.buttons[1].onPress();
  assert.deepEqual(calls, [{}, { force: true }]);
});

test('every entry point uses the one flow and the one sheet; none blocks, none keeps the separate discard sheet', () => {
  for (const f of ['screens/SettingsScreen.js', 'screens/AgeConfirmScreen.js', 'screens/OnboardingFlowScreen.js', 'App.js']) {
    const s = read(f);
    assert.match(s, /runSignOut\(\{/, `${f}: the one flow`);
    assert.match(s, /signOutSheet\(\{/, `${f}: the one sheet`);
    assert.doesNotMatch(s, /signOutOutcome|blockedCopy|orphanedSheet\(\{\s*t, count: n, title: t\('settings_signout'\)/, `${f}: the old blocked words / discard sheet are gone`);
  }
  assert.doesNotMatch(read('lib/signOutCore.js'), /function blockedCopy|function signOutOutcome/);
});

test('kept from Gate B F3 / F7: the internet is named only when the phone is offline; no answer is never "done"', async () => {
  const t = (k) => tr.en[k];
  const first = (offline) => signOutSheet({ t, language: 'en', offline, summary: { count: 1, byKind: { dose: 1 }, from: null, to: null, refused: 0 }, lastBackup: null }).body.split('\n')[0];
  assert.equal(first(true), 'This phone has no internet connection.');
  assert.equal(first(false), "This phone is connected, but the backup didn't finish.");
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(tr[l].so_online, /sin internet|sem internet|no internet|sans internet|ohne Internet|senza internet/i, l);
  // signOutCore: unknown connectivity (null) is not "offline".
  const h = deps([2], { isOnline: () => null });
  assert.deepEqual(await signOutCore(h.d), { blocked: true, offline: false });
  for (const r of [null, {}, { ok: true }]) {
    const shown = [];
    const o = await runSignOut({ signOut: async () => r, guard: createBusyGuard(), onFailed: () => shown.push('failed'), onBlocked: () => shown.push('blocked') });
    assert.equal(o, 'failed', JSON.stringify(r));
    assert.deepEqual(shown, ['failed']);
  }
});

test('the old blocked words are removed in every language (rebuild = replace)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['settings_signout_unsynced_body', 'settings_signout_notbacked_body', 'auth_signout_unsynced', 'auth_signout_notbacked', 'reset_switch_offline', 'reset_switch_notbacked']) {
      assert.equal(tr[l][k], undefined, `${l}.${k}`);
    }
    for (const k of ['settings_signout_anyway', 'settings_signout_stay', 'settings_signout_connect_first', 'settings_signout_failed_title', 'settings_signout_failed_body']) assert.ok(tr[l][k], `${l}.${k}`);
  }
});

test('the profile gate: unsent → the sheet with Sign out anyway (forced on tap); signed out → nothing; failed → Couldn\'t sign out', async () => {
  const shown = [];
  const calls = [];
  const results = [{ blocked: true, offline: true, summary: { count: 1, byKind: { dose: 1 }, from: '2026-10-12', to: '2026-10-12', refused: 0 }, lastBackup: '2026-10-11T10:00:00.000Z' }, { blocked: false }];
  const fn = loadFn('screens/OnboardingFlowScreen.js', '  async function handleSignOut() {', 'handleSignOut', {
    signOutGuard: createBusyGuard(), runSignOut, signOutSheet, t: (k) => tr.en[k] || k, language: 'en', timeFormat: 'auto',
    signOutIntended: async (opts) => { calls.push(opts || {}); return results.shift(); },
    setSheet: (s) => shown.push(s),
  });
  await fn();
  assert.equal(shown[0].title, 'Changes not backed up yet');
  assert.match(shown[0].body, /^This phone has no internet connection\./);
  await shown[0].buttons[1].onPress();
  assert.deepEqual(calls, [{}, { force: true }]);
  const failed = [];
  const f2 = loadFn('screens/OnboardingFlowScreen.js', '  async function handleSignOut() {', 'handleSignOut', {
    signOutGuard: createBusyGuard(), runSignOut, signOutSheet, t: (k) => k, language: 'en', timeFormat: 'auto',
    signOutIntended: async () => ({ failed: true }), setSheet: (s) => failed.push(s),
  });
  await f2();
  assert.equal(failed[0].title, 'settings_signout_failed_title');
});
