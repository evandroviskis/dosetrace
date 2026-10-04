'use strict';
// Final Gate B (2026-10-04, decided by the ledger — never destroy on a maybe): "Delete forever" is a
// POSITIVE tombstone, not a deletion other devices must infer from absence.
//   • A: purged_at is set on the cloud protocol row (the row stays, its other fields untouched), its
//     dose logs and vials are hard-deleted in the cloud first, and the local rows go.
//   • Before the migration (the cloud lacks purged_at): the protocol row is hard-deleted as before
//     and the local row stays hidden with optional_pending = 'purged_at'; once the column exists the
//     tombstone is written (re-inserted with the same id) and the local row goes.
//   • B: an ordinary pull that brings purged_at removes the protocol with its SYNCED children; a
//     pending child is never deleted — the protocol stays hidden, the child stays pending.
//   • A purged row never comes back through a pull or a full import.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const missing = { data: null, error: { code: 'PGRST204', message: "Could not find the 'purged_at' column of 'protocols' in the schema cache" } };

async function seedSynced(db, cloud, name) {
  const p = await cloud.insert('protocols', { user_id: USER, name, type: 'recon', dose: '250', active: false, deleted_at: '2026-10-01T00:00:00Z' });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, dose, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, 'recon', '250', 0, '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', ?, 'synced')`, [p.data.id, USER, name, p.data.updated_at]);
  const pid = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  for (const d of ['2026-09-20', '2026-09-21']) {
    const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
    db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'Taken', ?, ?, 'synced')`, [l.data.id, USER, pid, p.data.id, `${d}T08:00:00Z`, l.data.updated_at]);
  }
  const v = await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  db.runSync(`INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, total_doses, updated_at, sync_status) VALUES (?, ?, ?, ?, 10, ?, 'synced')`, [v.data.id, USER, pid, p.data.id, v.data.updated_at]);
  return { pid, remote: p.data.id };
}

async function twoDevices() {
  const cloud = makeCloud();
  const A = makeDb();
  const keep = await seedSynced(A, cloud, 'KEEP');
  const gone = await seedSynced(A, cloud, 'GONE');
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const onB = (name) => B.getFirstSync('SELECT * FROM protocols WHERE name = ?', [name]);
  return { cloud, A, B, keep, gone, onB };
}
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;
const cloudChildren = (cloud, remote) => cloud.rows('dose_logs', USER).filter((l) => l.protocol_id === remote).length + cloud.rows('vials', USER).filter((v) => v.protocol_id === remote).length;
function shownAnywhere(db, id) {
  const rd = E.recentlyDeletedQuery();
  const lists = [E.SQL_ACTIVE, E.SQL_ENDED, E.SQL_HISTORY].map((q) => db.getAllSync(q, [USER]));
  lists.push(db.getAllSync(rd.sql, [USER, ...rd.params]), db.getAllSync(E.SQL_RECENTLY_DELETED, [USER, '2000-01-01T00:00:00Z']));
  return lists.some((rows) => rows.some((r) => r.id === id));
}

test('purged_at is an optional column (sent only by the purge, never by an ordinary push)', () => {
  assert.ok(OPTIONAL_COLUMNS.protocols.includes('purged_at'));
  const { toCloudPayload } = require('../lib/syncMappers');
  assert.ok(!('purged_at' in toCloudPayload('protocols', { name: 'x', active: 0, purged_at: '2026-10-04T10:00:00Z' })), 'an edit can never clear a tombstone');
});

test('A: Delete forever leaves a tombstone in the cloud (other fields untouched), its children go first, the local rows go', async () => {
  const { cloud, A, keep, gone } = await twoDevices();
  assert.equal(E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z'), true);
  assert.ok(!shownAnywhere(A, gone.pid), 'hidden at once');
  await pushPending(A, cloud, USER);
  const tomb = cloud._store.protocols.get(gone.remote);
  assert.ok(tomb, 'the cloud row stays as a tombstone');
  assert.equal(tomb.purged_at, '2026-10-04T10:00:00Z');
  assert.equal(tomb.name, 'GONE');
  assert.equal(tomb.dose, '250');
  assert.equal(tomb.deleted_at, '2026-10-01T00:00:00Z');
  assert.equal(cloudChildren(cloud, gone.remote), 0, 'its dose logs and vials are hard-deleted in the cloud');
  assert.equal(cloudChildren(cloud, keep.remote), 3, 'the other protocol keeps its own');
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [gone.pid]), 0, 'gone locally');
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [gone.pid]), 0);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ?', [gone.pid]), 0);
  await pullChanges(A, cloud, USER);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols WHERE remote_id = ?', [gone.remote]), 0, 'the tombstone never comes back on a pull');
});

test('B: an ordinary pull that brings purged_at removes the protocol with its synced doses and vials', async () => {
  const { cloud, A, B, gone, onB } = await twoDevices();
  const bGone = onB('GONE');
  assert.ok(bGone);
  E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.ok(!onB('GONE'));
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ? OR protocol_remote_id = ?', [bGone.id, gone.remote]), 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ? OR protocol_remote_id = ?', [bGone.id, gone.remote]), 0);
  const bKeep = onB('KEEP');
  assert.ok(bKeep);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [bKeep.id]), 2);
});

test('B: a pending dose of the purged protocol survives — kept pending, never pushed, the protocol hidden', async () => {
  const { cloud, A, B, gone, onB } = await twoDevices();
  const bGone = onB('GONE');
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-10-04T08:00:00Z', '2026-10-04T08:00:00Z', 'pending')`, [USER, bGone.id, gone.remote]);
  E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ? AND sync_status = 'pending'`, [bGone.id]), 1, 'the pending dose is never deleted');
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ? AND sync_status = 'synced'`, [bGone.id]), 0, 'its synced doses went');
  const hidden = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [bGone.id]);
  assert.ok(hidden && hidden.purged_at, 'the protocol stays, hidden');
  assert.ok(!shownAnywhere(B, bGone.id));
  assert.equal(B.getAllSync(E.SQL_ALL_LOGS, [USER]).filter((l) => l.protocol_id === bGone.id).length, 0, 'not in the Dose log');
  assert.equal(cloudChildren(cloud, gone.remote), 0, 'the pending dose was never pushed onto the tombstone');
});

test('B: a pending edit of a protocol purged in the cloud — the pull hides it, the push removes it', async () => {
  const { cloud, A, B, gone, onB } = await twoDevices();
  const bGone = onB('GONE');
  B.runSync(`UPDATE protocols SET name = 'GONE edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [bGone.id]);
  E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT purged_at FROM protocols WHERE id = ?', [bGone.id]).purged_at, 'hidden after the pull');
  assert.ok(!shownAnywhere(B, bGone.id));
  await pushPending(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [bGone.id]), 0);
  assert.equal(cloud._store.protocols.get(gone.remote).name, 'GONE', 'the edit never went up over the tombstone');
  assert.ok(cloud._store.protocols.get(gone.remote).purged_at);
});

test('before the migration: the protocol row is hard-deleted as before, the local row waits hidden, the tombstone goes up once the column exists', async () => {
  const { cloud, A, B, gone, onB } = await twoDevices();
  let migrated = false;
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  cloud.insert = async (t, p) => (t === 'protocols' && !migrated && 'purged_at' in p ? missing : ins(t, p));
  cloud.update = async (t, id, p) => (t === 'protocols' && !migrated && 'purged_at' in p ? missing : upd(t, id, p));
  E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  assert.ok(!cloud._store.protocols.get(gone.remote), 'hard-deleted, so Delete forever still works');
  assert.equal(cloudChildren(cloud, gone.remote), 0);
  const waiting = A.getFirstSync('SELECT * FROM protocols WHERE id = ?', [gone.pid]);
  assert.equal(waiting.optional_pending, 'purged_at');
  assert.equal(waiting.sync_status, 'synced', 'nothing left to push (never blocks sign-out)');
  assert.ok(!shownAnywhere(A, gone.pid));
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [gone.pid]), 0);
  await pushPending(A, cloud, USER); // still no column: the marker stays
  assert.equal(A.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [gone.pid]).optional_pending, 'purged_at');
  migrated = true; // the founder applies the migration
  await pushPending(A, cloud, USER);
  const tomb = cloud._store.protocols.get(gone.remote);
  assert.ok(tomb && tomb.purged_at === '2026-10-04T10:00:00Z', 'the tombstone is written with the same id');
  assert.equal(tomb.name, 'GONE');
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [gone.pid]), 0, 'and the local row goes');
  await pullChanges(B, cloud, USER);
  assert.ok(!onB('GONE'), 'so B learns of it too');
});

test('a protocol purged before it ever reached the cloud is removed locally and nothing is sent', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, 'LOCAL', 'recon', 0, '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 'pending')`, [USER]);
  const pid = db.getFirstSync('SELECT id FROM protocols').id;
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, sync_status) VALUES (?, ?, 'Taken', '2026-09-20T08:00:00Z', 'pending')`, [USER, pid]);
  E.purgeProtocol(db, pid, '2026-10-04T10:00:00Z');
  await pushPending(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols'), 0);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs'), 0);
  assert.equal(cloud.rows('protocols').length, 0);
});

test('a full import (new device) skips purged protocols and anything of theirs', async () => {
  const { cloud, A, gone } = await twoDevices();
  E.purgeProtocol(A, gone.pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  const C = makeDb();
  await fullImport(C, cloud, USER);
  assert.deepEqual(C.getAllSync('SELECT name FROM protocols').map((r) => r.name), ['KEEP']);
});
