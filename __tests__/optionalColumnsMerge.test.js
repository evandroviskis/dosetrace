'use strict';
// Gate B round 2, R4 (optional synced columns ended_at / history_from, A-83 / A-30):
//   • a pull never writes a cloud NULL over a local value (merge, never clobber): a device whose
//     migration-less push dropped ended_at would otherwise erase the end on the next pull;
//   • a row pushed while the cloud lacked the column remembers what was dropped
//     (protocols.optional_pending, local only) and re-sends it once the cloud accepts it; one probe
//     per sync while the column is still missing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, updateLocalFromCloud } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');

const USER = 'u1';
function seed(db) {
  db.runSync(`INSERT INTO protocols (user_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, created_at, updated_at, sync_status) VALUES (?, 'BPC-157', 'recon', '2026-09-01', 1, 1, '08:00', 1, '2026-09-01T07:00:00.000Z', '2026-09-01T07:00:00.000Z', 'pending')`, [USER]);
  return db.getFirstSync('SELECT id FROM protocols').id;
}
const missing = (col) => ({ data: null, error: { code: 'PGRST204', message: `Could not find the '${col}' column of 'protocols' in the schema cache` } });

test('pull: a cloud NULL never erases a local ended_at / history_from', () => {
  const db = makeDb();
  const pid = seed(db);
  db.runSync(`UPDATE protocols SET ended_at = '2026-09-23T10:00:00.000Z', history_from = '2026-09-10' WHERE id = ?`, [pid]);
  const base = { name: 'BPC-157', type: 'recon', active: false, deleted_at: null, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', updated_at: '000009' };
  updateLocalFromCloud(db, 'protocols', pid, { ...base, ended_at: null, history_from: null });
  const row = db.getFirstSync('SELECT ended_at, history_from FROM protocols WHERE id = ?', [pid]);
  assert.equal(row.ended_at, '2026-09-23T10:00:00.000Z');
  assert.equal(row.history_from, '2026-09-10');
});

test('pushed without the column → remembered → re-sent once the cloud accepts it', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seed(db);
  let migrated = false;
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  let updates = 0;
  cloud.insert = async (t, p) => (t === 'protocols' && !migrated && 'ended_at' in p ? missing('ended_at') : ins(t, p));
  cloud.update = async (t, id, p) => { updates++; return (t === 'protocols' && !migrated && 'ended_at' in p ? missing('ended_at') : upd(t, id, p)); };
  E.endProtocol(db, pid, '2026-09-23T10:00:00.000Z');
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ended_at, undefined, 'the cloud has no column yet');
  assert.equal(db.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [pid]).optional_pending, 'ended_at');
  updates = 0;
  await pushPending(db, cloud, USER); // still missing: one probe, marker kept
  assert.equal(updates, 1);
  assert.equal(db.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [pid]).optional_pending, 'ended_at');
  migrated = true; // the founder applies the migration
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ended_at, '2026-09-23T10:00:00.000Z');
  assert.equal(db.getFirstSync('SELECT optional_pending, sync_status FROM protocols WHERE id = ?', [pid]).optional_pending, null);
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'synced');
});

test('a later full push that carries the column clears the marker', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const pid = seed(db);
  db.runSync(`UPDATE protocols SET optional_pending = 'ended_at' WHERE id = ?`, [pid]);
  E.endProtocol(db, pid, '2026-09-23T10:00:00.000Z');
  await pushPending(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT optional_pending FROM protocols WHERE id = ?', [pid]).optional_pending, null);
  assert.equal(cloud.rows('protocols', USER)[0].ended_at, '2026-09-23T10:00:00.000Z');
});
