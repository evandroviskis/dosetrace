'use strict';
// A-51 — time-zone-safe slots, the full fix for A-49 (S-19 only skipped the days before the
// last zone change). Past slots are rebuilt in the zone the device was in ON THAT DAY: the
// device keeps a short zone history ({ tz, sinceMs }, lib/zoneHistory), each interval's slots
// are built in its own zone (lib/zoneTime, Intl), and a slot exists only inside the interval
// of the zone it was built in — what Today and the reminders showed at the time. No synced
// column is needed: the zone of a day WITHOUT a dose (the very days the scan judges) is known
// only to the device that was there; a zone stored on each log says nothing about those days.
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../lib/zoneTime');
const H = require('../lib/zoneHistory');
const { computeMissedDoses } = require('../lib/missedDoses');
const { pendingFromYesterday } = require('../lib/pendingYesterday');

const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';
const withTz = (tz, fn) => { const prev = process.env.TZ; process.env.TZ = tz; try { return fn(); } finally { process.env.TZ = prev; } };

test('wall time in a zone ↔ the instant (incl. a DST day)', () => {
  assert.equal(Z.wallToEpoch(NY, 2026, 9, 25, 8, 0), Date.parse('2026-09-25T12:00:00Z'));
  assert.equal(Z.wallToEpoch(TOKYO, 2026, 9, 25, 8, 0), Date.parse('2026-09-24T23:00:00Z'));
  assert.equal(Z.wallToEpoch(NY, 2026, 11, 2, 8, 0), Date.parse('2026-11-02T13:00:00Z'), 'after the US clock change');
  assert.deepEqual(Z.wallParts(TOKYO, Date.parse('2026-09-24T23:00:00Z')), { y: 2026, m: 9, d: 25, h: 8, min: 0 });
  assert.equal(Z.wallToEpoch(null, 2026, 9, 25, 8, 0), new Date(2026, 8, 25, 8, 0).getTime(), 'no zone → device local');
});

test('this engine converts named zones (the history is used only then)', () => {
  assert.equal(Z.zonesWork(), true);
});

test('the zone history: a change is appended, the same zone is not, old entries are pruned', () => {
  let h = H.recordZone([], NY, 1000);
  h = H.recordZone(h, NY, 2000);
  assert.deepEqual(h, [{ tz: NY, sinceMs: 1000 }]);
  h = H.recordZone(h, TOKYO, 5000);
  assert.deepEqual(h, [{ tz: NY, sinceMs: 1000 }, { tz: TOKYO, sinceMs: 5000 }]);
  assert.equal(H.zoneAt(h, 999), null, 'before the history: unknown');
  assert.equal(H.zoneAt(h, 4999), NY);
  assert.equal(H.zoneAt(h, 5000), TOKYO);
  const day = 86400000;
  const long = [{ tz: 'A', sinceMs: 0 }, { tz: 'B', sinceMs: 10 * day }, { tz: 'C', sinceMs: 50 * day }];
  assert.deepEqual(H.prune(long, 60 * day, 30 * day), [{ tz: 'B', sinceMs: 10 * day }, { tz: 'C', sinceMs: 50 * day }], 'keeps the zone in force at the cut-off');
  assert.equal(H.recordZone(h, null, 9000), h, 'no zone name → unchanged');
});

test('the history after the update: S-19\'s stored zone seeds it, then a change appends', () => {
  const base = Date.parse('2026-09-21T00:00:00Z');
  assert.deepEqual(H.seedHistory({ stored: null, storedTz: NY, storedTzSinceMs: null, storedSinceMs: base, currentTz: NY, nowMs: base + 5e8 }), [{ tz: NY, sinceMs: base }]);
  assert.deepEqual(H.seedHistory({ stored: null, storedTz: NY, storedTzSinceMs: base + 1e8, storedSinceMs: base, currentTz: NY, nowMs: base + 5e8 }), [{ tz: NY, sinceMs: base + 1e8 }], 'zone known only since its last change');
  assert.deepEqual(H.seedHistory({ stored: null, storedTz: null, storedTzSinceMs: null, storedSinceMs: NaN, currentTz: TOKYO, nowMs: 77 }), [{ tz: TOKYO, sinceMs: 77 }], 'first run ever');
  const kept = [{ tz: NY, sinceMs: 5 }];
  assert.deepEqual(H.seedHistory({ stored: kept, currentTz: NY, nowMs: 9 }), kept);
});

// Daily 08:00. In New York Sep 15–26 (logged 08:00 NY each day, except Sep 24 — a real miss),
// flew to Tokyo on Sep 26 at 15:00 NY (19:00Z); logs 08:00 Tokyo from Sep 28. Now: Sep 30 12:00 Tokyo.
const p = { id: 9, user_id: 'u1', start_date: '2026-09-15', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-14T12:00:00.000Z' };
const flight = Date.parse('2026-09-26T19:00:00Z');
const history = [{ tz: NY, sinceMs: Date.parse('2026-09-10T00:00:00Z') }, { tz: TOKYO, sinceMs: flight }];
function travelLogs() {
  const logs = [];
  for (let d = 15; d <= 26; d++) if (d !== 24) logs.push({ protocol_id: 9, outcome: 'Taken', logged_at: new Date(Z.wallToEpoch(NY, 2026, 9, d, 8, 2)).toISOString() });
  for (let d = 28; d <= 30; d++) logs.push({ protocol_id: 9, outcome: 'Taken', logged_at: new Date(Z.wallToEpoch(TOKYO, 2026, 9, d, 8, 1)).toISOString() });
  return logs;
}

test('NY logs, device now in Tokyo: no false Missed; the real misses are found in the zone of their day', () => {
  const now = Z.wallToEpoch(TOKYO, 2026, 9, 30, 12, 0);
  const since = Date.parse('2026-09-15T00:00:00Z');
  const missed = withTz(TOKYO, () => computeMissedDoses([p], travelLogs(), now, since, { lookbackDays: 14, zoneHistory: history }));
  const at = missed.map((m) => new Date(m.scheduledAtMs).toISOString()).sort();
  assert.deepEqual(at, [
    new Date(Z.wallToEpoch(NY, 2026, 9, 24, 8, 0)).toISOString(), // the real miss in New York, at 08:00 New York
    new Date(Z.wallToEpoch(TOKYO, 2026, 9, 27, 8, 0)).toISOString(), // the first Tokyo morning, not logged
  ]);
});

test('A-49 case (20:00 New York doses, phone now in Tokyo): no false rows, and the days before the change are still judged', () => {
  const logs = [];
  for (let d = 21; d <= 27; d++) logs.push({ protocol_id: 9, outcome: 'Taken', logged_at: `2026-09-${d}T00:00:00.000Z` });
  const q = { id: 9, user_id: 'u1', start_date: '2026-09-20', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: '2026-09-19T12:00:00.000Z' };
  const nowTokyo = Date.parse('2026-09-28T12:00:00.000Z');
  const h = [{ tz: NY, sinceMs: Date.parse('2026-09-21T00:00:00.000Z') }, { tz: TOKYO, sinceMs: nowTokyo - 3600000 }];
  const since = Date.parse('2026-09-21T00:00:00.000Z');
  assert.deepEqual(withTz(TOKYO, () => computeMissedDoses([q], logs, nowTokyo, since, { lookbackDays: 6, zoneHistory: h })), []);
  const gap = logs.filter((l) => l.logged_at !== '2026-09-24T00:00:00.000Z'); // Sep 23 20:00 NY not logged
  const real = withTz(TOKYO, () => computeMissedDoses([q], gap, nowTokyo, since, { lookbackDays: 6, zoneHistory: h }));
  assert.deepEqual(real.map((m) => m.scheduledAtMs), [Date.parse('2026-09-24T00:00:00.000Z')], 'a real miss before the change is still found (S-19 skipped it)');
});

test('the same history scanned on a device still set to New York gives the same rows (the zone comes from the history)', () => {
  const now = Z.wallToEpoch(TOKYO, 2026, 9, 30, 12, 0);
  const since = Date.parse('2026-09-15T00:00:00Z');
  const a = withTz(TOKYO, () => computeMissedDoses([p], travelLogs(), now, since, { lookbackDays: 14, zoneHistory: history }));
  const b = withTz(NY, () => computeMissedDoses([p], travelLogs(), now, since, { lookbackDays: 14, zoneHistory: history }));
  assert.deepEqual(b.map((m) => m.scheduledAtMs).sort(), a.map((m) => m.scheduledAtMs).sort());
});

test('nothing is judged before the history starts (unknown zone)', () => {
  const now = Z.wallToEpoch(TOKYO, 2026, 9, 30, 12, 0);
  const h = [{ tz: TOKYO, sinceMs: flight }];
  const missed = withTz(TOKYO, () => computeMissedDoses([p], [], now, Date.parse('2026-09-15T00:00:00Z'), { lookbackDays: 14, zoneHistory: h }));
  assert.ok(missed.length > 0);
  assert.ok(missed.every((m) => m.scheduledAtMs >= flight));
});

test('Pending from yesterday after the flight: yesterday\'s Tokyo slot is offered, a slot logged in New York is not', () => {
  // The morning after landing (Sep 27 18:00 Tokyo): the New York days were logged, Tokyo's first
  // slot is today → nothing pending, nothing invented around the change.
  const now = Z.wallToEpoch(TOKYO, 2026, 9, 27, 18, 0);
  const r = withTz(TOKYO, () => pendingFromYesterday({ protocols: [p], logs: travelLogs(), nowMs: now, zoneHistory: history }));
  assert.deepEqual(r, []);
  // Sep 29 06:00 Tokyo, yesterday's (Sep 28) 20:00 Tokyo slot of a twice-daily protocol not logged → offered.
  const p2 = { ...p, id: 10, doses_per_day: 2, reminder_time: '08:00,20:00' };
  const logs2 = [{ protocol_id: 10, outcome: 'Taken', logged_at: new Date(Z.wallToEpoch(TOKYO, 2026, 9, 28, 8, 0)).toISOString() }];
  const now2 = Z.wallToEpoch(TOKYO, 2026, 9, 29, 6, 0);
  const r2 = withTz(TOKYO, () => pendingFromYesterday({ protocols: [p2], logs: logs2, nowMs: now2, zoneHistory: history }));
  assert.equal(r2.length, 1);
  assert.equal(r2[0].slotMs, Z.wallToEpoch(TOKYO, 2026, 9, 28, 20, 0));
  assert.equal(r2[0].dayKey, '2026-09-28');
  assert.equal(r2[0].ti, 1);
});

test('Pending from yesterday on a phone still in New York while the history says New York: unchanged behaviour', () => {
  const p2 = { ...p, id: 10, doses_per_day: 2, reminder_time: '08:00,20:00' };
  const logs2 = [{ protocol_id: 10, outcome: 'Taken', logged_at: new Date(Z.wallToEpoch(NY, 2026, 9, 20, 8, 0)).toISOString() }];
  const now = Z.wallToEpoch(NY, 2026, 9, 21, 6, 0);
  const h = [{ tz: NY, sinceMs: Date.parse('2026-09-10T00:00:00Z') }];
  const withH = withTz(NY, () => pendingFromYesterday({ protocols: [p2], logs: logs2, nowMs: now, zoneHistory: h }));
  const without = withTz(NY, () => pendingFromYesterday({ protocols: [p2], logs: logs2, nowMs: now }));
  assert.deepEqual(withH, without);
  assert.equal(withH.length, 1);
});

test('the scan start with a history: from the first known zone (a later change no longer resets it, as S-19 did)', () => {
  const base = 1000;
  assert.equal(H.scanStart({ baseMs: base, history: [{ tz: NY, sinceMs: 500 }, { tz: TOKYO, sinceMs: 9000 }], guardSinceMs: 9000, currentTz: TOKYO }), 1000);
  assert.equal(H.scanStart({ baseMs: base, history: [{ tz: NY, sinceMs: 4000 }], guardSinceMs: 4000, currentTz: NY }), 4000, 'zone unknown before the history');
  assert.equal(H.scanStart({ baseMs: base, history: [], guardSinceMs: 9000, currentTz: null }), 9000, 'no zone name: S-19\'s guard as before');
});

test('the app passes the history to the scan and to both Pending-from-yesterday blocks', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const da = read('lib/doseActions.js');
  assert.match(da, /const usable = !!\(currentTz && history\.length && Z\.zonesWork\(\)\);/);
  assert.match(da, /w\.zoneHistory = usable \? history : null;/);
  assert.match(da, /lookbackDays: MISSED_LOOKBACK_DAYS, zoneHistory \}/);
  assert.match(da, /H\.seedHistory\(/);
  for (const f of ['screens/TodayScreen.js', 'screens/ProtocolsScreen.js']) assert.match(read(f), /pendingFromYesterday\(\{[^}]*zoneHistory/, f);
});
