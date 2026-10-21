'use strict';
// A-119 Gate B re-review (round 2): each finding as the scenario that failed. purge.cjs and dbl2.cjs
// (the reviewer's probes) are made permanent here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone, memKv, addProtocol, addDose, doses } = require('./helpers/devicePhone');
const { rebuildFromCloud } = require('../lib/syncCore');
const { readChangeSeq } = require('../lib/changeSeq');
const { createDeviceFlow } = require('../lib/deviceFlow');
const PE = require('../lib/protocolEnd');
const { verdictSheet } = require('../lib/deviceCopy');

const U = 'u1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const old = '2026-10-01T10:00:00.000Z';

// ── 1. The keep rule follows every local change, not updated_at ──────────────────────────────
test('R2-1 (purge.cjs): a Delete forever made after the sign-in (it leaves updated_at alone) is kept and pushed — never discarded, never back in Recently deleted', async () => {
  const db = makeDb(); const cloud = makeCloud();
  cloud._store.protocols.set('P1', { id: 'P1', user_id: U, name: 'BPC', type: 'recon', active: false, deleted_at: old, purged_at: null, created_at: old, updated_at: old });
  cloud._store.dose_logs.set('D1', { id: 'D1', user_id: U, protocol_id: 'P1', outcome: 'Taken', logged_at: old, created_at: old, updated_at: old });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, deleted_at, created_at, updated_at, sync_status) VALUES ('P1', ?, 'BPC', 'recon', '#185FA5', '250', 'mcg', 1, 1, 0, ?, ?, ?, 'synced')`, [U, old, old, old]);
  const pid = db.getFirstSync('SELECT id FROM protocols').id;
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES ('D1', ?, ?, 'P1', 'Taken', ?, ?, 'synced')`, [U, pid, old, old]);
  const seq = readChangeSeq(db); // the claim moment
  assert.equal(PE.purgeProtocol(db, pid), true);
  const r = await rebuildFromCloud(db, cloud, U, { keep: { seq } });
  assert.equal(r.ok, true);
  assert.equal(r.discarded.count, 0, 'nothing discarded: the purge is the person\'s act after the sign-in');
  const p = db.getFirstSync('SELECT purged_at, sync_status FROM protocols WHERE remote_id = ?', ['P1']);
  assert.ok(p && p.purged_at && p.sync_status === 'pending', 'still deleted forever, to be pushed');
  assert.equal(db.getFirstSync(`SELECT sync_status FROM dose_logs WHERE remote_id = 'D1'`).sync_status, 'deleted');
});

test('R2-1: a row written after the claim with the phone clock set back is kept; a row written before is discarded and counted', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const before = addProtocol(db, U, { name: 'before' });
  db.runSync(`UPDATE protocols SET updated_at = '2030-01-01T00:00:00.000Z' WHERE id = ?`, [before]); // clock was ahead then
  const seq = readChangeSeq(db);
  const after = addProtocol(db, U, { name: 'after' });
  db.runSync(`UPDATE protocols SET updated_at = '2001-01-01T00:00:00.000Z' WHERE id = ?`, [after]); // clock set back now
  const r = await rebuildFromCloud(db, cloud, U, { keep: { seq } });
  assert.deepEqual(db.getAllSync('SELECT name FROM protocols').map((x) => x.name), ['after']);
  assert.equal(r.discarded.count, 1);
});

test('R2-1: a dose typed after the sign-in on a local-only protocol created before it goes with its protocol, counted (never unsent forever)', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const pid = addProtocol(db, U, { name: 'local-only' });
  const seq = readChangeSeq(db);
  addDose(db, U, pid);
  const r = await rebuildFromCloud(db, cloud, U, { keep: { seq } });
  assert.equal(doses(db, U).length, 0);
  assert.equal(r.discarded.count, 2);
  assert.deepEqual(r.discarded.byKind, { protocol: 1, dose: 1 });
});

test('R2-1: every local mutation moves the change sequence (inserts, edits, deletes, the purge); sync writes of synced rows do not', () => {
  const db = makeDb();
  const s0 = readChangeSeq(db);
  const pid = addProtocol(db, U);
  const s1 = readChangeSeq(db);
  assert.ok(s1 > s0);
  db.runSync(`UPDATE protocols SET sync_status = 'synced', remote_id = 'R' WHERE id = ?`, [pid]);
  assert.equal(readChangeSeq(db), s1, 'markSynced does not count');
  db.runSync(`UPDATE protocols SET active = 0, deleted_at = ?, sync_status = 'pending' WHERE id = ?`, [old, pid]);
  assert.ok(readChangeSeq(db) > s1);
  assert.ok(db.getFirstSync('SELECT dt_seq FROM protocols WHERE id = ?', [pid]).dt_seq > s1);
});

// ── 2. A stalled device call never holds the app (dbl2.cjs) ──────────────────────────────────
test('R2-2 (dbl2.cjs): concurrent checks run an owed rebuild once; a racing pass claims once; a device call that never answers times out (network) and the queue moves on', async () => {
  const mk = () => memKv();
  let owed = true; let rebuilds = 0; let passes = 0; let claims = 0;
  const rpc = async (name) => {
    await sleep(20);
    if (name === 'device_status') return { data: { status: 'active', rebuild_owed: owed, rebuild_mode: 'takeover', notice: null }, error: null };
    if (name === 'device_ack') { owed = false; return { data: { ok: true }, error: null }; }
    if (name === 'claim_device') { claims++; return { data: { status: 'active', took_over: claims === 1, rebuild_owed: owed, rebuild_mode: 'takeover', notice: null, secret: 'x'.repeat(48) }, error: null }; }
    return { data: null, error: { message: 'x' } };
  };
  const flow = createDeviceFlow({ rpc, deviceId: async () => 'i:dev', store: mk(), appVersion: '1.3.1', summarize: async () => ({ count: 0 }), requestPass: () => { passes++; },
    secret: { set: async () => {}, get: async () => null, remove: async () => {} }, rebuild: async () => { rebuilds++; await sleep(100); return { ok: true, discarded: { count: 0 } }; } });
  await Promise.all([flow.gate('U', 'foreground'), flow.gate('U', 'sync'), flow.gate('U', 'startup'), flow.gate('U', 'sync')]);
  assert.equal(rebuilds, 1);
  owed = false; claims = 0;
  flow.noteExplicitSignIn('V');
  await Promise.all([flow.gate('V', 'sync'), flow.afterExplicitSignIn('V')]);
  assert.equal(claims, 1, 'explicit + racing pass: one claim');
  const hang = createDeviceFlow({ rpc: () => new Promise(() => {}), deviceId: async () => 'i:dev', store: mk(), appVersion: '1.3.1', rpcTimeoutMs: 100 });
  hang.gate('W', 'startup');
  const t0 = Date.now();
  const r = await Promise.race([hang.gate('W', 'sync'), sleep(1500).then(() => 'stuck')]);
  assert.notEqual(r, 'stuck');
  assert.equal(r.go, true, 'no answer: unknown, the pass runs (the server guard still refuses)');
  assert.ok(Date.now() - t0 < 1000);
  const s = await Promise.race([hang.afterExplicitSignIn('W'), sleep(1500).then(() => 'stuck')]);
  assert.notEqual(s, 'stuck', 'the sign-in work goes on (the sync engine starts)');
  assert.equal(s.reason, 'claim_pending', 'a timeout is "network": the takeover stays pending, never dropped');
});

// ── 3. Screen 4's count is what "Use here" discards ──────────────────────────────────────────
// Round 3 (finding 3) changed the rule this test pins: an unsettled takeover key from an earlier
// attempt on this phone now keeps its (lower) point — what was typed since then is the person's — and
// screen 4 counts by that same rule. The intent stays: screen 4's count is exactly what "Use here"
// removes (see also __tests__/a119Round3.test.js R3-3).
test('R2-3: screen 4\'s count is exactly what "Use here" removes, with an older takeover key on this phone', async () => {
  const cloud = makeDeviceCloud(); cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U); await A.signIn();
  const kv = memKv();
  const B = phone(cloud, 'dev-B', U, { kv, session: '2026-10-15T09:00:00.000Z' });
  addProtocol(B.db, U, { name: 'old-local' });
  // An unsettled takeover key from an earlier attempt on this phone, after 'old-local'.
  await kv.setItem('dosetrace_device_takeover', JSON.stringify({ userId: U, seq: readChangeSeq(B.db) }));
  addProtocol(B.db, U, { name: 'typed-since' });
  await B.flow.gate(U, 'startup'); // screen 4
  const ask = (await B.state()).ask;
  assert.equal(ask.summary.count, 1);
  await B.useHere();
  assert.equal(B.db.getFirstSync(`SELECT COUNT(*) AS n FROM protocols WHERE name = 'old-local'`).n, 0, 'removed, as screen 4 said');
  assert.equal(B.db.getFirstSync(`SELECT COUNT(*) AS n FROM protocols WHERE name = 'typed-since'`).n, 1, 'kept: typed after the earlier attempt');
  assert.equal((await B.state()).notice.own.count, 1);
});

// ── 4. H2 edges ──────────────────────────────────────────────────────────────────────────────
test('R2-4: 42883 is "migration missing" only for the device RPC itself; an expired token (PGRST301/303) is not a server refusal', async () => {
  const run = async (error) => {
    const kv = memKv();
    const f = createDeviceFlow({ rpc: async () => ({ data: null, error }), deviceId: async () => 'i:d', store: kv, appVersion: '1.3.1' });
    const r1 = await f.afterExplicitSignIn('U');
    const r2 = await f.gate('U', 'sync');
    const r3 = await f.gate('U', 'sync');
    return [r1.reason, r2.reason, r3.reason];
  };
  assert.deepEqual(await run({ code: '42883', message: 'function public.claim_device(text, text, text, text, text, text) does not exist' }), ['claim_unavailable', 'unknown', 'unknown'], 'the device RPC itself is missing: as before the migration');
  assert.deepEqual(await run({ code: '42883', message: 'function extensions.gen_random_bytes(integer) does not exist' }), ['claim_pending', 'claim_unavailable', 'unknown'], 'a function INSIDE claim_device: a server error (twice, then the passes run)');
  assert.deepEqual(await run({ code: 'PGRST301', message: 'JWT expired' }), ['claim_pending', 'claim_pending', 'claim_pending'], 'an expired token is waited out like the network');
});

// ── 5. LOW ───────────────────────────────────────────────────────────────────────────────────
test('R2-5: the sign-in intent is forgotten at sign-out and after 3 minutes', async () => {
  let t = 1000000;
  let claims = 0;
  const f = createDeviceFlow({ now: () => t, rpc: async (name) => { if (name === 'claim_device') claims++; return { data: { status: 'active', took_over: false, rebuild_owed: false }, error: null }; }, deviceId: async () => 'i:d', store: memKv(), appVersion: '1.3.1' });
  f.noteExplicitSignIn('U');
  await f.clearOnSignOut();
  await f.gate('U', 'sync');
  assert.equal(claims, 0, 'cleared by the sign-out');
  f.noteExplicitSignIn('U');
  t += 3 * 60 * 1000 + 1;
  await f.gate('U', 'sync');
  assert.equal(claims, 0, 'expired');
});

test('R2-5: a replaced phone whose count cannot be read is never left silently stopped: a locked "checking" sheet with a retry, no wipe', () => {
  let retried = 0;
  const t = (k) => k;
  const s = verdictSheet({ t, language: 'en', verdict: { kind: 'replaced', at: old, summary: null, unknown: true }, onRetry: () => { retried++; } });
  assert.ok(s);
  assert.equal(s.locked, true);
  assert.equal(s.title, 'dev_counting_title');
  assert.deepEqual(s.buttons.map((b) => b.label), ['dev_counting_retry']);
  s.buttons[0].onPress();
  assert.equal(retried, 1);
});
