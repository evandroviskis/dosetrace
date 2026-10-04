'use strict';
// Consistency with Gate B round 3 N1 / N2 for ACCOUNT DELETION (finishAccountDeletion, after the
// server deleted the account): lib/signOutCore finishDeletionCore
//   • writes a wipe-pending marker naming the deleted account and wipes the phone AT ONCE (N2);
//   • signs out locally (one retry); if no SIGNED_OUT ran (the flag is still armed) or a session is
//     still there, the flag is disarmed and { failed: true } comes back — the screens say
//     "Couldn't sign out" with the existing copy (N1);
//   • the marker keeps the deleted account's id, so a cold start that still finds THAT session
//     wipes and signs it out (lib/signedOut completePendingWipe) — never left half-signed-in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const { finishDeletionCore } = require('../lib/signOutCore');
const S = require('../lib/signedOut');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function client({ removeThrows = false, online = false } = {}) {
  const mem = {};
  const storage = {
    getItem: async (k) => mem[k] ?? null,
    setItem: async (k, v) => { mem[k] = v; },
    removeItem: async (k) => { delete mem[k]; if (removeThrows) throw new Error('could not remove'); },
  };
  const now = Math.floor(Date.now() / 1000);
  mem['sb-del-auth-token'] = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: 'gone-user', aud: 'authenticated' } });
  return new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'sb-del-auth-token', storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: async () => { if (!online) throw new TypeError('Network request failed'); return new Response(null, { status: 204 }); } });
}
function flag() {
  let armed = false;
  return { mark: () => { armed = true; }, consume: () => { const v = armed; armed = false; return v; }, get armed() { return armed; } };
}
function harness(c) {
  const calls = [];
  const intent = flag();
  c.onAuthStateChange((e) => { if (e === 'SIGNED_OUT' && intent.consume()) calls.push('signed-out-wipe'); });
  return {
    calls, intent,
    deps: {
      auth: c, intent, userId: 'gone-user',
      signOutGoogle: async () => calls.push('google'),
      setWipePending: async (v) => calls.push(`marker:${v}`),
      wipeNow: () => calls.push('wipe-now'),
    },
  };
}

test('offline after the server deleted the account: marker, immediate wipe, signed out on the phone', async () => {
  const c = client();
  await c.initialize();
  const h = harness(c);
  const r = await finishDeletionCore(h.deps);
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(h.calls.slice(0, 2), ['marker:deleted:gone-user', 'wipe-now'], 'marker first, then the wipe');
  assert.ok(h.calls.includes('signed-out-wipe'));
  assert.equal((await c.getSession()).data.session, null);
  assert.equal(h.intent.armed, false);
});

test('no SIGNED_OUT ran (storage delete threw): failed, flag disarmed, marker kept for the next start', async () => {
  const c = client({ removeThrows: true });
  await c.initialize();
  const h = harness(c);
  const r = await finishDeletionCore(h.deps);
  assert.deepEqual(r, { failed: true });
  assert.equal(h.intent.armed, false);
  assert.ok(!h.calls.some((x) => x === 'marker:false'), 'the marker stays');
  assert.ok(h.calls.includes('wipe-now'), 'the phone was wiped anyway');
});

test('cold start still holding the deleted account\'s session: wipe and sign out; another account\'s session: drop the marker', async () => {
  const calls = [];
  const store = { v: 'deleted:gone-user' };
  const d = {
    isWipePending: async () => store.v,
    setWipePending: async (v) => { store.v = v ? '1' : null; calls.push(`marker:${v}`); },
    signOutLocally: async () => { calls.push('sign-out'); return { signedOut: true }; },
    clearLocalDatabase: () => calls.push('db'),
  };
  for (const k of ['cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts']) d[k] = () => {};
  assert.equal(await S.completePendingWipe(d, { hasSession: true, sessionUserId: 'gone-user' }), true);
  assert.ok(calls.includes('db') && calls.includes('sign-out'));
  assert.equal(store.v, null);
  const calls2 = [];
  const d2 = { ...d, isWipePending: async () => 'deleted:gone-user', setWipePending: async (v) => calls2.push(`marker:${v}`), clearLocalDatabase: () => calls2.push('db'), signOutLocally: async () => calls2.push('sign-out') };
  assert.equal(await S.completePendingWipe(d2, { hasSession: true, sessionUserId: 'someone-else' }), false);
  assert.deepEqual(calls2, ['marker:false']);
});

test('the app wires it: accountActions, both screens show the failure, App passes the session user', () => {
  const a = read('lib/accountActions.js');
  assert.match(a, /return finishDeletionCore\(\{/);
  assert.match(a, /wipeNow: \(\) => \{ try \{ runRegisteredWipe\(\); \} catch \{ clearLocalDatabase\(\); \} \}/);
  for (const f of ['screens/SettingsScreen.js', 'screens/AgeConfirmScreen.js']) {
    assert.match(read(f), /finishAccountDeletion\(\)\.then\(\(r\) => \{ if \(r && r\.failed\)/, f);
  }
  const app = read('App.js');
  assert.match(app, /registerWipe\(wipeDeps\)/);
  assert.match(app, /completePendingWipe\(wipeDeps\(\), \{ hasSession: !!session, sessionUserId: session\?\.user\?\.id \|\| null, localOwnerId: getLocalDataUserId\(\) \}\)/);
});
