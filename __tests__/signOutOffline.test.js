'use strict';
// Gate B review of 9b12176..376cf45, F1 (HIGH, proven with the installed auth-js 2.101.1):
// signOut({ scope: 'local' }) still POSTs /logout; offline it RESOLVES { error }
// (AuthRetryableFetchError), keeps the session and emits no SIGNED_OUT — so the old code returned
// success while the user stayed signed in, and the "intentional" flag stayed armed: a later
// token-failure SIGNED_OUT was then taken as intentional and wiped the phone (doses logged offline
// included). Now (lib/signOutCore):
//   • the sign-out is completed ON THE PHONE when /logout cannot be reached: the stored session is
//     removed under the auth lock (auth-js _removeSession, pinned below against the installed
//     version), which emits SIGNED_OUT so the intended wipe runs;
//   • if the phone still has a session afterwards, the flag is disarmed and { failed: true } comes
//     back (the screens say "Couldn't sign out"); never success while still signed in.
// Behaviour tests: the real GoTrueClient with an offline fetch, and fakes for the rest.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GoTrueClient } = require('@supabase/auth-js');
const authPkg = require('@supabase/auth-js/package.json');
const { completeLocalSignOut, signOutCore } = require('../lib/signOutCore');

function realClient({ online = false } = {}) {
  const mem = {};
  const storage = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const now = Math.floor(Date.now() / 1000);
  mem['sb-test-auth-token'] = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: 'user-A', aud: 'authenticated' } });
  const state = { online };
  const fetchImpl = async () => { if (!state.online) throw new TypeError('Network request failed'); return new Response(null, { status: 204 }); };
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'sb-test-auth-token', storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: fetchImpl });
  return { c, mem, state };
}
function intentFlag() {
  let armed = false;
  return { mark: () => { armed = true; }, consume: () => { const v = armed; armed = false; return v; }, get armed() { return armed; } };
}

test('pinned: the installed auth-js keeps the session offline and has the internals we use', async () => {
  assert.equal(authPkg.version, '2.101.1', 'auth-js changed: re-check completeLocalSignOut against it');
  const { c } = realClient();
  await c.initialize();
  const r = await c.signOut({ scope: 'local' });
  assert.ok(r.error, 'offline signOut resolves with an error');
  assert.ok((await c.getSession()).data.session, 'and keeps the session');
  assert.equal(typeof c._removeSession, 'function');
  assert.equal(typeof c._acquireLock, 'function');
});

test('offline: the sign-out completes on the phone, SIGNED_OUT fires once and finds the flag armed', async () => {
  const { c, mem } = realClient();
  await c.initialize();
  const intent = intentFlag();
  const seen = [];
  c.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') seen.push(intent.consume()); });
  intent.mark();
  const r = await completeLocalSignOut(c);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.signedOut, true);
  assert.equal((await c.getSession()).data.session, null);
  assert.equal(mem['sb-test-auth-token'], undefined, 'stored session removed');
  assert.deepEqual(seen, [true], 'the wipe handler saw an intentional sign-out');
  assert.equal(intent.armed, false);
});

test('online: the normal path, no local removal needed', async () => {
  const { c } = realClient({ online: true });
  await c.initialize();
  const r = await completeLocalSignOut(c);
  assert.deepEqual(r, { signedOut: true, removedLocally: false });
});

test('the session cannot be removed: { failed: true } and the flag is disarmed (never left armed)', async () => {
  const intent = intentFlag();
  const auth = {
    signOut: async () => ({ error: { name: 'AuthRetryableFetchError' } }),
    getSession: async () => ({ data: { session: { user: { id: 'u' } } } }),
  };
  const r = await signOutCore({ force: true, auth, forceSync: async () => {}, pendingCount: () => 0, isOnline: () => false, removePushToken: async () => {}, signOutGoogle: async () => {}, intent });
  assert.deepEqual(r, { failed: true });
  assert.equal(intent.armed, false);
});

test('signOutCore offline with the real client and "Sign out anyway": signed out, flag consumed by SIGNED_OUT', async () => {
  const { c } = realClient();
  await c.initialize();
  const intent = intentFlag();
  let wiped = false;
  c.onAuthStateChange((e) => { if (e === 'SIGNED_OUT' && intent.consume()) wiped = true; });
  const r = await signOutCore({ force: true, auth: c, forceSync: async () => {}, pendingCount: () => 3, isOnline: () => false, removePushToken: async () => {}, signOutGoogle: async () => {}, intent });
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(r, { blocked: false });
  assert.equal(wiped, true);
  assert.equal(intent.armed, false);
});

test('every caller handles { failed: true }: Settings, the 18+ sheet and the reset link', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['screens/SettingsScreen.js', 'screens/AgeConfirmScreen.js']) {
    assert.match(read(f), /r && r\.failed/, f);
    assert.match(read(f), /settings_signout_failed_body/, f);
  }
  assert.match(read('App.js'), /if \(r && \(r\.blocked \|\| r\.failed\)\)/);
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(mod.exports.translations[l].settings_signout_failed_title && mod.exports.translations[l].settings_signout_failed_body, l);
});

test('order: push, count, push token, intent flag, Google, sign-out; a block stops before the flag', async () => {
  const calls = [];
  const intent = { mark: () => calls.push('mark'), consume: () => { calls.push('consume'); return false; } };
  const auth = { signOut: async () => { calls.push('signOut'); return { error: null }; }, getSession: async () => ({ data: { session: null } }) };
  const deps = { auth, forceSync: async () => calls.push('sync'), isOnline: () => true, removePushToken: async () => calls.push('token'), signOutGoogle: async () => calls.push('google'), intent };
  assert.deepEqual(await signOutCore({ ...deps, pendingCount: () => { calls.push('count'); return 0; } }), { blocked: false });
  assert.deepEqual(calls, ['sync', 'count', 'token', 'mark', 'google', 'signOut']);
  calls.length = 0;
  assert.deepEqual(await signOutCore({ ...deps, pendingCount: () => { calls.push('count'); return 2; } }), { blocked: true, offline: false });
  assert.deepEqual(calls, ['sync', 'count'], 'nothing signed out, flag never armed');
});
