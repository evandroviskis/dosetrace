'use strict';
// DV-243 journey review F1: a "no dose" row (lib/noDose) whose time is not the minute the ring rebuilds
// for its slot — a Missed row written in the time zone of its own day (lib/missedDoses zoneSlots), or a
// reminder time changed before 1.3.1 (no schedule_history) — must still take one slot off the rings and
// the provider report. Rule: an exact-minute match first; otherwise the nearest slot of that protocol on
// the same LOCAL day that no taken dose filled (the by-day rule the streaks use). Count and % agree.
const test = require('node:test');
const assert = require('node:assert/strict');

const iso = (d, h = 8) => new Date(2026, 9, d, h, 0, 0, 0).toISOString();

function fixture(noDoseRow) {
  const protocols = [{ id: 1, name: 'BPC-157', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 8, 1, 7).toISOString() }];
  const logs = [
    ...[20, 21, 22, 23].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: iso(d) })),
    { protocol_id: 1, outcome: 'Missed', logged_at: iso(24) },
    ...(noDoseRow ? [noDoseRow] : [{ protocol_id: 1, outcome: 'Missed', logged_at: iso(25) }]),
  ];
  return { protocols, logs, sinceMs: new Date(2026, 9, 20, 0).getTime(), nowMs: new Date(2026, 9, 26, 12).getTime() };
}

test('F1: a "no dose" row 1 h off its slot lowers the ring due and the report due by 1; count and % agree', () => {
  const { slotCounts } = require('../lib/adherenceRings');
  const { adherenceStats } = require('../lib/adherenceReport');
  const base = fixture(null);
  const off = fixture({ protocol_id: 1, outcome: 'NoDose', logged_at: iso(25, 9) }); // 09:00, the slot is 08:00
  const a = slotCounts(base.protocols, base.logs, base.sinceMs, base.nowMs)[1];
  const b = slotCounts(off.protocols, off.logs, off.sinceMs, off.nowMs)[1];
  assert.equal(b.due, a.due - 1);
  assert.equal(b.taken, a.taken);
  const ra = adherenceStats(base);
  const rb = adherenceStats(off);
  assert.equal(rb.overall.missed, ra.overall.missed - 1);
  assert.equal(rb.overall.total, ra.overall.total - 1);
  // 4 of 7 → 57 %; one slot answered "no dose" → 4 of 6 → 67 %, the same as an exact-minute row.
  assert.equal(ra.overall.adherence, 57);
  assert.equal(rb.overall.adherence, 67);
});

test('F1: the off-minute "no dose" never takes a slot a taken dose filled, nor one from another day', () => {
  const { slotCounts } = require('../lib/adherenceRings');
  const p = { id: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', created_at: new Date(2026, 8, 1, 7).toISOString() };
  const since = new Date(2026, 9, 25, 0).getTime();
  const now = new Date(2026, 9, 25, 23).getTime();
  // 08:00 taken; "no dose" at 09:00 (nearer 08:00, which is filled) → it answers 20:00, the unfilled one.
  const logs = [
    { protocol_id: 1, outcome: 'Taken', logged_at: iso(25, 8) },
    { protocol_id: 1, outcome: 'NoDose', logged_at: iso(25, 9) },
  ];
  assert.deepEqual(slotCounts([p], logs, since, now)[1], { taken: 1, due: 1 });
  // A "no dose" dated another local day takes nothing off this day.
  const other = [{ protocol_id: 1, outcome: 'Taken', logged_at: iso(25, 8) }, { protocol_id: 1, outcome: 'NoDose', logged_at: iso(24, 20) }];
  assert.deepEqual(slotCounts([p], other, since, now)[1], { taken: 1, due: 2 });
  // Three off-minute "no dose" rows on a day of two slots answer both, never one twice, never below 0.
  const three = [9, 10, 11].map((h) => ({ protocol_id: 1, outcome: 'NoDose', logged_at: iso(25, h) }));
  assert.deepEqual(slotCounts([p], three, since, now)[1], { taken: 0, due: 0 });
});
