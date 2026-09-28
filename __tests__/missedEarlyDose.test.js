'use strict';
// Finding F-MISS-2 (registry A-43, target none; outside review #015 addendum,
// 2026-09-28; data-integrity class: false Missed rows). Today's "Mark taken" is
// enabled all day on a due day, but the Missed scan (lib/missedDoses.js) lets a
// log cover a slot only from slot − 3 h (EARLY_MS) to slot + 12 h (LATE_MS). A dose
// logged earlier than 3 h before its slot on the same day covers nothing, so the
// next scan writes a Missed row next to the real Taken row.
// Tests are todo (red now) until the item is picked up; the guard below passes today.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses } = require('../lib/missedDoses');

const DAY = 24 * 3600000;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const created = iso(local(2026, 9, 1, 7, 0));

test('F-MISS-2: once-daily 20:00 dose logged at 10:00 the same day → 0 Missed after the next-day scan', { todo: 'A-43 / F-MISS-2 — target none' }, () => {
  const p = { id: 1, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 10, 0)) }];
  // Only the 26th matters: scan from the 26th's start.
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(missed, [], `${missed.length} false Missed row(s) next to a same-day Taken`);
});

test('F-MISS-2: twice-daily 08:00/20:00, second dose logged early at 12:00 → 0 Missed', { todo: 'A-43 / F-MISS-2 — target none' }, () => {
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
test('F-MISS-2: once-daily 20:00 dose Skipped at 09:00 the same day → 0 Missed', { todo: 'A-43 / F-MISS-2 — target none' }, () => {
  const p = { id: 4, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [{ protocol_id: 4, outcome: 'Skipped', logged_at: iso(local(2026, 9, 26, 9, 0)) }];
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 26, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(missed, [], `${missed.length} Missed row(s) next to a same-day Skipped`);
});

// Review #016 item 3 (A-40 design + A-43 window): the A-40 pending prompt at 07:00
// with "ignore" writes yesterday's Skipped AT yesterday's slot time; today's dose is
// then taken at 07:00. Next scan → 0 Missed. Needs A-43's window fix for today's slot.
test('A-40 + F-MISS-2: "ignore yesterday" = Skipped at yesterday\'s slot time, today Taken at 07:00 → 0 Missed after the next scan', { todo: 'A-40 (option pending) + A-43 window fix' }, () => {
  const p = { id: 5, user_id: 'u1', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created };
  const logs = [
    { protocol_id: 5, outcome: 'Skipped', logged_at: iso(local(2026, 9, 25, 20, 0)) },
    { protocol_id: 5, outcome: 'Taken', logged_at: iso(local(2026, 9, 26, 7, 0)) },
  ];
  const missed = computeMissedDoses([p], logs, local(2026, 9, 27, 21, 0), local(2026, 9, 25, 0, 0), { lookbackDays: 2 });
  assert.deepEqual(missed, [], `${missed.length} Missed row(s)`);
});
