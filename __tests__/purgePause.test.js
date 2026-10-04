'use strict';
// Round 4, purge pause part (2026-10-03, decided by the ledger / logic, docs/decisions.md):
//   • Ended rows get the Recently deleted row's delete affordance: the trash opens the same
//     "Delete protocol" sheet and follows the existing soft delete → Recently deleted → Restore
//     path. Restoring a protocol that was ENDED before it was deleted puts it back in Ended (never
//     active: the weeks it was stopped must not become owed doses).
//   • Never destroy on a maybe: the 7-day automatic purge of soft-deleted protocols is PAUSED in
//     1.3.0. Protocols the old "Yes, it's finished" button soft-deleted cannot be told from
//     deliberate deletes, and the cloud's dose_logs → protocols cascade would erase their doses.
//     Recently deleted lists every soft-deleted protocol while the purge is paused (older ones
//     would otherwise vanish from the list yet stay on the phone), and "Delete permanently" by
//     hand still works. Registry item to revisit in the next build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
function seed(db, fields) {
  db.runSync(`INSERT INTO protocols (user_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, deleted_at, ended_at, created_at, updated_at, sync_status) VALUES (?, ?, 'recon', '2026-08-01', 1, 1, '08:00', ?, ?, ?, '2026-08-01T07:00:00.000Z', '2026-08-01T07:00:00.000Z', 'synced')`,
    [USER, fields.name, fields.active, fields.deleted_at || null, fields.ended_at || null]);
  return db.getFirstSync('SELECT id FROM protocols WHERE name = ?', [fields.name]).id;
}

test('the automatic purge is paused in 1.3.0: a protocol deleted 60 days ago stays', () => {
  assert.equal(E.AUTO_PURGE_PAUSED, true);
  const db = makeDb();
  const id = seed(db, { name: 'old', active: 0, deleted_at: '2026-08-01T10:00:00.000Z' });
  assert.equal(E.purgeOldDeleted(db, USER, '2026-10-03T00:00:00.000Z'), 0);
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [id]).sync_status, 'synced');
  assert.equal(E.purgeOldDeleted(db, USER, '2026-10-03T00:00:00.000Z', { paused: false }), 1, 'the mechanism itself is kept for the next build');
});

test('Recently deleted lists every soft-deleted protocol while the purge is paused', () => {
  const db = makeDb();
  seed(db, { name: 'old', active: 0, deleted_at: '2026-08-01T10:00:00.000Z' });
  seed(db, { name: 'new', active: 0, deleted_at: '2026-10-02T10:00:00.000Z' });
  seed(db, { name: 'ended', active: 0, ended_at: '2026-09-20T10:00:00.000Z' });
  const q = E.recentlyDeletedQuery('2026-10-03T00:00:00.000Z');
  assert.deepEqual(db.getAllSync(q.sql, [USER, ...q.params]).map((p) => p.name), ['new', 'old']);
  const q7 = E.recentlyDeletedQuery('2026-10-03T00:00:00.000Z', { paused: false });
  assert.deepEqual(db.getAllSync(q7.sql, [USER, ...q7.params]).map((p) => p.name), ['new'], 'the 7-day window when purging again');
  assert.match(read('lib/database.js'), /PE\.recentlyDeletedQuery\(/);
});

test('Today no longer purges automatically while paused', () => {
  const t = read('screens/TodayScreen.js');
  assert.match(read('lib/database.js'), /export function hardDeleteOldProtocols\(userId\) \{\n\s+PE\.purgeOldDeleted\(getDB\(\), userId\);/);
  assert.match(t, /hardDeleteOldProtocols\(user\.id\)/, 'the call stays; the pause lives in one place (lib/protocolEnd)');
});

