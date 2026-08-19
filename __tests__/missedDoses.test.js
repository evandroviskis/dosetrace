'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedSlotTimesOn } = require('../lib/schedule');
const { computeMissedDoses, LATE_MS } = require('../lib/missedDoses');

const OLD = '2020-01-01T08:00:00';
const DAY = 86400000;

// ── expectedSlotTimesOn ──────────────────────────────────────────────
test('expectedSlotTimesOn: returns the chronological slot strings for a dose day', () => {
  const p = { start_date: '2024-01-01', interval_days: 1, doses_per_day: 2, reminder_time: '20:00,08:00', created_at: OLD };
  assert.deepEqual(expectedSlotTimesOn(p, new Date('2024-06-15T12:00:00')), ['08:00', '20:00']);
});

test('expectedSlotTimesOn: empty on a non-dose day (interval / before start)', () => {
  const p = { start_date: '2024-06-01', interval_days: 3, doses_per_day: 1, reminder_time: '08:00', created_at: OLD };
  assert.deepEqual(expectedSlotTimesOn(p, new Date('2024-06-02T12:00:00')), []); // day 1, not a multiple of 3
  assert.deepEqual(expectedSlotTimesOn(p, new Date('2024-05-31T12:00:00')), []); // before start
  assert.deepEqual(expectedSlotTimesOn(p, new Date('2024-06-04T12:00:00')), ['08:00']); // day 3
});

test('expectedSlotTimesOn: creation-day rule drops slots before creation time', () => {
  const p = {
    start_date: '2024-06-15', interval_days: 1, doses_per_day: 2,
    reminder_time: '08:00,20:00', created_at: '2024-06-15T16:30:00',
  };
  // Created 4:30 PM → the 8 AM slot doesn't count that day, the 8 PM one does.
  assert.deepEqual(expectedSlotTimesOn(p, new Date('2024-06-15T18:00:00')), ['20:00']);
});

// ── computeMissedDoses ───────────────────────────────────────────────
function dailyProto(overrides = {}) {
  return { id: 1, user_id: 'u1', remote_id: null, start_date: '2024-01-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: OLD, ...overrides };
}

test('computeMissedDoses: an unlogged past-day slot 12h+ old is Missed', () => {
  const now = new Date('2024-06-20T12:00:00').getTime();
  const missed = computeMissedDoses([dailyProto()], [], now, 0, { lookbackDays: 3 });
  // yesterday 08:00 and the days before, all >12h ago and unlogged
  assert.ok(missed.length >= 1);
  assert.ok(missed.every((m) => m.protocol_id === 1 && m.user_id === 'u1'));
  // none is today's slot (excluded by default)
  const today0 = new Date('2024-06-20T00:00:00').getTime();
  assert.ok(missed.every((m) => m.scheduledAtMs < today0));
});

test('computeMissedDoses: a logged day produces no Missed row', () => {
  const now = new Date('2024-06-20T12:00:00').getTime();
  const logs = [{ protocol_id: 1, logged_at: '2024-06-19T08:05:00' }]; // yesterday taken
  const missed = computeMissedDoses([dailyProto()], logs, now, 0, { lookbackDays: 1 });
  const y0 = new Date('2024-06-19T00:00:00').getTime();
  const y1 = new Date('2024-06-20T00:00:00').getTime();
  const yesterdayMissed = missed.filter((m) => m.scheduledAtMs >= y0 && m.scheduledAtMs < y1);
  assert.equal(yesterdayMissed.length, 0);
});

test('computeMissedDoses: today is excluded by default, included when asked', () => {
  const now = new Date('2024-06-20T21:00:00').getTime(); // 08:00 slot is 13h ago
  const off = computeMissedDoses([dailyProto()], [], now, 0, { lookbackDays: 0 });
  assert.equal(off.length, 0); // lookback 0 + today excluded → nothing
  const on = computeMissedDoses([dailyProto()], [], now, 0, { lookbackDays: 0, includeToday: true });
  assert.equal(on.length, 1); // today's 08:00, now 13h past
});

test('computeMissedDoses: a not-yet-12h slot is not Missed', () => {
  const now = new Date('2024-06-20T15:00:00').getTime(); // today 08:00 is only 7h ago
  const on = computeMissedDoses([dailyProto()], [], now, 0, { lookbackDays: 0, includeToday: true });
  assert.equal(on.length, 0);
});

test('computeMissedDoses: watermark suppresses slots scheduled before it', () => {
  const now = new Date('2024-06-20T12:00:00').getTime();
  const since = new Date('2024-06-19T00:00:00').getTime(); // only yesterday-onward counts
  const missed = computeMissedDoses([dailyProto()], [], now, since, { lookbackDays: 5 });
  assert.ok(missed.every((m) => m.scheduledAtMs >= since));
});

test('computeMissedDoses: partial multi-dose day marks only the uncovered (latest) slots', () => {
  const now = new Date('2024-06-20T12:00:00').getTime();
  const p = dailyProto({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const logs = [{ protocol_id: 1, logged_at: '2024-06-19T08:05:00' }]; // took the 8 AM only
  const missed = computeMissedDoses([p], logs, now, 0, { lookbackDays: 1 });
  const y0 = new Date('2024-06-19T00:00:00').getTime();
  const y1 = new Date('2024-06-20T00:00:00').getTime();
  const yMissed = missed.filter((m) => m.scheduledAtMs >= y0 && m.scheduledAtMs < y1);
  assert.equal(yMissed.length, 1); // the 20:00 slot
  assert.equal(new Date(yMissed[0].scheduledAtMs).getHours(), 20);
});

test('computeMissedDoses: idempotent — a written Missed row counts and is not re-created', () => {
  const now = new Date('2024-06-20T12:00:00').getTime();
  const p = dailyProto();
  const first = computeMissedDoses([p], [], now, 0, { lookbackDays: 1 });
  // Feed the produced Missed rows back in as logs; a second pass yields nothing new.
  const logs = first.map((m) => ({ protocol_id: m.protocol_id, logged_at: new Date(m.scheduledAtMs).toISOString() }));
  const second = computeMissedDoses([p], logs, now, 0, { lookbackDays: 1 });
  assert.equal(second.length, 0);
});

test('computeMissedDoses: a dose logged after midnight covers the prior evening slot (no false Missed)', () => {
  // Slot 20:00 Mon 2024-06-17; user taps Taken at 00:30 Tue (stamped Tue, but
  // only 4.5 h after the Mon slot). Scanning midday Tue must NOT mark Mon missed.
  const p = dailyProto({ reminder_time: '20:00' });
  const now = new Date('2024-06-18T12:00:00').getTime();
  const logs = [{ protocol_id: 1, logged_at: '2024-06-18T00:30:00' }];
  const missed = computeMissedDoses([p], logs, now, 0, { lookbackDays: 3 });
  const monEve = new Date('2024-06-17T20:00:00').getTime();
  assert.ok(!missed.some((m) => m.scheduledAtMs === monEve), 'Monday 20:00 must not be Missed');
});

test('computeMissedDoses: the after-midnight log does not hide the next day\'s real miss', () => {
  // Same 00:30 Tue log covers Mon 20:00, but Tue 20:00 (once ≥12h past) is its own
  // slot and must still be marked Missed if nothing covers it.
  const p = dailyProto({ reminder_time: '20:00' });
  const now = new Date('2024-06-19T12:00:00').getTime(); // Tue 20:00 is now ~16h past
  const logs = [{ protocol_id: 1, logged_at: '2024-06-18T00:30:00' }]; // covers Mon eve only
  const missed = computeMissedDoses([p], logs, now, 0, { lookbackDays: 3 });
  const tueEve = new Date('2024-06-18T20:00:00').getTime();
  assert.ok(missed.some((m) => m.scheduledAtMs === tueEve), 'Tuesday 20:00 must be Missed');
});

test('computeMissedDoses: proximity match marks the actually-uncovered earlier slot', () => {
  // dpd=2 (08:00 & 20:00); user took only the 20:00 dose. The Missed row must land
  // on 08:00 (the uncovered slot), not the covered 20:00 — nearest-log matching.
  const now = new Date('2024-06-20T12:00:00').getTime();
  const p = dailyProto({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const logs = [{ protocol_id: 1, logged_at: '2024-06-19T20:03:00' }]; // took the 8 PM
  const missed = computeMissedDoses([p], logs, now, 0, { lookbackDays: 1 });
  const y0 = new Date('2024-06-19T00:00:00').getTime();
  const y1 = new Date('2024-06-20T00:00:00').getTime();
  const yMissed = missed.filter((m) => m.scheduledAtMs >= y0 && m.scheduledAtMs < y1);
  assert.equal(yMissed.length, 1);
  assert.equal(new Date(yMissed[0].scheduledAtMs).getHours(), 8);
});

test('LATE_MS is 12 hours', () => {
  assert.equal(LATE_MS, 12 * 60 * 60 * 1000);
});
