'use strict';
// A-142 (Gate B review of A-137, 2026-10-17): a row marked deleted on this phone was hard-deleted
// locally as soon as the cloud DELETE returned no error. Without a session (the anon key) or under
// another user's session, PostgREST answers a DELETE of someone else's row with 204 and 0 rows:
// the local row went, the cloud row stayed, and the next import brought it back. The rules:
//   1. the cloud adapter asks the DELETE for the rows it removed (lib/sync.js .select('id'));
//   2. 1 row removed → the local row goes (as before);
//   3. 0 rows under the same user's session → the row was already deleted elsewhere: the local row
//      goes (deletions win, nothing stuck);
//   4. 0 rows without a session, or under another user's → nothing is decided: the local row stays
//      'deleted' (hidden, still unsent) and the next pass retries;
//   5. the same rule for a Delete forever's dose logs and vials (lib/syncCore pushPurge): a child
//      that did not go keeps the tombstone back, so no device sees a tombstone next to live rows.
// Behaviour runs the REAL lib/syncCore push over the sync harness with a cloud that applies RLS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, fullImport } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

// The harness cloud with Supabase's RLS on DELETE: only the signed-in owner's rows are removed, and
// the reply lists the rows removed (lib/sync.js asks for them).
function rlsCloud() {
  const cloud = makeCloud();
  cloud.session = USER;
  cloud.sessionUserId = async () => cloud.session;
  cloud.delete = async (table, remoteId) => {
    const row = cloud._store[table].get(remoteId);
    if (!row || !cloud.session || row.user_id !== cloud.session) return { data: [], error: null };
    cloud._store[table].delete(remoteId);
    return { data: [{ id: remoteId }], error: null };
  };
  return cloud;
}

async function seed(db, cloud) {
  const p = await cloud.insert('protocols', { user_id: USER, name: 'BPC', type: 'recon', active: true });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, created_at, updated_at, sync_status) VALUES (?, ?, 'BPC', 'recon', 1, '2026-09-01T00:00:00Z', ?, 'synced')`, [p.data.id, USER, p.data.updated_at]);
  const pid = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: '2026-10-10T08:00:00Z' });
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'Taken', '2026-10-10T08:00:00Z', ?, 'synced')`, [l.data.id, USER, pid, p.data.id, l.data.updated_at]);
  const lid = db.getFirstSync('SELECT id FROM dose_logs WHERE remote_id = ?', [l.data.id]).id;
  return { pid, remote: p.data.id, lid, logRemote: l.data.id };
}
const markDeleted = (db, id) => db.runSync(`UPDATE dose_logs SET sync_status = 'deleted', updated_at = '2026-10-17T10:00:00Z' WHERE id = ?`, [id]);

test('A-142 (4)(2): no session -> the deleted dose stays deleted here and in the queue; signed in again -> it goes from the cloud and the phone', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  markDeleted(db, s.lid);
  cloud.session = null; // the anon key: RLS answers 0 rows
  await pushPending(db, cloud, USER);
  assert.ok(cloud._store.dose_logs.get(s.logRemote), 'the cloud row survived');
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [s.lid])?.sync_status, 'deleted', 'so the local row is kept, still to send');
  cloud.session = USER;
  await pushPending(db, cloud, USER);
  assert.equal(cloud._store.dose_logs.get(s.logRemote), undefined, 'the retry removes it in the cloud');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE id = ?', [s.lid]), 0, 'and then on the phone');
});

test('A-142 (4): another user\'s session -> nothing is decided, the row is kept for the retry', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  markDeleted(db, s.lid);
  cloud.session = 'someone-else';
  await pushPending(db, cloud, USER);
  assert.ok(cloud._store.dose_logs.get(s.logRemote));
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [s.lid])?.sync_status, 'deleted');
});

test('A-142 (3): 0 rows under the same user\'s session -> already deleted elsewhere, the local row goes (nothing stuck)', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  markDeleted(db, s.lid);
  cloud._store.dose_logs.delete(s.logRemote); // the other phone deleted it first
  await pushPending(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE id = ?', [s.lid]), 0);
});

test('A-142: after a no-session pass, a fresh import does not bring the deleted dose back to the screen', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  markDeleted(db, s.lid);
  cloud.session = null;
  await pushPending(db, cloud, USER);
  await fullImport(db, cloud, USER);
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status != 'deleted'`), 0, 'the deleted dose is not shown again');
});

test('A-142 (5): Delete forever without a session -> the children stay deleted here, no tombstone yet; with the session it completes', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  db.runSync(`UPDATE protocols SET active = 0, deleted_at = '2026-10-01T00:00:00Z' WHERE id = ?`, [s.pid]);
  assert.equal(E.purgeProtocol(db, s.pid, '2026-10-17T10:00:00Z'), true);
  cloud.session = null;
  await pushPending(db, cloud, USER);
  assert.ok(cloud._store.dose_logs.get(s.logRemote), 'the cloud dose survived');
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM dose_logs WHERE id = ? AND sync_status = 'deleted'`, [s.lid]), 1, 'the local child is kept for the retry');
  assert.ok(!cloud._store.protocols.get(s.remote).purged_at, 'no tombstone next to a live child');
  cloud.session = USER;
  await pushPending(db, cloud, USER);
  assert.equal(cloud._store.dose_logs.get(s.logRemote), undefined);
  assert.ok(cloud._store.protocols.get(s.remote).purged_at, 'then the tombstone');
});

test('A-142 (1): the Supabase adapter asks the DELETE for the rows it removed; the push decides through one rule', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', 'lib/sync.js'), 'utf8');
  assert.match(sync, /async delete\(table, remoteId\) \{\s*return await supabase\.from\(table\)\.delete\(\)\.eq\('id', remoteId\)\.select\('id'\);/);
  const core = fs.readFileSync(path.join(__dirname, '..', 'lib/syncCore.js'), 'utf8');
  assert.equal((core.match(/await cloud\.delete\(/g) || []).length, 1, 'every cloud delete goes through cloudDeleted');
});

// Gate B review of A-142, finding 1: the DELETE reads its token on its own. A session that comes
// back between the DELETE (sent with the anon key: 0 rows) and the check after it must not count
// as "already deleted elsewhere": the session is read before AND after, both must be the owner's
// (as lib/sync.js fetchIds does).
test('A-142 (6): no session when the DELETE goes out, the session back right after -> the row is kept for the retry', async () => {
  const cloud = rlsCloud();
  const db = makeDb();
  const s = await seed(db, cloud);
  markDeleted(db, s.lid);
  cloud.session = null;
  const del = cloud.delete;
  cloud.delete = async (table, id) => { const r = await del(table, id); cloud.session = USER; return r; }; // a refresh lands just after
  await pushPending(db, cloud, USER);
  assert.ok(cloud._store.dose_logs.get(s.logRemote), 'the cloud row survived');
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [s.lid])?.sync_status, 'deleted', 'so it is kept');
});
