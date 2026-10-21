'use strict';
// Review of 61b2c33..ed5d8bf, item 1: a delete-user request cut at 20 s was treated as offline at
// once (sync resumed, { offline: true }). The server function keeps running after the client gives
// up (Apple revoke, the table deletes, the admin delete); when it finished, every retry went POST →
// 401 → refresh refused → offline again, and the teardown never ran. Now, after a timeout, sync stays
// paused and the server is asked whether the account still exists (GET /auth/v1/user, own ~8 s
// timeout): gone → { ok: true } (the normal teardown); still there → resume + offline; unknown → stay
// paused (cleared by the next engine start / app start / a retry) + offline. A 401 whose refresh is
// refused as an invalid refresh token means the same: the account is gone → ok.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');

const URL_ = 'https://x.supabase.co';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const never = () => new Promise(() => {});

function load({ deleteUser, userCheck, refresh }) {
  const calls = [];
  const fetch = (u, init) => {
    const url = String(u);
    if (url.includes('/functions/v1/delete-user')) { calls.push('post'); return deleteUser(init); }
    if (url.includes('/auth/v1/user')) { calls.push('check'); return userCheck(init); }
    throw new Error(`unexpected ${url}`);
  };
  const del = loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: { auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      refreshSession: refresh || (async () => ({ data: { session: null }, error: null })),
    } },
    fetch, process: { env: { EXPO_PUBLIC_SUPABASE_URL: URL_, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    pauseSyncForDeletion: () => calls.push('pause'), resumeSyncAfterDeletion: () => calls.push('resume'),
    deletionRequestSettled: () => calls.push('settled'), waitForSyncIdle: async () => {},
  });
  return { del, calls };
}

test('R1: timeout, then the server says the user is gone → ok (teardown runs), sync never resumed', async () => {
  const { del, calls } = load({ deleteUser: never, userCheck: async () => json({ code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }, 403) });
  const out = await del({ timeoutMs: 50, checkTimeoutMs: 200 });
  assert.deepEqual(out, { ok: true, appleManualRevokeNeeded: false });
  assert.ok(!calls.includes('resume'), 'no push in the middle of the deletion');
  assert.deepEqual(calls, ['pause', 'post', 'check', 'settled']);
});

test('R1: timeout, the account still exists → resume sync + offline', async () => {
  const { del, calls } = load({ deleteUser: never, userCheck: async () => json({ id: 'u1', email: 't@x.io' }) });
  assert.deepEqual(await del({ timeoutMs: 50, checkTimeoutMs: 200 }), { offline: true });
  assert.deepEqual(calls, ['pause', 'post', 'check', 'resume']);
});

test('R1: timeout, the check also times out → stay paused (no resume), offline; the request is settled so the next start clears the pause', async () => {
  let signal = null;
  const { del, calls } = load({ deleteUser: never, userCheck: (init) => { signal = init.signal; return never(); } });
  const t0 = Date.now();
  assert.deepEqual(await del({ timeoutMs: 50, checkTimeoutMs: 80 }), { offline: true });
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(signal && signal.aborted, 'the check was aborted too');
  assert.ok(!calls.includes('resume'), 'sync stays paused while it is unknown');
  assert.deepEqual(calls, ['pause', 'post', 'check', 'settled']);
});

test('R1: a 401 whose refresh is refused as an invalid refresh token → the account is gone → ok', async () => {
  const { del, calls } = load({
    deleteUser: async () => json({ error: 'Invalid session' }, 401),
    userCheck: async () => { throw new Error('not asked'); },
    refresh: async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' } }),
  });
  assert.deepEqual(await del(), { ok: true, appleManualRevokeNeeded: false });
  assert.deepEqual(calls, ['pause', 'post', 'settled']);
});

// DV-009 lost-response half (Gate B 2, 1.3.1): a network error does not tell "never left" from "the
// answer was lost after the server deleted". The account is checked first; only then offline.
test('R1: a quick network failure (offline before the request left) still resumes + offline, after asking', async () => {
  const { del, calls } = load({ deleteUser: async () => { throw new TypeError('Network request failed'); }, userCheck: async () => { throw new TypeError('Network request failed'); } });
  assert.deepEqual(await del(), { offline: true });
  assert.deepEqual(calls, ['pause', 'post', 'check', 'resume']);
});

test('DV-009: the delete answer was lost on the network, the server says the user is gone → ok (teardown), never "failed"', async () => {
  const { del, calls } = load({ deleteUser: async () => { throw new TypeError('Network request failed'); }, userCheck: async () => json({ code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }, 403) });
  assert.deepEqual(await del(), { ok: true, appleManualRevokeNeeded: false });
  assert.ok(!calls.includes('resume'));
  assert.deepEqual(calls, ['pause', 'post', 'check', 'settled']);
});

test('DV-009: the network failed and the account still exists → resume + offline (the person may retry)', async () => {
  const { del, calls } = load({ deleteUser: async () => { throw new TypeError('Network request failed'); }, userCheck: async () => json({ id: 'u1' }) });
  assert.deepEqual(await del(), { offline: true });
  assert.deepEqual(calls, ['pause', 'post', 'check', 'resume']);
});

test('DV-009: a 5xx from delete-user after the account was already deleted → ok; still there → the failure, sync resumed', async () => {
  const gone = load({ deleteUser: async () => json({ error: 'boom' }, 500), userCheck: async () => json({ code: 'user_not_found' }, 403) });
  assert.deepEqual(await gone.del(), { ok: true, appleManualRevokeNeeded: false });
  assert.deepEqual(gone.calls, ['pause', 'post', 'check', 'settled']);
  const there = load({ deleteUser: async () => json({ error: 'boom' }, 500), userCheck: async () => json({ id: 'u1' }) });
  await assert.rejects(there.del(), /boom/);
  assert.deepEqual(there.calls, ['pause', 'post', 'check', 'resume']);
});
