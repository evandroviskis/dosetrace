'use strict';
// A-148 (Fold device test 2026-10-17, Test03): "Ainda em andamento?" for Vitmin C was answered
// "Ainda em andamento", yet the question came back after every sign-out / sign-in. Cause: the answer
// lived only in AsyncStorage (dosetrace_tx_check_{local protocol id}) — wiped with the local data on
// sign-out, keyed by a local id that a fresh import renumbers, and never on the other phone. The answer
// is now the protocol's synced still_going_at (the moment the person said it continues; the
// "Still going?" span restarts from it, DL-113), so it survives sign-out / in, a reinstall and other
// phones. An answer an older version kept on the device is carried into the synced column once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const { OPTIONAL_COLUMNS, toCloudPayload } = require('../lib/syncMappers');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { loadFn, sliceBlock, read } = require('./helpers/extractFn');

const USER = 'u1';
const DAY = 86400000;
function seedVitC(db) {
  const created = new Date(Date.now() - 60 * DAY).toISOString();
  const r = db.runSync(
    `INSERT INTO protocols (user_id, name, type, interval_days, doses_per_day, reminder_time, active, created_at, updated_at, sync_status) VALUES (?, 'Vitmin C', 'oral', 1, 1, '08:00', 1, ?, ?, 'pending')`,
    [USER, created, created],
  );
  return r.lastInsertRowId;
}
const row = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);

test('A-148: "Continua" is stored on the protocol (synced), not on the device', () => {
  const db = makeDb();
  const id = seedVitC(db);
  const now = new Date();
  E.markStillGoing(db, id, now.toISOString());
  const r = row(db, id);
  assert.equal(r.still_going_at, now.toISOString());
  assert.equal(r.sync_status, 'pending', 'it goes up with the next sync');
  assert.equal(E.inactivityDue(r, { lastTakenIso: null, now }), false);
  // An older answer never moves the span back.
  E.markStillGoing(db, id, new Date(now.getTime() - 3 * DAY).toISOString());
  assert.equal(row(db, id).still_going_at, now.toISOString());
  // The push carries it (optional column: sent when set, never a NULL that could erase another phone's answer).
  assert.ok((OPTIONAL_COLUMNS.protocols || []).includes('still_going_at'));
  assert.equal(toCloudPayload('protocols', r).still_going_at, now.toISOString());
  assert.ok(!('still_going_at' in toCloudPayload('protocols', { ...r, still_going_at: null })));
});

test('A-148: the answer survives sign-out / sign-in (wiped local data, fresh import) and reaches another phone', async () => {
  const cloud = makeCloud();
  const phone = makeDb();
  const id = seedVitC(phone);
  await pushPending(phone, cloud, USER);
  const now = new Date();
  assert.equal(E.inactivityDue(row(phone, id), { lastTakenIso: null, now }), true, 'asked before the answer');
  E.markStillGoing(phone, id, now.toISOString());
  await pushPending(phone, cloud, USER);
  // Sign out (clearLocalDatabase) and sign back in: a new empty database and a full import.
  const again = makeDb();
  await fullImport(again, cloud, USER);
  const r = again.getFirstSync('SELECT * FROM protocols');
  assert.equal(Date.parse(r.still_going_at), now.getTime());
  assert.equal(E.inactivityDue(r, { lastTakenIso: null, now: new Date(now.getTime() + DAY) }), false, 'not asked again after sign-in');
  assert.equal(E.nextTodayQuestion([r], [], new Date(now.getTime() + DAY)), null);
  // The other phone, which already had the row, gets it on its next pull.
  const other = makeDb();
  await fullImport(other, cloud, USER);
  await pullChanges(other, cloud, USER);
  assert.equal(Date.parse(other.getFirstSync('SELECT still_going_at FROM protocols').still_going_at), now.getTime());
});

test('A-148: a pull never moves the answer back (another phone\'s older row)', async () => {
  const db = makeDb();
  const id = seedVitC(db);
  const cloud = makeCloud();
  await pushPending(db, cloud, USER);
  const t1 = new Date().toISOString();
  E.markStillGoing(db, id, t1);
  await pushPending(db, cloud, USER);
  // Another phone (or 1.3.0) rewrites the row without the column: the cloud keeps its value; a cloud
  // NULL is never written over the local answer.
  const c = cloud.rows('protocols', USER)[0];
  cloud._store.protocols.set(c.id, { ...c, still_going_at: null, updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).still_going_at, t1);
  // An OLDER answer in the cloud (another phone's, pushed late) never replaces a newer one here.
  const older = new Date(Date.parse(t1) - 5 * DAY).toISOString();
  const c2 = cloud.rows('protocols', USER)[0];
  cloud._store.protocols.set(c2.id, { ...c2, still_going_at: older, updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).still_going_at, t1, 'the later answer wins');
  // A newer one does.
  const newer = new Date(Date.parse(t1) + DAY).toISOString();
  cloud._store.protocols.set(c2.id, { ...c2, still_going_at: newer, updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).still_going_at, newer);
});

test('A-148: an answer kept on the device by an older version is carried into the synced column once (update over 1.3.0)', async () => {
  const snoozedAt = new Date(Date.now() - 2 * DAY).toISOString();
  const store = new Map([['dosetrace_tx_check_7', snoozedAt]]);
  const AsyncStorage = {
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    removeItem: async (k) => { store.delete(k); },
  };
  const marked = [];
  const p = { id: 7, name: 'Vitmin C', interval_days: 1, start_date: null, created_at: new Date(Date.now() - 60 * DAY).toISOString(), still_going_at: null, active: 1 };
  const shown = [];
  const refs = {
    bodyMapOpenRef: { current: false }, siteQueueRef: { current: [] }, logPopupOpenRef: { current: false },
    inactivePromptOpenRef: { current: false }, vialPromptOpenRef: { current: false }, skipSheetOpenRef: { current: false },
    todaySheetOpenRef: { current: false },
  };
  let rows = [p];
  const check = loadFn('screens/TodayScreen.js', 'async function checkTreatmentStillActive(', 'checkTreatmentStillActive', {
    getCachedUser: async () => ({ id: 'u1' }),
    getActiveProtocols: () => rows,
    getLogsSince: () => [],
    AsyncStorage,
    markProtocolStillGoing: (id, iso) => { marked.push([id, iso]); rows = rows.map((x) => (x.id === id ? { ...x, still_going_at: iso } : x)); return true; },
    requestSync: () => {},
    nextTodayQuestion: E.nextTodayQuestion,
    ...refs,
    setInactiveProtocol: (x) => shown.push(x && x.name),
    setInactiveKind: () => {}, setInactiveStep: () => {},
    setShowInactivePrompt: () => {},
  });
  await check();
  assert.deepEqual(marked, [[7, snoozedAt]], 'the device answer moved to the protocol');
  assert.equal(store.has('dosetrace_tx_check_7'), false, 'and left the device');
  assert.deepEqual(shown, [], 'so it is not asked');
});

test('A-148: Today\'s "Continua" writes the synced answer, never AsyncStorage', () => {
  const today = read('screens/TodayScreen.js');
  const keep = sliceBlock(today, 'async function snoozeInactiveProtocol(');
  assert.match(keep, /markProtocolStillGoing\(p\.id, new Date\(\)\.toISOString\(\)\)/);
  assert.doesNotMatch(keep, /AsyncStorage\.setItem/);
  assert.match(keep, /requestSync\(\)/);
});
