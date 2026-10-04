'use strict';
// Final Gate B (2026-10-04, decided by the ledger — never destroy on a maybe), residual R-C closed:
// a protocol push that finds 0 rows with NO purged_at evidence (the cloud row is simply gone — an
// older build's automatic purge or manual delete, we cannot tell) may hold the LAST copy of that
// history. It is never deleted: the protocol is re-inserted (same id where possible, else a new
// one) as SOFT-DELETED — it lands in Recently deleted, never silently active — and its dose logs
// and vials go back up (same ids where possible), so the history exists in the cloud again. The
// user can then Delete forever deliberately (the tombstone path). A dose log or vial whose
// protocol exists here is re-inserted the same way instead of dropped.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;
const recentlyDeleted = (db) => { const q = E.recentlyDeletedQuery(); return db.getAllSync(q.sql, [USER, ...q.params]); };

// Cloud P (active) with 2 dose logs and a vial; device B synced it all.
async function setup() {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', dose: '250', active: true, deleted_at: null });
  for (const d of ['2026-08-20', '2026-08-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const pid = B.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  return { cloud, B, remote: p.data.id, pid };
}
// An older build purges P: a hard delete, the cloud cascading its children. No purged_at.
async function oldBuildPurge(cloud, remote) {
  for (const t of ['dose_logs', 'vials']) for (const r of cloud.rows(t, USER).filter((x) => x.protocol_id === remote)) await cloud.delete(t, r.id);
  await cloud.delete('protocols', remote);
}
const cloudKids = (cloud, remote) => ({
  logs: cloud.rows('dose_logs', USER).filter((l) => l.protocol_id === remote),
  vials: cloud.rows('vials', USER).filter((v) => v.protocol_id === remote),
});

test('an older build purged P, B edits P → P comes back in B\'s Recently deleted with its full history, and the cloud has it again', async () => {
  const { cloud, B, remote, pid } = await setup();
  const logIds = B.getAllSync('SELECT remote_id FROM dose_logs WHERE protocol_id = ? ORDER BY remote_id', [pid]).map((r) => r.remote_id);
  await oldBuildPurge(cloud, remote);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);

  const local = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.ok(local, 'never deleted');
  assert.equal(local.active, 0);
  assert.ok(local.deleted_at, 'soft-deleted');
  assert.ok(!local.purged_at);
  assert.equal(local.name, 'P edited', 'the edit is kept');
  assert.equal(local.sync_status, 'synced');
  assert.deepEqual(recentlyDeleted(B).map((r) => r.id), [pid], 'it lands in Recently deleted');
  assert.equal(B.getAllSync(E.SQL_ACTIVE, [USER]).length, 0, 'never silently active');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [pid]), 2, 'its history stays here');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ?', [pid]), 1);

  const back = cloud._store.protocols.get(remote);
  assert.ok(back, 'the cloud has it again, same id');
  assert.equal(back.active, false);
  assert.ok(back.deleted_at);
  assert.equal(back.name, 'P edited');
  const kids = cloudKids(cloud, remote);
  assert.deepEqual(kids.logs.map((l) => l.id).sort(), logIds, 'its dose logs are back, same ids');
  assert.equal(kids.vials.length, 1);
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status != 'synced'`), 0);

  // The user then deletes it forever, deliberately: the tombstone path.
  assert.equal(E.purgeProtocol(B, pid, '2026-10-04T12:00:00Z'), true);
  await pushPending(B, cloud, USER);
  assert.equal(cloud._store.protocols.get(remote).purged_at, '2026-10-04T12:00:00Z');
  assert.equal(cloudKids(cloud, remote).logs.length + cloudKids(cloud, remote).vials.length, 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [pid]), 0);
});

test('another device that kept P sees it come back soft-deleted, with no duplicate history', async () => {
  const { cloud, B, remote, pid } = await setup();
  const C = makeDb();
  await pullChanges(C, cloud, USER);
  await oldBuildPurge(cloud, remote);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);
  await pullChanges(C, cloud, USER);
  const onC = C.getFirstSync('SELECT * FROM protocols WHERE remote_id = ?', [remote]);
  assert.equal(onC.active, 0);
  assert.ok(onC.deleted_at);
  assert.equal(n(C, 'SELECT COUNT(*) AS n FROM dose_logs'), 2, 'same ids: no duplicates');
  assert.equal(n(C, 'SELECT COUNT(*) AS n FROM vials'), 1);
});

test('an unsynced dose of P goes up with it', async () => {
  const { cloud, B, remote, pid } = await setup();
  await oldBuildPurge(cloud, remote);
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-10-04T08:00:00Z', 'L2', 'pending')`, [USER, pid, remote]);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);
  assert.equal(cloudKids(cloud, remote).logs.length, 3);
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'synced' AND protocol_id = ?`, [pid]), 3);
});

test('when the same id cannot be reused, P gets a new cloud id and its history follows it', async () => {
  const { cloud, B, remote, pid } = await setup();
  await oldBuildPurge(cloud, remote);
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => (p.id ? { data: null, error: { code: '23505', message: 'duplicate key' } } : ins(t, p));
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);
  const local = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.notEqual(local.remote_id, remote);
  assert.ok(cloud._store.protocols.get(local.remote_id));
  const kids = cloudKids(cloud, local.remote_id);
  assert.equal(kids.logs.length, 2);
  assert.equal(kids.vials.length, 1);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_remote_id = ? AND sync_status = \'synced\'', [local.remote_id]), 2);
});

test('an edited dose log of a protocol that exists here is re-inserted, not dropped, when its cloud row is gone', async () => {
  const { cloud, B, pid } = await setup();
  const log = B.getFirstSync('SELECT * FROM dose_logs WHERE protocol_id = ? ORDER BY id LIMIT 1', [pid]);
  await cloud.delete('dose_logs', log.remote_id);
  B.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L3', sync_status = 'pending' WHERE id = ?`, [log.id]);
  await pushPending(B, cloud, USER);
  const kept = B.getFirstSync('SELECT * FROM dose_logs WHERE id = ?', [log.id]);
  assert.ok(kept, 'never dropped');
  assert.equal(kept.sync_status, 'synced');
  assert.equal(cloud._store.dose_logs.get(log.remote_id).outcome, 'Skipped', 'back in the cloud, same id');
});

test('a dose log edited while its protocol\'s cloud row is gone too: the protocol is revived next, then the log', async () => {
  const { cloud, B, remote, pid } = await setup();
  await oldBuildPurge(cloud, remote);
  const log = B.getFirstSync('SELECT * FROM dose_logs WHERE protocol_id = ? ORDER BY id LIMIT 1', [pid]);
  B.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L3', sync_status = 'pending' WHERE id = ?`, [log.id]);
  // the harness has no foreign key: emulate it (a child of a missing protocol is refused)
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => ((t === 'dose_logs' || t === 'vials') && !cloud._store.protocols.get(p.protocol_id) ? { data: null, error: { code: '23503', message: 'foreign key' } } : ins(t, p));
  await pushPending(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT id FROM dose_logs WHERE id = ?', [log.id]), 'kept while it cannot go up');
  await pushPending(B, cloud, USER);
  assert.ok(cloud._store.protocols.get(remote), 'the protocol is back');
  assert.equal(B.getFirstSync('SELECT active, deleted_at FROM protocols WHERE id = ?', [pid]).active, 0);
  assert.equal(cloudKids(cloud, remote).logs.length, 2);
  assert.equal(cloud._store.dose_logs.get(log.remote_id).outcome, 'Skipped');
});

test('without the same user\'s session nothing is re-inserted or changed (retried next sync)', async () => {
  const { cloud, B, remote, pid } = await setup();
  await oldBuildPurge(cloud, remote);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  cloud.sessionUserId = async () => null;
  await pushPending(B, cloud, USER);
  const local = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.equal(local.sync_status, 'pending');
  assert.equal(local.active, 1);
  assert.ok(!cloud._store.protocols.get(remote));
});
