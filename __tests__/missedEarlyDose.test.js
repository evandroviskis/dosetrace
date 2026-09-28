'use strict';
// Finding F-MISS-2 (registry A-43, 1.2.5 exception S-18 (founder 2026-09-28); outside review #015 addendum,
// 2026-09-28; data-integrity class: false Missed rows). Today's "Mark taken" is
// enabled all day on a due day, but the Missed scan (lib/missedDoses.js) lets a
// log cover a slot only from slot − 3 h (EARLY_MS) to slot + 12 h (LATE_MS). A dose
// logged earlier than 3 h before its slot on the same day covers nothing, so the
// next scan writes a Missed row next to the real Taken row.
// Tests are todo (red now) until the item is picked up; the guards pass today and must stay green.
// Pinned to a US zone so the DST test is meaningful on any machine (each test file runs in its own process).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses } = require('../lib/missedDoses');

const DAY = 24 * 3600000;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const created = iso(local(2026, 9, 1, 7, 0));

test('F-MISS-2: once-daily 20:00 dose logged at 10:00 the same day → 0 Missed after the next-day scan', { todo: 'A-43 / F-MISS-2 — 1.2.5 S-18' }, () => {
  const p = { id: 1, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 10, 0)) }];
  // Only the 26th matters: scan from the 26th's start.
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(missed, [], `${missed.length} false Missed row(s) next to a same-day Taken`);
});

test('F-MISS-2: twice-daily 08:00/20:00, second dose logged early at 12:00 → 0 Missed', { todo: 'A-43 / F-MISS-2 — 1.2.5 S-18' }, () => {
  const p = { id: 2, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', created_at: created };
  const logs = [
    { protocol_id: 2, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 8, 5)) },
    { protocol_id: 2, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 12, 0)) },
  ];
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(missed, [], `${missed.length} false Missed row(s) with both doses logged that day`);
});

test('F-MISS-2 (guard, passes today): a dose logged within 3 h before its slot covers it; no log at all is a real miss', () => {
  const p = { id: 3, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const covered = computeMissedDoses([p], [{ protocol_id: 3, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 17, 30)) }], local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.equal(covered.length, 0);
  const none = computeMissedDoses([p], [], local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.equal(none.length, 1);
  assert.equal(none[0].scheduledAtMs, local(2026, 9, 26, 20, 0));
});

// Review #016 item 2: Today's Skip writes logged_at = tap time (TodayScreen.js:745),
// so skipping an evening dose in the morning leaves Skipped + a Missed.
test('F-MISS-2: once-daily 20:00 dose Skipped at 09:00 the same day → 0 Missed', { todo: 'A-43 / F-MISS-2 — 1.2.5 S-18' }, () => {
  const p = { id: 4, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [{ protocol_id: 4, outcome: 'Skipped', logged_at: iso(local(2026, 9, 26, 9, 0)) }];
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(missed, [], `${missed.length} Missed row(s) next to a same-day Skipped`);
});

// Review #016 item 3 / #017 item 1: the rows the A-40 "ignore yesterday" choice leaves
// (Skipped AT yesterday's slot time) plus today's dose taken at 07:00. Fed straight into
// the scan, so it turns green with A-43's window alone (S-18).
test('F-MISS-2 scenario: Skipped at yesterday\'s slot time, today Taken at 07:00 → 0 Missed after the next scan', { todo: 'A-43 / F-MISS-2 — 1.2.5 S-18' }, () => {
  const p = { id: 5, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [
    { protocol_id: 5, outcome: 'Skipped', logged_at: iso(local(2026, 9, 25, 20, 0)) },
    { protocol_id: 5, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 7, 0)) },
  ];
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 25, 0, 0), { lookbackDays: 2 });
  assert.deepEqual(missed, [], `${missed.length} Missed row(s)`);
});

// Review #017 item 2a: US DST ends 2026-11-01 (a 25-hour day). A once-daily 20:00 slot
// on Nov 1 with a log at 00:30 Nov 1 is covered only if the window starts at the slot's
// LOCAL midnight computed with setHours(0,0,0,0) — "slot minus 20 h" lands at 01:00.
test('F-MISS-2 DST: Nov 1 (25 h day) 20:00 slot, log at 00:30 Nov 1 → covered (window starts at local midnight)', { todo: 'A-43 / F-MISS-2 — 1.2.5 S-18' }, () => {
  const p = { id: 6, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [
    { protocol_id: 6, outcome: 'Taken', logged_at: iso(local(2026, 10, 31, 20, 5)) }, // Oct 31's own slot
    { protocol_id: 6, outcome: 'Taken', logged_at: iso(local(2026, 11, 1, 0, 30)) },
  ];
  assert.equal(local(2026, 11, 1, 20, 0) - local(2026, 11, 1, 0, 0), 21 * 3600000, 'test precondition: Nov 1 is the 25-hour DST day');
  const missed = computeMissedDoses([p], logs, local(2026, 11, 2, 21, 0), local(2026, 10, 31, 0, 0), { lookbackDays: 2 });
  assert.deepEqual(missed, [], `${missed.length} Missed row(s) on the DST day`);
});

// Review #017 item 2b = A-35(b) acceptance (no earlier test existed): a log at 00:30
// that covers the previous night's slot must not ALSO cover today's slot.
test('A-35(b) guard: 00:30 covering last night\'s 20:00 does not also cover today\'s 20:00; + a 22:00 log → 0 Missed', () => {
  const p = { id: 7, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const at0030 = { protocol_id: 7, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 0, 30)) };
  const scan = (logs) => computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 25, 0, 0), { lookbackDays: 2 });
  const alone = scan([at0030]);
  assert.equal(alone.length, 1, '00:30 alone: today\'s slot is still missed');
  assert.equal(alone[0].scheduledAtMs, local(2026, 9, 26, 20, 0));
  assert.deepEqual(scan([at0030, { protocol_id: 7, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 22, 0)) }]), []);
});

// Sim run 2026-09-28 (A-40 check): relaunching in Asia/Tokyo made the Missed scan
// recompute past slots in Tokyo time; doses logged at New-York slot times no longer
// matched, and 7 false Missed rows were written (Test03). A traveller hits the same.
// Registry A-49. This test runs a NY-logged history through the scan as if the
// device were now in Tokyo.
test('A-49: a time-zone change does not turn past doses logged on time into false Missed rows', { todo: 'A-49 — 1.2.5 S-19 (after S-18)' }, () => {
  // Doses logged daily at 20:00 New York (= 00:00Z next day) for Sep 20–26.
  const logs = [];
  for (let d = 21; d <= 27; d++) logs.push({ protocol_id: 9, outcome: 'Taken', logged_at: `2026-09-${d}T00:00:00.000Z` });
  const p = { id: 9, user_id: 'u1', start_date: '2026-09-20', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: '2026-09-19T12:00:00.000Z' };
  const nowTokyo = Date.parse('2026-09-28T12:00:00.000Z');
  const prevTz = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo'; // the device is now in Tokyo
  let missed;
  try { missed = computeMissedDoses([p], logs, nowTokyo, Date.parse('2026-09-21T00:00:00.000Z'), { lookbackDays: 6 }); }
  finally { process.env.TZ = prevTz; }
  assert.deepEqual(missed, [], `${missed.length} false Missed row(s) after a time-zone change`);
});
