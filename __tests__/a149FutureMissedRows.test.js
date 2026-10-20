'use strict';
// A-149 (Fold device test of build 52, 2026-10-17): with the phone set to 25/10 the missed-dose scan
// wrote Missed rows for the days up to 25/10; after the clock was put back they stayed in the Dose
// log as missed doses on days that had not come yet. The rule:
//   1. the scan writes a Missed row only for a slot at least LATE_MS (12 h) old, and only the scan
//      writes Missed rows (the Dose log can only turn one into Taken / Skipped or keep it), so a
//      Missed row dated later than now − 12 h was written while the clock was ahead: the next scan
//      removes it (pushed to the cloud like the A-123 cleanup);
//   2. Taken / Skipped rows dated ahead are the user's and are never touched (A-145 keeps them out
//      of Today); a real Missed row 12 h or more old stays;
//   3. once the day really comes and the slot is 12 h old with nothing logged, the scan writes it
//      again — nothing is lost, the row only waits for its real time.
// Behaviour runs the REAL scanMissedDoses and the REAL lib/database.js reads/writes over the sync
// harness (in-memory SQLite + fake cloud, real lib/syncCore push).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending } = require('../lib/syncCore');
const MD = require('../lib/missedDoses');
const PE = require('../lib/protocolEnd');
const { loadFn } = require('./helpers/extractFn');

const USER = 'u1';
const H = 3600000;
const DAY = 24 * H;

function at(daysBack, h, m = 0) { const d = new Date(); d.setDate(d.getDate() - daysBack); d.setHours(h, m, 0, 0); return d; }
const iso = (d) => d.toISOString();
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function seedProtocol(db, cloud) {
  const created = at(30, 7);
  const p = await cloud.insert('protocols', { user_id: USER, name: 'Zinco', type: 'oral', active: true, reminder_time: '16:00', doses_per_day: 1, interval_days: 1, start_date: dayKey(created), created_at: iso(created) });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES (?, ?, 'Zinco', 'oral', '#185FA5', '16:00', 1, 1, ?, 1, ?, ?, 'synced')`, [p.data.id, USER, dayKey(created), iso(created), p.data.updated_at]);
  return { pid: db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id, remote: p.data.id };
}
// A row on this phone and in the cloud (written by an earlier scan / dose, pushed). The local copy
// keeps the cloud's stamp, which the server sets to its own time (the harness counts instead).
async function syncedRow(db, cloud, p, outcome, when) {
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.remote, outcome, logged_at: iso(when) });
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [l.data.id, USER, p.pid, p.remote, outcome, iso(when), iso(new Date())]);
  return db.getFirstSync('SELECT id FROM dose_logs WHERE remote_id = ?', [l.data.id]).id;
}
// A row written on this phone and not pushed yet.
function localRow(db, p, outcome, when) {
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [USER, p.pid, p.remote, outcome, iso(when), iso(new Date())]);
}
const live = (db, outcome) => db.getAllSync(`SELECT * FROM dose_logs WHERE outcome = ? AND sync_status != 'deleted' ORDER BY logged_at`, [outcome]).map((r) => r.logged_at);

function scanner(db) {
  const dbDeps = { getDB: () => db, PE };
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, dbDeps);
  return loadFn('lib/doseActions.js', 'export async function scanMissedDoses(', 'scanMissedDoses', {
    ...MD,
    getActiveProtocols: fromDb('getActiveProtocols'),
    getEndedProtocols: fromDb('getEndedProtocols'),
    getLogsSince: fromDb('getLogsSince'),
    observeSchedules: async (userId, protocols) => Object.fromEntries(protocols.map((p) => [p.id, at(30, 7).getTime()])),
    insertDoseLog: fromDb('insertDoseLog'),
    deleteDoseLog: fromDb('deleteDoseLog'),
    getCachedUser: async () => ({ id: USER }),
    getMissedWatermark: async () => ({ sinceMs: at(20, 0).getTime(), zoneHistory: null }),
    firstSyncGate: { whenOpen: async () => {}, whenOpenWithin: async () => true },
    MISSED_LOOKBACK_DAYS: 14,
    _missedScanInFlight: false,
  });
}

// Today 16:00 is in the past or the future depending on when the suite runs; the rows below are
// placed relative to now so every run sees the same picture.
test('A-149 (1): Missed rows a clock days ahead left on slots not yet due are removed, also from the cloud', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const p = await seedProtocol(db, cloud);
  const now = Date.now();
  // The clock was ahead: the scan wrote Missed for the next days and for a slot of the last 12 h.
  for (const d of [1, 2, 3, 4, 5]) await syncedRow(db, cloud, p, 'Missed', new Date(now + d * DAY));
  await syncedRow(db, cloud, p, 'Missed', new Date(now - 3 * H));
  localRow(db, p, 'Missed', new Date(now + 6 * DAY)); // written but not pushed yet
  // Real history: every day of the last 2 weeks has a dose (Taken), except 2 days ago (a real miss).
  for (let back = 1; back <= 14; back++) {
    if (back === 2) await syncedRow(db, cloud, p, 'Missed', at(2, 16));
    else await syncedRow(db, cloud, p, 'Taken', at(back, 16, 5));
  }
  const n = await scanner(db)();
  assert.equal(live(db, 'Missed').length, 1, 'only the real miss of 2 days ago stays');
  assert.equal(live(db, 'Missed')[0], iso(at(2, 16)));
  assert.equal(n, 7, 'the 7 removed rows count, so the caller syncs');
  await pushPending(db, cloud, USER);
  const cloudMissed = cloud.rows('dose_logs').filter((r) => r.outcome === 'Missed');
  assert.equal(cloudMissed.length, 1, 'the removal reaches the cloud: the next import cannot bring them back');
});

test('A-149 (2): Taken / Skipped rows dated ahead are the user\'s and stay', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const p = await seedProtocol(db, cloud);
  const now = Date.now();
  await syncedRow(db, cloud, p, 'Taken', new Date(now + 19 * H));
  await syncedRow(db, cloud, p, 'Skipped', new Date(now + 2 * DAY));
  await syncedRow(db, cloud, p, 'Missed', new Date(now + 1 * DAY));
  await scanner(db)();
  assert.equal(live(db, 'Taken').length, 1);
  assert.equal(live(db, 'Skipped').length, 1);
  assert.equal(live(db, 'Missed').filter((t) => Date.parse(t) > now).length, 0);
});

test('A-149 (3): pure rule — only Missed rows later than now − 12 h; a real 12 h-old miss stays', () => {
  const now = Date.UTC(2026, 9, 17, 12, 0);
  const rows = [
    { id: 1, outcome: 'Missed', logged_at: new Date(now + 8 * DAY).toISOString() },
    { id: 2, outcome: 'Missed', logged_at: new Date(now - 11 * H).toISOString() },
    { id: 3, outcome: 'Missed', logged_at: new Date(now - 12 * H).toISOString() },
    { id: 4, outcome: 'Missed', logged_at: new Date(now - 3 * DAY).toISOString() },
    { id: 5, outcome: 'Taken', logged_at: new Date(now + DAY).toISOString() },
    { id: 6, outcome: 'Skipped', logged_at: new Date(now + DAY).toISOString() },
    { id: 7, outcome: 'Missed', logged_at: 'not a date' },
  ];
  assert.deepEqual(MD.notYetDueMissedRows(rows, now).map((r) => r.id), [1, 2]);
  assert.deepEqual(MD.notYetDueMissedRows(null, now), []);
});

test('A-149 (4): when the day really comes and the slot is 12 h old with nothing logged, the scan writes it again', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const p = await seedProtocol(db, cloud);
  await syncedRow(db, cloud, p, 'Missed', new Date(Date.now() + 2 * H)); // left by a clock ahead
  for (let back = 2; back <= 14; back++) await syncedRow(db, cloud, p, 'Taken', at(back, 16, 5));
  await scanner(db)();
  // Yesterday 16:00 had nothing logged: once it is 12 h old the scan's normal rule writes it (before
  // 04:00 it is not 12 h old yet, and nothing is written — the suite can run at any hour).
  const due = Date.now() - at(1, 16).getTime() >= 12 * H;
  assert.deepEqual(live(db, 'Missed'), due ? [iso(at(1, 16))] : []);
});

// A clock put BACK (behind) must not make real rows look ahead. The cloud stamps updated_at itself
// (dose_logs: default now(), moddatetime trigger; the app never sends it, lib/syncMappers), so the
// newest stamp on a synced row is a time that has certainly passed: "now" is at least that.
test('A-149 (5): a phone clock days BEHIND keeps the real Missed rows (the cloud stamps set the floor of now)', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const p = await seedProtocol(db, cloud);
  await syncedRow(db, cloud, p, 'Missed', at(2, 16));
  await syncedRow(db, cloud, p, 'Missed', at(3, 16));
  for (const back of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) await syncedRow(db, cloud, p, 'Taken', at(back, 16, 5));
  const realNow = Date.now;
  Date.now = () => realNow() - 4 * DAY; // the phone set 4 days back
  try { await scanner(db)(); } finally { Date.now = realNow; }
  const missed = live(db, 'Missed');
  assert.ok(missed.includes(iso(at(2, 16))) && missed.includes(iso(at(3, 16))), 'the real misses stay');
});

test('A-149 (6): serverConfirmedNow = the later of the device clock and the newest cloud stamp on a synced row', () => {
  const now = Date.UTC(2026, 9, 17, 12, 0);
  const rows = [
    { sync_status: 'synced', updated_at: new Date(now + 3 * DAY).toISOString() },
    { sync_status: 'pending', updated_at: new Date(now + 9 * DAY).toISOString() }, // device clock: proves nothing
    { sync_status: 'synced', updated_at: 'bad' },
  ];
  assert.equal(MD.serverConfirmedNow(rows, now), now + 3 * DAY);
  assert.equal(MD.serverConfirmedNow([], now), now);
  assert.equal(MD.serverConfirmedNow([{ sync_status: 'synced', updated_at: new Date(now - DAY).toISOString() }], now), now);
});

// Gate B review of A-149: a row never pushed carries the phone's own stamp, so with a clock put back
// nothing proves it was written early. It goes only where the scan can write it again (an active
// protocol); a pending Missed row of an ended protocol stays (never destroy on a maybe).
test('A-149 (7): clock BEHIND, a pending real Missed row of an ENDED protocol stays', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  await seedProtocol(db, cloud);
  const created = at(30, 7);
  db.runSync(`INSERT INTO protocols (user_id, name, type, color, reminder_time, doses_per_day, interval_days, start_date, active, ended_at, created_at, updated_at, sync_status)
    VALUES (?, 'Vit C', 'oral', '#185FA5', '20:00', 1, 1, ?, 0, ?, ?, ?, 'pending')`, [USER, dayKey(created), iso(at(1, 0)), iso(created), iso(created)]);
  const ended = { pid: db.getFirstSync(`SELECT id FROM protocols WHERE name = 'Vit C'`).id, remote: null };
  localRow(db, ended, 'Missed', at(2, 20));
  const realNow = Date.now;
  Date.now = () => realNow() - 4 * DAY; // the phone set 4 days back, offline (nothing synced proves the time)
  try { await scanner(db)(); } finally { Date.now = realNow; }
  assert.ok(live(db, 'Missed').includes(iso(at(2, 20))), 'the ended protocol\'s real miss is kept: the scan could never write it back');
});
