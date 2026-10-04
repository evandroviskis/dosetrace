'use strict';
// Delete forever as a tombstone, part 6: a purged protocol (purged_at set — kept locally only
// while its tombstone waits to be written, or while unsynced doses of it wait) never shows
// anywhere: Today / lists, Ended, history (rings, streak, report, curve), Recently deleted, the
// Dose log; it never counts against the free limit (only active protocols do).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');

function seed(db) {
  const rows = [
    ['ACTIVE', 1, null, null], ['ENDED', 0, null, '2026-09-20T00:00:00Z'], ['DELETED', 0, '2026-10-01T00:00:00Z', null],
    ['PURGED-A', 1, null, null], ['PURGED-E', 0, null, '2026-09-20T00:00:00Z'], ['PURGED-D', 0, '2026-10-01T00:00:00Z', null],
  ];
  for (const [name, active, deleted, ended] of rows) {
    db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, ended_at, purged_at, created_at, updated_at, sync_status) VALUES ('u1', ?, 'recon', ?, ?, ?, ?, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 'synced')`,
      [name, active, deleted, ended, name.startsWith('PURGED') ? '2026-10-04T00:00:00Z' : null]);
  }
  for (const name of ['ACTIVE', 'PURGED-A']) {
    const pid = db.getFirstSync('SELECT id FROM protocols WHERE name = ?', [name]).id;
    db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, sync_status) VALUES ('u1', ?, 'Taken', '2026-10-02T08:00:00Z', 'pending')`, [pid]);
  }
}
const names = (db, sql, params) => db.getAllSync(sql, ['u1', ...(params || [])]).map((r) => r.name).sort();

test('lists, Ended, history and Recently deleted never show a purged protocol', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(names(db, E.SQL_ACTIVE), ['ACTIVE']);
  assert.deepEqual(names(db, E.SQL_ENDED), ['ENDED']);
  assert.deepEqual(names(db, E.SQL_HISTORY), ['ACTIVE', 'ENDED']);
  const q = E.recentlyDeletedQuery('2026-10-04T00:00:00Z');
  assert.deepEqual(names(db, q.sql, q.params), ['DELETED']);
  const q7 = E.recentlyDeletedQuery('2026-10-04T00:00:00Z', { paused: false });
  assert.deepEqual(names(db, q7.sql, q7.params), ['DELETED']);
});

test('the Dose log never lists a dose of a purged protocol (it stays unsynced, not deleted)', () => {
  const db = makeDb();
  seed(db);
  const logs = db.getAllSync(E.SQL_ALL_LOGS, ['u1']);
  assert.deepEqual(logs.map((l) => l.protocol_name), ['ACTIVE']);
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'pending'`).n, 2, 'nothing deleted');
});

test('the free limit counts active protocols only (SQL_ACTIVE)', () => {
  const db = makeDb();
  seed(db);
  assert.equal(db.getAllSync(E.SQL_ACTIVE, ['u1']).length, 1);
});
