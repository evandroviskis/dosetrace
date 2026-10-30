'use strict';
// Today v2.1 (founder approved 2026-09-29, docs/design/today-build-handoff.md §2 and
// checklist rows 3, 4, 22): the tracker's three rings count DOSES, not days —
// scheduled doses taken ÷ doses scheduled, for today / the last 7 days / the last 30
// days. A dose counts once against its own schedule (an extra Taken never adds, so a
// ring never shows more than 100%); a late weekly dose still counts; a skip is not
// taken; a rest day shows "Nothing due", never 0%.
const test = require('node:test');
const assert = require('node:assert/strict');
const { adherenceRings, ringPct } = require('../lib/adherenceRings');

const at = (d, h = 8, m = 0) => new Date(2026, 9, d, h, m).getTime(); // October 2026
const iso = (ms) => new Date(ms).toISOString();
const daily = { id: 'D', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00Z' };
const weekly = { id: 'W', start_date: '2026-09-07', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00Z' };
const taken = (pid, ms) => ({ protocol_id: pid, outcome: 'Taken', logged_at: iso(ms) });

test('rings: today counts every dose scheduled today; 7 and 30 days count only doses whose time has passed', () => {
  const nowMs = at(10, 7, 0); // Oct 10, 07:00 — today's 08:00 dose not yet due
  const logs = [10, 9, 8, 7, 6, 5, 4].map((d) => taken('D', at(d, 8, 5))).filter((l) => Date.parse(l.logged_at) < nowMs);
  const r = adherenceRings({ protocols: [daily], logs, nowMs });
  assert.deepEqual(r.today, { taken: 0, due: 1 });
  assert.deepEqual(r.week, { taken: 6, due: 6 }, 'Oct 4–9 passed and taken; Oct 10 not yet due');
});

test('rings: a rest day shows nothing due (null), never 0%', () => {
  const nowMs = at(10, 12); // Oct 10 is not a weekly day (Sep 7 + 7n = Oct 5, Oct 12)
  const r = adherenceRings({ protocols: [weekly], logs: [], nowMs });
  assert.equal(r.today, null);
  assert.equal(ringPct(r.today), null);
});

test('rings: a weekly dose taken a day late still counts as taken', () => {
  const nowMs = at(10, 12);
  const r = adherenceRings({ protocols: [weekly], logs: [taken('W', at(6, 9))], nowMs }); // due Oct 5, taken Oct 6
  assert.deepEqual(r.week, { taken: 1, due: 1 });
});

test('rings: an extra or duplicate Taken never adds — the ring never passes 100% and n never exceeds m', () => {
  const nowMs = at(10, 12);
  const logs = [taken('D', at(10, 8)), taken('D', at(10, 9)), taken('D', at(10, 10))];
  const r = adherenceRings({ protocols: [daily], logs, nowMs });
  assert.deepEqual(r.today, { taken: 1, due: 1 });
  assert.equal(ringPct(r.today), 100);
});

test('rings: a skip is not taken', () => {
  const nowMs = at(10, 12);
  const r = adherenceRings({ protocols: [daily], logs: [{ protocol_id: 'D', outcome: 'Skipped', logged_at: iso(at(10, 8)) }], nowMs });
  assert.deepEqual(r.today, { taken: 0, due: 1 });
});

test('rings: a protocol added mid-window is only due from the day it was added', () => {
  const nowMs = at(10, 12);
  const added = { ...daily, id: 'N', start_date: '2026-10-08', created_at: new Date(2026, 9, 8, 7).toISOString() };
  const r = adherenceRings({ protocols: [added], logs: [], nowMs });
  assert.deepEqual(r.week, { taken: 0, due: 3 }, 'Oct 8, 9, 10');
  assert.deepEqual(r.month, { taken: 0, due: 3 });
});

test('rings: paused or deleted protocols are left out', () => {
  const nowMs = at(10, 12);
  const r = adherenceRings({ protocols: [{ ...daily, active: 0 }, { ...daily, id: 'X', deleted_at: '2026-10-01' }], logs: [], nowMs });
  assert.equal(r.today, null);
  assert.deepEqual(r.week, { taken: 0, due: 0 });
});

test('rings: percent is rounded and capped at 100', () => {
  assert.equal(ringPct({ taken: 2, due: 3 }), 67);
  assert.equal(ringPct({ taken: 0, due: 0 }), null);
});

// A-192 (Fold, Gate S pass 2026-10-28): Today's list said "2 of 4 complete" while the ring said
// "0 of 4 today" — an evening daily dose (19:35) taken at 00:30 the same day, and a 14:00 dose
// taken at 01:00, were more than 12 h from their slots, so the ring never matched them, although
// the card counts them for today. Rule: a slot is matched first by the dose's own slot (slot_at),
// then by the nearest dose within half the interval, then by an unmatched dose taken the same day.
test('A-192: a dose taken early the same day counts for that day (ring = the dose list)', () => {
  const evening = { id: 'E', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '19:35', created_at: '2026-09-01T07:00:00Z' };
  const nowMs = at(28, 1, 5);
  const r = adherenceRings({ protocols: [evening], logs: [taken('E', at(28, 0, 30))], nowMs });
  assert.deepEqual(r.today, { taken: 1, due: 1 });
  const twice = { id: 'T', start_date: '2026-09-01', interval_days: 1, doses_per_day: 2, reminder_time: '14:00,22:40', created_at: '2026-09-01T07:00:00Z' };
  const r2 = adherenceRings({ protocols: [twice], logs: [taken('T', at(28, 1, 0))], nowMs });
  assert.deepEqual(r2.today, { taken: 1, due: 2 }, 'one of two, never both');
});

test('A-192: a dose with its own slot (slot_at) counts for that slot, and a late one never steals a later day', () => {
  const nowMs = at(28, 23, 0);
  const l = { ...taken('D', at(29, 0, 10)), slot_at: iso(at(28, 8, 0)) }; // corrected to after midnight, slot of the 28th
  const r = adherenceRings({ protocols: [daily], logs: [l], nowMs: at(29, 9, 0) });
  assert.deepEqual(r.week.taken >= 1, true);
  const yesterdayLate = adherenceRings({ protocols: [daily], logs: [taken('D', at(27, 23, 0))], nowMs });
  assert.deepEqual(yesterdayLate.today, { taken: 0, due: 1 }, 'a dose of the 27th never fills the 28th');
});

// Council of the 3rd EAS Update (2026-10-30, QA + senior): "Alterar horário" keeps the dose's slot
// in slot_at = the ORIGINAL logged_at (lib/doseEdit.js), which is the tap time when the dose was
// marked away from the scheduled minute. Such a dose matched no slot in step 1 and steps 2 and 3
// skipped every dose with a slot_at, so it counted nowhere (ring 0 of 1, list 1 of 1).
test('A-192: a dose tapped away from its time and then re-timed still counts (slot_at = the tap time)', () => {
  const nowMs = at(10, 20, 0);
  const log = { ...taken('D', at(10, 7, 50)), slot_at: iso(at(10, 8, 20)) };
  const r = adherenceRings({ protocols: [daily], logs: [log], nowMs });
  assert.deepEqual(r.today, { taken: 1, due: 1 });
  assert.deepEqual(r.week, { taken: 1, due: 7 });
  // Re-timed to another day: it still belongs to the day it was taken for (its slot), not the new time.
  const moved = { ...taken('D', at(9, 23, 30)), slot_at: iso(at(10, 8, 20)) };
  assert.deepEqual(adherenceRings({ protocols: [daily], logs: [moved], nowMs }).today, { taken: 1, due: 1 });
});
