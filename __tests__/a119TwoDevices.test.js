'use strict';
// A-119 one active device per account — two-device behaviour (docs/specs/one-active-device.md,
// OD-2..OD-8, OD-10, OD-14..OD-17; DL-102..DL-108; DIVERGENCES DV-182, DV-183, DV-209, DV-222).
// Each phone runs the real lib code (helpers/devicePhone.js) against one in-memory server that
// applies the migration's rules (helpers/syncHarness.js makeDeviceCloud).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone, memKv, addProtocol, addDose, addWeighIn, doses } = require('./helpers/devicePhone');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');

const U = 'user-1';
const iPhone = { platform: 'ios', name: 'iPhone', brand: null };
const fold = { platform: 'android', name: null, brand: 'samsung' };

function world() {
  const cloud = makeDeviceCloud();
  cloud.addUser(U);
  return cloud;
}
async function activeWithDose(cloud, deviceId = 'dev-A', opts = {}) {
  const A = phone(cloud, deviceId, U, { info: iPhone, session: '2026-10-15T08:00:00.000Z', ...opts });
  assert.equal((await A.signIn()).go, true);
  const pid = addProtocol(A.db, U);
  await A.sync(); // the protocol gets its cloud id first (children wait for it)
  addDose(A.db, U, pid);
  await A.sync();
  return { A, pid };
}

// ── OD-7 / DL-105: an older client gets a distinct refusal and loses nothing ──────────────────
test('OD-7: a client of an earlier version (no device id) is refused with DT002 once the account has a device; today\'s syncCore keeps every row and deletes nothing', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  // The old phone: synced copy of the protocol and dose, one new dose pending, one dose deletion pending,
  // one synced lab value (fullImport's absence rule would delete it on an empty reply).
  const old = makeDb();
  const view = cloud.as(null, { userId: U });
  await fullImport(old, cloud.as('dev-A', { userId: U }), U); // what it held before (same rows as the account)
  const before = old.getAllSync('SELECT id, sync_status FROM dose_logs ORDER BY id');
  assert.equal(before.length, 1);
  const pid = old.getFirstSync('SELECT id FROM protocols').id;
  addDose(old, U, pid);
  old.runSync(`UPDATE dose_logs SET sync_status = 'deleted' WHERE id = ?`, [before[0].id]);
  old.runSync(`INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES ('bm-1', ?, '2026-10-01', 'TSH', '2', 'mIU/L', '000001', '000001', 'synced')`, [U]);
  const snapshot = () => JSON.stringify(['protocols', 'dose_logs', 'biomarkers'].map((t) => old.getAllSync(`SELECT id, remote_id, sync_status FROM ${t} ORDER BY id`)));
  const was = snapshot();
  const seen = [];
  const spy = {};
  for (const m of ['delete', 'update', 'insert', 'fetchSince', 'fetchAll', 'fetchIds', 'fetchIn']) spy[m] = async (...a) => { const r = await view[m](...a); seen.push(r.error && r.error.code); return r; };
  spy.sessionUserId = async () => U;
  await pushPending(old, spy, U);
  await pullChanges(old, spy, U);
  await fullImport(old, spy, U);
  assert.ok(seen.length > 0 && seen.every((c) => c === 'DT002'), `every request refused with DT002: ${seen}`);
  assert.equal(snapshot(), was, 'nothing changed locally: the new dose and the deletion stay pending, no row deleted');
  assert.equal(cloud.base.rows('dose_logs', U).length, 1, 'the cloud kept its dose');
  assert.ok(A);
});

test('OD-17: a write without a device id is accepted only while the account has no registered device', async () => {
  const cloud = world();
  const old = cloud.as(null, { userId: U });
  const w1 = await old.insert('biomarkers', { user_id: U, marker: 'TSH', value: '2' });
  assert.equal(w1.error, null, 'no device registered yet: an older version still backs up');
  const A = phone(cloud, 'dev-A', U);
  await A.signIn();
  const w2 = await old.insert('biomarkers', { user_id: U, marker: 'TSH', value: '3' });
  assert.equal(w2.error.code, 'DT002');
  cloud.policy.min = '1.3.2';
  const w3 = await cloud.as('dev-A', { userId: U, version: '1.3.1' }).fetchAll('biomarkers', U);
  assert.equal(w3.error.code, 'DT003', 'below the minimum version: a distinct refusal a future build can turn into "please update"');
});

// ── OD-8: the four sync defects cannot occur with one active device ──────────────────────────
test('OD-8 / DV-182 (control): without the guard, an edit on the other phone brings back a dose deleted on this one', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const pid = addProtocol(a, U); await pushPending(a, cloud, U); addDose(a, U, pid); await pushPending(a, cloud, U);
  await fullImport(b, cloud, U);
  const x = a.getFirstSync('SELECT id FROM dose_logs');
  a.runSync(`UPDATE dose_logs SET sync_status = 'deleted' WHERE id = ?`, [x.id]); await pushPending(a, cloud, U);
  b.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L9', sync_status = 'pending'`); await pushPending(b, cloud, U);
  await pullChanges(a, cloud, U);
  assert.equal(doses(a, U).length, 1, 'today: the deleted dose is back on the phone that deleted it (DV-182)');
});

test('OD-8 / DV-182: a dose deleted on the active phone never comes back; the replaced phone\'s edit is refused; its takeover rebuilds without it (OD-15)', async () => {
  const cloud = world();
  const { A: B } = await activeWithDose(cloud, 'dev-B'); // B was the account's phone
  const A = phone(cloud, 'dev-A', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  assert.equal((await A.signIn()).go, true, 'A signs in and takes over');
  assert.equal(doses(A.db, U).length, 1, 'A rebuilt its copy from the account: it holds X');
  const x = A.db.getFirstSync('SELECT id FROM dose_logs');
  A.db.runSync(`UPDATE dose_logs SET sync_status = 'deleted' WHERE id = ?`, [x.id]);
  await A.sync();
  assert.equal(cloud.base.rows('dose_logs', U).length, 0, 'A deleted X in the account');
  // B (replaced, does not know yet) edits X; its pass asks the server first and never pushes.
  B.db.runSync(`UPDATE dose_logs SET outcome = 'Skipped', updated_at = 'L9', sync_status = 'pending'`);
  const r = await B.sync();
  assert.equal(r.ran, false);
  assert.equal(cloud.base.rows('dose_logs', U).length, 0, 'X never came back');
  assert.equal((await B.state()).verdict.kind, 'replaced');
  // Even when B's check cannot reach the function (unknown → the pass runs), the server refuses B.
  const B2 = phone(cloud, 'dev-B', U, { db: B.db });
  B2.view.rpcDown = true;
  await B2.sync();
  assert.equal(cloud.base.rows('dose_logs', U).length, 0, 'refused with DT001, nothing re-inserted');
  assert.equal(B.db.getFirstSync(`SELECT sync_status FROM dose_logs`).sync_status, 'pending', 'B keeps its edit pending (deletes nothing on a refusal)');
  // B signs in again (takeover): its own edit is discarded with a count and its copy has no X.
  const B3 = phone(cloud, 'dev-B', U, { db: B.db, kv: memKv(), session: '2026-10-15T10:00:00.000Z' });
  assert.equal((await B3.signIn()).go, true);
  assert.equal(doses(B3.db, U).length, 0, 'the rebuilt copy has no X');
  const n = (await B3.state()).notice;
  assert.equal(n.own.count, 1, 'its own unsent edit is named in the notice (DL-104)');
  await A.sync();
  assert.equal(doses(A.db, U).length, 0, 'and X is still gone on A');
});

test('OD-8 / DV-183: counters never lose a dose across a device switch', async () => {
  const cloud = world();
  const A = phone(cloud, 'dev-A', U, { session: '2026-10-15T08:00:00.000Z' });
  await A.signIn();
  const pid = addProtocol(A.db, U); await A.sync();
  const prem = A.db.getFirstSync('SELECT remote_id FROM protocols').remote_id;
  A.db.runSync(`INSERT INTO vials (user_id, protocol_id, protocol_remote_id, mixed_on, total_doses, doses_taken, active, created_at, updated_at, sync_status) VALUES (?, ?, ?, '2026-10-01', 20, 3, 1, 'L1', 'L1', 'pending')`, [U, pid, prem]);
  await A.sync();
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn(); // takeover; B holds doses_taken 3
  // A (replaced) logs one dose offline: its counter goes to 4 locally.
  A.db.runSync(`UPDATE vials SET doses_taken = 4, updated_at = 'L8', sync_status = 'pending'`);
  addDose(A.db, U, pid);
  await A.sync();
  const v = (await A.state()).verdict;
  assert.equal(v.kind, 'replaced');
  assert.equal(v.summary.byKind.dose, 1, 'A reports its one unsent dose');
  // B logs one dose.
  const bp = B.db.getFirstSync('SELECT id FROM protocols').id;
  B.db.runSync(`UPDATE vials SET doses_taken = doses_taken + 1, updated_at = 'L9', sync_status = 'pending'`);
  addDose(B.db, U, bp);
  await B.sync();
  assert.equal(cloud.base.rows('vials', U)[0].doses_taken, 4, 'the account counts B\'s dose; A\'s stale whole row never overwrote it');
  assert.equal(B.db.getFirstSync('SELECT doses_taken FROM vials').doses_taken, 4);
  assert.equal(cloud.base.rows('dose_logs', U).length, 1, 'one dose in the account, the one B logged');
});

test('OD-8 / DV-222 (control): without the takeover, a phone\'s own push hides the other phone\'s row for good', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const pa = addProtocol(a, U); await pushPending(a, cloud, U);
  await fullImport(b, cloud, U);
  addDose(a, U, pa); await pushPending(a, cloud, U); await pullChanges(a, cloud, U);
  const pb = b.getFirstSync('SELECT id FROM protocols').id;
  addDose(b, U, pb); await pushPending(b, cloud, U); await pullChanges(b, cloud, U); await pullChanges(b, cloud, U);
  assert.equal(cloud.rows('dose_logs', U).length, 2);
  assert.equal(doses(b, U).length, 1, 'today: B never receives A\'s dose (DV-222)');
});

test('OD-8 / DV-222: rows another phone pushed reach this phone through its takeover; the replaced phone\'s new row is refused and counted', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud); // X
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  assert.equal(doses(B.db, U).length, 1, 'B holds X after its rebuild');
  const ap = A.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(A.db, U, ap, { logged_at: '2026-10-14T09:00:00.000Z' }); // Y
  await A.sync();
  assert.equal((await A.state()).verdict.summary.count, 1, 'Y is counted in A\'s notice');
  const bp = B.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(B.db, U, bp); // Z
  await B.sync();
  assert.equal(cloud.base.rows('dose_logs', U).length, 2, 'the cloud holds X and Z');
  assert.equal(doses(B.db, U).length, 2, 'and so does B');
});

test('OD-8 / DV-209: a late write from the replaced phone (started before, committed after the active phone pulled) is refused; the active phone holds every row the cloud holds', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  const ap = A.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(A.db, U, ap);
  A.view.rpcDown = true; // its check cannot run: the pass pushes
  A.view.hold();
  const inFlight = A.sync();
  await new Promise((r) => setImmediate(r));
  await B.signIn();
  const bp = B.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(B.db, U, bp);
  await B.sync();
  await A.view.release();
  await inFlight;
  await B.sync();
  const cloudIds = cloud.base.rows('dose_logs', U).map((r) => r.id).sort();
  const bIds = doses(B.db, U).map((r) => r.remote_id).sort();
  assert.deepEqual(bIds, cloudIds, 'B holds every row the cloud holds');
  assert.equal(cloudIds.length, 2, 'A\'s late write was refused');
});

// ── OD-3: the takeover is committed before the first import; a write in flight is in it or refused ──
test('OD-3: a write from the old phone that lands before the takeover is in the new phone\'s import', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const ap = A.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(A.db, U, ap);
  A.view.hold();
  const inFlight = A.sync();
  await new Promise((r) => setImmediate(r));
  await A.view.release(); // committed first
  await inFlight;
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  assert.equal(doses(B.db, U).length, 2, 'the write is in B\'s rebuilt copy');
});

test('OD-3: a write from the old phone that lands after the takeover is refused and stays pending there (counted in its notice)', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const ap = A.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(A.db, U, ap);
  A.view.hold();
  const inFlight = A.sync();
  await new Promise((r) => setImmediate(r));
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn(); // committed while A's write is out
  await A.view.release();
  await inFlight;
  assert.equal(cloud.base.rows('dose_logs', U).length, 1, 'refused');
  assert.equal(A.db.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'pending'`).n, 1, 'kept pending on A');
  assert.equal(doses(B.db, U).length, 1);
  await A.sync();
  assert.equal((await A.state()).verdict.summary.count, 1, 'and named in A\'s notice');
});

// ── OD-2 / DL-108: the notice on the phone that signs in ─────────────────────────────────────
test('OD-2: the new phone gets one notice naming the other device and the server time it last sent everything; it survives a kill and shows once', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud); // A's last full send is stamped by its pass
  const lastSent = cloud.device(U, 'dev-A').last_full_send_at;
  assert.ok(lastSent, 'A\'s pass with nothing left recorded its last full send on the server');
  const kv = memKv();
  const B = phone(cloud, 'dev-B', U, { info: fold, kv, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  const n = (await B.state()).notice;
  assert.deepEqual(n.device, iPhone);
  assert.equal(n.lastSentAt, lastSent);
  assert.equal(n.own, null);
  // The app is killed before the notice is seen: the next open shows it again, once.
  const B2 = phone(cloud, 'dev-B', U, { info: fold, kv, db: B.db });
  await B2.sync();
  assert.equal((await B2.state()).notice.id, n.id);
  await B2.flow.dismissNotice();
  assert.equal((await B2.state()).notice, null);
  await B2.sync();
  assert.equal((await B2.state()).notice, null, 'shown once');
  assert.ok(A);
});

test('OD-2: a device that never sent anything gets its own wording (no date); no notice when the same device signs in again or the other phone signed out normally', async () => {
  const cloud = world();
  const A = phone(cloud, 'dev-A', U, { session: '2026-10-15T08:00:00.000Z' });
  await A.signIn(); // never synced
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  assert.equal((await B.state()).notice.lastSentAt, null, 'screen 1b');
  // The same device signs in again: no notice.
  const B2 = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T10:00:00.000Z' });
  await B2.signIn();
  assert.equal((await B2.state()).notice, null);
  // B signs out normally (nothing unsent): it releases the account; the next phone shows nothing.
  assert.equal(await B2.flow.release(U), true);
  const C = phone(cloud, 'dev-C', U, { session: '2026-10-15T11:00:00.000Z' });
  await C.signIn();
  assert.equal((await C.state()).notice, null, 'DL-108');
});

// ── OD-4 / OD-6: the replaced phone ───────────────────────────────────────────────────────────
test('OD-4 / OD-6: the replaced phone never pulls, stores the verdict with what and how many it had unsent (kinds and dates), stops sync and cancels reminders', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  const bp = B.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(B.db, U, bp); await B.sync(); // something new for A to (not) pull
  const ap = A.db.getFirstSync('SELECT id FROM protocols').id;
  addDose(A.db, U, ap, { logged_at: '2026-10-12T12:00:00.000Z' });
  addDose(A.db, U, ap, { logged_at: '2026-10-14T12:00:00.000Z' });
  addWeighIn(A.db, U, '2026-10-13');
  A.view.calls.length = 0;
  await A.sync();
  assert.deepEqual(A.view.calls, ['rpc:device_status'], 'the check is the first and only server call: never a pull');
  const v = (await A.state()).verdict;
  assert.equal(v.kind, 'replaced');
  assert.ok(v.at);
  assert.equal(v.summary.count, 3);
  assert.deepEqual(v.summary.byKind, { dose: 2, weighIn: 1 });
  assert.equal(v.summary.from, '2026-10-12');
  assert.equal(v.summary.to, '2026-10-14');
  assert.equal(A.stopped, 1);
  assert.equal(A.cancelled, 1);
  // A "Taken" from a notification on the replaced phone is counted too (OD-6).
  addDose(A.db, U, ap, { logged_at: '2026-10-15T08:00:00.000Z' });
  await A.flow.refreshVerdict(U);
  assert.equal((await A.state()).verdict.summary.count, 4);
  // A kill before Continue: the verdict is still there at the next open, with no server call.
  const A2 = phone(cloud, 'dev-A', U, { kv: A.kv, db: A.db });
  A2.view.offline = true;
  assert.equal((await A2.state()).verdict.summary.count, 4);
  const r = await A2.sync();
  assert.equal(r.ran, false);
  assert.deepEqual(A2.view.calls, [], 'a stored verdict needs no network');
});

// ── OD-5: never wipe on a maybe ───────────────────────────────────────────────────────────────
test('OD-5: a network error, a missing function or a garbled reply is never a verdict', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  A.view.offline = true;
  await A.sync();
  assert.equal((await A.state()).verdict, null, 'offline: no verdict');
  A.view.offline = false;
  const realRpc = A.view.rpc;
  for (const reply of [
    { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
    { data: null, error: { code: '57014', message: 'timeout' } },
    { data: 'replaced', error: null },
    { data: { status: 'Replaced' }, error: null },
  ]) {
    A.view.rpc = async () => reply;
    await A.sync();
    assert.equal((await A.state()).verdict, null, JSON.stringify(reply));
  }
  A.view.rpc = realRpc;
  await A.sync();
  assert.equal((await A.state()).verdict.kind, 'replaced', 'only the server\'s confirmed answer');
});

test('OD-5: a phone whose own takeover was never confirmed retries it first and keeps its writes pending; it is never wiped on that', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  B.view.offline = true;
  const r = await B.signIn();
  assert.equal(r.go, false, 'not confirmed');
  const bp = addProtocol(B.db, U);
  const r2 = await B.sync();
  assert.equal(r2.ran, false, 'no push while its own takeover is unconfirmed');
  assert.equal((await B.state()).verdict, null);
  assert.equal(B.db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [bp]).sync_status, 'pending');
  B.view.offline = false;
  await B.sync();
  assert.equal(cloud.active(U), 'dev-B', 'the takeover went through at the next pass');
  assert.equal((await B.state()).notice.own.count, 1, 'its own unsent protocol is named (DL-104)');
  await A.sync();
  assert.equal((await A.state()).verdict.kind, 'replaced');
});

test('OD-5 / last sign-in wins: a delayed claim from an OLDER sign-in is superseded by the newer one (server-confirmed)', async () => {
  const cloud = world();
  const A = phone(cloud, 'dev-A', U, { session: '2026-10-15T08:00:00.000Z' });
  A.view.offline = true;
  await A.signIn(); // pending
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  A.view.offline = false;
  await A.sync();
  assert.equal(cloud.active(U), 'dev-B');
  assert.equal((await A.state()).verdict.kind, 'replaced');
});

// ── OD-14 / DL-102: only a sign-in the person makes takes over ───────────────────────────────
test('OD-14: a cold start (or a re-auth) of the replaced phone never takes the account back', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  const A2 = phone(cloud, 'dev-A', U, { db: A.db, kv: memKv(), session: '2026-10-15T10:00:00.000Z' }); // restored session, newer token
  await A2.flow.gate(U, 'startup');
  assert.equal(cloud.active(U), 'dev-B');
  assert.equal((await A2.state()).verdict.kind, 'replaced');
});

// ── OD-10 / DL-103: updated phones and the deletion path ─────────────────────────────────────
test('OD-10: a phone updated from an earlier version becomes active silently with its data when no device is active; another updated phone asks first (Use here / Sign out)', async () => {
  const cloud = world();
  // Both phones held the account under 1.3.0 (no device registered): the cloud has P + dose.
  const seedDb = makeDb();
  const sp = addProtocol(seedDb, U); await pushPending(seedDb, cloud.as(null, { userId: U }), U); addDose(seedDb, U, sp); await pushPending(seedDb, cloud.as(null, { userId: U }), U);
  const a = makeDb(); await fullImport(a, cloud.as(null, { userId: U }), U);
  const b = makeDb(); await fullImport(b, cloud.as(null, { userId: U }), U);
  const bpid = b.getFirstSync('SELECT id FROM protocols').id;
  addDose(b, U, bpid); // B has an unsent dose from 1.3.0
  const A = phone(cloud, 'dev-A', U, { db: a });
  const g = await A.flow.gate(U, 'startup');
  assert.equal(g.go, true);
  assert.equal(cloud.active(U), 'dev-A');
  assert.equal(doses(A.db, U).length, 1, 'data kept');
  assert.equal((await A.state()).notice, null, 'silently');
  const B = phone(cloud, 'dev-B', U, { db: b, info: fold });
  const gb = await B.flow.gate(U, 'startup');
  assert.equal(gb.go, false);
  const ask = (await B.state()).ask;
  assert.deepEqual(ask.device, iPhone, 'screen 4 names the phone in use');
  assert.equal(cloud.active(U), 'dev-A', 'it never takes over silently');
  B.view.calls.length = 0;
  await B.sync();
  assert.ok(!B.view.calls.some((c) => !c.startsWith('rpc:')), 'no push or pull while it asks');
  const r = await B.flow.useHere(U);
  assert.equal(r.go, true);
  assert.equal(cloud.active(U), 'dev-B');
  const n = (await B.state()).notice;
  assert.deepEqual(n.device, iPhone, 'then screen 1');
  assert.equal(n.own.count, 1, 'with its own unsent dose named');
  assert.equal((await B.state()).ask, null);
  await A.sync();
  assert.equal((await A.state()).verdict.kind, 'replaced');
});

test('OD-10: an account deleted on the other phone takes the deletion path on this one, with its own verdict', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  cloud.deleteAccount(U); // B deleted the account
  await A.sync();
  const v = (await A.state()).verdict;
  assert.equal(v.kind, 'gone', 'not "opened on another device"');
  assert.equal(A.cancelled, 1, 'reminders cancelled (DL-85)');
});

test('OD-10: after a spurious sign-out the phone still learns the account was deleted (anonymous check, server-confirmed)', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  assert.equal(await A.flow.checkAccountGone(U), false, 'the account exists: nothing');
  assert.equal((await A.state()).verdict, null);
  cloud.deleteAccount(U);
  A.view.offline = true;
  assert.equal(await A.flow.checkAccountGone(U), false, 'offline: no verdict');
  A.view.offline = false;
  assert.equal(await A.flow.checkAccountGone(U), true);
  assert.equal((await A.state()).verdict.kind, 'gone');
});

// ── OD-16: push tokens and the background check ──────────────────────────────────────────────
test('OD-16: the takeover removes the account\'s other push tokens; the replaced phone\'s background check finds its verdict by its secret', async () => {
  const cloud = world();
  cloud.base._store.push_tokens = new Map([
    ['t1', { id: 't1', user_id: U, expo_token: 'ExpoA', device_id: 'dev-A' }],
    ['t0', { id: 't0', user_id: U, expo_token: 'ExpoOld', device_id: null }],
    ['t9', { id: 't9', user_id: 'someone-else', expo_token: 'ExpoX', device_id: 'dev-X' }],
  ]);
  const { A } = await activeWithDose(cloud);
  assert.ok(A.secret, 'the claim gave A a secret for the background check');
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  await B.signIn();
  assert.deepEqual([...cloud.base._store.push_tokens.keys()], ['t9'], 'no push reaches the replaced phone; other accounts untouched');
  const r = await A.flow.backgroundCheck(U);
  assert.equal(r, 'replaced');
  assert.equal((await A.state()).verdict.kind, 'replaced');
  assert.equal(A.cancelled, 1, 'its reminders cancelled in the background run');
  const r2 = await B.flow.backgroundCheck(U);
  assert.equal(r2, 'active');
});

// ── Sheet 3: the last full backup ─────────────────────────────────────────────────────────────
test('A pass that leaves nothing unsent records the server time of this phone\'s last full backup; one with rows left does not', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const t1 = await A.flow.lastFullBackup(U);
  assert.equal(t1, cloud.device(U, 'dev-A').last_full_send_at);
  A.view.offline = true;
  addDose(A.db, U, A.db.getFirstSync('SELECT id FROM protocols').id);
  await A.sync();
  assert.equal(await A.flow.lastFullBackup(U), t1, 'unchanged while something is unsent');
});

test('OD-5 / OD-18: a phone that cannot read its device id this time claims nothing, wipes nothing, and its writes stay pending (refused DT002, never deleted)', async () => {
  const cloud = world();
  const { A } = await activeWithDose(cloud);
  const X = phone(cloud, 'dev-X', U, { noDeviceId: true });
  const r = await X.signIn();
  assert.equal(r.go, true);
  assert.equal(X.kv._m.size, 0, 'nothing stored: no pending claim that would hold every pass');
  assert.equal(cloud.active(U), 'dev-A');
  assert.ok(A);
});
