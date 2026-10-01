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
