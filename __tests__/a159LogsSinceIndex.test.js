'use strict';
// A-159 (curve review 2026-10-20): getLogsSince wrapped logged_at in datetime(), so SQLite could not
// use idx_dose_logs_date (logged_at, protocol_id) and every read walked the whole table. The same
// shape is in getTakenLogsSince and getTodayLogs.
// What logged_at holds on a phone (every writer checked):
//   - "2026-10-20T08:00:00.000Z"        insertDoseLog (toISOString), the Today / notification writes
//   - "2026-10-20T08:00:00+00:00"       a pull: Postgres timestamptz as PostgREST returns it,
//     "2026-10-20T08:00:00.123+00:00"   fraction trimmed or absent
//   - "2026-10-20 08:00:00"             the column default (datetime('now')) and the oldest rows
//   - any other offset ("…T10:00:00+02:00") is accepted by datetime() too
// A plain text comparison would put "+00:00" before "Z" and " " before "T" at the same instant, so
// the fix keeps datetime() as the exact test and adds an indexable text bound in front of it: the
// UTC day before the bound (no offset moves a time by a day or more), which every stored form of a
// time at or after the bound sorts after. Same rows, now through the index.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const PE = require('../lib/protocolEnd');

const USER = 'u1';
const FN = {
  getLogsSince: (since) => [USER, since],
  getTakenLogsSince: (since) => [USER, since],
};
// The queries before A-159, as they were (the reference for "same rows").
const OLD = {
  getLogsSince: `SELECT * FROM dose_logs WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY logged_at DESC`,
  getTakenLogsSince: `SELECT protocol_id, logged_at, outcome FROM dose_logs WHERE user_id = ? AND outcome = 'Taken' AND datetime(logged_at) >= datetime(?) AND sync_status != 'deleted'`,
  getTodayLogs: `SELECT * FROM dose_logs WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND datetime(logged_at) < datetime(?) AND sync_status != 'deleted' ORDER BY logged_at DESC`,
};

function phone() {
  const db = makeDb();
  let lastSql = null;
  const spy = { ...db, getAllSync(sql, params) { lastSql = { sql, params }; return db.getAllSync(sql, params); } };
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => spy, PE });
  return { db, last: () => lastSql, getLogsSince: fromDb('getLogsSince'), getTakenLogsSince: fromDb('getTakenLogsSince'), getTodayLogs: fromDb('getTodayLogs') };
}

// Every stored form, around the bounds used below (2026-10-20T08:00:00.000Z and the day around it).
const STORED = [
  '2026-10-20T08:00:00.000Z', '2026-10-20T07:59:59.999Z', '2026-10-20T08:00:00.500Z', '2026-10-20T08:00:01.000Z',
  '2026-10-20T08:00:00+00:00', '2026-10-20T08:00:00.123+00:00', '2026-10-20T07:59:59+00:00', '2026-10-20T07:59:59.9+00:00',
  '2026-10-20 08:00:00', '2026-10-20 07:59:59', '2026-10-20 08:00:01',
  '2026-10-20T10:00:00+02:00', '2026-10-20T09:59:59+02:00', '2026-10-20T00:30:00-08:00', '2026-10-19T23:59:00-12:00',
  '2026-10-21T07:00:00+14:00', '2026-10-21T02:00:00+14:00', '2026-10-19T20:00:00-12:00', '2026-10-19T19:59:00-12:00',
  '2026-10-19T08:00:00.000Z', '2026-10-21T08:00:00.000Z', '2026-10-21 00:00:00', '2026-10-20T00:00:00.000Z',
  '2026-10-25T12:00:00.000Z', '2025-12-31T23:59:59.000Z', '2026-10-20', 'not a date', '',
];

function seed(p) {
  let i = 0;
  for (const at of STORED) {
    for (const outcome of ['Taken', 'Skipped']) {
      p.db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, sync_status) VALUES (?, ?, ?, ?, ?)`, [USER, (i % 3) + 1, outcome, at, 'synced']);
      i++;
    }
  }
  p.db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at) VALUES (?, 1, 'Taken', NULL)`, [USER]);
  p.db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, sync_status) VALUES (?, 1, 'Taken', '2026-10-20T09:00:00.000Z', 'deleted')`, [USER]);
  p.db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at) VALUES ('u2', 1, 'Taken', '2026-10-20T09:00:00.000Z')`);
}

const BOUNDS = ['2026-10-20T08:00:00.000Z', '2026-10-20T08:00:00.500Z', '2026-10-20T00:00:00.000Z', '2026-10-19T20:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2026-10-20T07:59:59.999Z'];
const ids = (rows) => rows.map((r) => JSON.stringify(r));

test('A-159: getLogsSince returns exactly the rows the datetime() query returned, in the same order (mixed formats)', () => {
  const p = phone();
  seed(p);
  for (const since of BOUNDS) {
    const want = p.db.getAllSync(OLD.getLogsSince, [USER, since]);
    assert.ok(want.length > 0 || since.startsWith('2027'), `fixture covers ${since}`);
    assert.deepEqual(ids(p.getLogsSince(USER, since)), ids(want), since);
  }
});

test('A-159: getTakenLogsSince returns exactly the same rows (mixed formats)', () => {
  const p = phone();
  seed(p);
  const key = (r) => `${r.logged_at}|${r.protocol_id}|${r.outcome}`;
  for (const since of BOUNDS) {
    const want = p.db.getAllSync(OLD.getTakenLogsSince, [USER, since]).map(key).sort();
    assert.deepEqual(p.getTakenLogsSince(USER, since).map(key).sort(), want, since);
  }
});

test('A-159: getTodayLogs returns exactly the same rows (mixed formats)', () => {
  const p = phone();
  seed(p);
  for (const now of ['2026-10-20T12:00:00.000Z', '2026-10-21T03:00:00.000Z', '2026-10-19T23:30:00.000Z', '2026-10-25T12:00:00.000Z']) {
    const nowMs = Date.parse(now);
    p.getTodayLogs(USER, nowMs);
    const { params } = p.last();
    const n = new Date(nowMs);
    const lo = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
    const hi = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString();
    assert.ok(params.includes(lo) && params.includes(hi), 'same local-day bounds as before (A-145)');
    const want = p.db.getAllSync(OLD.getTodayLogs, [USER, lo, hi]);
    assert.deepEqual(ids(p.getTodayLogs(USER, nowMs)), ids(want), now);
  }
});

test('A-159: the three reads go through idx_dose_logs_date (EXPLAIN QUERY PLAN)', () => {
  const p = phone();
  seed(p);
  const planOf = () => { const { sql, params } = p.last(); return p.db._raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((r) => r.detail).join(' | '); };
  // Before: "SCAN dose_logs USING INDEX idx_dose_logs_date" (the whole index, for the ORDER BY) or a
  // full table scan. After: a SEARCH on a logged_at range of the index.
  p.getLogsSince(USER, BOUNDS[0]);
  assert.match(planOf(), /SEARCH dose_logs USING INDEX idx_dose_logs_date \(logged_at>\?/, 'getLogsSince');
  p.getTakenLogsSince(USER, BOUNDS[0]);
  assert.match(planOf(), /SEARCH dose_logs USING INDEX idx_dose_logs_date \(logged_at>\?/, 'getTakenLogsSince');
  p.getTodayLogs(USER, Date.parse('2026-10-20T12:00:00.000Z'));
  assert.match(planOf(), /SEARCH dose_logs USING INDEX idx_dose_logs_date \(logged_at>\? AND logged_at<\?\)/, 'getTodayLogs');
  // The old shapes, for the record: never a SEARCH.
  for (const sql of [OLD.getLogsSince, OLD.getTakenLogsSince]) {
    const plan = p.db._raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(USER, BOUNDS[0]).map((r) => r.detail).join(' | ');
    assert.doesNotMatch(plan, /SEARCH/);
  }
});
