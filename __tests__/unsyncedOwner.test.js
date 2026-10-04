'use strict';
// Gate B round 2, R3: the not-backed-up count used the local data owner (getLocalDataUserId),
// which is null when the tables cannot be read — and a null owner counted 0, so the sign-out went
// ahead and the wipe deleted unpushed rows. The count now also runs for the signed-in user
// (recoveryFlow pendingForSignOut): rows are counted for the local owner AND the session's user;
// an unreadable table throws (F6) → blocked unless forced; no owner known at all → unknown → blocked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb } = require('./helpers/syncHarness');
const { TABLES, getPendingChanges } = require('../lib/syncCore');
const { pendingForSignOut } = require('../lib/recoveryFlow');
const { signOutCore } = require('../lib/signOutCore');

test('a null local owner counts the session user\'s pending rows (was 0)', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status) VALUES ('u1', 1, '2026-10-01T08:00:00Z', 'pending')`);
  assert.equal(pendingForSignOut({ db, localOwnerId: null, sessionUserId: 'u1', tables: TABLES, getPending: getPendingChanges }), 1);
  assert.equal(pendingForSignOut({ db, localOwnerId: 'u1', sessionUserId: 'u1', tables: TABLES, getPending: getPendingChanges }), 1, 'not counted twice');
});

test('unreadable tables or no owner at all: unknown (throws), never 0', () => {
  const broken = { getAllSync: () => { throw new Error('database disk image is malformed'); } };
  assert.throws(() => pendingForSignOut({ db: broken, localOwnerId: null, sessionUserId: 'u1', tables: TABLES, getPending: getPendingChanges }));
  assert.throws(() => pendingForSignOut({ db: makeDb(), localOwnerId: null, sessionUserId: null, tables: TABLES, getPending: getPendingChanges }));
});

test('signOutCore awaits the count: a rejected count blocks unless forced', async () => {
  const calls = [];
  const base = {
    auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }) },
    forceSync: async () => {}, isOnline: () => true, removePushToken: async () => calls.push('token'), signOutGoogle: async () => {},
    intent: { mark: () => calls.push('mark'), consume: () => false },
  };
  const r = await signOutCore({ ...base, pendingCount: async () => { throw new Error('unknown owner'); } });
  assert.equal(r.blocked, true);
  assert.equal(r.unknown, true);
  assert.deepEqual(calls, []);
  assert.equal((await signOutCore({ ...base, pendingCount: async () => 2 })).blocked, true);
  assert.deepEqual(await signOutCore({ ...base, pendingCount: async () => 0 }), { blocked: false });
});

test('the app counts with the session user', () => {
  const a = fs.readFileSync(path.join(__dirname, '../lib/accountActions.js'), 'utf8');
  assert.match(a, /pendingForSignOut\(\{ db: getDB\(\), localOwnerId: getLocalDataUserId\(\), sessionUserId/);
});
