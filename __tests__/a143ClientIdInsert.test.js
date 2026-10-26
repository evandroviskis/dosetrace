'use strict';
// A-143 (Gate B review of A-137, 2026-10-17; DV-185): a first insert carried no id of its own — the
// cloud row id came from the server. When the answer was lost (offline mid-request, a timeout, the
// app killed) the row stayed pending and the next pass inserted it AGAIN: a second dose log,
// protocol, vial, food entry or weigh-in in the cloud (and, after a pull, on the phone).
// The rules:
//   1. before its first insert a row gets a client id (a UUID, local column client_id), stored
//      BEFORE the request goes out, and sent as the cloud row's id — every retry sends the same id;
//   2. a retry whose insert is refused (the id is taken: the earlier insert landed) or fails looks
//      the id up under this user; found → the local row is linked to it (remote_id) and its latest
//      content goes up as an update — exactly one cloud row, the local row linked to it;
//   3. a pull / import that brings the landed row links it to the local row with that client id
//      (never a second local row);
//   4. a row deleted, or deleted forever, before the retry: the landed cloud row goes too / gets
//      the tombstone (never left behind to come back on the next import);
//   5. rows without a client id (an older build's pending rows, synced rows) keep working;
//   6. calc_inputs keeps its one-row merge (DV-010): no client id there.
// Behaviour runs the REAL lib/syncCore over the sync harness (better-sqlite3 + fake cloud whose
// insert refuses a taken id like Postgres' primary key).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { makeDb, makeCloud, seedLocalProtocol } = require('./helpers/syncHarness');
const S = require('../lib/syncCore');
const { pushPending, pullChanges, fullImport, TABLES } = S;
const E = require('../lib/protocolEnd');

const USER = 'u1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// A synced protocol (cloud + local) so dose logs and vials can go up.
async function syncedProtocol(db, cloud) {
  const p = await cloud.insert('protocols', { user_id: USER, name: 'BPC', type: 'recon', active: true });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, created_at, updated_at, sync_status) VALUES (?, ?, 'BPC', 'recon', 1, 'T0', ?, 'synced')`, [p.data.id, USER, p.data.updated_at]);
  return { pid: db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id, remote: p.data.id };
}

// One new (pending) local row per pushed table, as the app's own writes leave them.
const SEED = {
  protocols: (db) => seedLocalProtocol(db, USER, { name: 'TB-500' }),
  vials: (db, p) => db.runSync(`INSERT INTO vials (user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, updated_at, sync_status) VALUES (?, ?, ?, '2026-10-20', 2, 20, 0, 1, 'L1', 'pending')`, [USER, p.pid, p.remote]).lastInsertRowId,
  dose_logs: (db, p) => db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-10-20T08:00:00.000Z', 'L1', 'pending')`, [USER, p.pid, p.remote]).lastInsertRowId,
  biomarkers: (db) => db.runSync(`INSERT INTO biomarkers (user_id, report_date, marker, value, unit, updated_at, sync_status) VALUES (?, '2026-10-20', 'Testosterone', 600, 'ng/dL', 'L1', 'pending')`, [USER]).lastInsertRowId,
  vaccines: (db) => db.runSync(`INSERT INTO vaccines (user_id, name, date_given, updated_at, sync_status) VALUES (?, 'Flu', '2026-10-20', 'L1', 'pending')`, [USER]).lastInsertRowId,
  food_logs: (db) => db.runSync(`INSERT INTO food_logs (user_id, entry_date, raw_text, kcal, updated_at, sync_status) VALUES (?, '2026-10-20', '2 eggs', 140, 'L1', 'pending')`, [USER]).lastInsertRowId,
  reality_checks: (db) => db.runSync(`INSERT INTO reality_checks (user_id, entry_date, tdee, updated_at, sync_status) VALUES (?, '2026-10-20', 2400, 'L1', 'pending')`, [USER]).lastInsertRowId,
  calc_snapshots: (db) => db.runSync(`INSERT INTO calc_snapshots (user_id, entry_date, weight_kg, updated_at, sync_status) VALUES (?, '2026-10-20', 82.5, 'L1', 'pending')`, [USER]).lastInsertRowId,
  calc_targets: (db) => db.runSync(`INSERT INTO calc_targets (user_id, entry_date, target_weight_kg, updated_at, sync_status) VALUES (?, '2026-10-20', 78, 'L1', 'pending')`, [USER]).lastInsertRowId,
  reality_check_open: (db) => db.runSync(`INSERT INTO reality_check_open (user_id, start_date, start_weight_kg, created_at, updated_at, sync_status) VALUES (?, '2026-10-20', 82.5, '2026-10-20T08:00:00.000Z', 'L1', 'pending')`, [USER]).lastInsertRowId,
};
const GENERIC = TABLES.filter((t) => t !== 'calc_inputs');

// The network drops right after the insert landed: its answer is lost, and so is the look-up the same
// pass makes. → back(): the network is back (the next pass).
function dropAfterLanding(cloud, how = 'error') {
  cloud.loseInsertAnswers(1, how);
  const real = cloud.fetchIn;
  cloud.fetchIn = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
  return () => { cloud.fetchIn = real; };
}

test('A-143 (scope): every table the engine pushes, except the one-row calc_inputs, has a seeder here', () => {
  assert.deepEqual(Object.keys(SEED).sort(), GENERIC.slice().sort());
});

test('A-143 (defect): a dose log whose insert answer is lost, then the next pass -> ONE cloud dose log (before: two)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  SEED.dose_logs(db, p);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 1, 'one dose taken = one cloud row');
});

for (const how of ['error', 'throw']) {
  for (const table of GENERIC) {
    test(`A-143 (1)(2) ${table}: the insert lands, its answer is lost (${how}), the retry -> exactly one cloud row, the local row linked to it and synced`, async () => {
      const db = makeDb();
      const cloud = makeCloud();
      const p = await syncedProtocol(db, cloud);
      const id = SEED[table](db, p);
      const before = cloud.rows(table, USER).length;
      const back = dropAfterLanding(cloud, how);
      await pushPending(db, cloud, USER);
      back();
      assert.equal(cloud.rows(table, USER).length, before + 1, 'the first insert landed');
      const mid = db.getFirstSync(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      assert.equal(mid.sync_status, 'pending', 'no answer: still pending');
      assert.equal(mid.remote_id, null);
      assert.match(String(mid.client_id), UUID, 'the client id was stored before the request');
      await pushPending(db, cloud, USER); // the retry
      const rows = cloud.rows(table, USER);
      assert.equal(rows.length, before + 1, 'still exactly one new cloud row');
      const local = db.getFirstSync(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      assert.equal(local.remote_id, mid.client_id, 'the local row is linked to the landed row');
      assert.ok(rows.some((r) => r.id === local.remote_id), 'that cloud row exists');
      assert.equal(local.sync_status, 'synced', 'and the row is settled in the same pass');
      assert.equal(n(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [USER]), table === 'protocols' ? 2 : 1, 'one local row');
    });
  }
}

test('A-143 (2): the answer is lost but the network holds -> the same pass finds the landed row, links it and settles it (one cloud row)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const id = SEED.dose_logs(db, p);
  cloud.loseInsertAnswers(1);
  await pushPending(db, cloud, USER);
  const rows = cloud.rows('dose_logs', USER);
  assert.equal(rows.length, 1);
  const r = db.getFirstSync('SELECT remote_id, client_id, sync_status FROM dose_logs WHERE id = ?', [id]);
  assert.equal(r.remote_id, rows[0].id);
  assert.equal(r.remote_id, r.client_id);
  assert.equal(r.sync_status, 'synced');
});

test('A-143 (1): the same client id goes with every attempt (an attempt that never reached the cloud, then one that did)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const id = SEED.dose_logs(db, p);
  const realInsert = cloud.insert;
  cloud.insert = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } }); // offline: nothing lands
  await pushPending(db, cloud, USER);
  const cid = db.getFirstSync('SELECT client_id FROM dose_logs WHERE id = ?', [id]).client_id;
  assert.match(String(cid), UUID);
  cloud.insert = realInsert;
  await pushPending(db, cloud, USER);
  const sent = cloud.insertedPayloads.filter((x) => x.table === 'dose_logs');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.id, cid, 'the stored id is the cloud id');
  assert.equal(db.getFirstSync('SELECT remote_id FROM dose_logs WHERE id = ?', [id]).remote_id, cid);
});

test('A-143 (3): a pull between the lost answer and the retry links the landed row (one local row, one cloud row)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const id = SEED.dose_logs(db, p);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  await pullChanges(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE user_id = ?', [USER]), 1, 'the pulled row is the same row, not a second one');
  const cid = db.getFirstSync('SELECT client_id FROM dose_logs WHERE id = ?', [id]).client_id;
  assert.equal(db.getFirstSync('SELECT remote_id FROM dose_logs WHERE id = ?', [id]).remote_id, cid);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 1);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE user_id = ?', [USER]), 1);
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [id]).sync_status, 'synced');
});

test('A-143 (2): the watermark moved past the landed row (another dose synced after it) -> the retry still links, no duplicate', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const first = SEED.dose_logs(db, p);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  const second = SEED.dose_logs(db, p);
  await pushPending(db, cloud, USER); // first: retried; second: a normal insert
  await pullChanges(db, cloud, USER);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 2, 'two doses, two cloud rows');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs WHERE user_id = ?', [USER]), 2);
  for (const id of [first, second]) {
    const r = db.getFirstSync('SELECT remote_id, sync_status FROM dose_logs WHERE id = ?', [id]);
    assert.ok(r.remote_id && cloud._store.dose_logs.get(r.remote_id), 'linked');
    assert.equal(r.sync_status, 'synced');
  }
});

test('A-143 (2): a protocol whose answer was lost -> its dose log waits, then both go up once, the dose under the landed protocol', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'Sema' });
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', '2026-10-20T08:00:00.000Z', 'L1', 'pending')`, [USER, pid]);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  assert.equal(cloud.rows('protocols', USER).length, 1);
  assert.equal(cloud.rows('dose_logs', USER).length, 0, 'the dose waits for its protocol');
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 1, 'one protocol');
  const prot = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.equal(prot.remote_id, cloud.rows('protocols', USER)[0].id);
  const logs = cloud.rows('dose_logs', USER);
  assert.equal(logs.length, 1, 'one dose');
  assert.equal(logs[0].protocol_id, prot.remote_id, 'under the landed protocol');
  assert.equal(db.getFirstSync('SELECT protocol_remote_id FROM dose_logs WHERE protocol_id = ?', [pid]).protocol_remote_id, prot.remote_id);
});

test('A-143 (2): an edit made after the lost answer reaches the landed row (the latest content wins, still one row)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const id = SEED.food_logs(db);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  db.runSync(`UPDATE food_logs SET raw_text = '3 eggs', kcal = 210, updated_at = 'L2', sync_status = 'pending' WHERE id = ?`, [id]);
  await pushPending(db, cloud, USER);
  const rows = cloud.rows('food_logs', USER);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw_text, '3 eggs');
  assert.equal(rows[0].kcal, 210);
  assert.equal(db.getFirstSync('SELECT sync_status FROM food_logs WHERE id = ?', [id]).sync_status, 'synced');
});

test('A-143 (4): a dose deleted before the retry -> the landed cloud row is deleted too and never comes back', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const id = SEED.dose_logs(db, p);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  db.runSync(`UPDATE dose_logs SET sync_status = 'deleted', updated_at = 'L2' WHERE id = ?`, [id]); // the person's Undo
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 0, 'the landed row went');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs'), 0);
  await pullChanges(db, cloud, USER);
  await fullImport(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs'), 0, 'nothing came back');
});

test('A-143 (4): a deleted row whose cloud delete fails (offline) stays deleted here and is retried', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  const id = SEED.dose_logs(db, p);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  db.runSync(`UPDATE dose_logs SET sync_status = 'deleted', updated_at = 'L2' WHERE id = ?`, [id]);
  const realDelete = cloud.delete;
  cloud.delete = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [id])?.sync_status, 'deleted', 'kept, still to send');
  cloud.delete = realDelete;
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 0);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs'), 0);
});

test('A-143 (4): an app-written Missed row removed by an End after the lost answer -> the landed cloud row goes too', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Missed', '2026-10-20T08:00:00.000Z', 'L1', 'pending')`, [USER, p.pid, p.remote]);
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  assert.equal(cloud.rows('dose_logs', USER).length, 1);
  E.dropMissedAfter(db, p.pid, '2026-10-19T00:00:00.000Z', '2026-10-21T00:00:00.000Z');
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 0, 'the landed Missed row went from the cloud');
  await pullChanges(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM dose_logs'), 0, 'and never comes back');
});

test('A-143 (4): a protocol deleted forever before the retry -> the landed cloud row becomes the tombstone (not left live)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'Sema' });
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  const landed = cloud.rows('protocols', USER)[0];
  assert.ok(landed && !landed.purged_at);
  db.runSync(`UPDATE protocols SET active = 0, deleted_at = 'D1', purged_at = '2026-10-21T00:00:00.000Z', updated_at = 'L2', sync_status = 'pending' WHERE id = ?`, [pid]);
  await pushPending(db, cloud, USER);
  const after = cloud.rows('protocols', USER);
  assert.equal(after.length, 1);
  assert.ok(after[0].purged_at, 'the tombstone is on the landed row');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols'), 0, 'gone here');
  await fullImport(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols'), 0, 'never imported back');
});

test('A-143 (4): a purge whose landed-row check cannot be made (no session) waits; it never drops the local row blind', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'Sema' });
  const realInsert = cloud.insert;
  cloud.insert = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
  await pushPending(db, cloud, USER); // an attempt was made (client id stored), nothing landed
  cloud.insert = realInsert;
  db.runSync(`UPDATE protocols SET active = 0, deleted_at = 'D1', purged_at = '2026-10-21T00:00:00.000Z', updated_at = 'L2', sync_status = 'pending' WHERE id = ?`, [pid]);
  cloud.sessionUserId = async () => null; // RLS would answer "absent" for anything
  await pushPending(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [pid]), 1, 'kept until the check can be made');
  cloud.sessionUserId = async () => USER;
  await pushPending(db, cloud, USER);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [pid]), 0, 'verified absent: the local purge finishes');
  assert.equal(cloud.rows('protocols', USER).length, 0);
});

test('A-143 (3): a full import (sign-in on an empty phone is not it, but a rebuild / self-heal import) links the landed row to the pending one', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'Sema' });
  const back = dropAfterLanding(cloud);
  await pushPending(db, cloud, USER);
  back();
  S.importFromCloud(db, 'protocols', cloud.rows('protocols', USER));
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE user_id = ?', [USER]), 1, 'one local protocol');
  assert.equal(db.getFirstSync('SELECT remote_id FROM protocols WHERE id = ?', [pid]).remote_id, cloud.rows('protocols', USER)[0].id);
});

test('A-143 (5): an older build\'s pending row (no client id) gets one at its first push; the cloud row has that id', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const id = SEED.biomarkers(db);
  assert.equal(db.getFirstSync('SELECT client_id FROM biomarkers WHERE id = ?', [id]).client_id, null);
  await pushPending(db, cloud, USER);
  const r = db.getFirstSync('SELECT client_id, remote_id, sync_status FROM biomarkers WHERE id = ?', [id]);
  assert.match(String(r.client_id), UUID);
  assert.equal(r.remote_id, r.client_id);
  assert.equal(r.sync_status, 'synced');
  assert.equal(cloud.rows('biomarkers', USER).length, 1);
});

test('A-143 (5): a synced row (cloud id from the server, no client id) is edited and pushed as before: an update, no new row, no client id', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const p = await syncedProtocol(db, cloud);
  db.runSync(`UPDATE protocols SET name = 'BPC-157', updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [p.pid]);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 1);
  assert.equal(cloud._store.protocols.get(p.remote).name, 'BPC-157');
  const r = db.getFirstSync('SELECT client_id, sync_status FROM protocols WHERE id = ?', [p.pid]);
  assert.equal(r.client_id, null);
  assert.equal(r.sync_status, 'synced');
  assert.equal(cloud.insertedPayloads.filter((x) => x.table === 'protocols').length, 1, 'only the seed insert');
});

test('A-143 (5): an install whose table lacks the column (an older schema) still pushes, without an id', async () => {
  const db = makeDb();
  db.execSync('ALTER TABLE vaccines DROP COLUMN client_id');
  const cloud = makeCloud();
  const id = SEED.vaccines(db);
  await pushPending(db, cloud, USER);
  const r = db.getFirstSync('SELECT remote_id, sync_status FROM vaccines WHERE id = ?', [id]);
  assert.equal(r.sync_status, 'synced');
  assert.ok(r.remote_id);
  assert.equal(cloud.insertedPayloads.find((x) => x.table === 'vaccines').payload.id, undefined);
});

test('A-143 (safety): an id taken by ANOTHER account (refused, invisible under RLS) is never linked; the row stays pending', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const id = SEED.vaccines(db);
  const cid = '11111111-2222-4333-8444-555555555555';
  db.runSync('UPDATE vaccines SET client_id = ? WHERE id = ?', [cid, id]);
  cloud._store.vaccines.set(cid, { id: cid, user_id: 'someone-else', name: 'Theirs', updated_at: '000001' });
  await pushPending(db, cloud, USER);
  const r = db.getFirstSync('SELECT remote_id, sync_status FROM vaccines WHERE id = ?', [id]);
  assert.equal(r.remote_id, null, 'never linked to another account\'s row');
  assert.equal(r.sync_status, 'pending');
  assert.equal(cloud._store.vaccines.get(cid).name, 'Theirs', 'their row untouched');
});

test('A-143 (safety): a Restart never copies the old run\'s client id (the new run is a new cloud row)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seedLocalProtocol(db, USER, { name: 'Sema' });
  await pushPending(db, cloud, USER);
  db.runSync(`UPDATE protocols SET active = 0, ended_at = '2026-10-20T00:00:00.000Z' WHERE id = ?`, [pid]);
  const newId = E.restartAsNew(db, pid, { nowIso: '2026-10-21T08:00:00.000Z', todayKey: '2026-10-21' });
  assert.ok(newId && newId !== pid, 'a new run');
  assert.equal(db.getFirstSync('SELECT client_id FROM protocols WHERE id = ?', [newId]).client_id, null);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER).length, 2, 'two runs, two cloud rows');
});

test('A-143 (6): calc_inputs keeps its one-row merge (DV-010): no client id, no id in the insert', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  db.runSync(`INSERT INTO calc_inputs (user_id, payload, updated_at, sync_status) VALUES (?, '{"a":1}', 'L1', 'pending')`, [USER]);
  await pushPending(db, cloud, USER);
  const sent = cloud.insertedPayloads.filter((x) => x.table === 'calc_inputs');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.id, undefined);
  assert.equal(db.getFirstSync('SELECT client_id FROM calc_inputs').client_id, null);
});

test('A-143 (schema): an older install gets client_id on every pushed table, idempotently (lib/database.js initDatabase)', () => {
  const { upgradeClientIds, TABLE_DDL } = require('../lib/schema');
  const raw = new Database(':memory:');
  const db = { execSync: (s) => raw.exec(s), getAllSync: (s, p = []) => raw.prepare(s).all(...p) };
  for (const t of TABLES) raw.exec(TABLE_DDL[t].replace(/\n\s*client_id TEXT,/, ''));
  for (const t of TABLES) assert.ok(!raw.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'client_id'), `${t}: old schema`);
  upgradeClientIds(db);
  upgradeClientIds(db); // every launch
  for (const t of TABLES) assert.ok(raw.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'client_id'), `${t}: client_id added`);
  assert.match(read('lib/database.js'), /upgradeClientIds\(db\)/, 'initDatabase runs the upgrade');
});

test('A-143 (adapter): the app sends a real UUID from expo-crypto (lib/sync.js cloud.newId) and never strips the id', () => {
  const src = read('lib/sync.js');
  assert.match(src, /import \* as Crypto from 'expo-crypto'/);
  assert.match(src, /newId\(\)\s*\{\s*return Crypto\.randomUUID\(\);/);
  assert.match(src, /return await supabase\.from\(table\)\.insert\(payload\)\.select\('id, updated_at'\)\.single\(\);/);
});
