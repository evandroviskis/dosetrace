'use strict';
// A-153 (Gate B review of A-142, 2026-10-20): the paused automatic purge of soft-deleted protocols
// (lib/protocolEnd purgeOldDeleted, AUTO_PURGE_PAUSED) marked the protocol sync_status 'deleted', so
// the push sent a protocol DELETE — but production has no DELETE policy on protocols (RLS answers 0
// rows): the local row went, the cloud row stayed, and the next full import brought the protocol
// back (in Recently deleted), with its doses orphaned or resurrected. Decided 2026-10-04 "Delete
// forever = positive tombstone": the purge must go THROUGH purgeProtocol, exactly like the manual
// Delete forever (purged_at on the cloud row, its dose logs and vials removed first).
// Founder 2026-10-15: "Recently deleted" never empties by itself — the purge STAYS OFF; only the code
// path is made correct and tested here, behind its existing switch.
// Behaviour runs the REAL lib/syncCore push / full import over the sync harness, with a cloud that
// applies RLS on DELETE and has no DELETE policy on protocols (as production).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, fullImport } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const NOW = '2026-10-25T10:00:00.000Z';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

function prodCloud() {
  const cloud = makeCloud();
  cloud.session = USER;
  cloud.sessionUserId = async () => cloud.session;
  cloud.delete = async (table, remoteId) => {
    const row = cloud._store[table].get(remoteId);
    // protocols: no DELETE policy in production — RLS answers 204 and 0 rows.
    if (table === 'protocols' || !row || row.user_id !== cloud.session) return { data: [], error: null };
    cloud._store[table].delete(remoteId);
    return { data: [{ id: remoteId }], error: null };
  };
  return cloud;
}

async function seed(db, cloud, name, deletedAt) {
  const p = await cloud.insert('protocols', { user_id: USER, name, type: 'recon', active: false, deleted_at: deletedAt });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, 'recon', 0, ?, '2026-08-01T00:00:00Z', ?, 'synced')`, [p.data.id, USER, name, deletedAt, p.data.updated_at]);
  const pid = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: '2026-08-02T08:00:00Z' });
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'Taken', '2026-08-02T08:00:00Z', ?, 'synced')`, [l.data.id, USER, pid, p.data.id, l.data.updated_at]);
  const v = await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  db.runSync(`INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, total_doses, updated_at, sync_status) VALUES (?, ?, ?, ?, 10, ?, 'synced')`, [v.data.id, USER, pid, p.data.id, v.data.updated_at]);
  return { pid, remote: p.data.id };
}
const cloudChildren = (cloud, remote) => cloud.rows('dose_logs', USER).filter((l) => l.protocol_id === remote).length
  + cloud.rows('vials', USER).filter((v) => v.protocol_id === remote).length;
function shownAnywhere(db, name) {
  const rd = E.recentlyDeletedQuery(NOW);
  const lists = [E.SQL_ACTIVE, E.SQL_ENDED, E.SQL_HISTORY].map((q) => db.getAllSync(q, [USER]));
  lists.push(db.getAllSync(rd.sql, [USER, ...rd.params]));
  return lists.some((rows) => rows.some((r) => r.name === name));
}

test('A-153: the purge stays OFF by default — nothing changes on the phone or in the cloud', async () => {
  assert.equal(E.AUTO_PURGE_PAUSED, true, 'founder 2026-10-15: Recently deleted never empties by itself');
  const cloud = prodCloud();
  const db = makeDb();
  const old = await seed(db, cloud, 'OLD', '2026-08-01T10:00:00.000Z');
  assert.equal(E.purgeOldDeleted(db, USER, NOW), 0);
  await pushPending(db, cloud, USER);
  const row = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [old.pid]);
  assert.equal(row.sync_status, 'synced');
  assert.equal(row.purged_at, null);
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ? AND sync_status = 'synced'`, [old.pid]), 1);
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ? AND sync_status = 'synced'`, [old.pid]), 1);
  assert.equal(cloud._store.protocols.get(old.remote).purged_at ?? null, null);
  assert.equal(cloudChildren(cloud, old.remote), 2);
  assert.ok(shownAnywhere(db, 'OLD'), 'still in Recently deleted');
});

test('A-153: when switched on, the purge writes the purged_at tombstone (like Delete forever), never a protocol DELETE', async () => {
  const cloud = prodCloud();
  const db = makeDb();
  const old = await seed(db, cloud, 'OLD', '2026-08-01T10:00:00.000Z');
  const recent = await seed(db, cloud, 'RECENT', '2026-10-24T10:00:00.000Z');
  const deletes = [];
  const del = cloud.delete;
  cloud.delete = async (t, id) => { deletes.push(t); return del(t, id); };
  assert.equal(E.purgeOldDeleted(db, USER, NOW, { paused: false }), 1);
  const local = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [old.pid]);
  assert.equal(local.purged_at, NOW, 'a positive tombstone, not sync_status deleted');
  assert.equal(local.sync_status, 'pending');
  assert.ok(!shownAnywhere(db, 'OLD'), 'hidden at once');
  await pushPending(db, cloud, USER);
  assert.ok(!deletes.includes('protocols'), 'no protocol DELETE is ever sent (production has no DELETE policy)');
  const tomb = cloud._store.protocols.get(old.remote);
  assert.ok(tomb, 'the cloud row stays');
  assert.equal(tomb.purged_at, NOW, 'with the tombstone');
  assert.equal(cloudChildren(cloud, old.remote), 0, 'its dose logs and vials removed from the cloud, nothing orphaned');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [old.pid]), 0, 'gone locally');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [old.pid]), 0);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ?', [old.pid]), 0);
  // The one inside the 7 days is untouched.
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [recent.pid]).sync_status, 'synced');
  assert.equal(cloudChildren(cloud, recent.remote), 2);
});

test('A-153: a purged protocol never comes back on a full import (same phone, or a new one)', async () => {
  const cloud = prodCloud();
  const db = makeDb();
  await seed(db, cloud, 'OLD', '2026-08-01T10:00:00.000Z');
  E.purgeOldDeleted(db, USER, NOW, { paused: false });
  await pushPending(db, cloud, USER);
  await fullImport(db, cloud, USER);
  assert.ok(!shownAnywhere(db, 'OLD'), 'not back in Recently deleted');
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM protocols WHERE name = 'OLD' AND purged_at IS NULL`), 0);
  const fresh = makeDb();
  await fullImport(fresh, cloud, USER);
  assert.equal(n(fresh, `SELECT COUNT(*) AS n FROM protocols WHERE name = 'OLD'`), 0, 'a new phone never imports it');
  assert.equal(n(fresh, 'SELECT COUNT(*) AS n FROM dose_logs'), 0, 'nor its doses');
  assert.equal(n(fresh, 'SELECT COUNT(*) AS n FROM vials'), 0);
});

test('A-153: the purge never touches a row already purged or already on its way out', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, purged_at, created_at, updated_at, sync_status) VALUES (?, 'P', 'recon', 0, '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', 'pending')`, [USER]);
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, 'D', 'recon', 0, '2026-08-01T10:00:00Z', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', 'deleted')`, [USER]);
  assert.equal(E.purgeOldDeleted(db, USER, NOW, { paused: false }), 0);
  assert.equal(db.getFirstSync(`SELECT purged_at FROM protocols WHERE name = 'P'`).purged_at, '2026-09-01T10:00:00Z', 'the first tombstone date stays');
  assert.equal(db.getFirstSync(`SELECT sync_status FROM protocols WHERE name = 'D'`).sync_status, 'deleted');
});
