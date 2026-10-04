'use strict';
// Final Gate B PASS-WITH-FIXES, S3 (client side): a dose log or vial is never imported when its
// cloud protocol is a tombstone (purged), whether that protocol is known here or not — no
// protocol_id NULL orphans of a purged protocol in the Dose log. A child whose protocol is unknown
// here but live in the cloud is imported and linked once its protocol arrives (self-heal).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pullChanges, fullImport } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

async function purgedWithStrayChild() {
  const cloud = makeCloud();
  const keep = await cloud.insert('protocols', { user_id: USER, name: 'KEEP', type: 'recon', active: true });
  await cloud.insert('dose_logs', { user_id: USER, protocol_id: keep.data.id, outcome: 'Taken', logged_at: '2026-09-20T08:00:00Z' });
  const p = await cloud.insert('protocols', { user_id: USER, name: 'GONE', type: 'recon', active: false, deleted_at: '2026-10-01T00:00:00Z', purged_at: '2026-10-04T10:00:00Z' });
  // a child left on the tombstone (written by an older build, or before the server trigger existed)
  await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: '2026-10-04T09:00:00Z' });
  await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  return { cloud, keep: keep.data.id, gone: p.data.id };
}

test('a pull never imports a dose log or vial of a purged protocol unknown here (no NULL orphans)', async () => {
  const { cloud, gone } = await purgedWithStrayChild();
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_remote_id = ?', [gone]), 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_remote_id = ?', [gone]), 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id IS NULL'), 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs'), 1, 'the live protocol\'s dose is there');
});

test('a full import does the same', async () => {
  const { cloud, gone } = await purgedWithStrayChild();
  const C = makeDb();
  await fullImport(C, cloud, USER);
  assert.equal(n(C, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_remote_id = ?', [gone]), 0);
  assert.equal(n(C, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_remote_id = ?', [gone]), 0);
  assert.equal(C.getAllSync(E.SQL_ALL_LOGS, [USER]).length, 1);
});

test('a child whose protocol is unknown here but live in the cloud is imported and linked when the protocol arrives', async () => {
  const cloud = makeCloud();
  const lost = await cloud.insert('protocols', { user_id: USER, name: 'LOST', type: 'recon', active: true });
  const newer = await cloud.insert('protocols', { user_id: USER, name: 'NEWER', type: 'recon', active: true });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  B.runSync('DELETE FROM protocols WHERE remote_id = ?', [lost.data.id]); // gone here (an earlier build), watermark past it
  await cloud.insert('dose_logs', { user_id: USER, protocol_id: lost.data.id, outcome: 'Taken', logged_at: '2026-10-04T08:00:00Z' });
  await pullChanges(B, cloud, USER);
  const p = B.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [lost.data.id]);
  assert.ok(p, 'the protocol is back (self-heal)');
  const logs = B.getAllSync('SELECT protocol_id FROM dose_logs');
  assert.equal(logs.length, 1, 'no duplicate');
  assert.equal(logs[0].protocol_id, p.id, 'linked, not a NULL orphan');
  assert.ok(newer);
});

test('when the protocol lookup fails, that table waits (nothing imported blind, nothing lost)', async () => {
  const { cloud, gone } = await purgedWithStrayChild();
  const B = makeDb();
  const fin = cloud.fetchIn.bind(cloud);
  cloud.fetchIn = async () => ({ data: null, error: { message: 'offline' } });
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_remote_id = ?', [gone]), 0);
  cloud.fetchIn = fin;
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs'), 1);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_remote_id = ?', [gone]), 0);
});
