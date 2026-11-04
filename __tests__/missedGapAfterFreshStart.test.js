'use strict';
// Missed doses after a phone starts again from the server's data (founder 2026-11-03 21:42 EST, hello@ on
// Android 1.3.1: after a sign-in on the phone, the Dose log showed NOTHING between 2026-10-24 and 2026-11-03,
// for every protocol; the weekly 2026-10-26 and 2026-11-02 doses could not be found or marked anywhere).
// Founder 2026-11-03 21:50 EST (docs/decisions.md "A late dose is recorded on the day it was due") and
// ~22:05 EST: "se removerem o aplicativo, ao reinstalar a conta tem que puxar sim as doses perdidas" — a
// reinstall, a sign-out then sign-in, a device takeover and a new phone must all show every unlogged slot of
// the scan's 14-day window (US-8) as Missed, markable at its own date, exactly as if the person never left.
//
// Root cause (as built): when the phone holds no Missed-scan start (dosetrace_missed_since — removed on the
// intended sign-out by lib/accountKeys DV-081, gone on a reinstall / new phone), lib/doseActions
// getMissedWatermark starts the scan at NOW (lib/missedDoses missedScanWatermark `base = ... : nowMs`); and on
// the first sight of a protocol without a ledger entry the schedule ledger (lib/missedDoses noteSchedules,
// DV-244) also answers "known since NOW". computeMissedDoses then refuses every past slot (slotMs >= sinceMs,
// slotMs >= scheduleFrom), so the gap gets no Missed row, and nothing else on the phone offers those slots
// (Pending from yesterday ends at slot + 12 h; Today and My Protocols offer only today's slot).
//
// Runs the REAL scanMissedDoses, getMissedWatermark and observeSchedules (lib/doseActions.js) and the REAL
// lib/database.js reads / writes over the sync harness (in-memory SQLite), with the clock fixed at
// 2026-11-03 21:40 local. Synthetic account (not the founder's). Works in any time zone: every time is local.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const MD = require('../lib/missedDoses');
const PE = require('../lib/protocolEnd');
const H = require('../lib/zoneHistory');
const Z = require('../lib/zoneTime');
const { planMarkTaken, markTakenDay } = require('../lib/markTaken');
const { pendingFromYesterday } = require('../lib/pendingYesterday');
const { cardPlan } = require('../lib/dosePageState');
const { protocolTakeAction } = require('../lib/protocolTake');

const USER = 'u-gap';
const HOUR = 3600000;
const DAY = 86400000;
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0); // local time
const NOW = L(2026, 11, 3, 21, 40).getTime();
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } })();

// The clock the loaded app functions see.
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}

// The account as the server holds it (and as a rebuild / full import writes it on the phone, synced):
//  - "Weekly": every 7 days from 2026-09-21 at 21:00, last dose Taken at its 2026-10-19 21:00 slot;
//  - "Daily": every day at 21:00, Taken at its slot 2026-10-20 … 2026-10-24, nothing after.
function seedAccount(db, { protocolUpdatedAt }) {
  const created = L(2026, 9, 15, 0, 45).toISOString();
  const add = (name, interval, type, start, remote) => {
    db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, ?, '#185FA5', '5', 'mg', '21:00', 1, ?, ?, 1, ?, ?, 'synced')`, [remote, USER, name, type, interval, start, created, protocolUpdatedAt]);
    return { id: db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [remote]).id, remote };
  };
  const weekly = add('Weekly', 7, 'recon', '2026-09-21', 'r-weekly');
  const daily = add('Daily', 1, 'oral', '2026-09-10', 'r-daily');
  let n = 0;
  const row = (p, outcome, when) => db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`, [`r-log-${++n}`, USER, p.id, p.remote, outcome, when.toISOString(), '2026-10-25T12:58:55.000Z']);
  row(weekly, 'Taken', L(2026, 10, 19, 21));
  for (let d = 20; d <= 24; d++) row(daily, 'Taken', L(2026, 10, d, 21));
  return { weekly, daily };
}

// What the phone's own storage holds when the scan first runs.
function storage(entries = {}) {
  const store = new Map(Object.entries(entries));
  return {
    store,
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    setItem: async (k, v) => { store.set(k, v); },
    multiGet: async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null]),
    multiSet: async (pairs) => { for (const [k, v] of pairs) store.set(k, v); },
  };
}

// The real scan of this phone: lib/doseActions.js scanMissedDoses with its real watermark and schedule
// ledger over `AsyncStorage`; the dose_logs pull is known good (the rebuild / import just finished).
function phone(db, AsyncStorage) {
  const dbDeps = { getDB: () => db, PE };
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, dbDeps);
  const getMissedWatermark = loadFn('lib/doseActions.js', 'export async function getMissedWatermark(', 'getMissedWatermark', {
    AsyncStorage, missedScanWatermark: MD.missedScanWatermark, deviceTimeZone: () => TZ, H, Z, Date: FakeDate, MISSED_LOOKBACK_DAYS: 14,
    MISSED_SINCE_KEY: 'dosetrace_missed_since', MISSED_TZ_KEY: 'dosetrace_missed_tz', MISSED_TZ_SINCE_KEY: 'dosetrace_missed_tz_since', ZONE_HISTORY_KEY: 'dosetrace_zone_history',
  });
  const observeSchedules = loadFn('lib/doseActions.js', 'export async function observeSchedules(', 'observeSchedules', {
    AsyncStorage, noteSchedules: MD.noteSchedules, SCHEDULE_SEEN_KEY: 'dosetrace_missed_schedule_seen',
  });
  const scan = loadFn('lib/doseActions.js', 'export async function scanMissedDoses(', 'scanMissedDoses', {
    ...MD,
    Date: FakeDate,
    getActiveProtocols: fromDb('getActiveProtocols'),
    getEndedProtocols: fromDb('getEndedProtocols'),
    getLogsSince: fromDb('getLogsSince'),
    insertDoseLog: fromDb('insertDoseLog'),
    deleteDoseLog: fromDb('deleteDoseLog'),
    observeSchedules,
    getMissedWatermark,
    getCachedUser: async () => ({ id: USER }),
    firstSyncGate: { whenOpen: async () => true, whenOpenWithin: async () => true },
    MISSED_LOOKBACK_DAYS: 14,
    FALSE_MISSED_LOOKBACK_DAYS: 60,
    AsyncStorage,
    readDoseLogsPull: async () => NOW - 60 * 1000,
    _missedScanInFlight: false,
    heldMissedSlots: require('../lib/unsyncedDoses').heldMissedSlots,
    _lastHeld: null,
  });
  return { scan, fromDb };
}

const missedOf = (db, p) => db.getAllSync(`SELECT logged_at FROM dose_logs WHERE protocol_id = ? AND outcome = 'Missed' AND sync_status != 'deleted' ORDER BY logged_at`, [p.id])
  .map((r) => r.logged_at);
// The unlogged slots of the 14-day window (2026-10-20 … 2026-11-02; 2026-11-03 21:00 is not 12 h old yet).
const WEEKLY_GAP = [L(2026, 10, 26, 21), L(2026, 11, 2, 21)].map((d) => d.toISOString());
const DAILY_GAP = [25, 26, 27, 28, 29, 30, 31].map((d) => L(2026, 10, d, 21)).concat([L(2026, 11, 1, 21), L(2026, 11, 2, 21)]).map((d) => d.toISOString());

// The phone's storage before the scan, per way of starting again. A ledger entry as the scan writes it
// (lib/missedDoses noteSchedules), first seen when the protocol was set up.
function ledgerFor(db) {
  const out = {};
  for (const p of db.getAllSync('SELECT * FROM protocols')) out[`${USER}|r:${p.remote_id}`] = { fp: MD.scheduleFingerprint(p), sinceMs: L(2026, 9, 15, 1).getTime(), changed: false };
  return JSON.stringify(out);
}
const OLD_ZONES = TZ ? JSON.stringify([{ tz: TZ, sinceMs: L(2026, 9, 1).getTime() }]) : null;
const CASES = {
  // Control: the same phone, signed in all along (its own scan start from September, ledger, zones).
  'never left': (db) => storage({ dosetrace_missed_since: String(L(2026, 9, 15, 1).getTime()), ...(TZ ? { dosetrace_missed_tz: TZ, dosetrace_zone_history: OLD_ZONES } : {}), dosetrace_missed_schedule_seen: ledgerFor(db) }),
  // App removed and installed again: the phone's storage is empty.
  reinstall: () => storage({}),
  // Intended sign-out, then sign-in: the account keys went (DV-081, lib/accountKeys); per-phone keys stay.
  'sign-out then sign-in': (db) => storage({ ...(TZ ? { dosetrace_zone_history: OLD_ZONES } : {}), dosetrace_missed_schedule_seen: ledgerFor(db) }),
  // Device takeover right after signing in (the founder's case): account keys gone, and the first sync
  // after the takeover re-sent every protocol (production 2026-11-04 02:40 UTC), so updated_at is now.
  'device takeover after sign-in': (db) => storage({ ...(TZ ? { dosetrace_zone_history: OLD_ZONES } : {}) }),
  // A new phone: nothing on it.
  'new phone': () => storage({}),
};
const BUMPED = new Set(['device takeover after sign-in', 'new phone']);

for (const [name, makeStorage] of Object.entries(CASES)) {
  test(`fresh start from the server — ${name}: every unlogged slot of the 14-day window becomes Missed at its own time`, async () => {
    const db = makeDb();
    const { weekly, daily } = seedAccount(db, { protocolUpdatedAt: BUMPED.has(name) ? new Date(NOW - 2 * 60 * 1000).toISOString() : L(2026, 10, 1, 12).toISOString() });
    const { scan } = phone(db, makeStorage(db));
    await scan();
    assert.deepEqual(missedOf(db, weekly), WEEKLY_GAP, 'weekly: the 2026-10-26 and 2026-11-02 doses');
    assert.deepEqual(missedOf(db, daily), DAILY_GAP, 'daily: 2026-10-25 … 2026-11-02');
  });
}

test('fresh start (reinstall): each gap slot is marked taken from the Dose log at ITS OWN date and time, one dose each', async () => {
  const db = makeDb();
  const { weekly } = seedAccount(db, { protocolUpdatedAt: L(2026, 10, 1, 12).toISOString() });
  const { scan, fromDb } = phone(db, storage({}));
  await scan();
  const recordDoseTaken = loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', {
    Date: FakeDate, planMarkTaken, markTakenDay,
    getProtocolById: fromDb('getProtocolById'), getActiveVials: fromDb('getActiveVials'), getLogsSince: fromDb('getLogsSince'),
    insertDoseLog: fromDb('insertDoseLog'), updateDoseLog: fromDb('updateDoseLog'), updateVial: fromDb('updateVial'), updateProtocol: fromDb('updateProtocol'),
    doseLogBySourceKey: () => null, recordDoseTapKey: () => {},
  });
  // The Dose log's Missed line → "Mark complete" (screens/LogScreen.js markRowTaken: the row named, its day and slot).
  for (const slotIso of WEEKLY_GAP) {
    const row = db.getFirstSync(`SELECT * FROM dose_logs WHERE protocol_id = ? AND logged_at = ? AND outcome = 'Missed'`, [weekly.id, slotIso]);
    assert.ok(row, `the Dose log has a line for ${slotIso}`);
    const at = Date.parse(row.logged_at);
    const d = new Date(at);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const res = recordDoseTaken(weekly.id, { dayKey, slotMs: at, flipRowId: row.id, pastEnded: true });
    assert.ok(res && res.logId === row.id && res.flipped, 'that very row becomes the dose');
  }
  const taken = db.getAllSync(`SELECT logged_at FROM dose_logs WHERE protocol_id = ? AND outcome = 'Taken' AND sync_status != 'deleted' ORDER BY logged_at`, [weekly.id]).map((r) => r.logged_at);
  assert.deepEqual(taken, [L(2026, 10, 19, 21).toISOString(), ...WEEKLY_GAP], 'three doses at their slots; never the tap time, never the 10-19 row');
});

// Behaviour that already holds (guards for the fix).
test('marking the already-Taken 2026-10-19 dose again writes nothing (DV-227 "day full" sheet; DL-76 cap)', () => {
  const protocol = { id: 1, user_id: USER, doses_per_day: 1, interval_days: 7, reminder_time: '21:00', start_date: '2026-09-21', type: 'recon' };
  const row = { id: 7, protocol_id: 1, outcome: 'Taken', logged_at: L(2026, 10, 19, 21).toISOString() };
  const plan = planMarkTaken({ protocol, todayLogs: [row], dayKey: '2026-10-19', slotMs: Date.parse(row.logged_at), flipRowId: 7, nowMs: NOW });
  assert.equal(plan.alreadyTaken, true);
  assert.equal(plan.insert, null);
  assert.equal(plan.update, null);
});

test('today nothing else offers the gap slots: Pending from yesterday ends at slot + 12 h, Today and My Protocols offer only today', () => {
  const protocol = { id: 1, user_id: USER, doses_per_day: 1, interval_days: 7, reminder_time: '21:00', start_date: '2026-09-21', created_at: L(2026, 9, 15).toISOString(), type: 'recon', active: 1 };
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: L(2026, 10, 19, 21).toISOString() }];
  assert.deepEqual(pendingFromYesterday({ protocols: [protocol], logs, nowMs: NOW }), [], '2026-11-02 21:00 + 12 h has passed');
  assert.equal(cardPlan({ protocol, logs, nowMs: NOW }).next, null, 'no slot today (a rest day of the weekly protocol)');
  assert.equal(protocolTakeAction({ protocol, todayLogs: logs, pending: [], nowMs: NOW }), null, 'My Protocols shows no Mark complete');
  // So the Dose log's Missed line is the only way to a past slot: the scan has to write it.
  assert.ok(NOW - L(2026, 11, 2, 21).getTime() > 12 * HOUR && NOW - L(2026, 10, 26, 21).getTime() < 14 * DAY);
});
