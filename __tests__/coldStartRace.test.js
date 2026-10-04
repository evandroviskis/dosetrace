'use strict';
// Gate B H1 (proven by scratchpad/coldStartRace.cjs): at a cold start auth-js can emit SIGNED_IN
// (_recoverAndRefresh) BEFORE the getSession().then path reads the wipe marker; App's deferred
// SIGNED_IN block removed the marker unconditionally, so a "deleted:<id>" marker for the account
// that is still signed in was lost and the deleted account's session stayed. Now the SIGNED_IN
// block (lib/signedOut markerOnSignIn) finishes the deletion when the marker names that account,
// and both paths share finishDeletedSessionOnce — the wipe and the local sign-out run once.
// Real GoTrueClient, slow storage and a slow AsyncStorage stand-in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const S = require('../lib/signedOut');
const { completeLocalSignOut } = require('../lib/signOutCore');

const tick = () => new Promise((r) => setTimeout(r, 2));

function setup(markerValue, userId = 'user-A') {
  const mem = {};
  const now = Math.floor(Date.now() / 1000);
  mem.k = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: userId, aud: 'authenticated' } });
  const storage = { getItem: async (k) => { await tick(); return mem[k] ?? null; }, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'k', storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: async () => { throw new TypeError('offline'); } });
  const as = { v: markerValue };
  let q = Promise.resolve();
  const counts = { wipe: 0, signOut: 0 };
  const d = {
    isWipePending: () => (q = q.then(tick).then(() => as.v ?? null)),
    setWipePending: (v) => (q = q.then(tick).then(() => { as.v = v === false ? null : v; })),
    signOutLocally: async () => { counts.signOut++; return completeLocalSignOut(c); },
    stopSyncEngine: () => {},
    clearLocalDatabase: () => { counts.wipe++; },
  };
  for (const k of ['cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts']) d[k] = () => {};
  return { c, d, as, counts };
}

async function coldStart(h) {
  const pending = [];
  h.c.onAuthStateChange((e, s) => {
    if (e === 'SIGNED_IN' && s) pending.push(new Promise((res) => setTimeout(() => res(S.markerOnSignIn(h.d, { sessionUserId: s.user.id })), 0)));
  });
  const { data: { session: first } } = await h.c.getSession();
  const session = await S.sessionAfterPendingWipe(first, {
    completePending: (s) => S.completePendingWipe(h.d, { hasSession: !!s, sessionUserId: s && s.user.id, localOwnerId: null }),
    getSession: () => h.c.getSession(),
  });
  await Promise.all(pending);
  await new Promise((r) => setTimeout(r, 30));
  return session;
}

test('deleted:<signed-in account>: the deletion finishes once, the session ends, the marker is cleared', async () => {
  const h = setup('deleted:user-A');
  await coldStart(h);
  assert.equal(h.counts.wipe, 1, 'wiped exactly once');
  assert.equal(h.counts.signOut, 1, 'signed out exactly once');
  assert.equal((await h.c.getSession()).data.session, null, 'the deleted account no longer has a session');
  assert.equal(h.as.v, null);
});

test('a marker for another account: dropped by the sign-in, nothing wiped, the session stays', async () => {
  const h = setup('deleted:someone-else');
  await coldStart(h);
  assert.equal(h.counts.wipe, 0);
  assert.equal(h.counts.signOut, 0);
  assert.ok((await h.c.getSession()).data.session);
  assert.equal(h.as.v, null);
});

test('App\'s deferred SIGNED_IN block uses markerOnSignIn (no unconditional removal) and the strict local sign-out', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const i = app.indexOf("if (_event === 'SIGNED_IN' && session?.user?.id) {");
  const block = app.slice(i, i + 1600);
  assert.doesNotMatch(block, /AsyncStorage\.removeItem\(WIPE_PENDING_KEY\)/);
  assert.match(block, /await markerOnSignIn\(wipeDeps\(\), \{ sessionUserId: session\.user\.id \}\)/);
  assert.match(app, /signOutLocally: async \(\) => \{ setStrictRemoval\(true\);/);
});
