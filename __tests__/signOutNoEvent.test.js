'use strict';
// Gate B round 3, N1 (proven by scratchpad/round3.cjs): strict removal deletes the keychain
// chunks and then throws when the AsyncStorage copy cannot be removed — auth-js aborts before
// SIGNED_OUT, but getSession now reads nothing, so signOutCore reported success with the flag
// still armed: no wipe, and the user stays on the signed-in screens. The flag still armed after
// the local sign-out means no SIGNED_OUT ran: that is { failed: true } (and the flag is disarmed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { GoTrueClient } = require('@supabase/auth-js');
const { signOutCore } = require('../lib/signOutCore');

function halfRemovingClient() {
  const mem = {};
  const storage = {
    getItem: async (k) => mem[k] ?? null,
    setItem: async (k, v) => { mem[k] = v; },
    removeItem: async (k) => { delete mem[k]; throw new Error('AsyncStorage copy could not be removed'); },
  };
  const now = Math.floor(Date.now() / 1000);
  mem['sb-n1-auth-token'] = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: 'u', aud: 'authenticated' } });
  return new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'sb-n1-auth-token', storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: async () => { throw new TypeError('Network request failed'); } });
}

function flag() {
  let armed = false;
  return { mark: () => { armed = true; }, consume: () => { const v = armed; armed = false; return v; }, get armed() { return armed; } };
}

test('session gone from storage but no SIGNED_OUT: failed, flag disarmed, nothing wiped', async () => {
  const c = halfRemovingClient();
  await c.initialize();
  const intent = flag();
  const wiped = [];
  c.onAuthStateChange((e) => { if (e === 'SIGNED_OUT' && intent.consume()) wiped.push(1); });
  const r = await signOutCore({ force: true, auth: c, forceSync: async () => {}, pendingCount: async () => 0, isOnline: () => false, removePushToken: async () => {}, signOutGoogle: async () => {}, intent });
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(r, { failed: true });
  assert.equal(intent.armed, false);
  assert.deepEqual(wiped, []);
});

test('a normal sign-out: SIGNED_OUT consumed the flag → success', async () => {
  const intent = flag();
  const listeners = [];
  const auth = {
    signOut: async () => { listeners.forEach((l) => l('SIGNED_OUT')); return { error: null }; },
    getSession: async () => ({ data: { session: null }, error: null }),
  };
  listeners.push((e) => { if (e === 'SIGNED_OUT') intent.consume(); });
  const r = await signOutCore({ force: true, auth, forceSync: async () => {}, pendingCount: async () => 0, isOnline: () => true, removePushToken: async () => {}, signOutGoogle: async () => {}, intent });
  assert.deepEqual(r, { blocked: false });
});
