'use strict';
// Final Gate B PASS-WITH-FIXES, UX: a revive caused by the user's Restore keeps what the user asked
// for. An older build purged the soft-deleted protocol in the cloud; the user taps Restore on
// 1.3.0; the push finds 0 rows and re-inserts it — RESTORED (active, or Ended when it had ended),
// never back in Recently deleted (no double Restore). Any other 0-row revive stays soft-deleted.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;
const recentlyDeleted = (db) => { const q = E.recentlyDeletedQuery(); return db.getAllSync(q.sql, [USER, ...q.params]); };

async function setup({ ended = false } = {}) {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: false, deleted_at: '2026-09-01T00:00:00Z', ended_at: ended ? '2026-08-25T00:00:00Z' : null });
  for (const d of ['2026-08-20', '2026-08-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const pid = B.getFirstSync('SELECT id FROM protocols').id;
  // an older build's purge: hard delete, children cascaded
  for (const r of cloud.rows('dose_logs', USER)) await cloud.delete('dose_logs', r.id);
  await cloud.delete('protocols', p.data.id);
  return { cloud, B, pid, remote: p.data.id };
}

test('Restore after an older build purged it: it comes back ACTIVE, not in Recently deleted, history and cloud back', async () => {
  const { cloud, B, pid, remote } = await setup();
  assert.equal(E.restoreDeleted(B, pid, '2026-10-04T09:00:00Z'), 'active');
  await pushPending(B, cloud, USER);
  const p = B.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.equal(p.active, 1);
  assert.equal(p.deleted_at, null);
  assert.equal(p.sync_status, 'synced');
  assert.equal(recentlyDeleted(B).length, 0, 'no double Restore');
  assert.deepEqual(B.getAllSync(E.SQL_ACTIVE, [USER]).map((r) => r.id), [pid]);
  const c = cloud._store.protocols.get(remote);
  assert.equal(c.active, true);
  assert.equal(c.deleted_at, null);
  assert.equal(cloud.rows('dose_logs', USER).length, 2);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [pid]), 2);
});

test('Restore of one that had ended: it comes back in Ended', async () => {
  const { cloud, B, pid } = await setup({ ended: true });
  assert.equal(E.restoreDeleted(B, pid, '2026-10-04T09:00:00Z'), 'ended');
  await pushPending(B, cloud, USER);
  assert.deepEqual(B.getAllSync(E.SQL_ENDED, [USER]).map((r) => r.id), [pid]);
  assert.equal(recentlyDeleted(B).length, 0);
});

test('once the restore is pushed, a later 0-row revive (an edit) is soft-deleted again as usual', async () => {
  const { cloud, B, pid, remote } = await setup();
  E.restoreDeleted(B, pid, '2026-10-04T09:00:00Z');
  await pushPending(B, cloud, USER);
  for (const r of cloud.rows('dose_logs', USER)) await cloud.delete('dose_logs', r.id);
  await cloud.delete('protocols', remote);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L5', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);
  assert.deepEqual(recentlyDeleted(B).map((r) => r.id), [pid]);
});

test('deleting it again clears the restore mark', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES ('u1','P','recon',0,'2026-09-01T00:00:00Z','x','x','synced')`);
  const id = db.getFirstSync('SELECT id FROM protocols').id;
  E.restoreDeleted(db, id, '2026-10-04T09:00:00Z');
  assert.ok(db.getFirstSync('SELECT restored_at FROM protocols WHERE id = ?', [id]).restored_at);
  E.softDeleteRow(db, id, '2026-10-04T10:00:00Z');
  assert.equal(db.getFirstSync('SELECT restored_at FROM protocols WHERE id = ?', [id]).restored_at, null);
});
