'use strict';
// A-121 (founder 2026-10-15, docs/specs/still-going-end-date.md SG-1..SG-30): "Still going?" with an
// end date. The planned end is protocols.ends_on, a local day 'YYYY-MM-DD' (never ended_at). These
// are the behaviour tests of the pure owners and the storage / sync path:
//   lib/schedule.js     courseState (S-15, the only reader), courseEndAsk (SG-17), courseEndMoment
//                       (DL-99 / DL-110), endDateRange (SG-8 / SG-13)
//   lib/protocolEnd.js  inactivityDue (S-33), nextTodayQuestion (SG-22 / SG-29), setPlannedEnd,
//                       continueCourse, endNow (SG-16), startAfterEnd (SG-14), Restart allow-list
//   lib/syncMappers + lib/syncCore   ends_on always sent (NULL included), a pulled NULL written,
//                       works before the migration (PGRST204), one pull rewind (DL-117)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const S = require('../lib/schedule');
const E = require('../lib/protocolEnd');
const { toCloudPayload, CLOUD_FIELDS, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');

const USER = 'u1';
const DAY = 86400000;
const at = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0);
const goli = (over = {}) => ({
  id: 7, name: 'Goli', interval_days: 1, doses_per_day: 1, reminder_time: '20:00',
  start_date: '2026-09-01', created_at: '2026-09-01T08:00:00.000Z', active: 1, deleted_at: null, ...over,
});

function seed(db, over = {}) {
  const r = db.runSync(
    `INSERT INTO protocols (user_id, remote_id, name, type, start_date, interval_days, doses_per_day, reminder_time, active, created_at, updated_at, sync_status, ends_on, schedule_total)
     VALUES (?, ?, 'Goli', 'oral', ?, 1, 1, '20:00', 1, '2026-09-01T08:00:00.000Z', ?, ?, ?, ?)`,
    [USER, over.remote_id || null, over.start_date || '2026-09-01', over.updated_at || '000001', over.sync_status || 'pending', over.ends_on || null, over.schedule_total || null],
  );
  return r.lastInsertRowId;
}
const row = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
function log(db, pid, outcome, iso, remote = true) {
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'T0', ?)`,
    [USER, pid, remote ? `d-${iso}` : null, outcome, iso, remote ? 'synced' : 'pending']);
}

// ── S-15 courseState: the one reader ─────────────────────────────────────────────────────────────
test('SG-3/SG-12: courseState — before / on / after a planned end, as local days', () => {
  const p = goli({ ends_on: '2027-01-15' });
  assert.deepEqual(
    pick(S.courseState(p, at(2027, 1, 14, 23, 59))), { kind: 'planned', endKey: '2027-01-15', before: true, onEnd: false, after: false });
  assert.deepEqual(pick(S.courseState(p, at(2027, 1, 15, 0, 1))), { kind: 'planned', endKey: '2027-01-15', before: false, onEnd: true, after: false });
  assert.deepEqual(pick(S.courseState(p, at(2027, 1, 16, 0, 1))), { kind: 'planned', endKey: '2027-01-15', before: false, onEnd: false, after: true });
  assert.equal(S.courseState(p, at(2027, 1, 1)).plannedEnd, '2027-01-15');
  assert.deepEqual(pick(S.courseState(goli(), at(2027, 1, 1))), { kind: null, endKey: null, before: false, onEnd: false, after: false });
  assert.equal(S.courseState(goli({ ends_on: 'nonsense' }), at(2027, 1, 1)).kind, null, 'a bad value is no end date');
});
function pick(c) { return { kind: c.kind, endKey: c.endKey, before: c.before, onEnd: c.onEnd, after: c.after }; }

test('SG-12: the end day is the phone\'s local day at UTC−3 and UTC+9 (never a UTC parse)', () => {
  const code = `
    const S = require(${JSON.stringify(path.join(__dirname, '../lib/schedule'))});
    const p = { id: 1, interval_days: 1, doses_per_day: 1, reminder_time: '', start_date: '2026-09-01', ends_on: '2026-11-20' };
    const out = [];
    // 21:30 local on the 19th: still before; 00:30 local on the 20th: the day; 23:50 on the 20th: the day.
    for (const [d, h, m] of [[19, 21, 30], [20, 0, 30], [20, 23, 50], [21, 0, 5]]) {
      const c = S.courseState(p, new Date(2026, 10, d, h, m));
      out.push([c.before, c.onEnd, c.after].map(Number).join(''));
    }
    process.stdout.write(out.join(','));`;
  for (const tz of ['America/Sao_Paulo', 'Asia/Tokyo', 'Europe/Berlin']) {
    const res = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz } }).toString();
    assert.equal(res, '100,010,010,001', tz);
  }
  // A 25 h day (Berlin, last Sunday of October 2026): the end date is still one whole local day.
  const berlin = execFileSync(process.execPath, ['-e', `
    const S = require(${JSON.stringify(path.join(__dirname, '../lib/schedule'))});
    const p = { id: 1, interval_days: 1, doses_per_day: 1, reminder_time: '', start_date: '2026-09-01', ends_on: '2026-10-25' };
    const c1 = S.courseState(p, new Date(2026, 9, 25, 23, 30)); const c2 = S.courseState(p, new Date(2026, 9, 26, 0, 30));
    process.stdout.write([c1.onEnd, c2.after].join(','));`], { env: { ...process.env, TZ: 'Europe/Berlin' } }).toString();
  assert.equal(berlin, 'true,true');
});

test('SG-23 / DL-112: a legacy total and a planned end — one owner, the earlier one asks', () => {
  // total 10 dose days, daily, from 2026-09-01 → the course's last day is 2026-09-10.
  const total = goli({ schedule_total: 10 });
  assert.equal(S.courseState(total, at(2026, 9, 5)).kind, 'total');
  assert.equal(S.courseState(total, at(2026, 9, 5)).endKey, '2026-09-10');
  const both = goli({ schedule_total: 10, ends_on: '2026-09-20' });
  assert.equal(S.courseState(both, at(2026, 9, 5)).kind, 'total', 'the total ends first');
  const both2 = goli({ schedule_total: 30, ends_on: '2026-09-20' });
  assert.equal(S.courseState(both2, at(2026, 9, 5)).kind, 'planned');
  assert.equal(S.courseState(both2, at(2026, 9, 5)).endKey, '2026-09-20');
  // every-3-days total of 4 dose days → 2026-09-01, 04, 07, 10.
  assert.equal(S.courseState(goli({ schedule_total: 4, interval_days: 3 }), at(2026, 9, 5)).endKey, '2026-09-10');
});

// ── SG-17 / DL-109: the cycle's last dose is never taken away ────────────────────────────────────
test('SG-17: daily 20:00, end date today → not at 09:00 nor 20:30 unlogged; right after the dose; next day if unlogged', () => {
  const p = goli({ ends_on: '2026-11-20' });
  const noLogs = [];
  assert.equal(S.courseEndAsk(p, at(2026, 11, 20, 9, 0), noLogs), false, '09:00: the dose is still open');
  assert.equal(S.courseEndAsk(p, at(2026, 11, 20, 20, 30), noLogs), false, '20:30: the slot can still be logged today');
  const taken = [{ protocol_id: 7, outcome: 'Taken', logged_at: at(2026, 11, 20, 20, 5).toISOString() }];
  assert.equal(S.courseEndAsk(p, at(2026, 11, 20, 20, 6), taken), true, 'asked right after the last dose');
  const skipped = [{ protocol_id: 7, outcome: 'Skipped', logged_at: at(2026, 11, 20, 20, 5).toISOString() }];
  assert.equal(S.courseEndAsk(p, at(2026, 11, 20, 20, 6), skipped), true, 'a Skipped answer also closes the slot');
  const missed = [{ protocol_id: 7, outcome: 'Missed', logged_at: at(2026, 11, 20, 20, 0).toISOString() }];
  assert.equal(S.courseEndAsk(p, at(2026, 11, 20, 23, 0), missed), false, 'a Missed row is not an answer');
  assert.equal(S.courseEndAsk(p, at(2026, 11, 21, 8, 0), noLogs), true, 'unlogged → asked on the next day\'s open');
  assert.equal(S.courseEndAsk(p, at(2026, 11, 19, 21, 0), taken), false, 'never before the end date');
  // An end date with no dose due that day asks at the first open.
  const weekly = goli({ interval_days: 7, ends_on: '2026-11-20', start_date: '2026-11-02' }); // dose days 2, 9, 16, 23
  assert.equal(S.courseEndAsk(weekly, at(2026, 11, 20, 7, 0), noLogs), true);
  // Two doses that day: both must be answered.
  const twice = goli({ doses_per_day: 2, reminder_time: '08:00,20:00', ends_on: '2026-11-20' });
  assert.equal(S.courseEndAsk(twice, at(2026, 11, 20, 9, 0), [{ protocol_id: 7, outcome: 'Taken', logged_at: at(2026, 11, 20, 8, 1).toISOString() }]), false);
});

// ── DL-99 / DL-110 / SG-27: when "Encerrar" is dated ─────────────────────────────────────────────
test('SG-5 / SG-27: on the end date at the tap; late at the end of the end date, or the last Taken dose if later', () => {
  const p = goli({ ends_on: '2026-11-20' });
  const tap = at(2026, 11, 20, 20, 10);
  assert.equal(S.courseEndMoment(p, tap, null), tap.toISOString(), 'on the day: the tap (DL-99)');
  const late = at(2026, 12, 2, 10, 0);
  assert.equal(S.courseEndMoment(p, late, at(2026, 11, 20, 20, 1).toISOString()), at(2026, 11, 20, 23, 59).toISOString().replace(':00.000Z', ':59.000Z'));
  assert.equal(new Date(S.courseEndMoment(p, late, null)).getTime(), new Date(2026, 10, 20, 23, 59, 59).getTime(), '20/11 23:59:59 local');
  const after = at(2026, 11, 23, 8, 0).toISOString();
  assert.equal(S.courseEndMoment(p, late, after), after, 'a dose logged after the end date moves the end to it');
  assert.equal(S.courseEndMoment(goli(), tap, null), tap.toISOString(), 'no course: the tap');
});

// ── SG-8 / SG-13: the wheel's range ──────────────────────────────────────────────────────────────
test('SG-13: first valid day = later of tomorrow and the start; opens one month after the later of today and the start', () => {
  const now = at(2026, 10, 15, 10);
  assert.deepEqual(S.endDateRange(goli({ start_date: '2026-10-03' }), now), { minKey: '2026-10-16', openKey: '2026-11-15' });
  assert.deepEqual(S.endDateRange(goli({ start_date: '2026-12-01' }), now), { minKey: '2026-12-01', openKey: '2027-01-01' });
  assert.deepEqual(S.endDateRange(goli({ start_date: null }), now), { minKey: '2026-10-16', openKey: '2026-11-15' });
  // A saved end date opens the wheel on it.
  assert.equal(S.endDateRange(goli({ ends_on: '2027-01-15' }), now).openKey, '2027-01-15');
  // The start-after-end notice: the new (unsaved) start is the lower bound.
  assert.deepEqual(S.endDateRange(goli({ ends_on: '2027-01-15' }), now, { startKey: '2027-01-20' }), { minKey: '2027-01-20', openKey: '2027-02-20' });
  // 31 Jan + one month clamps to the month's last day.
  assert.equal(S.endDateRange(goli({ start_date: '2026-01-31' }), at(2026, 1, 31)).openKey, '2026-02-28');
});

test('SG-8: the end wheel reaches 5 years ahead and cannot settle before its first day; the other wheels keep their range', () => {
  const W = require('../lib/wheelPick');
  const now = at(2026, 10, 15, 10);
  const labels = Array.from({ length: 12 }, (_, i) => String(i));
  const cols = W.dateColumns('2026-11-15', now, labels, { minISO: '2026-10-16', yearsAhead: 5 });
  assert.equal(cols[2].values[0], '2026', 'no years before the first valid day');
  assert.equal(cols[2].values[cols[2].values.length - 1], '2031', 'at least 5 years ahead');
  assert.equal(W.dateAfter('2026-11-15', now, 0, 9, { minISO: '2026-10-16', yearsAhead: 5 }), '2026-10-16', 'Oct 15 → clamped to the first valid day');
  assert.equal(W.dateAfter('2026-11-15', now, 0, 11, { minISO: '2026-10-16', yearsAhead: 5 }), '2026-12-15');
  assert.equal(W.dateAfter('2026-11-15', now, 2, 5, { minISO: '2026-10-16', yearsAhead: 5 }), '2031-11-15');
  // Unchanged default (start date, curve date, assistant, calculator): 10 back to 2 ahead.
  const def = W.dateColumns('2026-10-15', now, labels);
  assert.equal(def[2].values[0], '2016');
  assert.equal(def[2].values[def[2].values.length - 1], '2028');
  assert.equal(W.dateAfter('2026-10-15', now, 2, 0), '2016-10-15');
});

// ── S-33 inactivityDue (SG-3, SG-15, DL-113) ─────────────────────────────────────────────────────
test('SG-3: with an end date "Still going?" never asks — before, on and after it, whatever the log says', () => {
  const p = goli({ ends_on: '2026-12-31', created_at: '2026-01-01T08:00:00.000Z' });
  for (const now of [at(2026, 11, 1), at(2026, 12, 31), at(2027, 2, 1)]) {
    assert.equal(E.inactivityDue(p, { lastTakenIso: null, now }), false, now.toISOString());
  }
  // Without one, today's rule: max(7, 3 × interval) days after the last Taken dose.
  const q = goli({ created_at: '2026-01-01T08:00:00.000Z' });
  assert.equal(E.inactivityDue(q, { lastTakenIso: at(2026, 11, 1).toISOString(), now: at(2026, 11, 7, 23) }), false);
  assert.equal(E.inactivityDue(q, { lastTakenIso: at(2026, 11, 1).toISOString(), now: at(2026, 11, 8, 10) }), true);
  assert.equal(E.inactivityDue(goli({ interval_days: 7, created_at: '2026-01-01T08:00:00.000Z' }), { lastTakenIso: at(2026, 11, 1).toISOString(), now: at(2026, 11, 15) }), false, 'weekly: 21 days');
});

test('SG-15 / DL-113: "Continua" (and every continue) restarts the span from the tap; a never-logged protocol is not asked again for max(7, 3×interval) days', () => {
  const tap = at(2026, 11, 1, 10);
  const p = goli({ created_at: '2026-01-01T08:00:00.000Z', still_going_at: tap.toISOString() });
  assert.equal(E.inactivityDue(p, { lastTakenIso: null, now: new Date(tap.getTime() + 6.9 * DAY) }), false);
  assert.equal(E.inactivityDue(p, { lastTakenIso: null, now: new Date(tap.getTime() + 7 * DAY + 60000) }), true);
  const every3 = goli({ interval_days: 3, created_at: '2026-01-01T08:00:00.000Z', still_going_at: tap.toISOString() });
  assert.equal(E.inactivityDue(every3, { lastTakenIso: null, now: new Date(tap.getTime() + 8 * DAY) }), false, '9 days for every 3 days');
});

// ── SG-22 / SG-29 / DL-112: one question per protocol, one at a time ─────────────────────────────
test('SG-22 / SG-29: the course-end question wins on and after its day; two due → asked one after the other, each once', () => {
  const now = at(2026, 11, 21, 9);
  const a = goli({ id: 1, name: 'A', ends_on: '2026-11-20', created_at: '2026-01-01T08:00:00.000Z' });
  const b = goli({ id: 2, name: 'B', ends_on: '2026-11-20', created_at: '2026-01-01T08:00:00.000Z' });
  const c = goli({ id: 3, name: 'C', created_at: '2026-01-01T08:00:00.000Z' }); // no logs: due for "Still going?"
  let list = [a, b, c];
  const q1 = E.nextTodayQuestion(list, [], now);
  assert.deepEqual([q1.p.name, q1.kind], ['A', 'course_end']);
  list = [{ ...a, active: 0, ended_at: now.toISOString() }, b, c].filter((p) => p.active === 1); // A answered: Encerrar
  const q2 = E.nextTodayQuestion(list, [], now);
  assert.deepEqual([q2.p.name, q2.kind], ['B', 'course_end']);
  list = [{ ...b, ends_on: null, still_going_at: now.toISOString() }, c]; // B answered: Continuar
  const q3 = E.nextTodayQuestion(list, [], now);
  assert.deepEqual([q3.p.name, q3.kind], ['C', 'still_going']);
  list = [list[0], { ...c, still_going_at: now.toISOString() }]; // C answered: Continua
  assert.equal(E.nextTodayQuestion(list, [], now), null, 'nobody is asked twice');
  // A legacy total past its course: the course-end question, never "Still going?" as well.
  const t = goli({ id: 4, schedule_total: 5, created_at: '2026-01-01T08:00:00.000Z' });
  assert.equal(E.nextTodayQuestion([t], [], at(2026, 11, 1)).kind, 'course_end');
});

// ── storage: the write owner ─────────────────────────────────────────────────────────────────────
test('SG-2 / SG-13: setPlannedEnd saves only on or after tomorrow and the start; a clear restarts the span (DL-113)', () => {
  const db = makeDb();
  const id = seed(db, { start_date: '2026-10-03' });
  const now = at(2026, 10, 15, 10);
  assert.equal(E.setPlannedEnd(db, id, '2026-10-15', { now }), false, 'today is too early');
  assert.equal(row(db, id).ends_on, null);
  assert.equal(E.setPlannedEnd(db, id, '2026-10-16', { now }), true);
  assert.equal(row(db, id).ends_on, '2026-10-16');
  assert.equal(row(db, id).sync_status, 'pending');
  assert.equal(row(db, id).status_at, null, 'content, not a status change');
  assert.equal(E.setPlannedEnd(db, id, '2027-01-15', { now }), true, 'moved');
  assert.equal(row(db, id).ends_on, '2027-01-15');
  const fut = seed(db, { start_date: '2026-12-01' });
  assert.equal(E.setPlannedEnd(db, fut, '2026-11-30', { now }), false, 'before a future start');
  assert.equal(E.setPlannedEnd(db, fut, '2026-12-01', { now }), true);
  assert.equal(E.setPlannedEnd(db, id, null, { now }), true, '"Sem data de fim"');
  assert.equal(row(db, id).ends_on, null);
  assert.equal(Date.parse(row(db, id).still_going_at), now.getTime(), 'the span restarts at the tap');
});

test('SG-5 / SG-23: "Continuar" clears the end date and a legacy total, and restarts the span', () => {
  const db = makeDb();
  const id = seed(db, { ends_on: '2026-11-20', schedule_total: 10 });
  const now = at(2026, 11, 20, 21);
  E.continueCourse(db, id, { now });
  const r = row(db, id);
  assert.equal(r.ends_on, null);
  assert.equal(r.schedule_total, null);
  assert.equal(Date.parse(r.still_going_at), now.getTime());
  assert.equal(r.sync_status, 'pending');
});

test('SG-16 / SG-27: "Encerrar" = the one End — Ended, vials off, end date kept; late: dated at the end date, app Missed rows after it go, Taken / Skipped kept', () => {
  const db = makeDb();
  const id = seed(db, { ends_on: '2026-11-20', remote_id: 'r1', sync_status: 'synced' });
  db.runSync(`INSERT INTO vials (user_id, protocol_id, active, created_at, updated_at, sync_status) VALUES (?, ?, 1, 'x', 'x', 'synced')`, [USER, id]);
  log(db, id, 'Taken', at(2026, 11, 20, 20, 1).toISOString());
  log(db, id, 'Missed', at(2026, 11, 22, 20, 0).toISOString());           // synced app row → deleted everywhere
  log(db, id, 'Missed', at(2026, 11, 24, 20, 0).toISOString(), false);    // unsynced → simply goes
  log(db, id, 'Skipped', at(2026, 11, 25, 20, 0).toISOString());          // the user's answer: kept
  const now = at(2026, 12, 2, 10);
  const end = E.endNow(db, id, { now });
  assert.equal(new Date(end).getTime(), new Date(2026, 10, 20, 23, 59, 59).getTime());
  const r = row(db, id);
  assert.equal(r.active, 0);
  assert.equal(r.deleted_at, null);
  assert.equal(r.ended_at, end);
  assert.ok(r.status_at, 'this phone changed the status (A-87)');
  assert.equal(r.ends_on, '2026-11-20', 'the end date stays on the Ended row');
  assert.equal(db.getFirstSync('SELECT active FROM vials WHERE protocol_id = ?', [id]).active, 0);
  const visible = db.getAllSync(`SELECT outcome FROM dose_logs WHERE protocol_id = ? AND sync_status != 'deleted' ORDER BY logged_at`, [id]).map((l) => l.outcome);
  assert.deepEqual(visible, ['Taken', 'Skipped']);
  assert.equal(db.getFirstSync(`SELECT sync_status FROM dose_logs WHERE outcome = 'Missed'`).sync_status, 'deleted');
  // On the end date itself: the tap.
  const db2 = makeDb();
  const id2 = seed(db2, { ends_on: '2026-11-20' });
  const tap = at(2026, 11, 20, 20, 10);
  assert.equal(E.endNow(db2, id2, { now: tap }), tap.toISOString());
  // A late "Continuar" keeps the rows.
  const db3 = makeDb();
  const id3 = seed(db3, { ends_on: '2026-11-20' });
  log(db3, id3, 'Missed', at(2026, 11, 22, 20, 0).toISOString());
  E.continueCourse(db3, id3, { now });
  assert.equal(db3.getFirstSync(`SELECT COUNT(*) AS n FROM dose_logs WHERE sync_status != 'deleted'`).n, 1);
});

test('SG-27: phone B, which pulls the late end, drops its own app-written Missed rows after it too (never a user row)', async () => {
  const cloud = makeCloud();
  const A = makeDb();
  const id = seed(A, { ends_on: '2026-11-20' });
  await pushPending(A, cloud, USER);
  const B = makeDb();
  await fullImport(B, cloud, USER);
  const bid = B.getFirstSync('SELECT id FROM protocols').id;
  log(B, bid, 'Missed', at(2026, 11, 22, 20, 0).toISOString(), false); // B wrote it, not pushed yet
  log(B, bid, 'Taken', at(2026, 11, 26, 20, 0).toISOString(), false);   // a dose B logged: kept
  E.endNow(A, id, { now: at(2026, 12, 2, 10) });
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  assert.equal(row(B, bid).active, 0);
  const outcomes = B.getAllSync(`SELECT outcome FROM dose_logs WHERE sync_status != 'deleted'`).map((l) => l.outcome);
  assert.deepEqual(outcomes, ['Taken']);
});

test('SG-14 / DL-111: a start date after the saved end date is caught before anything is written', () => {
  const p = goli({ ends_on: '2027-01-15' });
  assert.deepEqual(E.startAfterEnd(p, '2027-01-20'), { endKey: '2027-01-15' });
  assert.equal(E.startAfterEnd(p, '2027-01-15'), null, 'the same day is fine');
  assert.equal(E.startAfterEnd(goli(), '2027-01-20'), null, 'no end date: nothing to check');
});

test('SG-7 / SG-20 / DL-114: Restart copies an allow-list — never the end date, the span or history_from; the old row is unchanged', () => {
  const db = makeDb();
  const id = seed(db, { ends_on: '2026-11-20', schedule_total: null });
  db.runSync(`UPDATE protocols SET active = 0, ended_at = '2026-11-20T23:59:59.000Z', history_from = '2026-09-10', still_going_at = '2026-10-01T10:00:00.000Z', note = 'n' WHERE id = ?`, [id]);
  const before = row(db, id);
  const nid = E.restartAsNew(db, id, { nowIso: '2026-12-01T10:00:00.000Z', todayKey: '2026-12-01' });
  const n = row(db, nid);
  assert.equal(n.ends_on, null);
  assert.equal(n.history_from, null);
  assert.equal(n.still_going_at, null);
  assert.equal(n.note, 'n', 'settings are copied');
  assert.equal(n.reminder_time, '20:00');
  assert.equal(n.start_date, '2026-12-01');
  assert.deepEqual(row(db, id), before, 'the ended run is untouched');
  assert.ok(Array.isArray(E.RESTART_COPIED) && !E.RESTART_COPIED.includes('ends_on'));
});

test('SG-20: Restore keeps the end date; a same-day Restore to active whose end date passed is asked on the next Today open', () => {
  const db = makeDb();
  const id = seed(db, { ends_on: '2026-11-20' });
  E.softDeleteRow(db, id, at(2026, 11, 25, 9).toISOString());
  assert.equal(E.restoreDeleted(db, id, at(2026, 11, 25, 10).toISOString()), 'active');
  const r = row(db, id);
  assert.equal(r.ends_on, '2026-11-20');
  const q = E.nextTodayQuestion([r], [], at(2026, 11, 25, 11));
  assert.equal(q && q.kind, 'course_end');
});

// ── sync (SG-7, SG-18, SG-19, SG-21, SG-28) ──────────────────────────────────────────────────────
test('SG-18: ends_on is a regular column — always in the payload, NULL included; not in OPTIONAL_COLUMNS', () => {
  assert.ok(CLOUD_FIELDS.protocols.includes('ends_on'));
  assert.ok(!(OPTIONAL_COLUMNS.protocols || []).includes('ends_on'));
  assert.equal(toCloudPayload('protocols', { name: 'x', ends_on: null }).ends_on, null);
  assert.ok('ends_on' in toCloudPayload('protocols', { name: 'x' }));
  assert.equal(toCloudPayload('protocols', { name: 'x', ends_on: '2027-01-15' }).ends_on, '2027-01-15');
});

test('SG-18: set on A → B shows it and stays silent; cleared on A → B NULL, never asked; a full import brings the latest value', async () => {
  const cloud = makeCloud();
  const A = makeDb();
  const id = seed(A);
  await pushPending(A, cloud, USER);
  const B = makeDb();
  await fullImport(B, cloud, USER);
  const now = at(2026, 10, 15, 10);
  E.setPlannedEnd(A, id, '2027-01-15', { now });
  await pushPending(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  const b = B.getFirstSync('SELECT * FROM protocols');
  assert.equal(b.ends_on, '2027-01-15');
  assert.equal(E.nextTodayQuestion([b], [], at(2026, 12, 20)), null, 'B is silent before the end date');
  const C = makeDb();
  await fullImport(C, cloud, USER);
  assert.equal(C.getFirstSync('SELECT ends_on FROM protocols').ends_on, '2027-01-15', 'reinstall / rebuild from the cloud');
  E.setPlannedEnd(A, id, null, { now });
  await pushPending(A, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, null, 'the clear reaches the cloud');
  await pullChanges(B, cloud, USER);
  const b2 = B.getFirstSync('SELECT * FROM protocols');
  assert.equal(b2.ends_on, null, 'the pulled NULL is written');
  assert.notEqual(E.nextTodayQuestion([b2], [], at(2027, 1, 16)) && E.nextTodayQuestion([b2], [], at(2027, 1, 16)).kind, 'course_end');
  const D = makeDb();
  await fullImport(D, cloud, USER);
  assert.equal(D.getFirstSync('SELECT ends_on FROM protocols').ends_on, null, 'a full import brings "no date" too');
});

const missing = (col) => ({ data: null, error: { code: 'PGRST204', message: `Could not find the '${col}' column of 'protocols' in the schema cache` } });

test('SG-19: before the migration a protocol push never fails; the end date stays on the phone (a pull never erases it) and goes up once the cloud has the column', async () => {
  const cloud = makeCloud();
  let migrated = false;
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  const lacks = (p) => !migrated && ('ends_on' in p || 'still_going_at' in p);
  cloud.insert = async (t, p) => (t === 'protocols' && lacks(p) ? missing('ends_on' in p ? 'ends_on' : 'still_going_at') : ins(t, p));
  cloud.update = async (t, rid, p) => (t === 'protocols' && lacks(p) ? missing('ends_on' in p ? 'ends_on' : 'still_going_at') : upd(t, rid, p));
  const db = makeDb();
  const id = seed(db);
  E.setPlannedEnd(db, id, '2027-01-15', { now: at(2026, 10, 15) });
  await pushPending(db, cloud, USER);
  assert.equal(row(db, id).sync_status, 'synced', 'the push did not fail');
  assert.equal(cloud.rows('protocols', USER).length, 1);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, undefined, 'the cloud has no column yet');
  // The row comes back from the cloud without the column: the local end date stays.
  const c = cloud.rows('protocols', USER)[0];
  cloud._store.protocols.set(c.id, { ...c, name: 'Goli 2', updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).name, 'Goli 2');
  assert.equal(row(db, id).ends_on, '2027-01-15');
  // The founder applies the migration: the column appears as NULL on every row.
  migrated = true;
  for (const r of cloud.rows('protocols', USER)) cloud._store.protocols.set(r.id, { ...r, ends_on: null, still_going_at: null });
  // A pull of that NULL before the re-send must not erase the waiting value.
  const r2 = cloud.rows('protocols', USER)[0];
  cloud._store.protocols.set(r2.id, { ...r2, updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).ends_on, '2027-01-15', 'a value still waiting to go up is never clobbered');
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, '2027-01-15', 're-sent once accepted');
  assert.equal(row(db, id).optional_pending, null);
});

test('SG-19: a NULL pushed before the migration is never re-sent after it (it would erase a date another phone set since)', async () => {
  const cloud = makeCloud();
  let migrated = false;
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  const lacks = (p) => !migrated && ('ends_on' in p || 'still_going_at' in p);
  cloud.insert = async (t, p) => (t === 'protocols' && lacks(p) ? missing('ends_on' in p ? 'ends_on' : 'still_going_at') : ins(t, p));
  cloud.update = async (t, rid, p) => (t === 'protocols' && lacks(p) ? missing('ends_on' in p ? 'ends_on' : 'still_going_at') : upd(t, rid, p));
  const B = makeDb();
  const bid = seed(B); // no end date
  await pushPending(B, cloud, USER);
  assert.equal(row(B, bid).optional_pending, null, 'a NULL waits for nothing');
  // A date set and then cleared before the migration: nothing to clear in the cloud either.
  E.setPlannedEnd(B, bid, '2027-01-15', { now: at(2026, 10, 15) });
  await pushPending(B, cloud, USER);
  assert.equal(row(B, bid).optional_pending, 'ends_on', 'a value waits for the column');
  E.setPlannedEnd(B, bid, null, { now: at(2026, 10, 16) });
  await pushPending(B, cloud, USER);
  assert.equal(row(B, bid).optional_pending, 'still_going_at', 'cleared before it ever went up: the end date waits for nothing (the clear\'s "Still going?" answer does)');
  // The migration; phone A sets a date; phone B syncs (push, then pull) and keeps it.
  migrated = true;
  for (const r of cloud.rows('protocols', USER)) cloud._store.protocols.set(r.id, { ...r, ends_on: null, still_going_at: null });
  const A = makeDb();
  await fullImport(A, cloud, USER);
  const aid = A.getFirstSync('SELECT id FROM protocols').id;
  E.setPlannedEnd(A, aid, '2027-03-01', { now: at(2026, 10, 20) });
  await pushPending(A, cloud, USER);
  await pushPending(B, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].ends_on, '2027-03-01', 'B never sent its old NULL');
  await pullChanges(B, cloud, USER);
  assert.equal(row(B, bid).ends_on, '2027-03-01');
});

test('SG-21: the tombstone push never carries the end date or the span', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const id = seed(db, { ends_on: '2027-01-15' });
  await pushPending(db, cloud, USER);
  const rid = row(db, id).remote_id;
  cloud._store.protocols.delete(rid); // gone before the migration: the tombstone is re-inserted
  E.softDeleteRow(db, id);
  E.purgeProtocol(db, id);
  const seen = [];
  const ins = cloud.insert.bind(cloud);
  cloud.insert = async (t, p) => { seen.push(p); return ins(t, p); };
  await pushPending(db, cloud, USER);
  const tomb = seen.find((p) => p.purged_at);
  assert.ok(tomb, 'tombstone written');
  assert.ok(!('ends_on' in tomb) && !('still_going_at' in tomb));
});

test('SG-21: the migration adds ends_on (date) and still_going_at, nullable, and the purge trigger blanks both', () => {
  const dir = path.join(__dirname, '../supabase/migrations');
  const file = fs.readdirSync(dir).find((n) => /protocol_ends_on/.test(n));
  assert.ok(file, 'migration file');
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /alter table public\.protocols add column if not exists ends_on date;/i);
  assert.match(sql, /alter table public\.protocols add column if not exists still_going_at timestamptz;/i);
  assert.doesNotMatch(sql, /not null default|drop table|drop column|alter column|truncate|security definer/i);
  const fn = sql.slice(sql.indexOf('create or replace function public.protocols_blank_purged()'));
  assert.match(fn, /new\.ends_on := null;/i);
  assert.match(fn, /new\.still_going_at := null;/i);
  assert.match(fn, /new\.history_from := null;/i, 'the earlier blanks are kept');
  assert.match(fn, /new\.compound_id := null;/i);
  assert.match(sql, /create trigger protocols_blank_purged before insert or update on public\.protocols/i);
});

test('SG-28 / DL-117: adding the column rewinds the protocols pull once, so a date set on another phone before this update arrives', async () => {
  const cloud = makeCloud();
  const A = makeDb();
  const id = seed(A);
  await pushPending(A, cloud, USER);
  // Phone B on 1.3.0 (no column) has pulled the row; then A sets an end date and B's old pull moves
  // its watermark past it without the column.
  const B = makeDb();
  B.execSync('ALTER TABLE protocols DROP COLUMN ends_on;');
  B.execSync('ALTER TABLE protocols DROP COLUMN still_going_at;');
  await fullImport(B, cloud, USER);
  E.setPlannedEnd(A, id, '2027-01-15', { now: at(2026, 10, 15) });
  await pushPending(A, cloud, USER);
  const c = cloud.rows('protocols', USER)[0];
  B.runSync(`UPDATE protocols SET updated_at = ? WHERE remote_id = ?`, [c.updated_at, c.id]); // the old pull took it
  // B updates to 1.3.1.
  assert.equal(E.addPlannedEndColumns(B), true);
  assert.equal(E.addPlannedEndColumns(B), false, 'a second start adds nothing');
  let fetches = [];
  const since = cloud.fetchSince.bind(cloud);
  cloud.fetchSince = async (t, u, s) => { if (t === 'protocols') fetches.push(s); return since(t, u, s); };
  await pullChanges(B, cloud, USER);
  assert.equal(B.getFirstSync('SELECT ends_on FROM protocols').ends_on, '2027-01-15');
  assert.equal(fetches[0], null, 'the rewind pulled from the start');
  fetches = [];
  await pullChanges(B, cloud, USER);
  assert.notEqual(fetches[0], null, 'the rewind does not repeat');
});

test('SG-28: the rewind waits while the cloud lacks the column (it would bring nothing)', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const id = seed(B);
  await pushPending(B, cloud, USER);
  B.runSync(`INSERT OR REPLACE INTO local_meta (key, value) VALUES ('pull_rewind:protocols', 'pending')`);
  // The cloud rows carry no ends_on key (not migrated).
  for (const r of cloud.rows('protocols', USER)) { const { ends_on, still_going_at, ...rest } = r; cloud._store.protocols.set(r.id, rest); }
  await pullChanges(B, cloud, USER);
  assert.equal(B.getFirstSync(`SELECT value FROM local_meta WHERE key = 'pull_rewind:protocols'`).value, 'pending');
  for (const r of cloud.rows('protocols', USER)) cloud._store.protocols.set(r.id, { ...r, ends_on: null, still_going_at: null });
  await pullChanges(B, cloud, USER);
  assert.equal(B.getFirstSync(`SELECT value FROM local_meta WHERE key = 'pull_rewind:protocols'`), null, 'done once the column is there');
  assert.ok(row(B, id));
});

// ── SG-11: one reader; nothing else changes with an end date ──────────────────────────────────────
test('SG-11: ends_on appears only in its owners (reader, writer, schema, database, sync, the protocol page)', () => {
  const ROOT = path.join(__dirname, '..');
  const allowed = new Set([
    'lib/schedule.js', 'lib/protocolEnd.js', 'lib/schema.js', 'lib/database.js', 'lib/syncMappers.js', 'lib/syncCore.js',
    'screens/ProtocolsScreen.js',
  ]);
  const hits = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = path.join(dir, n);
      const st = fs.statSync(path.join(ROOT, rel));
      if (st.isDirectory()) walk(rel);
      else if (/\.(js|ts|tsx|jsx)$/.test(n) && /\bends_on\b/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) hits.push(rel);
    }
  };
  for (const d of ['lib', 'screens', 'components', 'supabase/functions']) walk(d);
  if (/\bends_on\b/.test(fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8'))) hits.push('App.js');
  assert.deepEqual(hits.filter((h) => !allowed.has(h)), []);
  // The server push sender never selects it.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'supabase/functions/send-reminders/index.ts'), 'utf8'), /ends_on/);
});

test('SG-4 / SG-11: doses, slots, reminders, Missed rows, rings, streak and the curve are identical with and without an end date', () => {
  const { dueDateKeys } = require('../lib/notificationPlan');
  const { computeMissedDoses } = require('../lib/missedDoses');
  const { scheduledDoses } = require('../lib/serumModel');
  const rings = require('../lib/adherenceRings');
  const { doseStreak } = require('../lib/doseStreak');
  const base = goli({ reminder_time: '08:00', start_date: '2026-11-01', created_at: '2026-10-30T08:00:00.000Z', compound_id: null, dose: '1', dose_unit: 'mg' });
  const withEnd = { ...base, ends_on: '2026-11-20' };
  for (const day of [at(2026, 11, 10), at(2026, 11, 20), at(2026, 11, 28)]) {
    assert.equal(S.expectedDosesOn(withEnd, day), S.expectedDosesOn(base, day));
    assert.deepEqual(S.expectedSlotTimesOn(withEnd, day), S.expectedSlotTimesOn(base, day));
    const key = S.localDayKey(day);
    assert.deepEqual(dueDateKeys(withEnd, key, 14), dueDateKeys(base, key, 14));
  }
  const nowMs = at(2026, 11, 28, 12).getTime();
  const logs = [{ protocol_id: 7, outcome: 'Taken', logged_at: at(2026, 11, 18, 8, 5).toISOString() }];
  const since = at(2026, 10, 30).getTime();
  assert.deepEqual(computeMissedDoses([withEnd], logs, nowMs, since), computeMissedDoses([base], logs, nowMs, since));
  assert.ok(computeMissedDoses([base], logs, nowMs, since).length > 0, 'the comparison has rows');
  const entry = { hours: 24 };
  const start = nowMs - 30 * DAY;
  assert.deepEqual(scheduledDoses(withEnd, entry, start, nowMs + 14 * DAY, nowMs), scheduledDoses(base, entry, start, nowMs + 14 * DAY, nowMs));
  assert.deepEqual(rings.adherenceRings({ protocols: [withEnd], logs, nowMs }), rings.adherenceRings({ protocols: [base], logs, nowMs }));
  const byDay = { [new Date(logs[0].logged_at).toDateString()]: 1 };
  assert.equal(doseStreak(withEnd, byDay, new Date(nowMs)), doseStreak(base, byDay, new Date(nowMs)));
});

test('SG-25: the add / edit wizard and the AI handback never carry the end date', () => {
  const F = require('../lib/protocolForm');
  const p = { ...goli({ ends_on: '2027-01-15', type: 'oral', dose: '1', dose_unit: 'mg' }) };
  const form = F.formFromProtocol(p, null, new Date(2026, 9, 15), 'en');
  assert.ok(!JSON.stringify(form).includes('2027-01-15'));
  const payload = F.protocolPayload(form, () => 'Daily', 'en');
  assert.ok(!('ends_on' in payload));
  assert.deepEqual(F.editPatch(form, form, () => 'Daily', 'en'), {}, 'save with no changes alters nothing');
  // A saved Edit with or without changes leaves the end date as it was (only the patch is written).
  const db = makeDb();
  const id = seed(db, { ends_on: '2027-01-15' });
  const stored = row(db, id);
  const f0 = F.formFromProtocol(stored, null, new Date(2026, 9, 15), 'en');
  const patch = F.editPatch(f0, { ...f0, note: 'changed' }, () => 'Daily', 'en');
  assert.ok(!('ends_on' in patch));
  const keys = Object.keys(patch);
  if (keys.length) db.runSync(`UPDATE protocols SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => patch[k]), id]);
  assert.equal(row(db, id).ends_on, '2027-01-15');
});

test('SG-26: the data export carries the end date; the 30-day report and analytics are unchanged by it', () => {
  const ROOT = path.join(__dirname, '..');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'lib/database.js'), 'utf8');
  assert.match(dbSrc, /for \(const table of exportTableNames\(TABLES\)\) \{\n\s+out\[table\] = db\.getAllSync\(`SELECT \* FROM \$\{table\} WHERE user_id = \? AND sync_status != 'deleted'`, \[userId\]\);/, 'every column of protocols');
  const { exportTableNames } = require('../lib/exportTables');
  const { TABLES } = require('../lib/syncCore');
  assert.ok(exportTableNames(TABLES).includes('protocols'));
  const db = makeDb();
  const id = seed(db, { ends_on: '2027-01-15' });
  assert.equal(db.getFirstSync(`SELECT * FROM protocols WHERE user_id = ? AND sync_status != 'deleted'`, [USER]).ends_on, '2027-01-15');
  // The report: the same protocols and the same counts with and without the end date.
  const { adherenceStats } = require('../lib/adherenceReport');
  const p = row(db, id);
  const q = { ...p, ends_on: null };
  const logs = [{ protocol_id: id, outcome: 'Taken', logged_at: '2026-09-10T20:00:00.000Z' }, { protocol_id: id, outcome: 'Missed', logged_at: '2026-09-11T20:00:00.000Z' }];
  const args = { logs, sinceMs: Date.parse('2026-09-01T00:00:00Z'), nowMs: Date.parse('2026-09-30T00:00:00Z') };
  assert.deepEqual(adherenceStats({ protocols: [p], ...args }), adherenceStats({ protocols: [q], ...args }));
  assert.equal(E.reportProtocols([p], logs, args.sinceMs, args.nowMs).length, E.reportProtocols([q], logs, args.sinceMs, args.nowMs).length);
  // No analytics event names or carries it.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'lib/analytics.js'), 'utf8'), /ends_on|planned_end|end_date/);
});
