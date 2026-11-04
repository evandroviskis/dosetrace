'use strict';
// UP-36 (founder answer 3, 2026-11-04 10:04 EST: "sim se foram ativamente marcadas como perdidas"): every
// dose row says who wrote its outcome — dose_logs.outcome_by_person (local column, synced as an optional
// column: sent when known, retried without it until the cloud migration is applied). The Missed scan
// writes 0; every outcome the person sets writes 1; an undo puts the previous value back with the
// previous outcome; rows without it count as written by the app (lib/unrecordedPeriod isPersonMarked).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const { planMarkTaken, planUndoTake } = require('../lib/markTaken');
const PE = require('../lib/protocolEnd');

const USER = 'user-ob';
const fromDb = (db, name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, PE });

test('local schema: dose_logs has outcome_by_person (new installs and upgrades)', () => {
  const db = makeDb();
  assert.ok(db.getAllSync('PRAGMA table_info(dose_logs)').some((c) => c.name === 'outcome_by_person'));
  const schema = fs.readFileSync(path.join(__dirname, '..', 'lib', 'schema.js'), 'utf8');
  assert.match(schema, /'outcome_by_person INTEGER'/, 'an older install gets the column on start');
});

test('insertDoseLog: a person by default; the scan writes 0; slot_at is kept', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const ins = fromDb(db, 'insertDoseLog');
  const a = ins({ user_id: USER, protocol_id: pid, outcome: 'Skipped', logged_at: '2026-10-01T09:00:00.000Z' });
  const b = ins({ user_id: USER, protocol_id: pid, outcome: 'Missed', logged_at: '2026-10-02T09:00:00.000Z', outcome_by_person: false });
  const c = ins({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: '2026-10-03T09:00:00.000Z', slot_at: '2026-10-03T09:00:00.000Z', outcome_by_person: 1 });
  const get = (id) => db.getFirstSync('SELECT outcome_by_person, slot_at FROM dose_logs WHERE id = ?', [id]);
  assert.equal(get(a).outcome_by_person, 1);
  assert.equal(get(b).outcome_by_person, 0);
  assert.equal(get(c).outcome_by_person, 1);
  assert.equal(get(c).slot_at, '2026-10-03T09:00:00.000Z');
  // The scan's own insert says it is the app.
  const actions = fs.readFileSync(path.join(__dirname, '..', 'lib', 'doseActions.js'), 'utf8');
  const scan = actions.slice(actions.indexOf('export async function scanMissedDoses('));
  assert.match(scan.slice(0, scan.indexOf('\n}\n')), /outcome: 'Missed',[\s\S]{0,200}outcome_by_person: false/);
});

test('updateDoseLog: an outcome the person sets is hers; an explicit value (an undo) is kept', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  const ins = fromDb(db, 'insertDoseLog');
  const upd = fromDb(db, 'updateDoseLog');
  const id = ins({ user_id: USER, protocol_id: pid, outcome: 'Missed', logged_at: '2026-10-02T09:00:00.000Z', outcome_by_person: false });
  upd(id, { outcome: 'Missed' }); // the Dose log editor: "Marcar como perdida"
  assert.equal(db.getFirstSync('SELECT outcome_by_person FROM dose_logs WHERE id = ?', [id]).outcome_by_person, 1);
  upd(id, { outcome: 'Missed', outcome_by_person: 0 }); // an undo back to the app's row
  assert.equal(db.getFirstSync('SELECT outcome_by_person FROM dose_logs WHERE id = ?', [id]).outcome_by_person, 0);
  upd(id, { injection_site: 'left' }); // not an outcome: unchanged
  assert.equal(db.getFirstSync('SELECT outcome_by_person FROM dose_logs WHERE id = ?', [id]).outcome_by_person, 0);
});

test('mark taken / undo: the flipped row\'s marker goes back with its outcome', () => {
  const p = { id: 7, user_id: USER, doses_per_day: 1, interval_days: 1, reminder_time: '09:00', type: 'recon' };
  const missed = { id: 70, protocol_id: 7, outcome: 'Missed', logged_at: new Date(2026, 9, 2, 9).toISOString(), outcome_by_person: 0 };
  const plan = planMarkTaken({ protocol: p, todayLogs: [missed], dayKey: '2026-10-02', slotMs: new Date(2026, 9, 2, 9).getTime(), nowMs: new Date(2026, 10, 3, 10).getTime(), flipRowId: 70 });
  assert.equal(plan.prevOutcomeByPerson, 0);
  const undo = planUndoTake({ logId: 70, flipped: true, flippedFrom: 'Missed', prevOutcomeByPerson: 0 });
  assert.equal(undo.restoreOutcomeByPerson, 0);
  assert.equal(planUndoTake({ logId: 70, flipped: true, flippedFrom: 'Skipped', prevOutcomeByPerson: 1 }).restoreOutcomeByPerson, 1);
  // Today's undo and the result of recordDoseTaken carry it.
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  assert.match(today, /outcome_by_person: plan\.restoreOutcomeByPerson/);
  assert.match(today, /prevOutcomeByPerson: res\.prevOutcomeByPerson/);
  const actions = fs.readFileSync(path.join(__dirname, '..', 'lib', 'doseActions.js'), 'utf8');
  assert.match(actions, /prevOutcomeByPerson: plan\.prevOutcomeByPerson/);
});

test('sync: optional column, 1 / 0 when known, round trip, a cloud without it keeps the local value', async () => {
  assert.ok(OPTIONAL_COLUMNS.dose_logs.includes('outcome_by_person'));
  const base = { outcome: 'Missed', logged_at: 'x', protocol_remote_id: 'p' };
  assert.equal(toCloudPayload('dose_logs', { ...base, outcome_by_person: 1 }).outcome_by_person, true);
  assert.equal(toCloudPayload('dose_logs', { ...base, outcome_by_person: 0 }).outcome_by_person, false);
  assert.ok(!('outcome_by_person' in toCloudPayload('dose_logs', base)));
  const cloud = makeCloud(); const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, outcome_by_person, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Missed', '2026-10-20T10:00:00Z', 1, '2026-10-20T10:00:00Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.equal(remote.outcome_by_person, true);
  await cloud.update('dose_logs', remote.id, { injection_site: 'left', outcome_by_person: null });
  await pullChanges(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT outcome_by_person FROM dose_logs').outcome_by_person, 1, 'a cloud NULL never erases it');
  await cloud.update('dose_logs', remote.id, { outcome_by_person: true });
  const fresh = makeDb(); seedSyncedProtocol(fresh, USER, { remote_id: 'p-1', updated_at: '000001' });
  await pullChanges(fresh, cloud, USER);
  assert.equal(fresh.getFirstSync('SELECT outcome_by_person FROM dose_logs').outcome_by_person, 1, 'a new phone knows the person marked it');
});

test('sync: a cloud without the column (migration not applied) still takes the row; the marker waits', async () => {
  const cloud = makeCloud(); const db = makeDb();
  const missing = { data: null, error: { code: 'PGRST204', message: "Could not find the 'outcome_by_person' column of 'dose_logs' in the schema cache" } };
  const realInsert = cloud.insert.bind(cloud);
  const realUpdate = cloud.update.bind(cloud);
  cloud.insert = async (table, payload) => (table === 'dose_logs' && 'outcome_by_person' in payload ? missing : realInsert(table, payload));
  cloud.update = async (table, id, payload, o) => (table === 'dose_logs' && 'outcome_by_person' in payload ? missing : realUpdate(table, id, payload, o));
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, outcome_by_person, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Taken', '2026-10-20T10:00:00Z', 1, '2026-10-20T10:00:00Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('dose_logs', USER).length, 1, 'the dose reached the cloud');
  const local = db.getFirstSync('SELECT sync_status, outcome_by_person, optional_pending FROM dose_logs');
  assert.equal(local.sync_status, 'synced');
  assert.equal(local.outcome_by_person, 1);
  assert.match(String(local.optional_pending || ''), /outcome_by_person/);
});
