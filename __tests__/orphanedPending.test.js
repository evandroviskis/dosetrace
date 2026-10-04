'use strict';
// Decided by logic 2026-10-04 (before the council): a dose log or vial of a protocol deleted
// forever on another device stays pending forever (the server refuses it, the client keeps it:
// R-A) and blocks every non-forced sign-out — and the profile gate / 18+ sheet have no "Sign out
// anyway". So the user gets a one-time, honest prompt (next Today open, and in a blocked sign-out
// sheet): "{n} entries couldn't be saved…" with Discard (removes ONLY those rows, locally) and
// Keep for now. Never discarded silently; nothing else is ever discarded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb } = require('./helpers/syncHarness');
const { TABLES, getPendingChanges } = require('../lib/syncCore');
const { unsyncedCount } = require('../lib/recoveryFlow');
const O = require('../lib/orphanedPending');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
const n = (db, sql, params = []) => db.getFirstSync(sql, params).n;

// GONE: purged here (hidden, kept for its pending rows). LIVE: an ordinary protocol.
function seed() {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, deleted_at, purged_at, created_at, updated_at, sync_status) VALUES ('c-gone', ?, 'GONE', 'recon', 0, '2026-10-01T00:00:00Z', '2026-10-04T10:00:00Z', 'x', '000009', 'synced')`, [USER]);
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, created_at, updated_at, sync_status) VALUES ('c-live', ?, 'LIVE', 'recon', 1, 'x', '000008', 'synced')`, [USER]);
  const gone = db.getFirstSync(`SELECT id FROM protocols WHERE name = 'GONE'`).id;
  const live = db.getFirstSync(`SELECT id FROM protocols WHERE name = 'LIVE'`).id;
  const log = (pid, prid, status, user = USER) => db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-10-04T08:00:00Z', 'L', ?)`, [user, pid, prid, status]);
  log(gone, 'c-gone', 'pending');            // refused: counted
  log(null, 'c-gone', 'pending');            // matched by the cloud id only: counted
  log(live, 'c-live', 'pending');            // a live protocol's pending dose: never touched
  log(gone, 'c-gone', 'synced');             // not pending: not counted (removed by the purge path, not here)
  db.runSync(`INSERT INTO vials (user_id, protocol_id, protocol_remote_id, total_doses, updated_at, sync_status) VALUES (?, ?, 'c-gone', 10, 'L', 'pending')`, [USER, gone]); // counted
  db.runSync(`INSERT INTO biomarkers (user_id, report_date, marker, value, unit, updated_at, sync_status) VALUES (?, '2026-10-01', 'TSH', 1, 'x', 'L', 'pending')`, [USER]); // other table: never touched
  return { db, gone, live };
}

test('counts only the pending dose logs and vials of protocols deleted forever, for these users', () => {
  const { db } = seed();
  assert.equal(O.countOrphanedPending(db, [USER]), 3);
  assert.equal(O.countOrphanedPending(db, ['u2']), 0);
  assert.equal(O.countOrphanedPending(db, []), 0);
});

test('Discard removes exactly those rows (locally), then the hidden protocol; nothing else', () => {
  const { db, gone, live } = seed();
  const before = unsyncedCount(db, USER, TABLES, getPendingChanges);
  assert.equal(O.discardOrphanedPending(db, [USER]), 3);
  assert.equal(O.countOrphanedPending(db, [USER]), 0);
  assert.equal(unsyncedCount(db, USER, TABLES, getPendingChanges), before - 3, 'the other pending rows stay');
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ? AND sync_status = 'pending'`, [live]), 1);
  assert.equal(n(db, `SELECT COUNT(*) AS n FROM biomarkers`), 1);
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [gone]), 0, 'the hidden protocol leaves with them');
  assert.equal(n(db, 'SELECT COUNT(*) AS n FROM protocols WHERE id = ?', [live]), 1);
});

test('the prompt shows once per new count (Keep for now is remembered), never at 0', () => {
  assert.equal(O.shouldPromptOrphans(0, null), false);
  assert.equal(O.shouldPromptOrphans(2, null), true);
  assert.equal(O.shouldPromptOrphans(2, '2'), false, 'once');
  assert.equal(O.shouldPromptOrphans(3, '2'), true, 'a new refused entry asks again');
  assert.equal(O.orphanPromptKey('u1'), 'orphanedPromptShown:u1');
});

test('the sheet: honest words by count, Keep for now and Discard, nothing at 0', () => {
  const t = (k) => ({ orphaned_title: 'T', orphaned_body_one: 'ONE', orphaned_body_many: '{n} MANY', orphaned_keep: 'Keep for now', orphaned_discard: 'Discard' }[k] || k);
  const onKeep = () => {}; const onDiscard = () => {};
  assert.equal(O.orphanedSheet({ t, count: 0, onKeep, onDiscard }), null);
  const one = O.orphanedSheet({ t, count: 1, onKeep, onDiscard });
  assert.equal(one.title, 'T');
  assert.equal(one.body, 'ONE');
  assert.deepEqual(one.buttons.map((b) => [b.label, b.kind]), [['Keep for now', 'secondary'], ['Discard', 'danger']]);
  assert.equal(one.buttons[1].onPress, onDiscard);
  assert.equal(one.onDismiss, onKeep, 'closing the sheet = Keep for now');
  assert.equal(O.orphanedSheet({ t, count: 3, onKeep, onDiscard }).body, '3 MANY');
  assert.equal(O.orphanedSheet({ t, count: 3, onKeep, onDiscard, prefix: 'Blocked.' }).body, 'Blocked.\n\n3 MANY');
});

test('the strings exist in six languages, natural, with {n} in the plural', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const tr = mod.exports.translations[l];
    for (const k of ['orphaned_title', 'orphaned_body_one', 'orphaned_body_many', 'orphaned_keep', 'orphaned_discard']) assert.ok(tr[k], `${l} ${k}`);
    assert.match(tr.orphaned_body_many, /\{n\}/, l);
    assert.doesNotMatch(tr.orphaned_body_one, /\{n\}/, l);
  }
  assert.equal(mod.exports.translations.en.orphaned_body_many, '{n} entries couldn’t be saved: their protocol was deleted forever on another device. Discard removes only these entries from this phone.');
});

test('wired: Today asks once on focus; Settings, the 18+ sheet and the profile gate offer it when sign-out is blocked', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /checkOrphans\(\);/);
  assert.match(today, /function checkOrphans\(\)[\s\S]{0,900}shouldPromptOrphans\([\s\S]{0,900}orphanedSheet\(/);
  assert.match(today, /todayPopupBusy\(\)/);
  for (const f of ['screens/SettingsScreen.js', 'screens/AgeConfirmScreen.js', 'screens/OnboardingFlowScreen.js']) {
    const s = read(f);
    assert.match(s, /orphanedPendingCount\(\)/, f);
    assert.match(s, /discardOrphaned\(\)/, f);
    assert.match(s, /orphanedSheet\(\{/, f);
  }
  const acts = read('lib/accountActions.js');
  assert.match(acts, /export async function orphanedPendingCount\(\)/);
  assert.match(acts, /export async function discardOrphaned\(\)/);
});
