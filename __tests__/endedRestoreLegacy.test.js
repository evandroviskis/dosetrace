'use strict';
// Gate B round 3, N3 (proven by scratchpad/endedRestore.cjs): an Ended row WITHOUT a local
// ended_at (pulled while the cloud lacked the column, or re-imported: active 0, no deletion, end
// read from updated_at) was soft-deleted with only active/deleted_at, so restoreDeleted — which
// asks ended_at — brought it back ACTIVE: reminders returned and the stopped weeks became owed
// doses. The soft delete now records the end first (ended_at = COALESCE(ended_at, updated_at of an
// ended row)), through lib/protocolEnd softDeleteRow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');

function seed(db, { active, ended_at = null, deleted_at = null }) {
  db.runSync(`INSERT INTO protocols (user_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, ended_at, deleted_at, created_at, updated_at, sync_status) VALUES ('u1', 'X', 'recon', '2026-08-01', 1, 1, '08:00', ?, ?, ?, '2026-08-01T07:00:00.000Z', '2026-09-20T10:00:00.000Z', 'synced')`, [active, ended_at, deleted_at]);
  return db.getFirstSync('SELECT max(id) AS id FROM protocols').id;
}

test('an Ended row without ended_at: delete → Restore puts it back in Ended, ended at its last change', () => {
  const db = makeDb();
  const id = seed(db, { active: 0 });
  assert.equal(E.isEnded(db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id])), true);
  E.softDeleteRow(db, id, '2026-10-03T12:00:00.000Z');
  const del = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  assert.equal(del.ended_at, '2026-09-20T10:00:00.000Z');
  assert.equal(del.deleted_at, '2026-10-03T12:00:00.000Z');
  assert.equal(E.restoreDeleted(db, id, '2026-10-03T13:00:00.000Z'), 'ended');
  const back = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  assert.equal(back.active, 0);
  assert.equal(E.isEnded(back), true);
});

test('an active row: delete records no end, Restore makes it active; an existing ended_at is kept', () => {
  const db = makeDb();
  const a = seed(db, { active: 1 });
  E.softDeleteRow(db, a, '2026-10-03T12:00:00.000Z');
  assert.equal(db.getFirstSync('SELECT ended_at FROM protocols WHERE id = ?', [a]).ended_at, null);
  assert.equal(E.restoreDeleted(db, a, '2026-10-03T13:00:00.000Z'), 'active');
  const e = seed(db, { active: 0, ended_at: '2026-09-01T00:00:00.000Z' });
  E.softDeleteRow(db, e, '2026-10-03T12:00:00.000Z');
  assert.equal(db.getFirstSync('SELECT ended_at FROM protocols WHERE id = ?', [e]).ended_at, '2026-09-01T00:00:00.000Z');
});

test('the app soft-deletes through it', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/database.js'), 'utf8');
  assert.match(src, /export function softDeleteProtocol\(id\) \{\n\s+PE\.softDeleteRow\(getDB\(\), id\);/);
});
