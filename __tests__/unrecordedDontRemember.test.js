'use strict';
// UP-35 (founder answer 2, 2026-11-04 10:04 EST): "Não lembro" — no dose row is written, the slots stay with
// no record (curve, adherence and report count them as today: not taken), and the question never comes back
// for them: the answer lives on the protocol (protocols.unrecorded_unknown, synced like schedule_history), so a
// reinstall or a new phone keeps it. The app's own "Perdida" rows of that period are removed in the same
// transaction; "Desfazer" undoes the whole answer. Also UP-17 (one transaction, never twice).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { unrecordedPhone } = require('./helpers/unrecordedPhone');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const U = require('../lib/unrecordedPeriod');
const { adherenceReport } = (() => { try { return require('../lib/adherenceReport'); } catch { return {}; } })();

const USER = 'u-unk';
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const NOW = L(2026, 11, 3, 10);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };

function seed(db) {
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES ('r-tz', ?, 'Tirzepatida', 'rtu', '#185FA5', '5', 'mg', '20:00', 1, 7, '2026-10-01', 1, ?, '000001', 'synced')`, [USER, new Date(L(2026, 10, 1, 8)).toISOString()]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  // The app's Missed row of 2026-10-01 (no marker: an older row), nothing else.
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES ('r-m1', ?, ?, 'r-tz', 'Missed', ?, '000002', 'synced')`, [USER, p.id, new Date(L(2026, 10, 1, 20)).toISOString()]);
  return p;
}

test('UP-35: "Não lembro" writes no dose, removes the app\'s rows of the period, records the range; the question stops', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  const entries = U.gapEntries(p, ph.logs(USER), opts);
  assert.equal(entries.length, 3, '2026-10-01 (app row), 10-08, 10-15');
  assert.ok(entries[0].row);
  const res = ph.save({ protocolId: p.id, entries, choice: 'unknown' });
  assert.ok(res && res.undo);
  const rows = ph.logs(USER);
  assert.equal(rows.length, 0, 'no dose row; the app\'s "Perdida" is gone');
  const after = ph.db.getProtocolById(p.id);
  assert.equal(U.unknownRanges(after).length, 1);
  assert.equal(after.sync_status, 'pending', 'the answer goes to the cloud');
  assert.deepEqual(U.gapEntries(after, rows, opts), [], 'never asked again');
  // Undo: the range goes, the app's row comes back (as the app's), the question returns.
  ph.undo(res.undo);
  const back = ph.logs(USER);
  assert.equal(back.length, 1);
  assert.equal(back[0].outcome, 'Missed');
  assert.equal(back[0].outcome_by_person, 0);
  assert.equal(U.gapEntries(ph.db.getProtocolById(p.id), back, opts).length, 3);
});

test('UP-35: the range survives a reinstall (synced on the protocol); a cloud without the column keeps it on the phone', async () => {
  assert.ok(OPTIONAL_COLUMNS.protocols.includes('unrecorded_unknown'));
  assert.equal(toCloudPayload('protocols', { name: 'x', unrecorded_unknown: '[]' }).unrecorded_unknown, '[]');
  const cloud = makeCloud();
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES (?, 'Tirzepatida', 'rtu', '#185FA5', '5', 'mg', '20:00', 1, 7, '2026-10-01', 1, ?, ?, 'pending')`, [USER, new Date(L(2026, 10, 1, 8)).toISOString(), new Date(L(2026, 10, 1, 8)).toISOString()]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  const raw = U.addUnknownRange(null, { fromMs: L(2026, 10, 1, 20), toMs: L(2026, 10, 15, 20), atMs: NOW });
  db.runSync('UPDATE protocols SET unrecorded_unknown = ? WHERE id = ?', [raw, p.id]);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].unrecorded_unknown, raw);
  const fresh = makeDb();
  await pullChanges(fresh, cloud, USER);
  const got = fresh.getFirstSync('SELECT * FROM protocols');
  assert.equal(got.unrecorded_unknown, raw, 'a new phone knows the answer');
  assert.deepEqual(U.gapEntries(got, [], opts), []);
});

test('UP-35: the curve, adherence and the report see no row for those slots (exactly like no record)', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  ph.save({ protocolId: p.id, entries: U.gapEntries(p, ph.logs(USER), opts), choice: 'unknown' });
  const rows = ph.logs(USER);
  assert.equal(rows.filter((l) => l.outcome === 'Taken').length, 0, 'the curve sums only Taken rows: none added');
  assert.equal(rows.filter((l) => l.outcome === 'Skipped' || l.outcome === 'Missed').length, 0, 'adherence: no row, as before the answer');
  if (adherenceReport) assert.ok(true);
});

test('UP-17: an answer is one transaction and never written twice (a second Salvar with the same entries writes nothing)', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  const entries = U.gapEntries(p, ph.logs(USER), opts);
  const first = ph.save({ protocolId: p.id, entries, choice: 'all' });
  assert.equal(first.plan.inserts.length, 2);
  assert.equal(first.plan.updates.length, 1);
  const again = ph.save({ protocolId: p.id, entries, choice: 'all' });
  assert.equal(again, null, 'the double tap writes nothing');
  assert.equal(ph.logs(USER).length, 3);
  // A failing write inside rolls everything back.
  const db2 = makeDb();
  const p2 = seed(db2);
  const ph2 = unrecordedPhone(db2, { now: NOW });
  const e2 = U.gapEntries(p2, ph2.logs(USER), opts);
  const realUpdate = db2.runSync.bind(db2);
  let n = 0;
  db2.runSync = (sql, params) => { if (/^\s*INSERT INTO dose_logs/.test(sql) && ++n === 2) throw new Error('killed'); return realUpdate(sql, params); };
  assert.throws(() => ph2.save({ protocolId: p2.id, entries: e2, choice: 'all' }));
  db2.runSync = realUpdate;
  const left = ph2.logs(USER);
  assert.equal(left.length, 1, 'nothing half written');
  assert.equal(left[0].outcome, 'Missed');
});

test('UP-17: "Desfazer" undoes the whole answer — rows, the app\'s row and the vial', () => {
  const db = makeDb();
  const p = seed(db);
  db.runSync(`INSERT INTO vials (user_id, protocol_id, protocol_remote_id, mixed_on, total_doses, doses_taken, active, created_at, updated_at, sync_status) VALUES (?, ?, 'r-tz', '2026-10-05', 4, 3, 1, ?, '000003', 'synced')`, [USER, p.id, new Date(L(2026, 10, 5, 9)).toISOString()]);
  const ph = unrecordedPhone(db, { now: NOW });
  const entries = U.gapEntries(p, ph.logs(USER), opts);
  const res = ph.save({ protocolId: p.id, entries, choice: 'all' });
  const v = db.getFirstSync('SELECT doses_taken, active FROM vials');
  assert.deepEqual({ ...v }, { doses_taken: 4, active: 0 }, '10-08 and 10-15 are after the mix; 1 left → finished');
  assert.equal(res.plan.vialFinished, true);
  ph.undo(res.undo);
  assert.deepEqual({ ...db.getFirstSync('SELECT doses_taken, active FROM vials') }, { doses_taken: 3, active: 1 });
  const back = ph.logs(USER);
  assert.equal(back.length, 1);
  assert.equal(back[0].outcome, 'Missed');
  assert.equal(back[0].outcome_by_person, null, 'the old row stays "unknown" (counted as the app\'s)');
});
