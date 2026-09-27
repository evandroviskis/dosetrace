'use strict';
// Finding F-MISS-1 (A-32; outside reviews #008/#009, 2026-09-27; data-integrity
// class: false Missed rows). computeMissedDoses does not check when the protocol
// was created: for a protocol whose start_date is in the past (e.g. the user
// declined backfill), every slot between start_date and the creation day is
// "expected", and the app-wide sinceMs watermark (first run of the feature) is
// usually older than the protocol — so those pre-registration slots become Missed.
//
// Contract: a slot is FALSE when scheduledAtMs < created_at − 1 h. The 1-hour
// creation-day grace (lib/schedule.js:72) is by design and stays: a slot within the
// hour before creation is a real expected dose.
//
// Must ship in the same build as A-30 or earlier (A-30 removes the backfill dialog,
// so without this fix EVERY past-start_date protocol would get false Missed rows).
// Target build: founder decides. Tests written first as todo (red now).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses } = require('../lib/missedDoses');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const falseRows = (missed, created) => missed.filter((m) => m.scheduledAtMs < created - HOUR);

test('F-MISS-1: no Missed rows for slots before created_at − 1 h (past start_date, backfill declined, scan on the creation day)', { todo: 'A-32 / F-MISS-1 — target build set by the founder' }, () => {
  const now = local(2026, 9, 27, 21, 0);
  const created = local(2026, 9, 27, 9, 0);
  const protocol = {
    id: 1, user_id: 'u1', start_date: '2026-09-17', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: new Date(created).toISOString(),
  };
  const missed = computeMissedDoses([protocol], [], now, now - 60 * DAY, { lookbackDays: 14 });
  const bad = falseRows(missed, created);
  assert.deepEqual(bad, [], `${bad.length} false Missed rows before the protocol existed`);
});

test('F-MISS-1: scan the day AFTER creation — the creation-day slot inside the 1 h grace is Missed; earlier slots that day and all earlier days are not', { todo: 'A-32 / F-MISS-1 — target build set by the founder' }, () => {
  const created = local(2026, 9, 26, 8, 30);
  const now = local(2026, 9, 27, 21, 0);
  const protocol = {
    id: 2, user_id: 'u1', start_date: '2026-09-17', interval_days: 1, doses_per_day: 2,
    reminder_time: '06:00,08:00', created_at: new Date(created).toISOString(),
  };
  const missed = computeMissedDoses([protocol], [], now, now - 60 * DAY, { lookbackDays: 14 });
  const slot0800on26 = local(2026, 9, 26, 8, 0);
  const slot0600on26 = local(2026, 9, 26, 6, 0);
  assert.ok(missed.some((m) => m.scheduledAtMs === slot0800on26), 'creation-day 08:00 (within the grace) is a real miss');
  assert.ok(!missed.some((m) => m.scheduledAtMs === slot0600on26), 'creation-day 06:00 (before created − 1 h) is not');
  const bad = falseRows(missed, created);
  assert.deepEqual(bad, [], `${bad.length} false Missed rows before created − 1 h`);
});

test('F-MISS-1 (guard, passes today): slots after creation are still marked Missed when not logged', () => {
  const now = local(2026, 9, 27, 21, 0);
  const protocol = {
    id: 3, user_id: 'u1', start_date: '2026-09-20', interval_days: 1, doses_per_day: 1,
    reminder_time: '08:00', created_at: new Date(local(2026, 9, 20, 7, 0)).toISOString(),
  };
  const missed = computeMissedDoses([protocol], [], now, now - 60 * DAY, { lookbackDays: 14 });
  assert.ok(missed.length >= 6, 'unlogged slots from the 20th to the 26th are real misses');
});
