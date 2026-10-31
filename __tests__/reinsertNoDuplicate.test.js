'use strict';
// Senior review 2026-10-31 of the reinsertRow fallback (parked since 2026-10-26, fixed on the spot under
// the founder rule of 19:08 EDT). Real sync passes (push then pull), temporary errors on the old id, a
// lost answer on the fallback, and Delete forever afterwards: one row in the cloud and one on the phone,
// and Delete forever is forever. Scenarios A, B, D, E of the review.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const USER = 'u1';
async function setup() {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: true });
  for (const d of ['2026-08-20', '2026-08-21']) await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const pid = B.getFirstSync('SELECT id FROM protocols').id;
  for (const r of cloud.rows('dose_logs', USER)) await cloud.delete('dose_logs', r.id);
  await cloud.delete('protocols', p.data.id);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  return { cloud, B, pid, remote: p.data.id };
}
// A: real sync pass = push then pull
test('A: lost fallback + pull in the same pass', async () => {
  const { cloud, B, remote } = await setup(); const OLD = remote;
  const ins = cloud.insert.bind(cloud);
  let lost = true;
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && p.id === remote) return { data: null, error: { code: '23514', message: 'check constraint' } };
    if (t === 'protocols' && lost) { lost = false; await ins(t, p); return { data: null, error: { message: 'network timeout' } }; }
    return ins(t, p);
  };
  const fi=cloud.fetchIn.bind(cloud); cloud.fetchIn=async(t,c,ids,u)=>(c==="id"&&!ids.includes(OLD)?{data:null,error:{message:"offline"}}:fi(t,c,ids,u)); await pushPending(B, cloud, USER); cloud.fetchIn=fi; await pullChanges(B, cloud, USER);
  await pushPending(B, cloud, USER); await pullChanges(B, cloud, USER);
  const loc = B.getAllSync('SELECT id, remote_id, client_id, sync_status, deleted_at FROM protocols');
  assert.equal(loc.length, 1, 'one local protocol');
});
// B: old id insert fails transiently once, then succeeds next sync
test('B: transient old-id failure then success: orphan cid row', async () => {
  const { cloud, B, remote } = await setup();
  const ins = cloud.insert.bind(cloud);
  let first = true, lost = true; const OLD = remote;
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && p.id === remote && first) { first = false; return { data: null, error: { message: '503' } }; }
    if (t === 'protocols' && p.id !== remote && lost) { lost = false; await ins(t, p); return { data: null, error: { message: 'network timeout' } }; }
    return ins(t, p);
  };
  {const fi=cloud.fetchIn.bind(cloud); cloud.fetchIn=async(t,c,ids,u)=>(c==="id"&&!ids.includes(OLD)?{data:null,error:{message:"offline"}}:fi(t,c,ids,u)); await pushPending(B, cloud, USER); cloud.fetchIn=fi;}
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  const loc = B.getAllSync('SELECT id, remote_id, client_id, sync_status FROM protocols');
  assert.equal(cloud.rows('protocols', USER).length, 1, 'one cloud protocol');
  assert.equal(loc.length, 1, 'one local protocol');
});

async function setupD() {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: true });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  const pid = B.getFirstSync('SELECT id FROM protocols').id;
  await cloud.delete('protocols', p.data.id);
  B.runSync(`UPDATE protocols SET name = 'P edited', updated_at = 'L1', sync_status = 'pending' WHERE id = ?`, [pid]);
  return { cloud, B, pid, remote: p.data.id };
}
test('D: Delete forever after a lost fallback leaves the landed copy alive', async () => {
  const { cloud, B, pid, remote } = await setupD();
  const ins = cloud.insert.bind(cloud);
  let first = true;
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && p.id === remote && first) { first = false; return { data: null, error: { message: '503' } }; }
    if (t === 'protocols' && p.id !== remote && !p.purged_at) { await ins(t, p); return { data: null, error: { message: 'timeout' } }; }
    return ins(t, p);
  };
  const fi = cloud.fetchIn.bind(cloud);
  cloud.fetchIn = async (t, c, ids, u) => (c === 'id' && !ids.includes(remote) ? { data: null, error: { message: 'offline' } } : fi(t, c, ids, u));
  await pushPending(B, cloud, USER);
  cloud.fetchIn = fi;
  B.runSync(`UPDATE protocols SET purged_at = '2026-10-31T10:00:00Z', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(B, cloud, USER);
  const C = makeDb();
  await fullImport(C, cloud, USER);
  const back = C.getAllSync('SELECT remote_id, name, deleted_at, purged_at FROM protocols');
  assert.equal(back.length, 0, 'deleted forever stays deleted');
});

test('E: dose log lost fallback, pull in same pass', async () => {
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: USER, name: 'P', type: 'recon', active: true });
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: '2026-08-20T08:00:00Z' });
  const B = makeDb();
  await pullChanges(B, cloud, USER);
  await cloud.delete('dose_logs', l.data.id);
  const log = B.getFirstSync('SELECT * FROM dose_logs');
  B.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L3', sync_status = 'pending' WHERE id = ?`, [log.id]);
  const OLD = l.data.id;
  const ins = cloud.insert.bind(cloud);
  let first = true, lost = true;
  cloud.insert = async (t, pl) => {
    if (t === 'dose_logs' && pl.id === OLD && first) { first = false; return { data: null, error: { message: '503' } }; }
    if (t === 'dose_logs' && pl.id !== OLD && lost) { lost = false; await ins(t, pl); return { data: null, error: { message: 'timeout' } }; }
    return ins(t, pl);
  };
  const fi = cloud.fetchIn.bind(cloud);
  cloud.fetchIn = async (t, c, ids, u) => (c === 'id' && !ids.includes(OLD) ? { data: null, error: { message: 'offline' } } : fi(t, c, ids, u));
  await pushPending(B, cloud, USER);
  cloud.fetchIn = fi;
  await pullChanges(B, cloud, USER);
  await pushPending(B, cloud, USER); await pullChanges(B, cloud, USER);
  assert.equal(B.getAllSync('SELECT id FROM dose_logs').length, 1);
});

// Review finding 4: an older build left a client id that the server refuses for good. The row must not
// stay pending forever (pending rows block sign-out): that id is dropped and a fresh one goes next pass.
test('F: a client id refused for good is replaced, so the row syncs instead of staying pending', async () => {
  const { cloud, B, pid, remote } = await setup();
  B.runSync(`UPDATE protocols SET client_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id = ?`, [pid]);
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && (p.id === remote || p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) return { data: null, error: { code: '23505', message: 'duplicate key' } };
    return ins(t, p);
  };
  await pushPending(B, cloud, USER);
  await pushPending(B, cloud, USER);
  const loc = B.getFirstSync('SELECT remote_id, sync_status FROM protocols WHERE id = ?', [pid]);
  assert.equal(loc.sync_status, 'synced');
  assert.equal(cloud.rows('protocols', USER).length, 1);
  assert.equal(loc.remote_id, cloud.rows('protocols', USER)[0].id);
});

// Re-review finding 1: a lost fallback relinked by a pull must still put the protocol's dose history
// back in the cloud (the children go up only through reviveProtocol), and a fresh device gets it.
test('A2: lost fallback + pull: the dose history goes back up with the protocol', async () => {
  const { cloud, B, remote } = await setup();
  const ins = cloud.insert.bind(cloud);
  let lost = true;
  cloud.insert = async (t, p) => {
    if (t === 'protocols' && p.id === remote) return { data: null, error: { code: '23514', message: 'check constraint' } };
    if (t === 'protocols' && lost) { lost = false; await ins(t, p); return { data: null, error: { message: 'network timeout' } }; }
    return ins(t, p);
  };
  const fi = cloud.fetchIn.bind(cloud);
  cloud.fetchIn = async (t, c, ids, u) => (c === 'id' && !ids.includes(remote) ? { data: null, error: { message: 'offline' } } : fi(t, c, ids, u));
  await pushPending(B, cloud, USER); cloud.fetchIn = fi; await pullChanges(B, cloud, USER);
  for (let i = 0; i < 3; i++) { await pushPending(B, cloud, USER); await pullChanges(B, cloud, USER); }
  assert.equal(cloud.rows('protocols', USER).length, 1, 'one protocol in the cloud');
  assert.equal(B.getAllSync('SELECT id FROM protocols').length, 1, 'one protocol on the phone');
  assert.equal(cloud.rows('dose_logs', USER).length, 2, 'the history is in the cloud again');
  const C = makeDb(); await fullImport(C, cloud, USER);
  assert.equal(C.getFirstSync('SELECT COUNT(*) AS n FROM dose_logs').n, 2, 'a new phone gets the history');
  const p = B.getFirstSync('SELECT remote_id, client_id FROM protocols');
  assert.equal(p.client_id, p.remote_id, 'no stale fallback marker left (finding 2)');
});
