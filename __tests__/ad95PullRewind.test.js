'use strict';
// AD-95 council fix (2026-10-27, decided by logic): the cloud migration stamped every Taken row with its
// protocol's dose on 27/10 without moving updated_at, and an old app (1.3.0) has no dose history. A phone
// that updates later stamps its own rows with the protocol's dose on the update day — a dose changed on
// 1.3.0 in between would rewrite the past. So the first pull after the upgrade reads dose_logs from the
// beginning once and the cloud's stamp (the older, closer one) wins on every synced row.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { upgradeDoseAmounts } = require('../lib/schema');

const USER = 'user-A';
const KEY = 'pull_rewind:dose_logs';
const meta = (db) => db.getFirstSync('SELECT value FROM local_meta WHERE key = ?', [KEY]);

test('first pull after the upgrade: the cloud stamp wins over the local one, once', async () => {
  const cloud = makeCloud(); const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("UPDATE protocols SET dose = '100', dose_unit = 'mg', type = 'rtu' WHERE id = ?", [pid]);
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Taken', '2026-10-20T10:00:00Z', '2026-10-20T10:00:00Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  remote.dose_amount = 100; remote.dose_unit = 'mg'; // the 27/10 migration, updated_at untouched
  // 1.3.0: the dose changed to 80 (no history), then the app updates: the old schema has no stamp column
  db.runSync("UPDATE protocols SET dose = '80' WHERE id = ?", [pid]);
  db.execSync('ALTER TABLE dose_logs DROP COLUMN dose_amount;');
  upgradeDoseAmounts(db);
  assert.equal(db.getFirstSync('SELECT dose_amount FROM dose_logs').dose_amount, 80, 'the phone only knows today\'s dose');
  assert.equal(meta(db).value, 'pending', 'the upgrade asks for one rewind');
  await pullChanges(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT dose_amount FROM dose_logs').dose_amount, 100, 'the cloud stamp wins');
  assert.equal(meta(db), null, 'done once');
});

test('a fresh install (column already there) asks for no rewind; a pending local edit is never overwritten', async () => {
  const db = makeDb();
  upgradeDoseAmounts(db);
  assert.equal(meta(db), null);
  const cloud = makeCloud();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("UPDATE protocols SET dose = '100', dose_unit = 'mg', type = 'rtu' WHERE id = ?", [pid]);
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, dose_amount, dose_unit, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Taken', '2026-10-20T10:00:00Z', 100, 'mg', '2026-10-20T10:00:00Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  db.runSync("UPDATE dose_logs SET dose_amount = 120, dose_edited = 1, sync_status = 'pending'"); // corrected, not sent yet
  db.runSync("INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, 'pending')", [KEY]);
  await pullChanges(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT dose_amount FROM dose_logs').dose_amount, 120);
});

test('an empty answer without a verified session keeps the rewind for later', async () => {
  const cloud = makeCloud(); const db = makeDb();
  db.runSync("INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, 'pending')", [KEY]);
  cloud.sessionUserId = async () => null;
  await pullChanges(db, cloud, USER);
  assert.ok(meta(db), 'still pending');
  cloud.sessionUserId = async () => USER;
  await pullChanges(db, cloud, USER);
  assert.equal(meta(db), null);
});
