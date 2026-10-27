'use strict';
// A-185 (found on the Fold development client 2026-10-26): a ready-to-use vial added by EDITING a
// protocol that is already in the cloud (Edit protocol → vial size) was saved without
// protocol_remote_id. A child row waits for its parent's cloud id, and that id is filled only when
// the protocol itself is first inserted — so this vial waited forever (pending, never in the cloud;
// since 1.3.0). Rules: (1) the sync fills a missing protocol_remote_id from the local parent that
// already has one, then pushes the row; (2) a child whose parent has no cloud id yet still waits;
// (3) the Edit protocol path writes the parent's cloud id itself.
// Runs the REAL lib/syncCore over the sync harness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud, seedLocalProtocol } = require('./helpers/syncHarness');
const { pushPending } = require('../lib/syncCore');

const USER = 'u1';

async function syncedProtocol(db, cloud) {
  const p = await cloud.insert('protocols', { user_id: USER, name: 'Testosterone Cypionate', type: 'rtu', active: true });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, created_at, updated_at, sync_status) VALUES (?, ?, 'Testosterone Cypionate', 'rtu', 1, 'T0', ?, 'synced')`, [p.data.id, USER, p.data.updated_at]);
  return { pid: db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id, remote: p.data.id };
}

test('A-185 (defect): a vial saved without protocol_remote_id under a synced protocol reaches the cloud', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  // What Edit protocol wrote (screens/ProtocolsScreen insertVial without protocol_remote_id).
  const vid = db.runSync(`INSERT INTO vials (user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, active, updated_at, sync_status) VALUES (?, ?, NULL, 10, 20, 1, 0, 'L1', 'pending')`, [USER, p.pid]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  const row = db.getFirstSync('SELECT * FROM vials WHERE id = ?', [vid]);
  assert.equal(row.protocol_remote_id, p.remote, 'the link is filled from the parent');
  assert.equal(row.sync_status, 'synced');
  const inCloud = cloud.rows('vials').filter((v) => v.protocol_id === p.remote);
  assert.equal(inCloud.length, 1);
  assert.equal(inCloud[0].doses_taken, 1);
});

test('A-185: a dose log with the same gap is healed the same way', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const lid = db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', '2026-10-26T23:40:00.000Z', 'L1', 'pending')`, [USER, p.pid]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [lid]).sync_status, 'synced');
});

test('A-185: a child whose parent is not in the cloud yet still waits (and goes up with it)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'TB-500' });
  // Simulate an offline parent: the cloud refuses protocol inserts this pass.
  const realInsert = cloud.insert;
  cloud.insert = async (table, row) => (table === 'protocols' ? { data: null, error: { message: 'TypeError: Network request failed' } } : realInsert.call(cloud, table, row));
  const vid = db.runSync(`INSERT INTO vials (user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, active, updated_at, sync_status) VALUES (?, ?, NULL, 10, 20, 0, 1, 'L1', 'pending')`, [USER, pid]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT sync_status FROM vials WHERE id = ?', [vid]).sync_status, 'pending');
  assert.equal(cloud.rows('vials').length, 0);
  cloud.insert = realInsert;
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT sync_status FROM vials WHERE id = ?', [vid]).sync_status, 'synced');
});

test('A-185: Edit protocol writes the parent\'s cloud id on a new ready-to-use vial', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  const at = src.indexOf('const vialPatch = editStartRef.current');
  const block = src.slice(at, at + 700);
  assert.match(block, /insertVial\(\{[^}]*protocol_remote_id:/);
});

test('A-185 (review): the link comes only from a protocol of the same account', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  // Another account's synced protocol still on the phone under local id 1.
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, created_at, updated_at, sync_status) VALUES ('other-remote', 'u2', 'Other', 'rtu', 1, 'T0', 'T0', 'synced')`);
  const otherPid = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = 'other-remote'`).id;
  const vid = db.runSync(`INSERT INTO vials (user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, active, updated_at, sync_status) VALUES (?, ?, NULL, 10, 20, 0, 1, 'L1', 'pending')`, [USER, otherPid]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  const row = db.getFirstSync('SELECT protocol_remote_id, sync_status FROM vials WHERE id = ?', [vid]);
  assert.equal(row.protocol_remote_id, null, 'never linked to another account\'s protocol');
  assert.equal(row.sync_status, 'pending');
  assert.equal(cloud.rows('vials').length, 0);
});

test('A-185 (review): a child of a protocol deleted forever still waits after the link is filled (R-A)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  db.runSync(`UPDATE protocols SET purged_at = '2026-10-26T23:00:00.000Z' WHERE id = ?`, [p.pid]);
  const vid = db.runSync(`INSERT INTO vials (user_id, protocol_id, mixed_on, water_ml, total_doses, doses_taken, active, updated_at, sync_status) VALUES (?, ?, NULL, 10, 20, 0, 1, 'L1', 'pending')`, [USER, p.pid]).lastInsertRowId;
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT sync_status FROM vials WHERE id = ?', [vid]).sync_status, 'pending');
  assert.equal(cloud.rows('vials').filter((v) => v.protocol_id === p.remote).length, 0);
});
