'use strict';
// A-87 (journey review F3, dt-council 2026-10-04): End / Delete wins across devices. Phone A ends
// or deletes a protocol; phone B was offline with a pending edit on it (an oral Taken writes
// units_taken onto the protocol row). B's push must not send active=true / deleted_at=null back
// over A's end, and B's pull must take the end. Status fields go up only from the device that
// changed the status (status_at, local).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { toCloudPayload } = require('../lib/syncMappers');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const row = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);

async function twoPhones() {
  const cloud = makeCloud();
  await cloud.insert('protocols', { user_id: USER, name: 'NAD+', type: 'oral', active: true, deleted_at: null, units_taken: 3 });
  const A = makeDb(); const B = makeDb();
  await pullChanges(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  const remote = cloud.rows('protocols', USER)[0].id;
  return { cloud, A, B, aId: A.getFirstSync('SELECT id FROM protocols').id, bId: B.getFirstSync('SELECT id FROM protocols').id, remote };
}

// B logs a capsule offline: only units_taken changes (the way lib/doseActions does it).
function offlineCapsule(B, bId) {
  B.runSync(`UPDATE protocols SET units_taken = units_taken + 1, updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [bId]);
}

test('A ends it, B pushes an offline capsule afterwards: the cloud stays ended and B shows Ended', async () => {
  const { cloud, A, B, aId, bId, remote } = await twoPhones();
  offlineCapsule(B, bId);
  E.endProtocol(A, aId, '2026-10-04T09:00:00Z');
  await pushPending(A, cloud, USER);
  await pushPending(B, cloud, USER);
  const c = cloud._store.protocols.get(remote);
  assert.equal(c.active, false, 'B never re-activates it in the cloud');
  assert.ok(c.ended_at, 'the end stays');
  assert.equal(c.units_taken, 4, "B's capsule still counts");
  await pullChanges(B, cloud, USER);
  const b = row(B, bId);
  assert.equal(b.active, 0);
  assert.ok(b.ended_at);
  assert.deepEqual(B.getAllSync(E.SQL_ENDED, [USER]).map((r) => r.id), [bId]);
});

test('B pulls BEFORE pushing its pending capsule: the pull takes the end, the push keeps it', async () => {
  const { cloud, A, B, aId, bId, remote } = await twoPhones();
  offlineCapsule(B, bId);
  E.endProtocol(A, aId, '2026-10-04T09:00:00Z');
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  const b = row(B, bId);
  assert.equal(b.active, 0, 'the end reaches a row with a pending edit');
  assert.equal(b.sync_status, 'pending', 'the capsule is still to be sent');
  await pushPending(B, cloud, USER);
  assert.equal(cloud._store.protocols.get(remote).active, false);
});

test('A deletes it, B pushes an offline capsule: it stays in Recently deleted everywhere', async () => {
  const { cloud, A, B, aId, bId, remote } = await twoPhones();
  offlineCapsule(B, bId);
  E.softDeleteRow(A, aId, '2026-10-04T09:00:00Z');
  await pushPending(A, cloud, USER);
  await pushPending(B, cloud, USER);
  assert.ok(cloud._store.protocols.get(remote).deleted_at, 'B never un-deletes it');
  await pullChanges(B, cloud, USER);
  assert.ok(row(B, bId).deleted_at);
});

test('the device that changed the status does send it (end, delete, restore)', async () => {
  const { cloud, A, aId, remote } = await twoPhones();
  E.endProtocol(A, aId, '2026-10-04T09:00:00Z');
  await pushPending(A, cloud, USER);
  assert.equal(cloud._store.protocols.get(remote).active, false);
  assert.equal(row(A, aId).status_at, null, 'the mark is cleared once pushed');
  E.softDeleteRow(A, aId, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  assert.ok(cloud._store.protocols.get(remote).deleted_at);
  E.restoreDeleted(A, aId, '2026-10-04T11:00:00Z');
  await pushPending(A, cloud, USER);
  assert.equal(cloud._store.protocols.get(remote).deleted_at, null);
});

test('payload: an update without a status change carries no status fields; a new row carries them', () => {
  const synced = { id: 1, remote_id: 'r1', name: 'P', active: 1, deleted_at: null, ended_at: null, status_at: null };
  const p = toCloudPayload('protocols', synced);
  assert.ok(!('active' in p) && !('deleted_at' in p) && !('ended_at' in p));
  const changed = toCloudPayload('protocols', { ...synced, active: 0, ended_at: 'T', status_at: 'T' });
  assert.equal(changed.active, false);
  assert.equal(changed.ended_at, 'T');
  assert.ok('deleted_at' in changed);
  const fresh = toCloudPayload('protocols', { ...synced, remote_id: null });
  assert.equal(fresh.active, true);
  assert.ok('deleted_at' in fresh);
});

// Gate B review of A-87 (2026-10-04), finding 1: the user taps End while a capsule push is in
// flight. The update's returned status must never overwrite the End made meanwhile, and the next
// push must send the End, not an undone status.
test('End tapped while an edit push is in flight survives, here and in the cloud', async () => {
  const { cloud, A, aId, remote } = await twoPhones();
  A.runSync(`UPDATE protocols SET units_taken = 4, updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [aId]);
  const realUpdate = cloud.update.bind(cloud);
  cloud.update = async (t, r, p) => { const res = await realUpdate(t, r, p); if (t === 'protocols') E.endProtocol(A, aId, '2026-10-04T09:00:00Z'); return res; };
  await pushPending(A, cloud, USER);
  cloud.update = realUpdate;
  const local = row(A, aId);
  assert.equal(local.active, 0, 'the End survives the returned row');
  assert.ok(local.ended_at);
  await pushPending(A, cloud, USER);
  const c = cloud._store.protocols.get(remote);
  assert.equal(c.active, false);
  assert.ok(c.ended_at);
});

// Finding 2: a phone updated from 1.2.x has rows with a status change still pending and no
// status_at (the column is new). The upgrade marks them, so the change is still sent.
test('upgrade from 1.2.x: a pending delete made on the old build still reaches the cloud', async () => {
  const { cloud, A, aId, remote } = await twoPhones();
  A.execSync('ALTER TABLE protocols DROP COLUMN status_at'); // the 1.2.x local table
  A.runSync(`UPDATE protocols SET active = 0, deleted_at = '2026-10-01T00:00:00Z', updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [aId]);
  E.addStatusAtColumn(A); // what lib/database.js runs at start-up
  await pullChanges(A, cloud, USER);
  await pushPending(A, cloud, USER);
  assert.ok(row(A, aId).deleted_at, 'the old-build delete survives here');
  assert.ok(cloud._store.protocols.get(remote).deleted_at, 'and reaches the cloud');
});

test('upgrade backfill runs once: rows that were synced get no status mark', () => {
  const db = makeDb();
  db.execSync('ALTER TABLE protocols DROP COLUMN status_at');
  db.runSync(`INSERT INTO protocols (user_id, remote_id, name, type, active, updated_at, sync_status) VALUES ('u1','r1','A','oral',1,'T1','synced')`);
  db.runSync(`INSERT INTO protocols (user_id, remote_id, name, type, active, updated_at, sync_status) VALUES ('u1','r2','B','oral',0,'T2','pending')`);
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, updated_at, sync_status) VALUES ('u1','C','oral',1,'T3','pending')`);
  // an end pushed before the cloud had ended_at (synced, the column still to send): still this phone's change
  db.runSync(`INSERT INTO protocols (user_id, remote_id, name, type, active, ended_at, optional_pending, updated_at, sync_status) VALUES ('u1','r4','D','oral',0,'E1','ended_at','T4','synced')`);
  E.addStatusAtColumn(db);
  const m = Object.fromEntries(db.getAllSync('SELECT name, status_at FROM protocols').map((r) => [r.name, r.status_at]));
  assert.equal(m.A, null);
  assert.equal(m.B, 'T2');
  assert.equal(m.C, null, 'a never-pushed row sends its status anyway');
  assert.equal(m.D, 'T4', 'an end still waiting for its column keeps authority');
  E.addStatusAtColumn(db); // a second start-up changes nothing
  db.runSync(`UPDATE protocols SET status_at = NULL WHERE name = 'B'`);
  E.addStatusAtColumn(db);
  assert.equal(db.getFirstSync(`SELECT status_at FROM protocols WHERE name = 'B'`).status_at, null);
});

// Finding 5: once the cloud's state is taken over the local row, the local status change is settled.
test('a row that takes the cloud state keeps no status mark', async () => {
  const { cloud, A, B, aId, bId } = await twoPhones();
  E.endProtocol(B, bId, '2026-10-04T08:00:00Z');
  B.runSync(`UPDATE protocols SET sync_status = 'synced', updated_at = '' WHERE id = ?`, [bId]); // marked synced without a push (low watermark: the pull brings the cloud row)
  A.runSync(`UPDATE protocols SET name = 'NAD+ 2', updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [aId]);
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(row(B, bId).status_at, null);
});

