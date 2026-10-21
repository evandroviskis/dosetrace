'use strict';
// DT Council, test build 3 (2026-10-17), item 3: the delete-user request had no timeout. React
// Native Android's OkHttp has none (the hang CS-23 fixed for the refresh): on a network that is up
// but carries nothing, Delete account never answered and sync stayed paused. The POST is now aborted
// after 20 s and treated as offline (sync resumes, { offline: true }); the 20 s wait for a running
// sync pass clears its timer once it settles. The real requestAccountDeletion, fakes around it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function timers() {
  const live = new Set();
  return {
    live,
    setTimeout: (fn, ms) => { const h = setTimeout(() => { live.delete(h); fn(); }, ms); live.add(h); return h; },
    clearTimeout: (h) => { live.delete(h); clearTimeout(h); },
  };
}

function load(fetch, tm, calls) {
  return loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), refreshSession: async () => ({ data: { session: null } }) } },
    fetch, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' } },
    pauseSyncForDeletion: () => calls.push('pause'), resumeSyncAfterDeletion: () => calls.push('resume'),
    deletionRequestSettled: () => calls.push('settled'), waitForSyncIdle: async () => {},
    setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout,
  });
}

test('TB3-3: a delete-user request that never answers is aborted → offline; no timer left (sync stays paused while the account state is unknown: tb3DeleteGone)', async () => {
  const tm = timers();
  const calls = [];
  let signal = null;
  const fetch = (u, init) => { if (String(u).includes('delete-user')) signal = init.signal; return new Promise(() => {}); };
  const t0 = Date.now();
  const out = await load(fetch, tm, calls)({ timeoutMs: 80, checkTimeoutMs: 80 });
  assert.deepEqual(out, { offline: true });
  assert.ok(Date.now() - t0 < 2000, 'answered at the timeout');
  assert.ok(signal && signal.aborted, 'the request itself was aborted');
  assert.deepEqual(calls, ['pause', 'settled'], 'the check timed out too: paused, request settled');
  assert.equal(tm.live.size, 0, 'no timer left behind');
});

test('TB3-3: the default timeouts are 20 s (request, idle wait) and 8 s (the account check)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'accountActions.js'), 'utf8');
  assert.match(src, /export async function requestAccountDeletion\(\{ timeoutMs = 20000, idleWaitMs = 20000, checkTimeoutMs = 8000, retried = false \} = \{\}\)/); // A-119 Gate B M4: one retry after the device check
});

test('TB3-3: a deletion that answers clears both timers (the idle race and the request)', async () => {
  const tm = timers();
  const calls = [];
  const out = await load(async () => json({ ok: true }), tm, calls)();
  assert.deepEqual(out, { ok: true, appleManualRevokeNeeded: false });
  assert.equal(tm.live.size, 0, 'the 20 s idle-race timer and the request timer are cleared');
});
