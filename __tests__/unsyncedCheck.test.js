'use strict';
// Gate B 2026-10-03 F6: if the check for changes that are not backed up FAILS, nobody is signed
// out (an intended sign-out wipes the phone, so "couldn't count" must never read as "nothing to
// lose"). recoveryFlow.unsyncedCount throws instead of counting an erroring table as 0;
// signOutCore then returns { blocked: true } unless the user chose "Sign out anyway" (force).
// Behaviour tests: the real harness database + syncCore, fakes for auth.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { TABLES, getPendingChanges } = require('../lib/syncCore');
const { unsyncedCount } = require('../lib/recoveryFlow');
const { signOutCore } = require('../lib/signOutCore');

test('a readable database: pending rows of this account are counted, other accounts\' are not', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status) VALUES ('u1', 1, '2026-10-01T08:00:00Z', 'pending')`);
  assert.equal(unsyncedCount(db, 'u1', TABLES, getPendingChanges), 1);
  assert.equal(unsyncedCount(db, 'u2', TABLES, getPendingChanges), 0);
});

test('an erroring table or no database throws (never 0)', () => {
  const db = makeDb();
  assert.throws(() => unsyncedCount(db, 'u1', [...TABLES, 'no_such_table'], getPendingChanges));
  const broken = { getAllSync: () => { throw new Error('database is locked'); } };
  assert.throws(() => unsyncedCount(broken, 'u1', TABLES, getPendingChanges));
  assert.throws(() => unsyncedCount(null, 'u1', TABLES, getPendingChanges));
  assert.equal(unsyncedCount(makeDb(), null, TABLES, getPendingChanges), 0, 'no account owns local data → nothing of anyone');
});

function deps(pendingCount) {
  const calls = [];
  return {
    calls,
    d: {
      auth: { signOut: async () => { calls.push('signOut'); return { error: null }; }, getSession: async () => ({ data: { session: null } }) },
      forceSync: async () => calls.push('sync'),
      pendingCount,
      isOnline: () => true,
      removePushToken: async () => calls.push('token'),
      signOutGoogle: async () => calls.push('google'),
      intent: { mark: () => calls.push('mark'), consume: () => false },
    },
  };
}

test('the check fails: blocked, nothing signed out, the wipe flag never armed', async () => {
  const broken = { getAllSync: () => { throw new Error('database is locked'); } };
  const h = deps(() => unsyncedCount(broken, 'u1', TABLES, getPendingChanges));
  const r = await signOutCore(h.d);
  assert.equal(r.blocked, true);
  assert.equal(r.unknown, true);
  assert.deepEqual(h.calls, ['sync']);
});

test('the check fails but the user chose Sign out anyway: signed out', async () => {
  const h = deps(() => { throw new Error('x'); });
  const r = await signOutCore({ ...h.d, force: true });
  assert.deepEqual(r, { blocked: false });
  assert.deepEqual(h.calls, ['sync', 'token', 'mark', 'google', 'signOut']);
});
