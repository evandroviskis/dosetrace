'use strict';
// Final Gate B PASS-WITH-FIXES, S2: the DELAYED tombstone (a Delete forever made before the
// migration, written by resendOptional once the column exists) writes purged_at ONLY while the
// cloud row is still missing. If a live row exists, someone brought it back meanwhile (a 1.3.0
// device revived or restored it): the local purge is cancelled and the protocol shows again in
// the state the cloud has, with its history. A row that is already a tombstone just finishes the
// local purge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;
const missing = { data: null, error: { code: 'PGRST204', message: "Could not find the 'purged_at' column of 'protocols' in the schema cache" } };

// P soft-deleted with 2 doses on A and B; the cloud has no purged_at column yet.
async function setup() {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: false, deleted_at: '2026-10-01T00:00:00Z' });
  for (const d of ['2026-09-20', '2026-09-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  const A = makeDb();
  const B = makeDb();
  await pullChanges(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  const state = { migrated: false };
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  cloud.insert = async (t, pl) => (t === 'protocols' && !state.migrated && 'purged_at' in pl ? missing : ins(t, pl));
  cloud.update = async (t, id, pl) => (t === 'protocols' && !state.migrated && 'purged_at' in pl ? missing : upd(t, id, pl));
  const pidA = A.getFirstSync('SELECT id FROM protocols').id;
  const pidB = B.getFirstSync('SELECT id FROM protocols').id;
  // A deletes it forever before the migration: hard delete, local row waits hidden.
  E.purgeProtocol(A, pidA, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  assert.ok(!cloud._store.protocols.get(p.data.id));
  assert.equal(A.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [pidA]).optional_pending, 'purged_at');
  return { cloud, A, B, remote: p.data.id, pidA, pidB, state };
}

test('a live row exists when the column arrives → the local purge is cancelled, the protocol shows again as the cloud has it, with its history', async () => {
  const { cloud, A, B, remote, pidA, pidB, state } = await setup();
  // B edits its copy: the push finds 0 rows and revives P (soft-deleted, history back up).
  B.runSync(`UPDATE protocols SET name = 'P kept', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pidB]);
  await pushPending(B, cloud, USER);
  assert.ok(cloud._store.protocols.get(remote));
  await pullChanges(A, cloud, USER); // A sees the revived row but its purge is still waiting
  state.migrated = true;
  await pushPending(A, cloud, USER);
  const cloudRow = cloud._store.protocols.get(remote);
  assert.ok(!cloudRow.purged_at, 'purged_at is NOT written over a live row');
  const a = A.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pidA]);
  assert.ok(a, 'kept');
  assert.equal(a.purged_at, null, 'the local purge is cancelled');
  assert.equal(a.optional_pending, null);
  assert.equal(a.name, 'P kept', 'as the cloud has it');
  assert.equal(a.active, 0);
  assert.ok(a.deleted_at);
  assert.equal(a.sync_status, 'synced');
  const q = E.recentlyDeletedQuery();
  assert.deepEqual(A.getAllSync(q.sql, [USER, ...q.params]).map((r) => r.id), [pidA], 'shown again');
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [pidA]), 2, 'with its history from the cloud');
  await pullChanges(A, cloud, USER);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM dose_logs'), 2, 'no duplicates');
});

test('the row is already a tombstone → the local purge just finishes', async () => {
  const { cloud, A, remote, pidA, state } = await setup();
  state.migrated = true;
  await cloud.insert('protocols', { id: remote, user_id: USER, name: 'P', type: 'recon', active: false, deleted_at: '2026-10-01T00:00:00Z', purged_at: '2026-10-04T11:00:00Z' });
  await pushPending(A, cloud, USER);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [pidA]), 0);
  assert.equal(cloud._store.protocols.get(remote).purged_at, '2026-10-04T11:00:00Z');
});

test('the row is still missing → the tombstone is written (same id) and the local row goes', async () => {
  const { cloud, A, remote, pidA, state } = await setup();
  state.migrated = true;
  await pushPending(A, cloud, USER);
  assert.equal(cloud._store.protocols.get(remote).purged_at, '2026-10-04T10:00:00Z');
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [pidA]), 0);
});

test('when the check itself fails nothing is written (retried next sync)', async () => {
  const { cloud, A, remote, pidA, state } = await setup();
  state.migrated = true;
  cloud.fetchIn = async () => ({ data: null, error: { message: 'offline' } });
  await pushPending(A, cloud, USER);
  assert.ok(!cloud._store.protocols.get(remote));
  assert.equal(A.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [pidA]).optional_pending, 'purged_at');
});
