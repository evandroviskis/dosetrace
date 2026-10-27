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
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: new Date(Date.now() - 4 * 86400000).toISOString() }); // 200 was used
  a.updateProtocol(pid, { dose: '100' }); // changed after the missed slot
  a.updateDoseLog(id, { outcome: 'Taken' }); // Dose log > Mark taken
  assert.equal(rows(db).find((r) => r.id === id).dose_amount, 200, 'the dose of its time, not today\'s 100');
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
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: new Date(Date.now() - 2 * 86400000).toISOString() }); // 200 was used
  a.updateProtocol(pid, { dose: '150' });
  db.runSync('DELETE FROM dose_logs');
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

// Founder 2026-10-27: a typo fixed before any dose was marked at it is a correction — nothing used the
// old value, so it is replaced (the estimated part too). Once a dose was marked at it, an edit only goes
// forward; the person corrects past doses one by one (Alterar dose).
test('a protocol dose edit with no dose marked at the old value replaces it; after a marked dose it goes forward', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db, '2500');
  const hist = () => { const h = db.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [pid]).dose_history; return h ? JSON.parse(h) : null; };
  a.updateProtocol(pid, { dose: '250' });
  assert.equal(hist(), null, 'typo fixed before any dose: no history, 250 everywhere');
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: new Date(Date.now() - 1000).toISOString() });
  a.updateProtocol(pid, { dose: '200' });
  assert.deepEqual(hist().map((e) => e.dose), [250, 200], 'a dose was marked at 250: the change goes forward');
  a.updateProtocol(pid, { dose: '210' });
  assert.deepEqual(hist().map((e) => e.dose), [250, 210], '200 was never used: replaced by 210');
});

// Founder 2026-10-27 ("aprovo sua sugestão", docs/design/dose-fix-or-change.html): with doses already
// marked at the old value, Save asks — "Estava errada" corrects exactly those doses (a dose the person
// already set to another amount keeps it); "Mudou a partir de agora" keeps them.
test('Save question: the count, "Estava errada" corrects the doses at the old value, "Mudou" keeps them', () => {
  const db = makeDb(); const a = app(db); const pid = protocol(db, '2500');
  const count = loadFn('lib/database.js', 'export function countTakenAtCurrentDose(', 'countTakenAtCurrentDose', { getDB: () => db });
  assert.equal(count(pid), 0);
  const t = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const r1 = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(14) });
  const r2 = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(7) });
  const r3 = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(1) });
  a.updateDoseLog(r3, { dose_amount: 300 }); // the person already set this one herself
  a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Skipped', logged_at: t(3) });
  assert.equal(count(pid), 2, 'two doses marked at 2500');
  a.updateProtocol(pid, { dose: '250', __doseFix: true });
  const amt = (id) => db.getFirstSync('SELECT dose_amount, sync_status FROM dose_logs WHERE id = ?', [id]);
  assert.equal(amt(r1).dose_amount, 250);
  assert.equal(amt(r2).dose_amount, 250);
  assert.equal(amt(r1).sync_status, 'pending', 'the correction goes to the cloud');
  assert.equal(amt(r3).dose_amount, 300, 'her own amount stays');
  assert.equal(db.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [pid]).dose_history, null, 'the wrong value is gone from the history too');

  const db2 = makeDb(); const b = app(db2); const p2 = protocol(db2, '2500');
  const k = b.insertDoseLog({ user_id: USER, protocol_id: p2, outcome: 'Taken', logged_at: t(7) });
  b.updateProtocol(p2, { dose: '250', __doseFix: false });
  assert.equal(db2.getFirstSync('SELECT dose_amount FROM dose_logs WHERE id = ?', [k]).dose_amount, 2500, 'Mudou: kept');
  assert.equal(JSON.parse(db2.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [p2]).dose_history).length, 2);
});

test('Save question is wired in the protocol editor with the approved text x6', () => {
  const { read } = require('./helpers/extractFn');
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /countTakenAtCurrentDose\(editingId\)/);
  assert.match(src, /<DoseFixSheet/);
  assert.match(src, /__doseFix: doseChoice === 'fix'/);
  const { translations } = require('../i18n/translations');
  assert.equal(translations.pt.dosefix_title, 'A dose mudou ou estava errada?');
  assert.equal(translations.pt.dosefix_wrong, 'Estava errada');
  assert.equal(translations.pt.dosefix_changed, 'Mudou a partir de agora');
  assert.equal(translations.pt.dosefix_body_one, 'Você já marcou 1 dose de {name} com {old}. A nova dose é {new}.', 'one dose: singular (sim 2026-10-27 showed "1 doses")');
  assert.match(read('screens/components/DoseFixSheet.js'), /pluralKey\(k, ask \? ask\.count : 0, language\)/);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['dosefix_title', 'dosefix_body', 'dosefix_body_one', 'dosefix_wrong', 'dosefix_wrong_sub', 'dosefix_wrong_sub_one', 'dosefix_changed', 'dosefix_changed_sub', 'dosefix_changed_sub_one']) assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
});
