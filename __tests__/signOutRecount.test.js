'use strict';
// Final Gate B (with G1): the not-backed-up count is taken again right before the intent flag is
// armed — a row written between the first count and the sign-out (e.g. a Mark complete action on a
// notification while the push token is removed) blocks the sign-out instead of being wiped.
const test = require('node:test');
const assert = require('node:assert/strict');
const { signOutCore } = require('../lib/signOutCore');

function deps(counts) {
  const calls = [];
  let i = 0;
  return {
    calls,
    d: {
      auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null }, error: null }) },
      forceSync: async () => calls.push('sync'),
      pendingCount: async () => { const v = counts[Math.min(i, counts.length - 1)]; i++; calls.push(`count:${v}`); if (v instanceof Error) throw v; return v; },
      isOnline: () => true,
      removePushToken: async () => calls.push('token'),
      restorePushToken: async () => calls.push('token-back'),
      signOutGoogle: async () => calls.push('google'),
      intent: { mark: () => calls.push('mark'), consume: () => false },
    },
  };
}

test('a row written after the first count blocks the sign-out before the flag is armed', async () => {
  const h = deps([0, 1]);
  const r = await signOutCore(h.d);
  assert.equal(r.blocked, true);
  assert.deepEqual(h.calls, ['sync', 'count:0', 'token', 'count:1', 'token-back']);
});

test('the second count failing is unknown → blocked; still 0 → signed out; forced → no counts', async () => {
  const h = deps([0, new Error('locked')]);
  const r = await signOutCore(h.d);
  assert.equal(r.blocked, true);
  assert.equal(r.unknown, true);
  assert.ok(!h.calls.includes('mark'));
  const ok = deps([0, 0]);
  assert.deepEqual(await signOutCore(ok.d), { blocked: false });
  assert.deepEqual(ok.calls, ['sync', 'count:0', 'token', 'count:0', 'mark', 'google']);
  const f = deps([5]);
  assert.deepEqual(await signOutCore({ ...f.d, force: true }), { blocked: false });
  assert.ok(!f.calls.some((c) => c.startsWith('count')));
});
