'use strict';
// Final Gate B (2026-10-04), R-B self-heal: the pull is incremental by updated_at, so a live
// protocol this device lacks (removed here by an earlier build's absence rule, or missed) would
// never come back once the watermark is past it. After each pull the device asks the cloud for
// the account's live protocol ids (read-only, under the same user's session before and after) and
// re-imports the protocols it lacks — with their dose logs and vials. It never deletes anything,
// never re-imports a purged protocol, and never duplicates a protocol it already has.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

async function cloudProtocol(cloud, name, extra = {}) {
  const p = await cloud.insert('protocols', { user_id: USER, name, type: 'recon', active: true, deleted_at: null, ...extra });
  for (const d of ['2026-09-20', '2026-09-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  return p.data.id;
}
// B synced everything, then lost LOST locally (an earlier build's absence rule); NEWER keeps the
// watermark past LOST, so an incremental pull never brings it back.
async function deviceMissingOne() {
  const cloud = makeCloud();
  const lost = await cloudProtocol(cloud, 'LOST');
  await cloudProtocol(cloud, 'NEWER');
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const local = B.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [lost]);
  B.runSync('DELETE FROM dose_logs WHERE protocol_remote_id = ?', [lost]);
  B.runSync('DELETE FROM vials WHERE protocol_remote_id = ?', [lost]);
  B.runSync('DELETE FROM protocols WHERE id = ?', [local.id]);
  return { cloud, B, lost };
}

test('a live protocol the device lacks is re-imported with its dose logs and vials', async () => {
  const { cloud, B, lost } = await deviceMissingOne();
  await pullChanges(B, cloud, USER);
  const p = B.getFirstSync('SELECT * FROM protocols WHERE remote_id = ?', [lost]);
  assert.ok(p, 're-imported');
  assert.equal(p.name, 'LOST');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [p.id]), 2);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM vials WHERE protocol_id = ?', [p.id]), 1);
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE remote_id = ?', [lost]), 1, 'never duplicated');
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM dose_logs'), 4);
});

test('without the same user\'s session before and after, nothing is re-imported (and nothing deleted)', async () => {
  const { cloud, B, lost } = await deviceMissingOne();
  const real = cloud.fetchIds.bind(cloud);
  cloud.fetchIds = async (t, u) => ({ ...(await real(t, u)), sessionVerified: false });
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE remote_id = ?', [lost]), 0);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols'), 1);
});

test('a protocol deleted forever (purged_at) is never re-imported', async () => {
  const cloud = makeCloud();
  const A = makeDb();
  await cloudProtocol(cloud, 'KEEP');
  await pullChanges(A, cloud, USER);
  const pid = A.getFirstSync(`SELECT id FROM protocols WHERE name = 'KEEP'`).id;
  A.runSync(`UPDATE protocols SET active = 0, deleted_at = '2026-10-01T00:00:00Z' WHERE id = ?`, [pid]);
  E.purgeProtocol(A, pid, '2026-10-04T10:00:00Z');
  await pushPending(A, cloud, USER);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols'), 0);
  const unfiltered = cloud.fetchIds.bind(cloud);
  cloud.fetchIds = async (t, u) => ({ data: cloud.rows(t, u).map((r) => r.id), error: null, sessionVerified: true }); // a cloud that cannot filter yet
  await pullChanges(A, cloud, USER);
  cloud.fetchIds = unfiltered;
  await pullChanges(A, cloud, USER);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM protocols'), 0);
  assert.equal(n(A, 'SELECT COUNT(*) AS n FROM dose_logs'), 0);
});

test('the self-heal never deletes: a local protocol missing from the id list stays', async () => {
  const cloud = makeCloud();
  await cloudProtocol(cloud, 'ONE');
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  B.runSync(`INSERT INTO protocols (user_id, name, type, active, created_at, updated_at, sync_status) VALUES (?, 'LOCAL', 'recon', 1, 'x', 'x', 'pending')`, [USER]);
  cloud.fetchIds = async () => ({ data: [], error: null, sessionVerified: true });
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols'), 2);
});

test('another account\'s rows are never imported by the self-heal', async () => {
  const { cloud, B, lost } = await deviceMissingOne();
  cloud._store.protocols.get(lost).user_id = 'u2';
  const real = cloud.fetchIds.bind(cloud);
  cloud.fetchIds = async () => ({ ...(await real('protocols', USER)), data: [lost] }); // a bogus id list
  await pullChanges(B, cloud, USER);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE remote_id = ?', [lost]), 0);
});

test('the real adapter: live ids only (purged_at is null, unfiltered while the column is missing), the session checks, fetchIn paged by user', () => {
  const s = read('lib/sync.js');
  const i = s.indexOf('async fetchIds(table, userId) {');
  const body = s.slice(i, s.indexOf('\n  },', i));
  assert.match(body, /const beforeUid = await sessionUid\(\);/);
  assert.match(body, /const afterUid = await sessionUid\(\);/);
  assert.match(body, /\.is\('purged_at', null\)/);
  assert.match(body, /sessionVerified: !!userId && beforeUid === userId && afterUid === userId/);
  const j = s.indexOf('async fetchIn(table, column, values, userId) {');
  assert.ok(j > 0);
  const fin = s.slice(j, s.indexOf('\n  },', j));
  assert.match(fin, /\.eq\('user_id', userId\)\.in\(column, chunk\)/);
  assert.match(fin, /\.range\(/);
});
