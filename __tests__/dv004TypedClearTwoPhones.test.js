'use strict';
// DV-004 Gate B (1.3.1): Stop clears the stopped check's typed calorie average (rcTypedKcal is keyed
// by the check's start date). The clear must be CONDITIONAL on that start date all the way to the
// cloud: phone A stopping check X (start X) must never wipe the calories phone B already typed for a
// newer check Y. The clear is written as { rcTypedKcal: { start: X, kcal: null } } and the merge
// (lib/realityCheckStore mergeCalcInputs) applies it only while the value it lands on still has start
// X — on this phone, in the accumulated pending patch, and over the cloud's payload at push time.
// Two phones, one fake cloud, the REAL lib/syncCore push/pull and the REAL saveCalcInputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { mergeCalcInputs } = require('../lib/realityCheckStore');
const { calcInputsChanges, recordCalcInputs } = require('../lib/calcInputsSync');
const { typedIntakePatch, typedIntakeFor } = require('../lib/realityCheckRules');
const { loadFn } = require('./helpers/extractFn');

const USER = 'user-A';
const X = '2026-10-01';
const Y = '2026-10-15';
let clock = 0;
const now = () => `2026-10-20T11:00:${String(++clock).padStart(2, '0')}.000Z`;

function phone(db) {
  const getCalcInputsRow = (uid) => db.getFirstSync(
    `SELECT * FROM calc_inputs WHERE user_id = ? AND sync_status != 'deleted' ORDER BY updated_at DESC, id DESC LIMIT 1`, [uid]);
  const upsertCalcInputs = (uid, text, changes) => recordCalcInputs(db, uid, text, changes, now());
  const save = loadFn('lib/realityCheck.js', 'export async function saveCalcInputs(', 'saveCalcInputs', {
    getCachedUser: async () => ({ id: USER, user_metadata: {} }),
    isMigrated: async () => true,
    getCalcInputsRow, upsertCalcInputs, mergeCalcInputs, calcInputsChanges,
    requestSync: () => {},
    supabase: { auth: { updateUser: () => Promise.resolve() } },
  });
  return { db, save, payload: () => JSON.parse(getCalcInputsRow(USER)?.payload || 'null') };
}
const cloudPayload = (cloud) => cloud.rows('calc_inputs', USER)[0].payload;
const syncPass = async (db, cloud) => { await pushPending(db, cloud, USER); await pullChanges(db, cloud, USER); };

async function twoPhonesOnCheckX() {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  assert.equal(await A.save({ unit: 'metric', ...typedIntakePatch(X, 2100) }), true);
  await syncPass(A.db, cloud);
  await fullImport(B.db, cloud, USER);
  return { cloud, A, B };
}

test('the clear is conditional: { start, kcal: null } (never a bare null)', () => {
  assert.deepEqual(typedIntakePatch(X, null), { rcTypedKcal: { start: X, kcal: null } });
  // Over the same check: cleared (reads as no typed value).
  assert.equal(typedIntakeFor(mergeCalcInputs({ rcTypedKcal: { start: X, kcal: 2100 } }, typedIntakePatch(X, null)), X), null);
  // Over a newer check's value: that value stays.
  assert.deepEqual(mergeCalcInputs({ unit: 'metric', rcTypedKcal: { start: Y, kcal: 1900 } }, typedIntakePatch(X, null)).rcTypedKcal, { start: Y, kcal: 1900 });
  // Over nothing: stays a (conditional) clear, so a later merge still checks the start.
  assert.equal(typedIntakeFor(mergeCalcInputs({}, typedIntakePatch(X, null)), X), null);
  assert.deepEqual(mergeCalcInputs(mergeCalcInputs({}, typedIntakePatch(X, null)), {}).rcTypedKcal, { start: X, kcal: null });
  // A typed value and an old build's bare null are plain values, as before.
  assert.deepEqual(mergeCalcInputs({ rcTypedKcal: { start: X, kcal: 2100 } }, typedIntakePatch(Y, 1900)).rcTypedKcal, { start: Y, kcal: 1900 });
  assert.equal(mergeCalcInputs({ rcTypedKcal: { start: Y, kcal: 1900 } }, { rcTypedKcal: null }).rcTypedKcal, null);
});

test('two phones: A clears for start X while B already typed kcal for start Y and synced -> B\'s value survives, on both phones', async () => {
  const { cloud, A, B } = await twoPhonesOnCheckX();
  await B.save(typedIntakePatch(Y, 1900)); // B started check Y and typed its average
  await syncPass(B.db, cloud);
  await A.save(typedIntakePatch(X, null)); // A (stale, still on X) stops check X
  await pushPending(A.db, cloud, USER);
  assert.deepEqual(cloudPayload(cloud).rcTypedKcal, { start: Y, kcal: 1900 }, 'the cloud keeps B\'s check-Y calories');
  assert.equal(cloudPayload(cloud).unit, 'metric');
  await pullChanges(A.db, cloud, USER);
  assert.equal(typedIntakeFor(A.payload(), Y), 1900, 'A shows B\'s value after the pull');
  await syncPass(B.db, cloud);
  assert.equal(typedIntakeFor(B.payload(), Y), 1900, 'B keeps it');
});

test('two phones: A clears for start X and the cloud still holds X -> cleared everywhere', async () => {
  const { cloud, A, B } = await twoPhonesOnCheckX();
  await A.save(typedIntakePatch(X, null));
  await syncPass(A.db, cloud);
  assert.equal(typedIntakeFor(cloudPayload(cloud), X), null, 'cleared in the cloud');
  assert.equal(typedIntakeFor(A.payload(), X), null);
  await syncPass(B.db, cloud);
  assert.equal(typedIntakeFor(B.payload(), X), null, 'and on the other phone');
  assert.equal(B.payload().unit, 'metric', 'nothing else changes');
});

test('two phones: A types for X and stops X before syncing (one pending patch), B types for Y meanwhile -> B\'s value survives', async () => {
  const cloud = makeCloud();
  const A = phone(makeDb()); const B = phone(makeDb());
  await A.save({ unit: 'metric' });
  await syncPass(A.db, cloud);
  await fullImport(B.db, cloud, USER);
  await A.save(typedIntakePatch(X, 2100)); // offline: typed for X ...
  await A.save(typedIntakePatch(X, null)); // ... then Stop, still offline
  await B.save(typedIntakePatch(Y, 1900));
  await syncPass(B.db, cloud);
  await pushPending(A.db, cloud, USER);
  assert.deepEqual(cloudPayload(cloud).rcTypedKcal, { start: Y, kcal: 1900 }, 'the accumulated patch stays conditional');
});
