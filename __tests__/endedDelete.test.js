'use strict';
// Round 4, Ended delete part (2026-10-03, decided by the ledger / logic, docs/decisions.md):
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

test('restore: a protocol ended before it was deleted goes back to Ended; a plain deleted one becomes active', () => {
  const db = makeDb();
  const ended = seed(db, { name: 'e', active: 0, ended_at: '2026-09-20T10:00:00.000Z' });
  db.runSync(`UPDATE protocols SET deleted_at = '2026-10-01T10:00:00.000Z' WHERE id = ?`, [ended]);
  const plain = seed(db, { name: 'p', active: 0, deleted_at: '2026-10-01T10:00:00.000Z' });
  assert.equal(E.restoreDeleted(db, ended, '2026-10-03T00:00:00.000Z'), 'ended');
  const e = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [ended]);
  assert.equal(e.active, 0);
  assert.equal(e.deleted_at, null);
  assert.equal(e.ended_at, '2026-09-20T10:00:00.000Z');
  assert.equal(E.isEnded(e), true);
  assert.equal(e.sync_status, 'pending');
  assert.equal(E.restoreDeleted(db, plain, '2026-10-03T00:00:00.000Z'), 'active');
  assert.equal(db.getFirstSync('SELECT active FROM protocols WHERE id = ?', [plain]).active, 1);
});

test('the Ended row has the Recently deleted trash, opening the same Delete protocol sheet', () => {
  const s = read('screens/ProtocolsScreen.js');
  const i = s.indexOf('const endedSection = ');
  const sec = s.slice(i, s.indexOf('const deletedSection = '));
  assert.match(sec, /onPress=\{\(\) => deleteEndedProtocol\(p\)\}/);
  assert.match(sec, /accessibilityLabel=\{t\('protocols_delete'\)\}/);
  assert.match(sec, /style=\{s\.deleteForeverBtn\}/);
  assert.match(sec, /<FeatureIcon name="trash" size=\{22\} color=\{colors\.risk\} \/>/);
  const fn = s.slice(s.indexOf('function deleteEndedProtocol(p) {'), s.indexOf('function deleteEndedProtocol(p) {') + 900);
  assert.match(fn, /title: t\('protocols_delete_title'\)/);
  assert.match(fn, /softDeleteProtocol\(p\.id\)/);
  const restore = s.slice(s.indexOf('function restoreProtocol(id) {'), s.indexOf('function restoreProtocol(id) {') + 700);
  assert.match(restore, /if \(restoreProtocolDB\(id\) === 'ended'\)/, 'an ended one gets no vial or reminder back');
});

