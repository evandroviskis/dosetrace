'use strict';
// DV-009 (S1, DL-85): an account deleted, or a session revoked, from somewhere else is no longer
// treated as a hiccup. When the auth server itself says so (user_not_found / session_not_found /
// refresh_token_not_found), the scheduled reminders are cancelled and the phone's data wiped through
// the "deleted:<id>" marker path; a network failure, a 5xx or a 429 never cancels anything.
// "Never destroy on a maybe": a revoked session (the account may still exist) whose phone holds
// changes never backed up keeps the data (the reminders stop, the person signs in again to send
// them; another account signing in meets the DV-242 sheet).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthFetch, goneKindOf, probeAccount } = require('../lib/authFetch');
const { afterSignedOut, afterAccountGone, checkAccountGone } = require('../lib/signedOut');

const URL_ = 'https://x.supabase.co';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refreshInit = (rt) => ({ method: 'POST', body: JSON.stringify({ refresh_token: rt }) });
const stored = JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expires_at: 1, user: { id: 'u1' } });

test('DV-009: the classifier reads GoTrue\'s own codes, and only those', () => {
  assert.equal(goneKindOf(JSON.stringify({ code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' })), 'deleted');
  assert.equal(goneKindOf(JSON.stringify({ code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' })), 'revoked');
  assert.equal(goneKindOf(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found', error_code: 'refresh_token_not_found' })), 'revoked');
  assert.equal(goneKindOf(JSON.stringify({ code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' })), null, 'a reused token is a hiccup, not a revoke');
  assert.equal(goneKindOf(JSON.stringify({ code: 'bad_jwt', message: 'token is expired' })), null);
  assert.equal(goneKindOf('<html>502 Bad Gateway</html>'), null);
  assert.equal(goneKindOf(''), null);
});

test('DV-009: a refresh the server refuses as "not found" leaves a gone signal; a network failure or a 5xx leaves none', async () => {
  const run = async (answer) => {
    const af = createAuthFetch({ fetch: async () => answer(), readStoredSession: async () => stored, isOffline: async () => true });
    try { await af.fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, refreshInit('r1')); } catch { /* thrown through */ }
    return af.takeGone();
  };
  assert.equal(await run(() => json({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }, 400)), 'revoked');
  assert.equal(await run(() => { throw new TypeError('Network request failed'); }), null, 'offline never counts');
  assert.equal(await run(() => json({ message: 'boom' }, 500)), null, 'a 5xx never counts');
  assert.equal(await run(() => json({ message: 'rate' }, 429)), null, 'a 429 never counts');
  assert.equal(await run(() => json({ code: 'refresh_token_already_used' }, 400)), null);
});

test('DV-009: /auth/v1/user answering user_not_found leaves a "deleted" signal; it is taken once and goes stale', async () => {
  let t = 0;
  const af = createAuthFetch({ fetch: async () => json({ code: 'user_not_found', message: 'User from sub claim in JWT does not exist' }, 403), now: () => t });
  await af.fetch(`${URL_}/auth/v1/user`, { method: 'GET' });
  assert.equal(af.takeGone(), 'deleted');
  assert.equal(af.takeGone(), null, 'taken once');
  await af.fetch(`${URL_}/auth/v1/user`, { method: 'GET' });
  t = 61 * 1000;
  assert.equal(af.takeGone(), null, 'older than a minute: not this sign-out\'s cause');
  const logout = createAuthFetch({ fetch: async () => json({ code: 'session_not_found' }, 403) });
  await logout.fetch(`${URL_}/auth/v1/logout?scope=local`, { method: 'POST' });
  assert.equal(logout.takeGone(), null, 'our own sign-out is not a revoke');
});

test('DV-009: probing the account — gone, there, or unknown (network) — never through auth-js\'s lock', async () => {
  const probe = (impl, timeoutMs) => probeAccount({ fetch: impl, url: URL_, anonKey: 'anon', token: 'a1', timeoutMs });
  assert.equal(await probe(async () => json({ code: 'user_not_found' }, 403)), 'deleted');
  assert.equal(await probe(async () => json({ code: 'session_not_found' }, 403)), 'revoked');
  assert.equal(await probe(async () => json({ id: 'u1', email: 'a@x' }, 200)), 'exists');
  assert.equal(await probe(async () => { throw new TypeError('Network request failed'); }), 'unknown');
  assert.equal(await probe(async () => json({ message: 'boom' }, 503)), 'unknown');
  assert.equal(await probe(() => new Promise(() => {}), 20), 'unknown', 'a stalled request times out as unknown');
});

function phoneDeps({ pending = 0, owner = 'u1' } = {}) {
  const calls = [];
  let marker = null;
  const d = {
    stopSyncEngine: () => calls.push('stopSync'),
    waitForSyncIdle: async () => {},
    getLocalOwner: () => owner,
    countPending: () => { if (pending === 'throw') throw new Error('unreadable'); return pending; },
    setWipePending: async (v) => { marker = v || null; calls.push(v ? `marker:${v}` : 'marker:clear'); },
    isWipePending: async () => marker,
    signOutLocally: async () => { calls.push('signOutLocal'); return { signedOut: true }; },
    clearLocalDatabase: () => calls.push('clearDb'),
    cancelAllNotifications: async () => calls.push('cancelNotifs'),
    dismissAllNotifications: async () => calls.push('dismissNotifs'),
    logOutPurchases: async () => calls.push('purchases'),
    clearOnboarding: async () => {}, removeRcStart: async () => {}, clearRealityDeviceFlags: async () => {},
    clearSeenOnboarding: async () => {}, removeQuestions: async () => {}, resetAllSelections() {}, clearAllDrafts() {},
    forgetTodayLayout: async () => {}, clearAIConsent: async () => calls.push('consent'), forgetLocalOwner: async () => {},
  };
  return { d, calls, marker: () => marker };
}

test('DV-009: the server says the user is gone (getUser → user_not_found) → wipe marker set, reminders cancelled, data wiped, signed out', async () => {
  const p = phoneDeps({ pending: 3 });
  const probe = async () => ({ kind: await probeAccount({ fetch: async () => json({ code: 'user_not_found' }, 403), url: URL_, anonKey: 'k', token: 't' }), userId: 'u1' });
  assert.equal(await checkAccountGone(p.d, probe), 'wiped');
  assert.ok(p.calls.includes('marker:deleted:u1'), 'the deleted:<id> marker is written first (a kill mid-way finishes on the next start)');
  assert.ok(p.calls.includes('cancelNotifs') && p.calls.includes('dismissNotifs'), 'reminders cancelled');
  assert.ok(p.calls.includes('clearDb'), 'a deleted account\'s rows can never be backed up: wiped even with unsent rows');
  assert.ok(p.calls.includes('signOutLocal'));
  assert.equal(p.marker(), null, 'marker cleared after the local sign-out worked');
});

test('DV-009: a network error (unknown) or an account that exists → nothing cancelled, nothing wiped', async () => {
  for (const impl of [async () => { throw new TypeError('Network request failed'); }, async () => json({ id: 'u1' }, 200), async () => json({}, 502)]) {
    const p = phoneDeps();
    const probe = async () => ({ kind: (k => (k === 'deleted' || k === 'revoked' ? k : null))(await probeAccount({ fetch: impl, url: URL_, anonKey: 'k', token: 't' })), userId: 'u1' });
    assert.equal(await checkAccountGone(p.d, probe), 'none');
    assert.deepEqual(p.calls, []);
  }
});

test('DV-009: SIGNED_OUT after a refresh refused as revoked, nothing unsent → wiped and reminders cancelled', async () => {
  const p = phoneDeps({ pending: 0 });
  assert.equal(await afterSignedOut(false, p.d, 'revoked'), 'wiped');
  assert.ok(p.calls.includes('marker:deleted:u1') && p.calls.includes('cancelNotifs') && p.calls.includes('clearDb'));
  assert.ok(!p.calls.includes('signOutLocal'), 'no session left to sign out');
});

test('DV-009: revoked with changes never backed up (or a count that cannot be read) → reminders cancelled, data kept', async () => {
  for (const pending of [2, 'throw']) {
    const p = phoneDeps({ pending });
    assert.equal(await afterSignedOut(false, p.d, 'revoked'), 'cancelled');
    assert.ok(p.calls.includes('cancelNotifs') && p.calls.includes('dismissNotifs'));
    assert.ok(!p.calls.includes('clearDb'), 'never destroy on a maybe');
    assert.ok(!p.calls.some((c) => c.startsWith('marker:deleted')));
  }
});

test('DV-009: a plain spurious SIGNED_OUT (no gone signal) still keeps everything and cancels nothing', async () => {
  const p = phoneDeps();
  assert.equal(await afterSignedOut(false, p.d), false);
  assert.equal(await afterSignedOut(false, p.d, null), false);
  assert.deepEqual(p.calls, ['stopSync', 'stopSync']);
});

test('DV-009: the local data belongs to another account → the gone account\'s marker never wipes it', async () => {
  const p = phoneDeps({ owner: 'someone-else', pending: 0 });
  await afterAccountGone(p.d, { kind: 'deleted', userId: 'u1', hasSession: false });
  assert.ok(!p.calls.includes('clearDb'));
  // B (held by the DV-242 sheet over A's unsent rows) turns out deleted: B leaves, A's data stays.
  const held = phoneDeps({ owner: 'user-a', pending: 2 });
  assert.equal(await afterAccountGone(held.d, { kind: 'deleted', userId: 'user-b', hasSession: true }), 'signed_out');
  assert.ok(held.calls.includes('signOutLocal'));
  assert.ok(!held.calls.includes('clearDb') && !held.calls.includes('cancelNotifs'));
});

test('DV-009: App takes the gone signal inline (no await, no supabase) and probes deferred', () => {
  const app = require('./helpers/extractFn').read('App.js');
  assert.match(app, /const gone = takeAccountGone\(\);/);
  assert.match(app, /afterSignedOut\(intentional, wipeDeps\(\), gone\)/);
  assert.match(app, /checkAccountGone\(wipeDeps\(\), probeAccountGone\)/);
});
