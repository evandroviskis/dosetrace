'use strict';
// Gate B on the purge (2026-10-04), P2: purgeProtocol only purges a protocol that is still deleted
// (a pull may restore it while the confirm sheet is open), and marks its children only when it did.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');

function seed(db) {
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES ('u1', 'A', 'recon', 0, '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 'synced')`);
  const pid = db.getFirstSync('SELECT id FROM protocols').id;
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, sync_status) VALUES ('u1', ?, 'Taken', '2026-09-20T08:00:00Z', 'synced')`, [pid]);
  db.runSync(`INSERT INTO vials (user_id, protocol_id, total_doses, sync_status) VALUES ('u1', ?, 10, 'synced')`, [pid]);
  return pid;
}

test('a deleted protocol is purged with its children', () => {
  const db = makeDb();
  const pid = seed(db);
  assert.equal(E.purgeProtocol(db, pid, '2026-10-04T10:00:00Z'), true);
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'deleted'`).n, 1);
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM vials WHERE sync_status = 'deleted'`).n, 1);
});

test('a protocol restored meanwhile is never purged, nor its children', () => {
  const db = makeDb();
  const pid = seed(db);
  db.runSync(`UPDATE protocols SET active = 1, deleted_at = NULL WHERE id = ?`, [pid]);
  assert.equal(E.purgeProtocol(db, pid, '2026-10-04T10:00:00Z'), false);
  assert.equal(db.getFirstSync('SELECT sync_status FROM protocols WHERE id = ?', [pid]).sync_status, 'synced');
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status = 'deleted'`).n, 0);
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM vials WHERE sync_status = 'deleted'`).n, 0);
});
