'use strict';
// Final Gate B PASS-WITH-FIXES, part 5: reinsertRow never makes a duplicate history. When the
// same-id insert errors, it first checks whether that id exists now (a timeout after the row was
// created, or another device revived it meanwhile): present → it updates that row instead; a
// tombstone → the local purge applies; the check itself fails → nothing (retried). Only when the id
// is really absent does it fall back to a new id. A row the server refuses because its protocol was
// deleted forever (the migration's trigger) stays pending — no fallback, no parent re-queue.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

async function setup() {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: true });
  for (const d of ['2026-08-20', '2026-08-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const pid = B.getFirstSync('SELECT id FROM protocols').id;
  for (const r of cloud.rows('dose_logs', USER)) await cloud.delete('dose_logs', r.id);
  await cloud.delete('protocols', p.data.id); // an older build's purge
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  return { cloud, B, pid, remote: p.data.id };
}

test('timeout after create: the same-id row exists, so it is used — no second history under a new id', async () => {
  const { cloud, B, pid, remote } = await setup();
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => { if (p.id) { await ins(t, p); return { data: null, error: { message: 'network timeout' } }; } return ins(t, p); };
  await pushPending(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 1, 'one protocol');
  assert.equal(B.getFirstSync('SELECT remote_id FROM protocols WHERE id = ?', [pid]).remote_id, remote, 'same id kept');
  assert.equal(cloud.rows('dose_logs', USER).length, 2, 'one copy of the history');
  assert.equal(n(B, `SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'synced'`), 2);
  assert.equal(B.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'synced');
});

test('the same id turned out to be a tombstone: the local purge applies, nothing new is created', async () => {
  const { cloud, B, pid, remote } = await setup();
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && p.id) { // another device's Delete forever got there first
      await ins(t, { ...p, purged_at: '2026-10-04T11:00:00Z' });
      return { data: null, error: { code: '23505', message: 'duplicate key' } };
    }
    return ins(t, p);
  };
  await pushPending(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 1);
  assert.ok(cloud._store.protocols.get(remote).purged_at);
  assert.equal(n(B, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ? AND purged_at IS NULL', [pid]), 0, 'gone or hidden here');
  assert.equal(cloud.rows('dose_logs', USER).length, 0, 'no history written onto the tombstone');
});

test('when the check fails nothing falls back to a new id (retried next sync)', async () => {
  const { cloud, B, pid } = await setup();
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => (p.id ? { data: null, error: { message: 'network timeout' } } : ins(t, p));
  cloud.fetchIn = async () => ({ data: null, error: { message: 'offline' } });
  await pushPending(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 0);
  assert.equal(B.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'pending');
});

test('a dose log the server refuses (its protocol was deleted forever) stays pending: no new id, no parent re-queue', async () => {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: true });
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: '2026-08-20T08:00:00Z' });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  // another device deleted it forever: tombstone + children removed by the server trigger
  cloud._store.protocols.get(p.data.id).purged_at = '2026-10-04T10:00:00Z';
  await cloud.delete('dose_logs', l.data.id);
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, pl) => ((t === 'dose_logs' || t === 'vials') && cloud._store.protocols.get(pl.protocol_id)?.purged_at
    ? { data: null, error: { code: 'P0001', message: `protocol ${pl.protocol_id} was deleted forever` } } : ins(t, pl));
  const log = B.getFirstSync('SELECT * FROM dose_logs');
  B.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L3', sync_status = 'pending' WHERE id = ?`, [log.id]);
  await pushPending(B, cloud, USER);
  assert.equal(B.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [log.id]).sync_status, 'pending', 'kept, pending');
  assert.equal(cloud.rows('dose_logs', USER).length, 0, 'never written under a new id');
  assert.equal(B.getFirstSync('SELECT sync_status FROM protocols').sync_status, 'synced', 'the protocol is not re-queued');
});
