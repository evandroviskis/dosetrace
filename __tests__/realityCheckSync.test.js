'use strict';
// S-03 / FX-9: the open reality check and calculator inputs sync between devices,
// and Stop wins (stopped_at never reverts), driven through the REAL sync engine
// (lib/syncCore.js) with a real SQLite + fake cloud (__tests__/helpers/syncHarness.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { makeDb, makeCloud } = require('./helpers/syncHarness');

const USER = 'user-A';

function startCheck(db, over = {}) {
  const t = over.updated_at || new Date().toISOString();
  return db.runSync(
    `INSERT INTO reality_check_open (user_id, start_date, start_weight_kg, stopped_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, NULL, ?, ?, 'pending')`,
    [USER, over.start_date || '2026-09-20', over.start_weight_kg ?? 88.4, t, t]
  ).lastInsertRowId;
}
const row = (db) => db.getFirstSync(`SELECT * FROM reality_check_open WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [USER]);
const stop = (db, id, at) => db.runSync(`UPDATE reality_check_open SET stopped_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [at, at, id]);
const editWeight = (db, id, kg, at) => db.runSync(`UPDATE reality_check_open SET start_weight_kg = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [kg, at, id]);

test('FX-9: an open check started on device A reaches device B', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  startCheck(a);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  const rb = row(b);
  assert.equal(rb.start_date, '2026-09-20');
  assert.equal(rb.start_weight_kg, 88.4);
  assert.equal(rb.stopped_at, null);
});

test('FX-9: Stop on device A ends the check on device B', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const id = startCheck(a);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  stop(a, id, '2026-09-27T10:00:00Z');
  await pushPending(a, cloud, USER);
  await pullChanges(b, cloud, USER);
  assert.equal(row(b).stopped_at, '2026-09-27T10:00:00Z');
});

test('FX-9: both devices change the check offline; B pushes an edit AFTER A pushed its Stop → still stopped everywhere', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const idA = startCheck(a);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  const idB = row(b).id;
  stop(a, idA, '2026-09-27T10:00:00Z');
  editWeight(b, idB, 87.0, '2026-09-27T11:00:00Z');
  await pushPending(a, cloud, USER); // stop reaches the cloud first
  await pushPending(b, cloud, USER); // stale open edit must not clear it
  assert.ok(cloud.rows('reality_check_open', USER)[0].stopped_at, 'cloud keeps the stop');
  await pullChanges(b, cloud, USER);
  await pullChanges(a, cloud, USER);
  assert.equal(row(b).stopped_at, '2026-09-27T10:00:00Z', 'device B ends stopped');
  assert.equal(row(a).stopped_at, '2026-09-27T10:00:00Z', 'device A stays stopped');
});

test('FX-9: the other order — B pushes its edit first, then A pushes Stop → stopped everywhere', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const idA = startCheck(a);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  const idB = row(b).id;
  stop(a, idA, '2026-09-27T10:00:00Z');
  editWeight(b, idB, 87.0, '2026-09-27T11:00:00Z');
  await pushPending(b, cloud, USER);
  await pushPending(a, cloud, USER);
  await pullChanges(b, cloud, USER);
  assert.equal(row(b).stopped_at, '2026-09-27T10:00:00Z');
});

test('FX-9: a device that still holds the check open never reopens a stop it pulls later (pending local edit)', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const idA = startCheck(a);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  stop(a, idA, '2026-09-27T10:00:00Z');
  await pushPending(a, cloud, USER);
  editWeight(b, row(b).id, 87.0, '2026-09-27T11:00:00Z'); // B offline, edit pending
  await pullChanges(b, cloud, USER);                        // B comes online: pull first
  assert.equal(row(b).stopped_at, '2026-09-27T10:00:00Z', 'pending local row takes the stop');
  await pushPending(b, cloud, USER);
  assert.ok(cloud.rows('reality_check_open', USER)[0].stopped_at);
});

test('FX-9: calculator inputs sync (last writer wins)', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const t = '2026-09-27T09:00:00Z';
  a.runSync(`INSERT INTO calc_inputs (user_id, payload, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'pending')`, [USER, JSON.stringify({ weight: '88.4', unit: 'metric' }), t, t]);
  await pushPending(a, cloud, USER);
  await fullImport(b, cloud, USER);
  const rb = b.getFirstSync(`SELECT payload FROM calc_inputs WHERE user_id = ?`, [USER]);
  assert.deepEqual(JSON.parse(rb.payload), { weight: '88.4', unit: 'metric' });
});

// Re-review blocking: the migration may only plan after a pull of
// reality_check_open that is KNOWN to have succeeded.
test('pullTable reports success, and failure when the cloud fetch errors (offline / table missing)', async () => {
  const { pullTable } = require('../lib/syncCore');
  const cloud = makeCloud();
  const db = makeDb();
  assert.equal((await pullTable(db, cloud, USER, 'reality_check_open')).ok, true);
  const failing = { ...cloud, fetchSince: async () => ({ data: null, error: { message: 'offline' } }) };
  assert.equal((await pullTable(db, failing, USER, 'reality_check_open')).ok, false);
  const throwing = { ...cloud, fetchSince: async () => { throw new Error('network'); } };
  assert.equal((await pullTable(db, throwing, USER, 'reality_check_open')).ok, false);
});

test('pullTable brings a stop from the cloud into an empty device (so the migration sees it)', async () => {
  const { pullTable } = require('../lib/syncCore');
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  const id = startCheck(a);
  await pushPending(a, cloud, USER);
  stop(a, id, '2026-09-27T10:00:00Z');
  await pushPending(a, cloud, USER);
  assert.equal((await pullTable(b, cloud, USER, 'reality_check_open')).ok, true);
  assert.equal(row(b).stopped_at, '2026-09-27T10:00:00Z');
});

// Re-review #3: created_at travels with the row, so duplicate tie-breaks agree on every device.
test('reality_check_open keeps its device created_at in the cloud', async () => {
  const cloud = makeCloud();
  const a = makeDb();
  startCheck(a, { updated_at: '2026-09-20T08:00:00.000Z' });
  await pushPending(a, cloud, USER);
  assert.equal(cloud.rows('reality_check_open', USER)[0].created_at, '2026-09-20T08:00:00.000Z');
});

// #024 reply item 2: never two open checks on an account. A new check started
// offline on A + an older open check pulled later → the older ends stopped and
// that stop is pushed.
test('single open check: a new local check + an older open check pulled later → the older is stopped and pushed', async () => {
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  startCheck(b, { start_date: '2026-09-10', updated_at: '2026-09-10T08:00:00.000Z' });
  await pushPending(b, cloud, USER);
  startCheck(a, { start_date: '2026-09-25', updated_at: '2026-09-25T08:00:00.000Z' });
  await pullChanges(a, cloud, USER);
  const rowsA = a.getAllSync(`SELECT start_date, stopped_at FROM reality_check_open WHERE user_id = ? ORDER BY start_date`, [USER]);
  assert.equal(rowsA.length, 2);
  assert.ok(rowsA[0].stopped_at, 'older (pulled) check is stopped');
  assert.equal(rowsA[1].stopped_at, null, 'the new check stays open');
  await pushPending(a, cloud, USER);
  const older = cloud.rows('reality_check_open', USER).find((r) => r.start_date === '2026-09-10');
  assert.ok(older.stopped_at, 'the stop reached the cloud');
});

test('single open check: the same rule holds through pullTable (migration pull)', async () => {
  const { pullTable } = require('../lib/syncCore');
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  startCheck(b, { start_date: '2026-09-10', updated_at: '2026-09-10T08:00:00.000Z' });
  await pushPending(b, cloud, USER);
  startCheck(a, { start_date: '2026-09-25', updated_at: '2026-09-25T08:00:00.000Z' });
  await pullTable(a, cloud, USER, 'reality_check_open');
  const open = a.getAllSync(`SELECT start_date FROM reality_check_open WHERE user_id = ? AND stopped_at IS NULL`, [USER]);
  assert.deepEqual(open.map((r) => r.start_date), ['2026-09-25']);
});

// FX-9 two-simulator run 2026-09-28, finding F2: a pull that stops an older open
// check (enforceSingleOpenCheck) leaves that stop PENDING with no push after it —
// the cloud keeps two open checks until this device's next sync (seen live).
// The fix: one sync pass = push, pull, then push again when the pull queued writes.
test('FX-9 F2: one sync pass leaves the cloud with a single open check (the enforced stop is pushed in the same pass)', { todo: 'A-48 — parked (founder 2026-09-28)' }, async () => {
  const { syncOnce } = require('../lib/syncCore');
  assert.equal(typeof syncOnce, 'function', 'syncOnce not built yet');
  const cloud = makeCloud();
  const a = makeDb(); const b = makeDb();
  startCheck(a, { start_date: '2026-09-28', updated_at: '2026-09-28T21:20:46.000Z' });
  await pushPending(a, cloud, USER);
  startCheck(b, { start_date: '2026-09-28', updated_at: '2026-09-28T21:21:17.000Z' });
  await syncOnce(b, cloud, USER);
  const open = cloud.rows('reality_check_open', USER).filter((r) => !r.stopped_at);
  assert.equal(open.length, 1, 'exactly one open check in the cloud after one sync pass');
});

// Finding F1: a device resumed from the background never pulls (App.js foreground
// handler only re-plans notifications), so a Stop made on another device does not
// reach it until a cold start or its own write. A-47 (target 1.2.6, which ships inside 1.3.0):
// built in the pre-build pass 2026-10-03, the test is a real test now.
test('FX-9 F1: returning to the foreground requests a sync (throttled), so another device\'s Stop arrives without a cold start', () => {
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const i = src.indexOf("AppState.addEventListener('change'");
  const handler = src.slice(i, src.indexOf('});', i) + 3);
  assert.match(handler, /requestSync\(\)/);
});
