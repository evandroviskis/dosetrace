'use strict';
// Final Gate B, G1 (proven by scratchpad/final.cjs): the complete-profile gate's Sign out
// (OnboardingFlowScreen handleSignOut) still armed the intent flag and called supabase.auth.signOut
// itself — offline the flag stayed armed (a later token failure then wiped the phone); online it
// wiped at once with no forced sync and no not-backed-up check. It goes through the one deliberate
// sign-out (signOutIntended) and, since A-119 OD-9, the one flow (lib/settingsSignOut runSignOut)
// and the one sheet (lib/deviceCopy signOutSheet: never blocked, "Sign out anyway").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn } = require('./helpers/extractFn');
const { runSignOut } = require('../lib/settingsSignOut');
const { createBusyGuard } = require('../lib/busyGuard');
const { signOutSheet } = require('../lib/deviceCopy');

const ROOT = path.join(__dirname, '..');
function load(results, guard = createBusyGuard()) {
  const shown = [];
  const calls = [];
  const list = Array.isArray(results) ? [...results] : [results];
  const fn = loadFn('screens/OnboardingFlowScreen.js', '  async function handleSignOut() {', 'handleSignOut', {
    signOutGuard: guard, runSignOut, signOutSheet, t: (k) => k, language: 'en', timeFormat: 'auto',
    signOutIntended: async (opts) => { calls.push(opts && opts.force ? 'force' : 'signOutIntended'); const r = list.length > 1 ? list.shift() : list[0]; if (r instanceof Error) throw r; return r; },
    setSheet: (s) => shown.push(s),
  });
  return { fn, shown, calls };
}

test('changes not backed up (records the server will never accept included): the one sheet, Sign out anyway signs out', async () => {
  const b = load([{ blocked: true, offline: false, summary: { count: 2, byKind: { dose: 2 }, from: null, to: null, refused: 2 }, lastBackup: null }, { blocked: false }]);
  await b.fn();
  const sheet = b.shown[0];
  assert.equal(sheet.title, 'so_title');
  assert.match(sheet.body, /so_refused_many/);
  assert.deepEqual(sheet.buttons.map((x) => x.label), ['settings_signout_stay', 'settings_signout_anyway']);
  await sheet.buttons[1].onPress();
  assert.deepEqual(b.calls, ['signOutIntended', 'force'], 'the same deliberate sign-out, forced on the person\'s choice');
});

test('signed out: nothing shown; offline: the connection words; failed or thrown: Couldn\'t sign out', async () => {
  const ok = load({ blocked: false });
  await ok.fn();
  assert.deepEqual(ok.calls, ['signOutIntended']);
  assert.deepEqual(ok.shown, []);
  const blocked = load({ blocked: true, offline: true, summary: null, lastBackup: null });
  await blocked.fn();
  assert.match(blocked.shown[0].body, /^so_offline/);
  assert.deepEqual(blocked.shown[0].buttons.map((x) => x.label), ['settings_signout_connect_first', 'settings_signout_anyway']);
  for (const r of [{ failed: true }, new Error('boom')]) {
    const f = load(r);
    await f.fn();
    assert.equal(f.shown[0].title, 'settings_signout_failed_title');
    assert.equal(f.shown[0].body, 'settings_signout_failed_body');
  }
});

test('a second tap while signing out does nothing', async () => {
  let release;
  const guard = createBusyGuard();
  const calls = [];
  const fn = loadFn('screens/OnboardingFlowScreen.js', '  async function handleSignOut() {', 'handleSignOut', {
    signOutGuard: guard, runSignOut, signOutSheet, t: (k) => k, language: 'en', timeFormat: 'auto', setSheet: () => {},
    signOutIntended: () => { calls.push('signOutIntended'); return new Promise((r) => { release = () => r({ blocked: false }); }); },
  });
  const first = fn();
  await fn();
  release();
  await first;
  assert.deepEqual(calls, ['signOutIntended']);
});

// Guard: one deliberate sign-out. Only lib/signOutCore (the core) and lib/authIntent (the flag)
// touch the flag or auth.signOut; lib/accountActions only hands the flag to the core.
const ALLOWED_SIGNOUT = {
  // The Apple revoke listener signs out locally WITHOUT the intent flag (no wipe: not a deletion).
  'App.js': 'Apple credential revoked: plain local sign-out, no intent flag, data kept',
};
function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ['node_modules', '__tests__', '.git', 'supabase', 'scripts', 'docs', 'assets', 'ios', 'android', '.expo', 'dist'].includes(e.name) ? [] : files(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}
test('guard: nothing outside lib/signOutCore and lib/authIntent arms the flag or calls auth.signOut', () => {
  const all = ['App.js', ...files('lib'), ...files('screens'), ...files('components')];
  for (const f of all) {
    if (f === 'lib/signOutCore.js' || f === 'lib/authIntent.js') continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /markIntentionalSignOut\(\)/, `${f} arms the intent flag itself`);
    if (!ALLOWED_SIGNOUT[f]) assert.doesNotMatch(src, /auth\.signOut\(/, `${f} calls supabase.auth.signOut directly`);
  }
  const app = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
  assert.equal((app.match(/auth\.signOut\(/g) || []).length, 2, 'only the Apple revoke listener (and its fallback)');
});
