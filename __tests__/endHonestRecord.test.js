'use strict';
// dt-council 2026-10-04, journey review (decided by logic, docs/decisions.md):
//   A-86 an end from the inactivity prompt ("Yes, it's finished") is dated at the LAST logged Taken
//        dose — the prompt appears only after 7+ days without a dose, so the tap always includes
//        days the user did not take it — and the Missed rows the app wrote after that end go.
//   A-89 Restore of a protocol deleted BEFORE today puts it in Ended (its deleted days are never
//        owed); a same-day Restore is an undo: active when allowed (under the free limit), else Ended.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');

const USER = 'u1';
function seed(db, { deletedAt = null, endedAt = null, active = 1 } = {}) {
  db.runSync(`INSERT INTO protocols (user_id, remote_id, name, type, active, deleted_at, ended_at, created_at, updated_at, sync_status) VALUES (?, 'r1', 'Tirz', 'recon', ?, ?, ?, '2026-09-01T08:00:00Z', 'T0', 'synced')`, [USER, active, deletedAt, endedAt]);
  return db.getFirstSync('SELECT id FROM protocols').id;
}
function log(db, pid, outcome, at, status = 'synced') {
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'T0', ?)`, [USER, pid, status === 'synced' ? `d-${at}` : null, outcome, at, status]);
}
const prot = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
const visibleLogs = (db, pid) => db.getAllSync(`SELECT outcome, logged_at FROM dose_logs WHERE protocol_id = ? AND sync_status != 'deleted' ORDER BY logged_at`, [pid]);

test('A-86: "Yes, it\'s finished" 12 days after the last dose ends it at that dose', () => {
  const db = makeDb();
  const id = seed(db);
  log(db, id, 'Taken', '2026-09-20T08:00:00Z');
  log(db, id, 'Taken', '2026-09-22T08:00:00Z');
  log(db, id, 'Skipped', '2026-09-23T08:00:00Z'); // the user's own answer: kept
  log(db, id, 'Missed', '2026-09-24T08:00:00Z'); // written by the app after the last dose
  log(db, id, 'Missed', '2026-09-26T08:00:00Z', 'pending');
  E.endAtLastDose(db, id, '2026-10-04T09:00:00Z');
  const p = prot(db, id);
  assert.equal(p.active, 0);
  assert.equal(p.ended_at, '2026-09-22T08:00:00Z');
  assert.ok(p.status_at, 'this phone changed the status');
  assert.deepEqual(visibleLogs(db, id).map((l) => l.outcome), ['Taken', 'Taken', 'Skipped']);
  const synced = db.getFirstSync(`SELECT sync_status FROM dose_logs WHERE logged_at = '2026-09-24T08:00:00Z'`);
  assert.equal(synced.sync_status, 'deleted', 'a synced Missed row is deleted everywhere');
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE logged_at = '2026-09-26T08:00:00Z'`).n, 0, 'an unsynced one simply goes');
});

test('A-86: never a dose logged → it ends where it started (nothing owed)', () => {
  const db = makeDb();
  const id = seed(db);
  log(db, id, 'Missed', '2026-09-03T08:00:00Z');
  E.endAtLastDose(db, id, '2026-10-04T09:00:00Z');
  assert.equal(prot(db, id).ended_at, '2026-09-01T08:00:00Z');
  assert.equal(visibleLogs(db, id).length, 0);
});

test('A-85: a deliberate end ("Protocol finished") is the moment tapped', () => {
  const db = makeDb();
  const id = seed(db);
  log(db, id, 'Taken', '2026-10-04T08:00:00Z');
  E.endProtocol(db, id, '2026-10-04T08:05:00Z');
  assert.equal(prot(db, id).ended_at, '2026-10-04T08:05:00Z');
});

test('A-89: Restore of one deleted before today goes to Ended, dated at the delete', () => {
  const db = makeDb();
  const id = seed(db, { active: 0, deletedAt: '2026-09-24T10:00:00Z' });
  assert.equal(E.restoreDeleted(db, id, '2026-10-04T09:00:00Z', { allowActive: true }), 'ended');
  const p = prot(db, id);
  assert.equal(p.active, 0);
  assert.equal(p.deleted_at, null);
  assert.equal(p.ended_at, '2026-09-24T10:00:00Z');
});

test('A-89: a same-day Restore is an undo — active when allowed, Ended at the free limit', () => {
  const db = makeDb();
  const id = seed(db, { active: 0, deletedAt: '2026-10-04T08:00:00Z' });
  assert.equal(E.restoreDeleted(db, id, '2026-10-04T09:00:00Z', { allowActive: true }), 'active');
  assert.equal(prot(db, id).active, 1);
  const db2 = makeDb();
  const id2 = seed(db2, { active: 0, deletedAt: '2026-10-04T08:00:00Z' });
  assert.equal(E.restoreDeleted(db2, id2, '2026-10-04T09:00:00Z', { allowActive: false }), 'ended');
  assert.equal(prot(db2, id2).active, 0);
});

test('A-89: one that was ended before the delete still goes back to Ended with its own end', () => {
  const db = makeDb();
  const id = seed(db, { active: 0, deletedAt: '2026-10-04T08:00:00Z', endedAt: '2026-09-10T00:00:00Z' });
  assert.equal(E.restoreDeleted(db, id, '2026-10-04T09:00:00Z', { allowActive: true }), 'ended');
  assert.equal(prot(db, id).ended_at, '2026-09-10T00:00:00Z');
});

test('A-85 on Today: "Protocol finished" calls the end, the inactivity prompt the last-dose end', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  const btn = s.slice(s.indexOf("{t('today_vial_finished')}") - 260, s.indexOf("{t('today_vial_finished')}"));
  assert.match(btn, /onPress=\{finishFromVialPrompt\}/);
  const fn = s.slice(s.indexOf('function finishFromVialPrompt() {'), s.indexOf('function finishFromVialPrompt() {') + 600);
  assert.match(fn, /endProtocol\(p\.id\)/);
  assert.match(fn, /deactivateVialsByProtocol\(p\.id\)/);
  assert.match(fn, /cancelDoseReminder\(p\.id\)/);
  const inactive = s.slice(s.indexOf('async function endInactiveProtocol() {'), s.indexOf('async function endInactiveProtocol() {') + 700);
  assert.match(inactive, /endProtocolAtLastDose\(p\.id\)/);
});
