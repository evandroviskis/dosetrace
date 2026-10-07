'use strict';
// A-83 follow-up — journey review of the end flow (2026-10-03), each finding test-first:
//   F1/F3 Restart re-activated the SAME row and cleared its end, so the weeks between the end and
//         the restart became owed doses (Missed rows written by the scan, ring days due, curve
//         doses) and "Is this protocol finished?" came straight back. Restart now starts a NEW run:
//         a copy of the settings, started today, created now; the ended row stays as history.
//   F2    the Settings adherence report read active protocols only (the import alias said
//         "local"), so ending a protocol erased its doses from the 30-day report.
//   F4    the prompt still promised "restore it from Recently Deleted".
//   F7    a device that pulls an ended (or deleted) protocol kept its local dose reminders.
//   F8    Restart skipped the free plan's protocol limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const { computeMissedDoses } = require('../lib/missedDoses');
const { adherenceRings } = require('../lib/adherenceRings');
const { orphanDoseIds } = require('../lib/notificationPlan');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
const DAY = 86400000;
function seedEnded(db) {
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, compound_id, type, color, dose, dose_unit, amount, unit, water, start_date, interval_days, doses_per_day, reminder_time, notes, active, ended_at, created_at, updated_at, sync_status) VALUES ('rem-1', ?, 'BPC-157', 'bpc157', 'recon', 'teal', '250', 'mcg', '5', 'mg', '2', '2026-08-01', 1, 1, '08:00', 'my note', 0, '2026-09-20T10:00:00.000Z', '2026-08-01T07:00:00.000Z', '2026-09-20T10:00:00.000Z', 'synced')`, [USER]);
  const pid = db.getFirstSync('SELECT id FROM protocols').id;
  db.runSync(`INSERT INTO vials (user_id, protocol_id, protocol_remote_id, total_doses, doses_taken, active, created_at, sync_status) VALUES (?, ?, 'rem-1', 20, 8, 0, '2026-09-01T00:00:00.000Z', 'synced')`, [USER, pid]);
  return pid;
}

test('F1: Restart starts a new run — same settings, started today, created now; the ended row stays history', () => {
  const db = makeDb();
  const old = seedEnded(db);
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' });
  assert.notEqual(newId, old);
  const n = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [newId]);
  for (const k of ['user_id', 'name', 'compound_id', 'type', 'color', 'dose', 'dose_unit', 'amount', 'unit', 'water', 'interval_days', 'doses_per_day', 'reminder_time', 'notes']) {
    assert.equal(n[k], db.getFirstSync(`SELECT ${k} FROM protocols WHERE id = ?`, [old])[k], k);
  }
  assert.equal(n.active, 1);
  assert.equal(n.ended_at, null);
  assert.equal(n.deleted_at, null);
  assert.equal(n.remote_id, null, 'a new cloud row');
  assert.equal(n.sync_status, 'pending');
  assert.equal(n.start_date, '2026-10-03');
  assert.equal(n.created_at, '2026-10-03T14:00:00.000Z');
  const o = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [old]);
  assert.equal(E.isEnded(o), true, 'the old run stays ended, with its history');
  assert.equal(o.ended_at, '2026-09-20T10:00:00.000Z');
});

// Founder 2026-10-06 (device test, build 47): Restart must start TODAY with zero doses taken.
// The new run used to take the old vial along ("Mixed Sep 23 · 15 of 20 doses left"), so a
// restart looked like it began on the first run's date. Now the new run gets a FULL vial of the
// same size, mixed today; the old vial stays with the ended run as its history (never lost).
test('Restart: the new run starts with a full vial mixed today; the old vial stays with the ended run', () => {
  const db = makeDb();
  const old = seedEnded(db);
  db.runSync(`UPDATE vials SET mixed_on = '2026-09-01', water_ml = 2 WHERE protocol_id = ?`, [old]);
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' });
  const ov = db.getAllSync('SELECT * FROM vials WHERE protocol_id = ?', [old]);
  assert.equal(ov.length, 1, 'the old vial stays with the first run');
  assert.equal(ov[0].doses_taken, 8, 'its history is kept');
  assert.equal(ov[0].active, 0);
  const nv = db.getAllSync('SELECT * FROM vials WHERE protocol_id = ?', [newId]);
  assert.equal(nv.length, 1, 'the new run has its own vial');
  assert.equal(nv[0].doses_taken, 0, 'zero doses taken');
  assert.equal(nv[0].total_doses, 20, 'same size');
  assert.equal(nv[0].water_ml, 2);
  assert.equal(nv[0].mixed_on, '2026-10-03', 'mixed today');
  assert.equal(nv[0].active, 1);
  assert.equal(nv[0].remote_id, null);
  assert.equal(nv[0].protocol_remote_id, null);
  assert.equal(nv[0].sync_status, 'pending');
  assert.equal(nv[0].created_at, '2026-10-03T14:00:00.000Z');
});

// Council 3 (senior/QA): the old box date may already be past, so the restarted run would show
// "expired" on day 0 — a ready-to-use vial restarts with no expiry (the user enters the new box's).
test('Restart: a ready-to-use vial restarts with no mix date and no expiry; no vial → none created', () => {
  const db = makeDb();
  const old = seedEnded(db);
  db.runSync(`UPDATE vials SET mixed_on = NULL, expires_on = '2027-03-31' WHERE protocol_id = ?`, [old]);
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' });
  const nv = db.getFirstSync('SELECT * FROM vials WHERE protocol_id = ?', [newId]);
  assert.equal(nv.mixed_on, null);
  assert.equal(nv.expires_on, null, 'the new box date is unknown');
  assert.equal(nv.doses_taken, 0);
  const db2 = makeDb();
  const o2 = seedEnded(db2);
  db2.runSync('DELETE FROM vials');
  const n2 = E.restartAsNew(db2, o2, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' });
  assert.equal(db2.getAllSync('SELECT * FROM vials WHERE protocol_id = ?', [n2]).length, 0);
});

test('F1: nothing is owed between the end and the restart (scan, rings)', () => {
  const db = makeDb();
  const old = seedEnded(db);
  const nowIso = '2026-10-03T14:00:00.000Z';
  const newId = E.restartAsNew(db, old, { nowIso, todayKey: '2026-10-03' });
  const ps = db.getAllSync('SELECT * FROM protocols');
  const now = Date.parse('2026-10-05T14:00:00.000Z');
  const missed = computeMissedDoses(ps.filter((p) => p.active === 1), [], now, Date.parse('2026-09-01T00:00:00Z'), { lookbackDays: 14 });
  assert.ok(missed.every((m) => m.scheduledAtMs >= Date.parse(nowIso) - 3600000), 'no Missed row for the gap');
  assert.ok(missed.length <= 2, 'only the new run\'s own days');
  const r = adherenceRings({ protocols: ps, logs: [], nowMs: Date.parse('2026-10-03T20:00:00.000Z') });
  assert.ok(r.week.due <= 1, `gap days not due (week due ${r.week.due})`);
  assert.ok(newId);
});

test('F2: the 30-day report lists the ended protocols that have records in the window', () => {
  const since = Date.parse('2026-09-03T00:00:00Z');
  const now = Date.parse('2026-10-03T00:00:00Z');
  const active = { id: 1, active: 1 };
  const endedIn = { id: 2, active: 0, deleted_at: null, ended_at: '2026-09-20T00:00:00Z' };
  const endedOld = { id: 3, active: 0, deleted_at: null, ended_at: '2026-06-01T00:00:00Z' };
  const logs = [{ protocol_id: 2, outcome: 'Taken', logged_at: '2026-09-10T08:00:00Z' }, { protocol_id: 3, outcome: 'Taken', logged_at: '2026-05-30T08:00:00Z' }];
  assert.deepEqual(E.reportProtocols([active, endedIn, endedOld], logs, since, now).map((p) => p.id), [1, 2]);
  const s = read('screens/SettingsScreen.js');
  assert.doesNotMatch(s, /getActiveProtocols as getLocalProtocols/);
  assert.match(s, /reportProtocols\(getHistoryProtocols\(user\.id\)/);
  assert.match(s, /protocols_ended_on/, 'an ended protocol says so in the report');
});

test('F4: the prompt points to Ended in My Protocols, in six languages', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const tr = mod.exports.translations[l];
    assert.ok(tr.today_tx_over_body.includes(tr.protocols_ended_title), `${l} names the Ended section`);
    assert.ok(tr.today_tx_over_body.includes(tr.protocols_title), `${l} names My Protocols`);
    assert.ok(!tr.today_tx_over_body.includes(tr.protocols_recently_deleted), `${l} no longer says Recently deleted`);
  }
});

test('F7: reminders of a protocol that is no longer active are found and cancelled on every resync', () => {
  const ids = ['dose-1-2026-10-03-t0', 'dose-2-2026-10-03-t0', 'dose-2-2026-10-04-t1-f1', 'snz-dose-2-2026-10-03-t0', 'vial-exp-5', 'food-x'];
  assert.deepEqual(orphanDoseIds(ids, [1]), ['dose-2-2026-10-03-t0', 'dose-2-2026-10-04-t1-f1']);
  assert.deepEqual(orphanDoseIds(ids, []), ['dose-1-2026-10-03-t0', 'dose-2-2026-10-03-t0', 'dose-2-2026-10-04-t1-f1'], 'also when nothing is active');
  const n = read('lib/notifications.js');
  const i = n.indexOf('export async function syncAllDoseReminders');
  const body = n.slice(i, n.indexOf('\n}\n', i));
  assert.ok(body.indexOf('orphanDoseIds(') > 0 && body.indexOf('orphanDoseIds(') < body.indexOf('if (!protocols || protocols.length === 0) return;'), 'before the early return');
});

test('F8 + Restart wiring: the free limit is checked first; the new run gets its reminders', () => {
  const s = read('screens/ProtocolsScreen.js');
  const i = s.indexOf('async function restartProtocol(id, opts = {}) {');
  assert.ok(i > 0);
  const body = s.slice(i, i + 900);
  assert.match(body, /if \(await isOverFreeLimit\(\)\) \{ promptUpgrade\(\); return; \}/);
  assert.match(body, /try \{ newId = restartEndedProtocol\(id, opts\); \} catch \(err\) \{/, "a failed restart shows an error and changes nothing");
  assert.match(body, /getProtocolById\(newId\)/);
  assert.doesNotMatch(read('lib/protocolEnd.js'), /function restartProtocol/, 'the same-row restart is gone');
});

// Council 3 backend: Restart made three writes with no transaction; a crash in between left a new
// run without its vial. All or nothing now.
test('Restart is all or nothing: a failing vial write leaves no half-made run', () => {
  const db = makeDb();
  const old = seedEnded(db);
  const before = db.getAllSync('SELECT id FROM protocols').length;
  const run = db.runSync.bind(db);
  db.runSync = (sql, params) => { if (/^INSERT INTO vials/.test(sql)) throw new Error('disk full'); return run(sql, params); };
  assert.throws(() => E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' }));
  db.runSync = run;
  assert.equal(db.getAllSync('SELECT id FROM protocols').length, before, 'no new protocol');
  assert.equal(db.getFirstSync('SELECT doses_taken FROM vials WHERE protocol_id = ?', [old]).doses_taken, 8, 'old vial untouched');
});

// Council 3 journey F3 (2026-10-07): an oral / capsule protocol carried the first run's bottle count
// (units_taken) into the restarted run — the same "zero taken" rule as vials applies.
test('Restart: an oral protocol starts with zero units taken', () => {
  const db = makeDb();
  const old = seedEnded(db);
  db.runSync(`UPDATE protocols SET type = 'oral', container_units = 180, units_taken = 30 WHERE id = ?`, [old]);
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03' });
  const n = db.getFirstSync('SELECT container_units, units_taken FROM protocols WHERE id = ?', [newId]);
  assert.equal(n.container_units, 180, 'same bottle size');
  assert.equal(n.units_taken, 0, 'zero taken');
  assert.equal(db.getFirstSync('SELECT units_taken FROM protocols WHERE id = ?', [old]).units_taken, 30, 'the first run keeps its count');
});

// Council 3 journey F1: a double tap on Restart created two identical active runs.
test('Restart: a second tap while the first restart runs does nothing', () => {
  const s = read('screens/ProtocolsScreen.js');
  const i = s.indexOf('async function restartProtocol(id, opts = {}) {');
  const body = s.slice(i, i + 900);
  assert.match(body, /if \(restartingRef\.current\) return;\s*restartingRef\.current = true;/);
  assert.match(body, /finally \{ restartingRef\.current = false; \}/);
});

// Founder 2026-10-07 (council 3 decision 1): Restart asks which container. "Continue the same vial"
// moves the old vial to the new run UNCHANGED (its mix date and count are the truth); orals keep
// the bottle's units. "New vial" (default) is the full vial mixed today.
test('Restart with the same vial: the old vial moves to the new run unchanged, no new vial', () => {
  const db = makeDb();
  const old = seedEnded(db);
  db.runSync(`UPDATE vials SET mixed_on = '2026-09-01' WHERE protocol_id = ?`, [old]);
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03', sameContainer: true });
  const all = db.getAllSync('SELECT * FROM vials');
  assert.equal(all.length, 1, 'no new vial');
  assert.equal(all[0].protocol_id, newId);
  assert.equal(all[0].doses_taken, 8);
  assert.equal(all[0].mixed_on, '2026-09-01');
  assert.equal(all[0].active, 1);
  assert.equal(all[0].protocol_remote_id, null, 'relinked to the new run on its push');
  assert.equal(all[0].sync_status, 'pending');
});

test('Restart with the same bottle (oral): the units taken carry over', () => {
  const db = makeDb();
  const old = seedEnded(db);
  db.runSync(`UPDATE protocols SET type = 'oral', container_units = 180, units_taken = 30 WHERE id = ?`, [old]);
  db.runSync('DELETE FROM vials');
  const newId = E.restartAsNew(db, old, { nowIso: '2026-10-03T14:00:00.000Z', todayKey: '2026-10-03', sameContainer: true });
  assert.equal(db.getFirstSync('SELECT units_taken FROM protocols WHERE id = ?', [newId]).units_taken, 30);
});

test('Restart asks first: the container question, and a warning when the same protocol is already active', () => {
  const s = read('screens/ProtocolsScreen.js');
  const i = s.indexOf('function askRestart(p) {');
  assert.ok(i > 0);
  const body = s.slice(i, i + 3200);
  assert.match(body, /protocols_restart_new_vial_btn/);
  assert.match(body, /protocols_restart_same_vial/);
  assert.match(body, /protocols_restart_same_bottle/);
  assert.match(body, /protocols_restart_dup_title/);
  assert.match(body, /restartProtocol\(p\.id, \{ sameContainer: true \}\)/);
  assert.match(s, /onPress=\{\(\) => askRestart\(p\)\}/, 'the Restart pill asks first');
  const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['protocols_restart_title', 'protocols_restart_body', 'protocols_restart_body_plain', 'protocols_restart_new_vial_btn', 'protocols_restart_same_vial', 'protocols_restart_new_bottle_btn', 'protocols_restart_same_bottle', 'protocols_restart_confirm', 'protocols_restart_dup_title', 'protocols_restart_dup_body', 'protocols_restart_dup_go']) assert.ok(T[l][k], `${l} ${k}`);
});
