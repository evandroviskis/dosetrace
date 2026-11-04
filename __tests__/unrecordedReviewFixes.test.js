'use strict';
// Independent senior review of the unrecorded-period branch (2026-11-04, 9c891fd..8d8c9d1), each finding as a
// test: (1) an app-written old Missed row whose slot another row covers is never asked (no double dose), and the
// save re-checks it; (2) the queue is not recomputed when nothing changed, and Today stops reading it once it has
// stopped asking; (3) ended-only accounts still get Today's question; (4) Undo works by delta on the vial and
// the vial prompt waits for the Undo window; (5) the re-send of an optional column sends a boolean as a boolean.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sliceBlock, loadFn } = require('./helpers/extractFn');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { unrecordedPhone } = require('./helpers/unrecordedPhone');
const { pushPending } = require('../lib/syncCore');
const U = require('../lib/unrecordedPeriod');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const NOW = L(2026, 11, 3, 10);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };
const daily = { id: 2, user_id: 'u', remote_id: 'r2', name: 'BPC', type: 'recon', dose: '250', dose_unit: 'mcg', reminder_time: '08:00', doses_per_day: 1, interval_days: 1, start_date: '2026-10-01', active: 1, created_at: iso(L(2026, 10, 1, 7)) };

test('review 1: an app Missed row whose slot a later row of that day covers is never asked (no double dose)', () => {
  const logs = [
    { id: 1, protocol_id: 2, outcome: 'Missed', logged_at: iso(L(2026, 10, 1, 8)), outcome_by_person: 0 },
    { id: 2, protocol_id: 2, outcome: 'Taken', logged_at: iso(L(2026, 10, 1, 21)) }, // the same-day late pass covers 08:00
  ];
  const e = U.gapEntries(daily, logs, opts);
  assert.ok(!e.some((x) => x.slotMs === L(2026, 10, 1, 8)), 'the covered slot is not asked');
  assert.ok(!e.some((x) => x.row && x.row.id === 1), 'the duplicate Missed row is not attached');
  // An app row away from every open slot (an old schedule) is not asked either.
  const off = [{ id: 3, protocol_id: 2, outcome: 'Missed', logged_at: iso(L(2026, 10, 2, 13)), outcome_by_person: 0 }];
  assert.ok(!U.gapEntries(daily, off, opts).some((x) => x.row));
});

test('review 1: the save re-checks that each slot is still uncovered (a dose marked meanwhile is never doubled)', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES ('r2', 'u', 'BPC', 'recon', '#185FA5', '250', 'mcg', '08:00', 1, 1, '2026-10-01', 1, ?, '000001', 'synced')`, [iso(L(2026, 10, 1, 7))]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  const ph = unrecordedPhone(db, { now: NOW });
  const entries = U.gapEntries(p, [], opts);
  // Meanwhile 10-03's dose was marked at 19:00 (not at the slot time).
  ph.db.insertDoseLog({ user_id: 'u', protocol_id: p.id, outcome: 'Taken', logged_at: iso(L(2026, 10, 3, 19)) });
  ph.save({ protocolId: p.id, entries, choice: 'all' });
  const oct3 = ph.logs('u').filter((l) => l.outcome === 'Taken' && new Date(l.logged_at).getDate() === 3 && new Date(l.logged_at).getMonth() === 9);
  assert.equal(oct3.length, 1, 'one dose on 10-03, not two');
});

test('review 2: the queue is cached on a cheap key (rows, protocols, pull stamp, day) and Today stops reading it after three "Agora não"', () => {
  const actions = read('lib/doseActions.js');
  const q = sliceBlock(actions, 'export async function unrecordedQueue(');
  assert.match(q, /unrecordedDataKey\(user\.id\)/);
  assert.match(q, /_unrecCache && _unrecCache\.key === key/);
  const db = read('lib/database.js');
  const keyFn = sliceBlock(db, 'export function unrecordedDataKey(');
  assert.match(keyFn, /SELECT COUNT\(\*\) AS n, MAX\(updated_at\) AS u FROM dose_logs WHERE user_id = \?/);
  assert.match(keyFn, /MAX\(updated_at\) AS u FROM protocols WHERE user_id = \?/);
  const ask = sliceBlock(read('screens/TodayScreen.js'), 'async function askUnrecordedToday(');
  assert.match(ask, /if \(st && \(st\.day === dayKey \|\| st\.checked === dayKey\)\) return;/, 'at most one read a day once nothing is asked');
  assert.match(ask, /checked: dayKey/);
});

test('review 2: the key changes when a dose, a protocol, the pull or the day changes', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, 'u', { remote_id: 'p', updated_at: '000001' });
  const key = loadFn('lib/database.js', 'export function unrecordedDataKey(', 'unrecordedDataKey', { getDB: () => db });
  const a = key('u');
  assert.equal(key('u'), a);
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES ('u', ?, 'Taken', 'x', '2026-11-04T10:00:00Z', 'pending')", [pid]);
  assert.notEqual(key('u'), a);
});

test('review 3: an account with only ended protocols still gets Today\'s question', () => {
  const check = sliceBlock(read('screens/TodayScreen.js'), 'async function checkTreatmentStillActive(');
  assert.match(check, /if \(protocols\.length === 0\) \{ askUnrecordedToday\(\); return; \}/);
});

test('review 4a: Undo takes back the answer\'s doses from the vial as it is NOW (a dose marked meanwhile stays)', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES ('r2', 'u', 'BPC', 'recon', '#185FA5', '250', 'mcg', '08:00', 1, 1, '2026-10-10', 1, ?, '000001', 'synced')`, [iso(L(2026, 10, 10, 7))]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  db.runSync(`INSERT INTO vials (user_id, protocol_id, mixed_on, total_doses, doses_taken, active, created_at, updated_at, sync_status) VALUES ('u', ?, '2026-10-10', 30, 2, 1, ?, '1', 'synced')`, [p.id, iso(L(2026, 10, 10, 9))]);
  const ph = unrecordedPhone(db, { now: NOW });
  const res = ph.save({ protocolId: p.id, entries: U.gapEntries(p, [], opts), choice: 'all' });
  const used = res.plan.vialUpdate.doses_taken - 2;
  assert.ok(used > 0);
  db.runSync('UPDATE vials SET doses_taken = doses_taken + 1'); // Today's dose marked inside the Undo window
  ph.undo(res.undo);
  assert.equal(db.getFirstSync('SELECT doses_taken FROM vials').doses_taken, 3, 'the answer\'s doses go back, today\'s dose stays');
});

test('review 4a: a vial the answer finished is reopened only when no other vial of the protocol is active', () => {
  const save = sliceBlock(read('lib/doseActions.js'), 'export function undoUnrecordedAnswer(');
  assert.match(save, /getVialById\(r\.id\)/);
  assert.match(save, /Math\.max\(0, \(now\.doses_taken \|\| 0\) - r\.used\)/);
  assert.match(save, /!\(getActiveVials\(now\.user_id\) \|\| \[\]\)\.some\(\(v\) => v\.protocol_id === now\.protocol_id && v\.id !== now\.id\)/);
});

test('review 4b: the vial prompt of an answer opens only after its Undo window has closed (and never after an Undo)', () => {
  const host = read('screens/components/UnrecordedHost.js');
  assert.match(sliceBlock(host, 'function close('), /flushPrompts\(\)/);
  assert.match(sliceBlock(host, 'function flushPrompts('), /if \(openRef\.current \|\| toastRef\.current\) return;/);
  assert.match(sliceBlock(host, 'function showUndo('), /flushPrompts\(\)/);
  assert.match(sliceBlock(host, 'function undo('), /finished\.current = finished\.current\.filter/);
});

test('review 5: re-sending a waiting boolean column sends true / false, never 1 / 0', async () => {
  const cloud = makeCloud(); const db = makeDb();
  const missing = { data: null, error: { code: 'PGRST204', message: "Could not find the 'outcome_by_person' column of 'dose_logs' in the schema cache" } };
  const realInsert = cloud.insert.bind(cloud);
  const realUpdate = cloud.update.bind(cloud);
  let migrated = false;
  cloud.insert = async (t, pl) => (!migrated && t === 'dose_logs' && 'outcome_by_person' in pl ? missing : realInsert(t, pl));
  cloud.update = async (t, id, pl, o) => (!migrated && t === 'dose_logs' && 'outcome_by_person' in pl ? missing : realUpdate(t, id, pl, o));
  const pid = seedSyncedProtocol(db, 'u', { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, outcome_by_person, updated_at, sync_status) VALUES ('u', ?, 'p-1', 'Missed', '2026-10-20T10:00:00Z', 0, '2026-10-20T10:00:00Z', 'pending')", [pid]);
  await pushPending(db, cloud, 'u');
  migrated = true; // the founder applies the migration
  await pushPending(db, cloud, 'u');
  const remote = cloud.rows('dose_logs', 'u')[0];
  assert.strictEqual(remote.outcome_by_person, false);
  assert.equal(db.getFirstSync('SELECT optional_pending FROM dose_logs').optional_pending, null);
});
