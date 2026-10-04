'use strict';
// Final Gate B (2026-10-04, decided by the ledger — never destroy on a maybe): nothing is removed
// from a device because a row is ABSENT from the cloud. reconcileVanishedProtocols (and its orphan
// cleanup) is gone; only a positive tombstone (purged_at, purgeTombstone.test.js) removes a
// protocol elsewhere.
//   R-C: an older build's 30-day auto-purge hard-deletes a protocol with no purged_at → this
//        device KEEPS its local copy and its dose history.
//   R-B: an incomplete id list removes nothing.
//   R-A: a pending child is never deleted — not by a pull, not by a push that finds 0 rows.
//   A push that finds 0 rows only counts when the same user's session is there (a missing
//   session reads as 0 rows under RLS): otherwise nothing is removed and it retries next sync.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const core = require('../lib/syncCore');
const { pushPending, pullChanges, fullImport } = core;
const E = require('../lib/protocolEnd');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

async function seedSynced(db, cloud, name, { deleted = false } = {}) {
  const p = await cloud.insert('protocols', { user_id: USER, name, type: 'recon', active: !deleted, deleted_at: deleted ? '2026-09-01T00:00:00Z' : null });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, 'recon', ?, ?, '2026-08-01T00:00:00Z', ?, 'synced')`, [p.data.id, USER, name, deleted ? 0 : 1, deleted ? '2026-09-01T00:00:00Z' : null, p.data.updated_at]);
  const pid = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  for (const d of ['2026-08-20', '2026-08-21']) {
    const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
    db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'Taken', ?, ?, 'synced')`, [l.data.id, USER, pid, p.data.id, `${d}T08:00:00Z`, l.data.updated_at]);
  }
  return { pid, remote: p.data.id };
}
// An older build's auto-purge: a hard delete, the cloud cascading the children. No purged_at.
async function oldBuildHardDelete(cloud, remote) {
  for (const t of ['dose_logs', 'vials']) for (const r of cloud.rows(t, USER).filter((x) => x.protocol_id === remote)) await cloud.delete(t, r.id);
  await cloud.delete('protocols', remote);
}

test('R-C: a protocol an older build auto-purged (no purged_at) stays on this 1.3.0 device with its history', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const keep = await seedSynced(B, cloud, 'KEEP');
  const old = await seedSynced(B, cloud, 'OLD', { deleted: true });
  await oldBuildHardDelete(cloud, old.remote);
  await pullChanges(B, cloud, USER);
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT id FROM protocols WHERE id = ?', [old.pid]), 'the local copy is kept');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [old.pid]), 2, 'and its dose history');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [keep.pid]), 2);
});

test('R-C: even an active protocol whose cloud row vanished is kept (and every child of it)', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedSynced(B, cloud, 'ACTIVE');
  await seedSynced(B, cloud, 'OTHER');
  await oldBuildHardDelete(cloud, p.remote);
  await pullChanges(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT id FROM protocols WHERE id = ?', [p.pid]));
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [p.pid]), 2);
});

test('R-B: an incomplete id list removes nothing', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  await seedSynced(B, cloud, 'TWO');
  const one = await seedSynced(B, cloud, 'ONE'); // newer: the watermark sits past TWO
  cloud.fetchIds = async () => ({ data: [one.remote], error: null, sessionVerified: true }); // a short page
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols'), 2);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs'), 4);
  cloud.fetchIds = async () => ({ data: [], error: null, sessionVerified: true, emptyVerified: true });
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols'), 2, 'nor an empty one');
});

test('R-A: a pending dose pointing at a cloud protocol no local row owns is never deleted by a pull', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  await seedSynced(B, cloud, 'LIVE');
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, sync_status) VALUES (?, NULL, 'cloud-gone', 'Taken', '2026-10-04T08:00:00Z', 'pending')`, [USER]);
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'pending'`), 1);
});

test('a push that finds 0 rows never removes a protocol: it comes back soft-deleted with its history (purgeRevive.test.js)', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedSynced(B, cloud, 'X');
  await oldBuildHardDelete(cloud, p.remote);
  B.runSync(`UPDATE protocols SET name = 'X edited', sync_status = 'pending' WHERE id = ?`, [p.pid]);
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-10-04T08:00:00Z', '2026-10-04T08:00:00Z', 'pending')`, [USER, p.pid, p.remote]);
  await pushPending(B, cloud, USER);
  const kept = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [p.pid]);
  assert.ok(kept && kept.deleted_at && kept.active === 0 && !kept.purged_at);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [p.pid]), 3, 'synced and pending doses kept');
  assert.equal(cloud.rows('dose_logs', USER).length, 3, 'and back in the cloud');
});

test('a 0-row answer without the same user\'s session removes nothing (it retries next sync)', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedSynced(B, cloud, 'X');
  B.runSync(`UPDATE protocols SET name = 'X edited', sync_status = 'pending' WHERE id = ?`, [p.pid]);
  const upd = cloud.update.bind(cloud);
  cloud.update = async () => ({ data: [], error: null }); // RLS without a session: 0 rows, no error
  cloud.sessionUserId = async () => null;
  await pushPending(B, cloud, USER);
  assert.equal(B.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [p.pid]).sync_status, 'pending', 'kept, still to push');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [p.pid]), 2);
  cloud.sessionUserId = async () => 'u2'; // another account's session
  await pushPending(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT id FROM protocols WHERE id = ?', [p.pid]));
  cloud.update = upd;
  cloud.sessionUserId = async () => USER;
  await pushPending(B, cloud, USER);
  assert.equal(B.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [p.pid]).sync_status, 'synced', 'the edit goes up once the session is back');
});

test('a full import never drops a protocol, dose log or vial because the cloud lacks it', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedSynced(B, cloud, 'X');
  await oldBuildHardDelete(cloud, p.remote);
  await fullImport(B, cloud, USER);
  assert.ok(B.getFirstSync('SELECT id FROM protocols WHERE id = ?', [p.pid]));
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [p.pid]), 2);
});

test('deletion by absence is gone from the code', () => {
  assert.equal(core.reconcileVanishedProtocols, undefined);
  assert.equal(core.emptyIdsVerified, undefined);
  assert.equal(core.removeProtocolTree, undefined);
  const src = read('lib/syncCore.js');
  assert.doesNotMatch(src, /reconcileVanishedProtocols|removeProtocolTree|emptyVerified/);
  assert.doesNotMatch(read('lib/sync.js'), /emptyIdsVerified|emptyVerified/);
});

test('the real adapter reports the session user (the 0-row guard)', () => {
  const s = read('lib/sync.js');
  assert.match(s, /async sessionUserId\(\) \{[\s\S]{0,200}supabase\.auth\.getSession\(\)/);
});
