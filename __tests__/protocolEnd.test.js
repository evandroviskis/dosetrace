'use strict';
// A-83 (F4b, decided by logic under CLAUDE.md "never lose user data", 2026-10-03): "Yes, it's
// finished" soft-DELETED the protocol: its doses vanished from the Dose log at once, it sat in
// "Recently deleted", and after 7 days it was purged — and the cloud's dose_logs → protocols
// foreign key is ON DELETE CASCADE, so the purge deleted every dose of it. Ending is now its own
// state: active 0, ended_at set, deleted_at NULL. An ended protocol stops (no reminders, not on
// Today), keeps its full dose history (Dose log, report, adherence and streak days, the curve's
// past), is never purged, and can be restarted from the Protocols list.
// Existing protocols soft-deleted by the old finish button cannot be told apart from ones the user
// deleted on purpose (both wrote the same fields through softDeleteProtocol), so none is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const { expectedDosesOn, expectedSlotTimesOn } = require('../lib/schedule');
const { adherenceRings } = require('../lib/adherenceRings');
const { toCloudPayload } = require('../lib/syncMappers');
const { read, sliceBlock } = require('./helpers/extractFn');

const USER = 'u1';
function seed(db) {
  db.runSync(`INSERT INTO protocols (user_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, created_at, updated_at, sync_status) VALUES (?, 'BPC-157', 'recon', '2026-09-01', 1, 1, '08:00', 1, '2026-09-01T07:00:00.000Z', '2026-09-01T07:00:00.000Z', 'synced')`, [USER]);
  const pid = db.getFirstSync('SELECT id FROM protocols').id;
  for (const d of ['2026-09-20', '2026-09-21', '2026-09-22']) {
    db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', ?, ?, 'synced')`, [USER, pid, `${d}T12:00:00.000Z`, `${d}T12:00:00.000Z`]);
  }
  return pid;
}

test('ending keeps the protocol out of Today and out of Recently deleted, with its doses in the Dose log', () => {
  const db = makeDb();
  const pid = seed(db);
  E.endProtocol(db, pid, '2026-09-23T10:00:00.000Z');
  const row = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [pid]);
  assert.equal(row.active, 0);
  assert.equal(row.deleted_at, null, 'not a deletion');
  assert.equal(row.ended_at, '2026-09-23T10:00:00.000Z');
  assert.equal(row.sync_status, 'pending');
  assert.equal(E.isEnded(row), true);
  assert.equal(db.getAllSync(E.SQL_ACTIVE, [USER]).length, 0, 'not on Today / reminders');
  assert.equal(db.getAllSync(E.SQL_RECENTLY_DELETED, [USER, '2000-01-01']).length, 0);
  assert.equal(db.getAllSync(E.SQL_ALL_LOGS, [USER]).length, 3, 'all three doses still listed');
  assert.deepEqual(db.getAllSync(E.SQL_ENDED, [USER]).map((p) => p.id), [pid]);
});

test('an ended protocol is never purged with the 7-day clean-up; a deleted one still is', () => {
  const db = makeDb();
  const pid = seed(db);
  E.endProtocol(db, pid, '2026-08-01T10:00:00.000Z');
  E.purgeOldDeleted(db, USER, '2026-10-03T00:00:00.000Z');
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'pending');
  db.runSync(`UPDATE protocols SET ended_at = NULL, deleted_at = '2026-08-01T10:00:00.000Z' WHERE id = ?`, [pid]);
  E.purgeOldDeleted(db, USER, '2026-10-03T00:00:00.000Z', { paused: false }); // paused in 1.3.0 (purgePause.test.js)
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'deleted');
});

// Restart (a new run, never the same row re-activated): protocolEndFollowup.test.js F1.

test('the schedule stops after the end: no slot on later days, none after the end time that day', () => {
  const p = { start_date: '2026-09-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', created_at: '2026-09-01T07:00:00.000Z', active: 0, deleted_at: null, ended_at: new Date(2026, 8, 23, 12, 0).toISOString() };
  assert.deepEqual(expectedSlotTimesOn(p, new Date(2026, 8, 22)), ['08:00', '20:00']);
  assert.deepEqual(expectedSlotTimesOn(p, new Date(2026, 8, 23)), ['08:00']);
  assert.deepEqual(expectedSlotTimesOn(p, new Date(2026, 8, 24)), []);
  assert.equal(expectedDosesOn(p, new Date(2026, 8, 24)), 0);
  // A protocol another device ended before the ended_at column existed: active 0 and no
  // deletion = ended, at its last change.
  const legacy = { ...p, ended_at: null, updated_at: new Date(2026, 8, 23, 12, 0).toISOString() };
  assert.equal(E.isEnded(legacy), true);
  assert.equal(expectedDosesOn(legacy, new Date(2026, 8, 24)), 0);
});

test('adherence keeps the ended protocol\'s past days (and nothing after the end)', () => {
  const now = new Date(2026, 8, 25, 12, 0).getTime();
  const p = { id: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00.000Z', active: 0, deleted_at: null, ended_at: new Date(2026, 8, 23, 18, 0).toISOString() };
  const logs = [21, 22, 23].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 8, d, 8, 5).toISOString() }));
  const r = adherenceRings({ protocols: [p], logs, nowMs: now });
  assert.equal(r.week.due, 5, '19..23 September');
  assert.equal(r.week.taken, 3);
  assert.equal(r.today, null, 'nothing due after the end');
});

test('sync: ended_at goes to the cloud only when set; a cloud without the column still takes the row', async () => {
  const row = { name: 'x', active: 0, deleted_at: null, ended_at: '2026-09-23T10:00:00.000Z' };
  assert.equal(toCloudPayload('protocols', row).ended_at, '2026-09-23T10:00:00.000Z');
  assert.ok(!('ended_at' in toCloudPayload('protocols', { ...row, ended_at: null })), 'never sends NULL (restart keeps the old value harmlessly: active wins)');
  // Before the migration: the cloud rejects the unknown column → the push retries without it.
  const { pushPending } = require('../lib/syncCore');
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seed(db);
  db.runSync(`UPDATE protocols SET sync_status = 'pending', remote_id = NULL WHERE id = ?`, [pid]);
  const realInsert = cloud.insert.bind(cloud);
  cloud.insert = async (table, payload) => (table === 'protocols' && 'ended_at' in payload
    ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'ended_at' column of 'protocols' in the schema cache" } }
    : realInsert(table, payload));
  E.endProtocol(db, pid, '2026-09-23T10:00:00.000Z');
  await pushPending(db, cloud, USER);
  const up = cloud.rows('protocols', USER);
  assert.equal(up.length, 1, 'pushed without the optional column');
  assert.equal(up[0].active, false);
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'synced');
});

test('pull: a cloud ended_at lands locally; a cloud without the column leaves the local value', () => {
  const { updateLocalFromCloud } = require('../lib/syncCore');
  const db = makeDb();
  const pid = seed(db);
  const base = { name: 'BPC-157', type: 'recon', active: false, deleted_at: null, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', updated_at: '000009' };
  updateLocalFromCloud(db, 'protocols', pid, { ...base, ended_at: '2026-09-23T10:00:00.000Z' });
  assert.equal(db.getFirstSync('SELECT ended_at FROM protocols WHERE id = ?', [pid]).ended_at, '2026-09-23T10:00:00.000Z');
  updateLocalFromCloud(db, 'protocols', pid, { ...base, updated_at: '000010' });
  assert.equal(db.getFirstSync('SELECT ended_at FROM protocols WHERE id = ?', [pid]).ended_at, '2026-09-23T10:00:00.000Z');
});

test('Today\'s "Yes, it\'s finished" ends the protocol (no deletion); the Protocols list offers Restart', () => {
  const today = read('screens/TodayScreen.js');
  const fn = sliceBlock(today, 'async function endInactiveProtocol() {');
  assert.match(fn, /endProtocol\(p\.id\)/);
  assert.doesNotMatch(fn, /softDeleteProtocol/);
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /t\('protocols_ended_title'\)/);
  assert.match(prot, /onPress=\{\(\) => restartProtocol\(p\.id\)\}/);
  assert.match(prot, /restartEndedProtocol\(id\);/);
  assert.match(read('lib/database.js'), /SQL_ALL_LOGS/);
});

test('the migration is additive and nullable', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const dir = path.join(__dirname, '../supabase/migrations');
  const f = fs.readdirSync(dir).find((n) => /protocol_ended_at/.test(n));
  assert.ok(f, 'migration file');
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  assert.match(sql, /alter table public\.protocols add column if not exists ended_at timestamptz;/i);
  assert.doesNotMatch(sql, /update |delete |drop /i);
});

test('the curve keeps an ended protocol while its doses still show (its past, no projection after the end)', () => {
  const { curveHistoryProtocols, scheduledDoses } = require('../lib/serumModel');
  const now = new Date(2026, 9, 3, 12, 0).getTime();
  const DAY = 86400000;
  const base = { type: 'recon', compound_id: 'bpc157', name: 'BPC-157', dose: '250', dose_unit: 'mcg', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00.000Z' };
  const active = { ...base, id: 1, active: 1 };
  const recent = { ...base, id: 2, active: 0, deleted_at: null, ended_at: new Date(now - 5 * DAY).toISOString() };
  const old = { ...base, id: 3, active: 0, deleted_at: null, ended_at: new Date(now - 400 * DAY).toISOString() };
  const deleted = { ...base, id: 4, active: 0, deleted_at: new Date(now - DAY).toISOString() };
  const ids = curveHistoryProtocols([active, recent, old, deleted], now).map((p) => p.id);
  assert.deepEqual(ids, [1, 2], 'active first (the default pick), then the recently ended; old and deleted ones not');
  const doses = scheduledDoses(recent, { hours: 4 }, now - 14 * DAY, now + 7 * DAY, now);
  assert.ok(doses.length > 0, 'its past doses');
  assert.ok(doses.every((d) => d <= Date.parse(recent.ended_at) + DAY), 'nothing projected after the end');
});

test('the Ended strings exist in six languages', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['protocols_ended_title', 'protocols_ended_on', 'protocols_restart', 'curve_ended_marker']) assert.ok(mod.exports.translations[l][k], `${l} ${k}`);
    assert.match(mod.exports.translations[l].protocols_ended_on, /\{date\}/, l);
  }
});
