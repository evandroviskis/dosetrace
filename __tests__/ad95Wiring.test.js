'use strict';
// AD-95 B wiring (founder 2026-10-26 "verifique se está tudo wired perfeitamente"): every path that
// makes a dose Taken stores the dose it was taken at; a protocol dose edit is remembered with its
// moment; an older install is stamped once, silently; the stamp and the history go to the cloud and
// come back; a cloud NULL never erases them.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn, read } = require('./helpers/extractFn');
const { markTakenDay, planMarkTaken } = require('../lib/markTaken');
const { toCloudPayload } = require('../lib/syncMappers');
const { pushPending, pullChanges } = require('../lib/syncCore');

const USER = 'user-A';
function app(db) {
  const getDB = () => db;
  const f = {};
  for (const n of ['getProtocolById', 'getActiveVials', 'insertDoseLog', 'updateDoseLog', 'deleteDoseLog', 'updateVial', 'getLogsSince', 'doseLogBySourceKey', 'withImmediateTransaction', 'recordDoseTapKey', 'updateProtocol']) {
    f[n] = loadFn('lib/database.js', `export function ${n}(`, n, { getDB });
  }
  f.recordDoseTaken = loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', { ...f, markTakenDay, planMarkTaken });
  return f;
}
function protocol(db, dose = '200') {
  const id = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync('UPDATE protocols SET dose = ?, dose_unit = ?, type = ?, doses_per_day = 1, interval_days = 1 WHERE id = ?', [dose, 'mg', 'rtu', id]);
  return id;
}
const rows = (db) => db.getAllSync(`SELECT * FROM dose_logs WHERE sync_status != 'deleted' ORDER BY id`);

test('Today / a notification (recordDoseTaken): the Taken row stores the current dose', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  a.recordDoseTaken(pid, { atNow: true });
  const r = rows(db)[0];
  assert.equal(r.outcome, 'Taken');
  assert.equal(r.dose_amount, 200);
  assert.equal(r.dose_unit, 'mg');
});

test('a Missed / Skipped row has no dose; recovered as Taken it gets the dose in force at ITS time', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const slot = new Date(Date.now() - 3 * 86400000).toISOString();
  const id = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Missed', logged_at: slot });
  assert.equal(rows(db)[0].dose_amount, null);
  a.updateProtocol(pid, { dose: '100' }); // changed after the missed slot
  a.updateDoseLog(id, { outcome: 'Taken' }); // Dose log > Mark taken
  assert.equal(rows(db)[0].dose_amount, 200, 'the dose of its time, not today\'s 100');
});

test('a dose Taken after the protocol change gets the new dose; earlier stamps never move', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: new Date(Date.now() - 86400000).toISOString() });
  a.updateProtocol(pid, { dose: '100' });
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: new Date(Date.now() + 1000).toISOString() });
  assert.deepEqual(rows(db).map((r) => r.dose_amount), [200, 100]);
  const h = JSON.parse(db.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [pid]).dose_history);
  assert.equal(h.length, 2);
  assert.deepEqual([h[0].dose, h[1].dose], [200, 100]);
  a.updateProtocol(pid, { name: 'Renamed' });
  assert.equal(JSON.parse(db.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [pid]).dose_history).length, 2, 'an edit without a dose change adds nothing');
});

test('Alterar dose: an amount the person gives is kept, also through a later flip to Taken', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const id = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken' });
  a.updateDoseLog(id, { dose_amount: 180 });
  a.updateDoseLog(id, { outcome: 'Taken' });
  assert.equal(rows(db)[0].dose_amount, 180);
  assert.equal(rows(db)[0].sync_status, 'pending', 'the edit goes to the cloud');
});

test('older install: the columns are added and its Taken rows stamped once, silently', () => {
  const raw = new Database(':memory:');
  raw.exec(`CREATE TABLE protocols (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, dose TEXT, dose_unit TEXT);
    CREATE TABLE dose_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, protocol_id INTEGER, outcome TEXT, logged_at TEXT, updated_at TEXT, sync_status TEXT);
    INSERT INTO protocols (user_id, dose, dose_unit) VALUES ('u', '0,5', 'mg');
    INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES
      ('u', 1, 'Taken', '2026-10-01T08:00:00Z', 'U1', 'synced'), ('u', 1, 'Missed', '2026-10-02T08:00:00Z', 'U2', 'synced');`);
  const db = { execSync: (s) => raw.exec(s), getAllSync: (s, p = []) => raw.prepare(s).all(...p), runSync: (s, p = []) => raw.prepare(s).run(...p) };
  const { upgradeDoseAmounts } = require('../lib/schema');
  upgradeDoseAmounts(db);
  upgradeDoseAmounts(db); // a second launch: nothing more
  const out = raw.prepare('SELECT outcome, dose_amount, dose_unit, updated_at, sync_status FROM dose_logs ORDER BY id').all();
  assert.deepEqual(out[0], { outcome: 'Taken', dose_amount: 0.5, dose_unit: 'mg', updated_at: 'U1', sync_status: 'synced' });
  assert.equal(out[1].dose_amount, null, 'a Missed row is not a dose');
  assert.ok(raw.prepare('PRAGMA table_info(protocols)').all().some((c) => c.name === 'dose_history'));
  assert.match(read('lib/database.js'), /upgradeDoseAmounts\(db\);/, 'initDatabase runs it');
});

test('cloud: the stamp and the history go up; they come down; a cloud NULL never erases them', async () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db);
  const cloud = makeCloud();
  cloud._store.protocols.set('p-1', { id: 'p-1', user_id: USER, name: 'X', updated_at: '000001' });
  a.updateProtocol(pid, { dose: '150' });
  a.recordDoseTaken(pid, { atNow: true });
  const p = toCloudPayload('dose_logs', rows(db)[0]);
  assert.equal(p.dose_amount, 150);
  assert.equal(p.dose_unit, 'mg');
  assert.ok(toCloudPayload('protocols', db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid])).dose_history);
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.equal(remote.dose_amount, 150, 'in the cloud');
  // another edit there (the person's other phone before a takeover) with no dose in it
  await cloud.update('dose_logs', remote.id, { injection_site: 'left', dose_amount: null });
  await pullChanges(db, cloud, USER);
  assert.equal(rows(db)[0].injection_site, 'left');
  assert.equal(rows(db)[0].dose_amount, 150, 'a cloud NULL keeps the local dose');
  // a fresh phone (reinstall) gets the stamp from the cloud
  await cloud.update('dose_logs', remote.id, { dose_amount: 140 });
  const fresh = makeDb(); seedSyncedProtocol(fresh, USER, { remote_id: 'p-1', updated_at: '000001' });
  await pullChanges(fresh, cloud, USER);
  assert.equal(fresh.getFirstSync('SELECT dose_amount FROM dose_logs').dose_amount, 140);
});
