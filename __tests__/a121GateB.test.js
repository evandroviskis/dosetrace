'use strict';
// A-121 / A-148 Gate B review (2026-10-20, "fix first") and spec audit: the reviewer's probes P1–P5
// (scratchpad probe.test.cjs / probe2.test.cjs, real syncCore + protocolEnd) made permanent, plus the
// other findings. Each test reproduced the bug before its fix.
//   1  a pending row on another phone never sends the end date it did not change (ends_on_changed marker)
//   2  the "Still going?" answer never goes backward (cloud trigger, pending merge, writers)
//   3  a clock set ahead never locks the answer (trusted-now)
//   4  SG-27 also when the end arrives on a phone with a pending edit
//   5  rewind needs a verified session; local_meta wiped on sign-out; Restart classifies every column
//   9  "Sim, terminou" goes through the one End
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { toCloudPayload } = require('../lib/syncMappers');

const USER = 'u1';
const DAY = 86400000;
function seed(db) {
  return db.runSync(`INSERT INTO protocols (user_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, created_at, updated_at, sync_status, units_taken)
    VALUES (?, 'Goli', 'oral', '2026-09-01', 1, 1, '20:00', 1, '2026-09-01T08:00:00.000Z', '000001', 'pending', 0)`, [USER]).lastInsertRowId;
}
const one = (db, col) => db.getFirstSync(`SELECT ${col} FROM protocols`)[col];
async function twoPhones() {
  const cloud = makeCloud();
  const A = makeDb();
  const id = seed(A);
  await pushPending(A, cloud, USER);
  const B = makeDb();
  await fullImport(B, cloud, USER);
  const bid = B.getFirstSync('SELECT id FROM protocols').id;
  return { cloud, A, id, B, bid };
}
// The cloud trigger of the migration (protocols_still_going_forward): never backward, never ahead of now.
function forwardTrigger(cloud, nowMs = Date.now()) {
  const fix = (old, p) => {
    if (!('still_going_at' in p) || p.still_going_at == null) return p;
    let v = Math.min(Date.parse(p.still_going_at), nowMs);
    const o = old && old.still_going_at ? Date.parse(old.still_going_at) : NaN;
    if (Number.isFinite(o) && o > v) v = o;
    return { ...p, still_going_at: new Date(v).toISOString() };
  };
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  cloud.insert = async (t, p) => ins(t, t === 'protocols' ? fix(null, p) : p);
  cloud.update = async (t, id, p) => upd(t, id, t === 'protocols' ? fix(cloud._store.protocols.get(id), p) : p);
}

// ── 1 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 1 / P1: a capsule taken on phone B (pending units_taken) never pushes NULL over the end date A set', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  E.setPlannedEnd(A, id, '2027-01-15', { now: new Date(2026, 9, 15) });
  await pushPending(A, cloud, USER);
  B.runSync(`UPDATE protocols SET units_taken = 1, updated_at = '999999', sync_status = 'pending' WHERE id = ?`, [bid]);
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  await pullChanges(A, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, '2027-01-15', 'cloud');
  assert.equal(one(A, 'ends_on'), '2027-01-15', 'A');
  assert.equal(one(B, 'ends_on'), '2027-01-15', 'B takes the cloud\'s end date after its push');
});

test('Gate B 1 / P4: "Continua" on B never wipes the end date A just saved', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  E.setPlannedEnd(A, id, '2027-01-15', { now: new Date(2026, 9, 15) });
  await pushPending(A, cloud, USER);
  E.markStillGoing(B, bid, new Date(2026, 9, 15, 12).toISOString());
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  await pullChanges(A, cloud, USER);
  assert.equal(one(A, 'ends_on'), '2027-01-15');
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, '2027-01-15');
});

test('Gate B 1: a cleared date is never resurrected by a stale pending row; a pending row takes the cloud\'s end date on pull', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  E.setPlannedEnd(A, id, '2027-01-15', { now: new Date(2026, 9, 15) });
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(one(B, 'ends_on'), '2027-01-15');
  E.setPlannedEnd(A, id, null, { now: new Date(2026, 9, 16) }); // "Sem data de fim" on A
  await pushPending(A, cloud, USER);
  B.runSync(`UPDATE protocols SET units_taken = 2, updated_at = '999998', sync_status = 'pending' WHERE id = ?`, [bid]);
  await pullChanges(B, cloud, USER); // B pulls while its own edit is pending
  assert.equal(one(B, 'ends_on'), null, 'the pending row took the clear');
  await pushPending(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, null, 'never re-sent the old date');
  // The marker: set only by the writers, cleared by an accepted push.
  E.setPlannedEnd(B, bid, '2027-02-01', { now: new Date(2026, 9, 16) });
  assert.ok(one(B, 'ends_on_changed'));
  assert.equal(toCloudPayload('protocols', B.getFirstSync('SELECT * FROM protocols')).ends_on, '2027-02-01');
  await pushPending(B, cloud, USER);
  assert.equal(one(B, 'ends_on_changed'), null);
  assert.ok(!('ends_on' in toCloudPayload('protocols', B.getFirstSync('SELECT * FROM protocols'))), 'not sent without the marker');
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, '2027-02-01');
});

// ── 2 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 2 / P2: an older answer pushed late never moves the cloud\'s "Still going?" answer back; every phone ends on the later one', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  forwardTrigger(cloud);
  E.markStillGoing(B, bid, '2026-10-01T10:00:00.000Z'); // B answered first, offline
  E.markStillGoing(A, id, '2026-10-10T10:00:00.000Z');
  await pushPending(A, cloud, USER);
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].still_going_at, '2026-10-10T10:00:00.000Z');
  assert.equal(one(B, 'still_going_at'), '2026-10-10T10:00:00.000Z', 'B took the later answer back from its push');
  const C = makeDb();
  await fullImport(C, cloud, USER);
  assert.equal(one(C, 'still_going_at'), '2026-10-10T10:00:00.000Z');
});

test('Gate B 2: a pending row takes a later cloud answer on pull; continueCourse / a clear never move the answer back', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  E.markStillGoing(A, id, '2026-10-10T10:00:00.000Z');
  await pushPending(A, cloud, USER);
  B.runSync(`UPDATE protocols SET units_taken = 1, updated_at = '999999', sync_status = 'pending' WHERE id = ?`, [bid]);
  await pullChanges(B, cloud, USER);
  assert.equal(one(B, 'still_going_at'), '2026-10-10T10:00:00.000Z');
  // Writers: an answer already later than the tap stays (a phone whose clock is behind).
  E.continueCourse(B, bid, { now: new Date('2026-10-05T10:00:00.000Z') });
  assert.equal(one(B, 'still_going_at'), '2026-10-10T10:00:00.000Z');
  E.setPlannedEnd(B, bid, null, { now: new Date('2026-10-06T10:00:00.000Z') });
  assert.equal(one(B, 'still_going_at'), '2026-10-10T10:00:00.000Z');
});

test('Gate B 2: the migration keeps the answer forward and never ahead of the server clock (not on a purge)', () => {
  const dir = path.join(__dirname, '../supabase/migrations');
  const sql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((n) => /protocol_ends_on/.test(n))), 'utf8').replace(/--[^\n]*/g, '');
  const i = sql.indexOf('create or replace function public.protocols_still_going_forward()');
  assert.ok(i >= 0);
  const fn = sql.slice(i, sql.indexOf('$$;', i));
  assert.match(fn, /if new\.purged_at is not null then return new; end if;/i);
  assert.match(fn, /if new\.still_going_at is not null then new\.still_going_at := least\(new\.still_going_at, now\(\)\); end if;/i);
  assert.match(fn, /if tg_op = 'UPDATE' then new\.still_going_at := greatest\(old\.still_going_at, new\.still_going_at\); end if;/i);
  assert.match(fn, /security invoker/i);
  assert.match(sql, /create trigger protocols_still_going_forward before insert or update on public\.protocols\s+for each row execute function public\.protocols_still_going_forward\(\);/i);
});

// ── 3 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 3 / P3: "Continua" with the clock 19 days ahead never locks the answer once the clock is back', () => {
  const A = makeDb();
  const id = seed(A);
  const ahead = new Date(Date.now() + 19 * DAY).toISOString();
  // Written while the phone's clock was ahead (its own now = trusted then).
  assert.equal(E.markStillGoing(A, id, ahead, { trustedNowMs: Date.parse(ahead) }), true);
  // The clock is back: the real answer replaces the value from the future.
  assert.equal(E.markStillGoing(A, id, new Date().toISOString()), true, 'the real answer is accepted');
  const p = A.getFirstSync('SELECT * FROM protocols');
  assert.equal(E.inactivityDue(p, { now: new Date(Date.now() + 8 * DAY) }), true, 'asked again after the usual span');
  // A value from the future is not trusted by the check either: due as if there were no answer.
  const q = { ...p, still_going_at: ahead, created_at: new Date(Date.now() - 30 * DAY).toISOString() };
  assert.equal(E.inactivityDue(q, { now: new Date() }), true);
  assert.equal(E.inactivityDue(q, { now: new Date(), trustedNowMs: Date.parse(ahead) + 1000 }), false, 'trusted when the server time agrees');
  // The 1.3.0 device answer from the future is not copied.
  const B = makeDb();
  const bid = seed(B);
  assert.equal(E.markStillGoing(B, bid, ahead), false);
  assert.equal(one(B, 'still_going_at'), null);
});

test('Gate B 3: Today passes the trusted time (newest cloud stamp) to the decision', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/protocolEnd.js'), 'utf8');
  const fn = src.slice(src.indexOf('function nextTodayQuestion('), src.indexOf('\n}\n', src.indexOf('function nextTodayQuestion(')));
  assert.match(fn, /serverConfirmedNow\(/);
  // Behaviour: a synced row with a cloud stamp later than the device clock makes a near-future answer trusted.
  const now = new Date();
  const answer = new Date(now.getTime() + 2 * 3600000).toISOString();
  const p = { id: 1, interval_days: 1, created_at: new Date(now.getTime() - 30 * DAY).toISOString(), still_going_at: answer, active: 1 };
  assert.equal(E.nextTodayQuestion([p], [], now).kind, 'still_going', 'untrusted alone');
  const logs = [{ protocol_id: 1, outcome: 'Skipped', logged_at: now.toISOString(), updated_at: new Date(now.getTime() + 3 * 3600000).toISOString(), sync_status: 'synced' }];
  assert.equal(E.nextTodayQuestion([p], logs, now), null, 'the cloud says that time has passed');
});

// ── 4 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 4 / P5: B has a pending edit when A ends it — B\'s app Missed rows after the end go, and never reach A', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, (SELECT remote_id FROM protocols WHERE id = ?), 'Missed', '2026-10-12T18:00:00.000Z', 'T0', 'pending')`, [USER, bid, bid]);
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, (SELECT remote_id FROM protocols WHERE id = ?), 'Taken', '2026-10-13T18:00:00.000Z', 'T0', 'pending')`, [USER, bid, bid]);
  B.runSync(`UPDATE protocols SET units_taken = 1, updated_at = '999999', sync_status = 'pending' WHERE id = ?`, [bid]);
  E.endNow(A, id, { now: new Date('2026-10-10T12:00:00.000Z') });
  await pushPending(A, cloud, USER);
  await pushPending(B, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(one(B, 'active'), 0);
  assert.deepEqual(B.getAllSync(`SELECT outcome FROM dose_logs WHERE sync_status != 'deleted'`).map((l) => l.outcome), ['Taken'], 'the user\'s Taken stays');
  await pullChanges(A, cloud, USER);
  assert.deepEqual(cloud.rows('dose_logs', USER).map((l) => l.outcome), ['Taken']);
});

test('Gate B 4: the pending-row merge on pull settles the end too', async () => {
  const { cloud, A, id, B, bid } = await twoPhones();
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Missed', '2026-10-12T18:00:00.000Z', 'T0', 'pending')`, [USER, bid]);
  B.runSync(`UPDATE protocols SET units_taken = 1, updated_at = '999999', sync_status = 'pending' WHERE id = ?`, [bid]);
  E.endNow(A, id, { now: new Date('2026-10-10T12:00:00.000Z') });
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER); // pull first: B's protocol row is still pending
  assert.equal(one(B, 'active'), 0);
  assert.equal(B.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs`).n, 0);
});

// ── 5 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 5: an empty answer without a verified session never marks the rewind done', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  B.runSync(`INSERT OR REPLACE INTO local_meta (key, value) VALUES ('pull_rewind:protocols', 'pending')`);
  cloud.sessionUserId = async () => null; // RLS answers 0 rows without a session
  await pullChanges(B, cloud, USER);
  assert.ok(B.getFirstSync(`SELECT value FROM local_meta WHERE key = 'pull_rewind:protocols'`), 'still pending');
  cloud.sessionUserId = async () => USER;
  await pullChanges(B, cloud, USER);
  assert.equal(B.getFirstSync(`SELECT value FROM local_meta WHERE key = 'pull_rewind:protocols'`), null);
});

test('Gate B 5: Restart classifies every protocols column as copied or excluded (a new column must be decided)', () => {
  const db = makeDb();
  const cols = db.getAllSync('PRAGMA table_info(protocols)').map((c) => c.name);
  const known = new Set([...E.RESTART_COPIED, ...E.RESTART_EXCLUDED]);
  assert.deepEqual(cols.filter((c) => !known.has(c)), []);
  assert.deepEqual(E.RESTART_COPIED.filter((c) => E.RESTART_EXCLUDED.includes(c)), []);
  for (const c of ['ends_on', 'ends_on_changed', 'still_going_at', 'history_from']) assert.ok(E.RESTART_EXCLUDED.includes(c), c);
});

// ── 9 ────────────────────────────────────────────────────────────────────────────────────────────
test('Gate B 9 / SG-16: "Sim, terminou" goes through the one End (vials off, Missed after it gone), still dated at the last dose (DL-87)', () => {
  const db = makeDb();
  const id = seed(db);
  db.runSync(`INSERT INTO vials (user_id, protocol_id, active, created_at, updated_at, sync_status) VALUES (?, ?, 1, 'x', 'x', 'synced')`, [USER, id]);
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', '2026-09-20T20:00:00.000Z', 'x', 'synced')`, [USER, id]);
  const end = E.endAtLastDose(db, id, '2026-10-04T09:00:00.000Z');
  assert.equal(end, '2026-09-20T20:00:00.000Z');
  assert.equal(db.getFirstSync('SELECT active FROM vials').active, 0, 'the one End deactivates the vials');
  const src = fs.readFileSync(path.join(__dirname, '../lib/protocolEnd.js'), 'utf8');
  const body = src.slice(src.indexOf('function endAtLastDose('), src.indexOf('\n}\n', src.indexOf('function endAtLastDose(')));
  assert.match(body, /return endNow\(db, id, \{ now: new Date\(nowIso\), endIso: end \}\);/);
  // What the person sees is unchanged: Today still cancels its reminders only (no new banner clearing).
  const today = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  const h = today.slice(today.indexOf('async function endInactiveProtocol('), today.indexOf('closeProtocolQuestion();', today.indexOf('async function endInactiveProtocol(')));
  assert.match(h, /endProtocolAtLastDose\(p\.id\);/);
  assert.doesNotMatch(h, /dismissDeliveredDoseReminders/);
});
