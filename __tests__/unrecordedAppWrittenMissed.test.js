'use strict';
// UP-36 (founder answer 3, 2026-11-04 10:04 EST, "sim se foram ativamente marcadas como perdidas"): the picture's
// section 5 — Semaglutida every Friday 20:00; 4 and 11 Sep "Perdida" written by the app, 18 Sep "Perdida" marked by
// the person, 25 Sep … 16 Oct no record. The question counts 6 (the 4 without record + the app's 2); "Tomei todas"
// turns the app's two rows themselves into Taken (never a second row) and adds the 4 others; the person's row
// stays red. Runs the real save over the in-memory database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { unrecordedPhone } = require('./helpers/unrecordedPhone');
const U = require('../lib/unrecordedPeriod');

const USER = 'u-sema';
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const NOW = L(2026, 11, 3, 10);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };

function seed(db) {
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES ('r-s', ?, 'Semaglutida', 'rtu', '#185FA5', '0,25', 'mg', '20:00', 1, 7, '2026-09-04', 1, ?, '000001', 'synced')`, [USER, iso(L(2026, 9, 1, 8))]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  const add = (rid, ms, by) => db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, outcome_by_person, updated_at, sync_status) VALUES (?, ?, ?, 'r-s', 'Missed', ?, ?, '000002', 'synced')`, [rid, USER, p.id, iso(ms), by]);
  add('r-1', L(2026, 9, 4, 20), null); // before this version: no marker → the app's
  add('r-2', L(2026, 9, 11, 20), 0); // the scan
  add('r-3', L(2026, 9, 18, 20), 1); // the person, in the Dose log
  return p;
}

test('UP-36: the app\'s old "Perdida" rows are counted in {n}; the person\'s stays out', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  const e = U.gapEntries(p, ph.logs(USER), opts);
  assert.equal(e.length, 6);
  assert.deepEqual(e.filter((x) => x.row).map((x) => x.slotMs), [L(2026, 9, 4, 20), L(2026, 9, 11, 20)]);
  assert.ok(!e.some((x) => x.slotMs === L(2026, 9, 18, 20)));
});

test('UP-36: "Tomei todas" changes the same rows (never a duplicate); the person\'s row is untouched', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  ph.save({ protocolId: p.id, entries: U.gapEntries(p, ph.logs(USER), opts), choice: 'all' });
  const rows = ph.logs(USER);
  assert.equal(rows.length, 7, '3 old rows + 4 new ones, no duplicate');
  const byRemote = Object.fromEntries(rows.filter((r) => r.remote_id).map((r) => [r.remote_id, r]));
  assert.equal(byRemote['r-1'].outcome, 'Taken');
  assert.equal(byRemote['r-2'].outcome, 'Taken');
  assert.equal(byRemote['r-1'].outcome_by_person, 1);
  assert.equal(byRemote['r-3'].outcome, 'Missed', 'marked by the person: stays red');
  assert.equal(byRemote['r-3'].sync_status, 'synced', 'and untouched');
  for (const r of rows.filter((x) => !x.remote_id)) { assert.equal(r.outcome, 'Taken'); assert.equal(r.outcome_by_person, 1); }
  // Nothing more to ask; the person's row is still not in the question.
  assert.deepEqual(U.gapEntries(ph.db.getProtocolById(p.id), rows, opts), []);
});

test('UP-36: "Não tomei" turns the app\'s rows into Skipped (same rows); a chosen slot of "Escolher quais" too', () => {
  const db = makeDb();
  const p = seed(db);
  const ph = unrecordedPhone(db, { now: NOW });
  const e = U.gapEntries(p, ph.logs(USER), opts);
  ph.save({ protocolId: p.id, entries: e, choice: 'pick', picked: new Set([L(2026, 9, 11, 20)]) });
  const rows = ph.logs(USER);
  const byRemote = Object.fromEntries(rows.filter((r) => r.remote_id).map((r) => [r.remote_id, r]));
  assert.equal(byRemote['r-1'].outcome, 'Skipped');
  assert.equal(byRemote['r-2'].outcome, 'Taken');
  assert.equal(rows.length, 7);
});
