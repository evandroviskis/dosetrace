'use strict';
// DV-184 re-verification C: the Mark complete idempotency key. A notification "Mark complete" writes
// its tap's key (notification id | action | notification date, the same key as the handled list)
// into the local-only dose_logs.source_key, in the same INSERT (or the UPDATE that flips a Missed
// row), read and written inside BEGIN IMMEDIATE. A replay of the same tap (a kill before the
// AsyncStorage claim, or a lost claim) finds the key and logs nothing — also after an Undo (the row
// is deleted locally but still holds the key). The column is never sent to the cloud and never
// overwritten by a pull. REAL lib/doseActions recordDoseTaken and lib/database functions on SQLite.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { markTakenDay, planMarkTaken } = require('../lib/markTaken');
const { toCloudPayload } = require('../lib/syncMappers');
const { pushPending, pullChanges } = require('../lib/syncCore');

const USER = 'user-A';
const KEY = 'dose-1-2026-10-20-t0|MARK_TAKEN|1760950000000';

function app(db) {
  const getDB = () => db;
  const fromDb = (name, header = `export function ${name}(`) => loadFn('lib/database.js', header, name, { getDB });
  const f = {};
  for (const n of ['getProtocolById', 'getActiveVials', 'insertDoseLog', 'updateDoseLog', 'deleteDoseLog', 'updateVial', 'getLogsSince', 'doseLogBySourceKey', 'withImmediateTransaction']) f[n] = fromDb(n);
  f.updateProtocol = () => {};
  const make = (over = {}) => loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', { ...f, markTakenDay, planMarkTaken, ...over });
  return { ...f, recordDoseTaken: make(), make };
}
function protocol(db, perDay = 2) {
  const id = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync('UPDATE protocols SET doses_per_day = ? WHERE id = ?', [perDay, id]);
  return id;
}
const live = (db) => db.getAllSync(`SELECT * FROM dose_logs WHERE sync_status != 'deleted'`);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('C: the same tap replayed after its write logs nothing more (2 doses a day)', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const first = a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY });
  assert.ok(first.logId);
  const replay = a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY });
  assert.equal(replay.logId, null);
  assert.equal(replay.alreadyLogged, true);
  assert.equal(replay.sameTap, true, 'known as this very tap');
  assert.equal(live(db).length, 1, 'one Taken row, although the protocol allows a 2nd dose today');
  assert.equal(live(db)[0].source_key, KEY);
  assert.ok(a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY + 'x' }).logId, 'another tap still logs the 2nd dose');
});

test('C: a write that fails is rolled back with its key, and the replay logs it', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const failing = a.make({ insertDoseLog: (data) => { a.insertDoseLog(data); throw new Error('disk I/O'); } });
  assert.throws(() => failing(pid, { atNow: true, sourceKey: KEY }));
  assert.equal(db.getAllSync('SELECT * FROM dose_logs').length, 0, 'nothing half-written');
  assert.ok(a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY }).logId);
  assert.equal(live(db).length, 1);
});

test('C: Undo then a replay of the tap -> the dose stays undone', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const { logId } = a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY });
  a.deleteDoseLog(logId);                                   // Undo
  const replay = a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY });
  assert.equal(replay.logId, null);
  assert.equal(replay.sameTap, true);
  assert.equal(live(db).length, 0);
});

test('C: the flip of an auto-Missed row carries the key; Undo back to Missed then a replay keeps it Missed', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db, 1);
  const now = new Date();
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30).getTime();
  a.insertDoseLog({ user_id: USER, protocol_id: pid, protocol_remote_id: 'p-1', outcome: 'Missed', logged_at: new Date(slot).toISOString() });
  const r = a.recordDoseTaken(pid, { dayKey: ymd(now), slotMs: slot, sourceKey: KEY });
  assert.equal(r.flipped, true);
  const row = live(db)[0];
  assert.equal(row.outcome, 'Taken');
  assert.equal(row.source_key, KEY);
  a.updateDoseLog(row.id, { outcome: 'Missed' });           // Undo of the flip
  assert.equal(a.recordDoseTaken(pid, { dayKey: ymd(now), slotMs: slot, sourceKey: KEY }).sameTap, true);
  assert.equal(live(db)[0].outcome, 'Missed');
});

test('C: a tap from the app (no key) is unchanged; two rows may never share a key (unique index)', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  assert.ok(a.recordDoseTaken(pid, { atNow: true }).logId);
  assert.ok(a.recordDoseTaken(pid, { atNow: true }).logId, 'no key: the normal 2nd dose');
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', source_key: KEY });
  assert.throws(() => a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', source_key: KEY }), /UNIQUE/);
});

test('C: source_key is local only - never in the push payload, never overwritten by a pull', async () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const cloud = makeCloud();
  cloud._store.protocols.set('p-1', { id: 'p-1', user_id: USER, name: 'X', updated_at: '000001' });
  a.recordDoseTaken(pid, { atNow: true, sourceKey: KEY });
  assert.ok(!('source_key' in toCloudPayload('dose_logs', live(db)[0])));
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.ok(!('source_key' in remote), 'the cloud never sees it');
  await cloud.update('dose_logs', remote.id, { injection_site: 'left' });
  await pullChanges(db, cloud, USER);
  assert.equal(live(db)[0].injection_site, 'left', 'the pull applied');
  assert.equal(live(db)[0].source_key, KEY, 'and kept the key');
});

test('C: upgrade over an older install - the column and the unique index are added, old rows keep NULL', () => {
  const raw = new Database(':memory:');
  raw.exec(`CREATE TABLE dose_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id TEXT, user_id TEXT, protocol_id INTEGER,
    protocol_remote_id TEXT, outcome TEXT DEFAULT 'Taken', injection_site TEXT, logged_at TEXT, updated_at TEXT, sync_status TEXT DEFAULT 'pending');`);
  raw.exec(`INSERT INTO dose_logs (user_id, protocol_id, outcome) VALUES ('${USER}', 1, 'Taken'), ('${USER}', 1, 'Taken');`);
  const db = { execSync: (s) => raw.exec(s) };
  const { createSchema, upgradeDoseLogsSourceKey } = require('../lib/schema');
  createSchema(db);                 // initDatabase order: the schema first (must not throw on the old table) ...
  upgradeDoseLogsSourceKey(db);     // ... then the upgrade
  upgradeDoseLogsSourceKey(db);     // a second launch: a no-op
  const cols = raw.prepare('PRAGMA table_info(dose_logs)').all().map((c) => c.name);
  assert.ok(cols.includes('source_key'));
  assert.deepEqual(raw.prepare('SELECT source_key FROM dose_logs').all().map((r) => r.source_key), [null, null]);
  const ix = raw.prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_dose_logs_source_key'`).get();
  assert.match(ix.sql, /UNIQUE INDEX[\s\S]*source_key[\s\S]*WHERE source_key IS NOT NULL/);
  const { read } = require('./helpers/extractFn');
  assert.match(read('lib/database.js'), /upgradeDoseLogsSourceKey\(db\);/, 'initDatabase runs it');
});
