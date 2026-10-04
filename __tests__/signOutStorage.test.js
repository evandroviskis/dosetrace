'use strict';
// Gate B round 2, R2:
//   • offline with an expired token, getSession() resolves { session: null, error } while the
//     session is still stored — that is not "signed out": any error counts as still signed in;
//   • a keychain delete that fails was swallowed (SecureStoreAdapter.removeItem), so SIGNED_OUT
//     fired — and the intended wipe ran — while the tokens stayed on the phone. During the
//     deliberate sign-out the adapter now checks the item is really gone and throws otherwise
//     (strict removal): auth-js then emits no SIGNED_OUT, and signOutCore reports { failed: true }.
// Behaviour tests: the real GoTrueClient over a storage whose delete fails, and the adapter's own
// removeItem run with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const { hasSession, signOutCore } = require('../lib/signOutCore');
const { sliceBlock, read } = require('./helpers/extractFn');

test('hasSession: an error from getSession means still signed in', async () => {
  assert.equal(await hasSession({ getSession: async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } }) }), true);
  assert.equal(await hasSession({ getSession: async () => ({ data: { session: null }, error: null }) }), false);
});

function stuckStorageClient() {
  const mem = {};
  let strict = false;
  const storage = {
    getItem: async (k) => mem[k] ?? null,
    setItem: async (k, v) => { mem[k] = v; },
    // the keychain refuses to delete: strict mode reports it, lax mode swallows it (the old bug)
    removeItem: async () => { if (strict) throw new Error('keychain delete failed'); },
  };
  const now = Math.floor(Date.now() / 1000);
  mem['sb-t-auth-token'] = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: 'u', aud: 'authenticated' } });
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'sb-t-auth-token', storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: async () => { throw new TypeError('Network request failed'); } });
  return { c, setStrict: (v) => { strict = v; } };
}

test('a keychain delete that fails: no SIGNED_OUT, nothing wiped, { failed: true }, the flag disarmed', async () => {
  const { c, setStrict } = stuckStorageClient();
  await c.initialize();
  let armed = false;
  const seen = [];
  c.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') seen.push(armed); });
  const r = await signOutCore({
    force: true, auth: c, forceSync: async () => {}, pendingCount: () => 0, isOnline: () => false,
    removePushToken: async () => {}, signOutGoogle: async () => {},
    intent: { mark: () => { armed = true; }, consume: () => { const v = armed; armed = false; return v; } },
    strictStorage: { begin: () => setStrict(true), end: () => setStrict(false) },
  });
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(r, { failed: true });
  assert.deepEqual(seen, [], 'no SIGNED_OUT, so no wipe');
  assert.equal(armed, false);
});

test('SecureStoreAdapter.removeItem: strict mode throws when the item survives the delete; lax mode does not', async () => {
  const block = sliceBlock(read('lib/secureStore.js'), '  removeItem: async (key) => {');
  const make = (left) => new Function('safeKey', 'scDelete', 'scRead', 'AsyncStorage', 'strictRemoval', `return { ${block} };`)(
    (k) => k, async () => {}, async () => left, { removeItem: async () => {} }, () => strictOn);
  let strictOn = true;
  await assert.rejects(make('token').removeItem('k'));
  await make(null).removeItem('k');
  strictOn = false;
  await make('token').removeItem('k');
  assert.match(read('lib/secureStore.js'), /export function setStrictRemoval\(on\)/);
  assert.match(read('lib/accountActions.js'), /strictStorage: \{ begin: \(\) => setStrictRemoval\(true\), end: \(\) => setStrictRemoval\(false\) \}/);
});
