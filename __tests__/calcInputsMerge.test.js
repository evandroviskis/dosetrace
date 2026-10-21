'use strict';
// DV-010 (DL-29, S1): calc_inputs is merged per key on push — a phone sends only the keys it
// changed since its last sync, merged over the cloud's payload, and a first save on a payload
// another phone created keeps that phone's keys. Before the fix, a push (or the first-save upsert on
// user_id) replaced the whole JSON payload, so the typed average calories (rcTypedKcal), the result
// sources or the kept daily burn (legacyBurn) set on phone A vanished after phone B synced.
// Two phones, one fake cloud, the REAL lib/syncCore push/pull and the REAL saveCalcInputs
// (lib/realityCheck.js, cut out with loadFn) writing through lib/calcInputsSync.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { mergeCalcInputs } = require('../lib/realityCheckStore');
const { calcInputsChanges, recordCalcInputs } = require('../lib/calcInputsSync');
const { loadFn, read } = require('./helpers/extractFn');

const USER = 'user-A';
let clock = 0;
const now = () => `2026-10-20T10:00:${String(++clock).padStart(2, '0')}.000Z`;

// The real saveCalcInputs of lib/realityCheck.js on one phone's SQLite.
function phone(db, { migrated = true, meta = null } = {}) {
  const getCalcInputsRow = (uid) => db.getFirstSync(
    `SELECT * FROM calc_inputs WHERE user_id = ? AND sync_status != 'deleted' ORDER BY updated_at DESC, id DESC LIMIT 1`, [uid]);
  const upsertCalcInputs = (uid, text, changes) => recordCalcInputs(db, uid, text, changes, now());
  const save = loadFn('lib/realityCheck.js', 'export async function saveCalcInputs(', 'saveCalcInputs', {
    getCachedUser: async () => ({ id: USER, user_metadata: meta ? { calc_inputs: meta } : {} }),
    isMigrated: async () => migrated,
    getCalcInputsRow, upsertCalcInputs, mergeCalcInputs, calcInputsChanges,
    requestSync: () => {},
    supabase: { auth: { updateUser: () => Promise.resolve() } },
  });
  return { db, save, payload: () => JSON.parse(getCalcInputsRow(USER)?.payload || 'null') };
}
const cloudPayload = (cloud) => {
  const rows = cloud.rows('calc_inputs', USER);
  assert.equal(rows.length, 1, 'one calc_inputs row per user in the cloud');
  return rows[0].payload;
};
const syncPass = async (db, cloud) => { await pushPending(db, cloud, USER); await pullChanges(db, cloud, USER); };

// The calculator's debounced save sends its WHOLE state every time (CalculatorSection inputsSave).
const calcState = (over = {}) => ({ unit: 'metric', weight: '88.4', bfSource: 'typed', bodyFat: '18', sex: 'male', age: 41, height: '180', activity: 1.375, goal: 'lose', waist: '90', oneCard: 1, legacyBurn: true, ...over });

test('DV-010: B, holding a stale copy, changes only the unit -> the cloud keeps A\'s rcTypedKcal and takes B\'s unit', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await A.save(calcState());
  await syncPass(A.db, cloud);
  await fullImport(B.db, cloud, USER);                 // B holds the same copy (no rcTypedKcal yet)
  await A.save({ rcTypedKcal: 2100 });                 // A types the average calories ...
  await syncPass(A.db, cloud);                         // ... and syncs
  await B.save(calcState({ unit: 'imperial' }));       // B (stale) changes only the unit
  await pushPending(B.db, cloud, USER);
  const p = cloudPayload(cloud);
  assert.equal(p.rcTypedKcal, 2100, 'A\'s typed calories survive B\'s push');
  assert.equal(p.unit, 'imperial', 'B\'s change arrives');
  assert.equal(p.legacyBurn, true, 'the kept daily burn survives');
  assert.equal(B.payload().rcTypedKcal, 2100, 'B now shows A\'s value too');
  await syncPass(A.db, cloud);
  assert.equal(A.payload().unit, 'imperial');
  assert.equal(A.payload().rcTypedKcal, 2100);
});

test('DV-010: a stale key B holds never overwrites A\'s newer value of that key (a plain merge of B\'s full copy would)', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await A.save({ ...calcState(), rcTypedKcal: 1800, rcResultSources: { '2026-10-01': { kcal: 'typed' } } });
  await syncPass(A.db, cloud);
  await fullImport(B.db, cloud, USER);
  await A.save({ rcTypedKcal: 2100, legacyBurn: false, rcResultSources: { '2026-10-08': { kcal: 'food' } } });
  await syncPass(A.db, cloud);
  await B.save(calcState({ unit: 'imperial', legacyBurn: true }));   // legacyBurn unchanged on B (stale true)
  await pushPending(B.db, cloud, USER);
  const p = cloudPayload(cloud);
  assert.equal(p.rcTypedKcal, 2100, 'B\'s stale 1800 never goes up');
  assert.equal(p.legacyBurn, false, 'A\'s newer daily-burn decision kept');
  assert.deepEqual(Object.keys(p.rcResultSources).sort(), ['2026-10-01', '2026-10-08'], 'result sources merged per date');
  assert.equal(p.unit, 'imperial');
});

test('DV-010: B\'s first-ever save on a payload A created keeps A\'s keys (the first-save upsert merges)', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await A.save({ ...calcState(), rcTypedKcal: 2100 });
  await syncPass(A.db, cloud);
  await B.save({ rcResultSources: { '2026-10-08': { kcal: 'typed' } } }); // B never pulled calc_inputs
  await pushPending(B.db, cloud, USER);
  const p = cloudPayload(cloud);
  assert.equal(p.rcTypedKcal, 2100);
  assert.equal(p.weight, '88.4');
  assert.equal(p.legacyBurn, true);
  assert.deepEqual(p.rcResultSources, { '2026-10-08': { kcal: 'typed' } });
  assert.equal(B.payload().rcTypedKcal, 2100, 'B holds the merged payload');
  const rowB = B.db.getFirstSync('SELECT remote_id, sync_status, pending_patch FROM calc_inputs WHERE user_id = ?', [USER]);
  assert.equal(rowB.remote_id, cloud.rows('calc_inputs', USER)[0].id, 'B adopted the account\'s one cloud row');
  assert.equal(rowB.sync_status, 'synced');
  assert.equal(rowB.pending_patch, null);
});

test('DV-010: a cloud row that appears between the read and the first insert is never replaced (insert refused -> merged next pass)', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await B.save({ unit: 'imperial' });
  // The account's row lands while B is between "no cloud row" and its insert: the unique user_id
  // refuses B's insert (lib/sync.js: upsert ... ignoreDuplicates, nothing written).
  const racing = {
    ...cloud,
    fetchSince: async (t, u, s) => (t === 'calc_inputs' ? { data: [], error: null } : cloud.fetchSince(t, u, s)),
    insert: async (t, p) => {
      if (t === 'calc_inputs') {
        await A.save({ ...calcState(), rcTypedKcal: 2100 });
        await pushPending(A.db, cloud, USER);
        if (cloud.rows('calc_inputs', USER).length) return { data: null, error: { code: 'PGRST116', message: 'no row' } };
      }
      return cloud.insert(t, p);
    },
  };
  await pushPending(B.db, racing, USER);
  assert.equal(cloudPayload(cloud).rcTypedKcal, 2100, 'A\'s row untouched');
  assert.equal(B.db.getFirstSync('SELECT sync_status FROM calc_inputs').sync_status, 'pending', 'B retries');
  await pushPending(B.db, cloud, USER);
  const p = cloudPayload(cloud);
  assert.equal(p.rcTypedKcal, 2100);
  assert.equal(p.unit, 'imperial');
});

test('DV-010: an edit made while the push is in flight stays pending and goes up on the next pass', async () => {
  const cloud = makeCloud();
  const B = phone(makeDb());
  await B.save(calcState());
  await syncPass(B.db, cloud);
  await B.save({ unit: 'imperial' });
  const slow = { ...cloud, update: async (t, id, p) => { if (t === 'calc_inputs') await B.save({ rcTypedKcal: 1950 }); return cloud.update(t, id, p); } };
  await pushPending(B.db, slow, USER);
  assert.equal(cloudPayload(cloud).unit, 'imperial');
  assert.equal(B.db.getFirstSync('SELECT sync_status FROM calc_inputs').sync_status, 'pending');
  await pushPending(B.db, cloud, USER);
  assert.equal(cloudPayload(cloud).rcTypedKcal, 1950);
  assert.equal(cloudPayload(cloud).unit, 'imperial');
  assert.equal(B.db.getFirstSync('SELECT sync_status FROM calc_inputs').sync_status, 'synced');
});

test('DV-010: a failed cloud read leaves the row pending and the cloud untouched', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await A.save({ ...calcState(), rcTypedKcal: 2100 });
  await syncPass(A.db, cloud);
  await fullImport(B.db, cloud, USER);
  await B.save({ unit: 'imperial' });
  const offline = { ...cloud, fetchSince: async () => ({ data: null, error: { message: 'offline' } }) };
  await pushPending(B.db, offline, USER);
  assert.equal(cloudPayload(cloud).unit, 'metric');
  assert.equal(B.db.getFirstSync('SELECT sync_status FROM calc_inputs').sync_status, 'pending');
});

test('DV-010 update over 1.3.0: a row an older build left pending (no record of its changes) still never drops a cloud-only key', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = makeDb();
  await A.save({ ...calcState(), rcTypedKcal: 2100 });
  await syncPass(A.db, cloud);
  const remote = cloud.rows('calc_inputs', USER)[0];
  // As 1.3.0 left it: synced earlier (no rcTypedKcal yet), then edited offline -> pending, no pending_patch.
  B.runSync(`INSERT INTO calc_inputs (remote_id, user_id, payload, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [remote.id, USER, JSON.stringify(calcState({ unit: 'imperial' })), now(), now()]);
  await pushPending(B, cloud, USER);
  const p = cloudPayload(cloud);
  assert.equal(p.rcTypedKcal, 2100, 'the cloud-only key survives');
  assert.equal(p.unit, 'imperial', 'the old build\'s pending edit goes up');
});

test('DV-010: the calculator\'s whole-state save records only the keys that changed', () => {
  const base = { ...calcState(), rcResultSources: { '2026-10-01': { kcal: 'typed' } } };
  assert.deepEqual(calcInputsChanges(base, calcState({ unit: 'imperial' })), { unit: 'imperial' });
  assert.deepEqual(calcInputsChanges(base, { rcResultSources: { '2026-10-01': { kcal: 'typed' }, '2026-10-08': { kcal: 'food' } } }),
    { rcResultSources: { '2026-10-08': { kcal: 'food' } } });
  assert.deepEqual(calcInputsChanges(base, { rcTypedKcal: null }), {}, 'clearing a key that was never set is no change');
  assert.deepEqual(calcInputsChanges({ rcTypedKcal: 2100 }, { rcTypedKcal: null }), { rcTypedKcal: null }, 'an explicit clear is a change');
  assert.deepEqual(calcInputsChanges(null, { unit: 'metric' }), { unit: 'metric' });
});

test('DV-010: an install from before this build gets the pending_patch column; the cloud adapter never replaces an existing row on a first save', () => {
  assert.match(read('lib/database.js'), /ALTER TABLE calc_inputs ADD COLUMN pending_patch TEXT;/);
  assert.match(read('lib/schema.js'), /pending_patch TEXT,/);
  const sync = read('lib/sync.js');
  assert.match(sync, /upsert\(payload, \{ onConflict: 'user_id', ignoreDuplicates: true \}\)/);
  assert.doesNotMatch(sync, /upsert\(payload, \{ onConflict: 'user_id' \}\)/);
});
