'use strict';
// Finding F-MISS-1 (outside review #008, 2026-09-27; data-integrity class: false
// Missed rows). computeMissedDoses does not check when the protocol was created:
// for a protocol whose start_date is in the past (e.g. the user declined backfill),
// every slot between start_date and the creation day is "expected", and the
// app-wide sinceMs watermark (first run of the feature) is usually older than the
// protocol — so those pre-registration slots are written as Missed rows.
// Target build: founder decides. Test written first as todo (red now).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses } = require('../lib/missedDoses');

const DAY = 86400000;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

test('F-MISS-1: no Missed rows for slots before the protocol was created (past start_date, backfill declined)', { todo: 'finding F-MISS-1 — target build set by the founder' }, () => {
  const now = local(2026, 9, 27, 21, 0);
  const created = local(2026, 9, 27, 9, 0);
  const protocol = {
    id: 1, user_id: 'u1', start_date: '2026-09-17', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: new Date(created).toISOString(),
  };
  const sinceMs = now - 60 * DAY; // the user has had the app for 2 months
  const missed = computeMissedDoses([protocol], [], now, sinceMs, { lookbackDays: 14 });
  const beforeCreation = missed.filter((m) => m.scheduledAtMs < created);
  assert.deepEqual(beforeCreation, [], `${beforeCreation.length} false Missed rows before the protocol existed`);
});

test('F-MISS-1 (guard, passes today): slots after creation are still marked Missed when not logged', () => {
  const now = local(2026, 9, 27, 21, 0);
  const protocol = {
    id: 1, user_id: 'u1', start_date: '2026-09-20', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: new Date(local(2026, 9, 20, 7, 0)).toISOString(),
  };
  const missed = computeMissedDoses([protocol], [], now, now - 60 * DAY, { lookbackDays: 14 });
  assert.ok(missed.length >= 6, 'unlogged slots from 20th to 26th are real misses');
});
