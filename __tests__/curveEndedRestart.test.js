'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-12, R12): an ended protocol — every Taken log counts, no
// plan after ended_at; a Restart (a new protocol of the same compound) with a past start date never
// overlaps the earlier run's logged-era Taken rows with its declared part.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const at = (m, d, h, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();
const iso = (ms) => new Date(ms).toISOString();
const e = H.getHalfLifeEntry('Testosterone Cypionate');
const base = { type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '100', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '09:00' };
// Run 1: Fridays from 2026-09-04 (added that day), ended Wed 2026-10-07 18:00.
const run1 = { ...base, id: 1, start_date: '2026-09-04', created_at: iso(at(9, 4, 8)), active: 0, ended_at: iso(at(10, 7, 18)) };
const row = (pid, outcome, ms) => ({ protocol_id: pid, outcome, logged_at: iso(ms), sync_status: 'synced' });
const RUN1_TAKEN = [at(9, 4, 9), at(9, 11, 9, 30), at(9, 18, 9), at(10, 2, 10)].map((t) => row(1, 'Taken', t));
const sum = (times, T) => times.reduce((s, t) => s + 100 * H.amountFraction(e, (T - t) / HOUR), 0);
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

test('PK-12: an ended protocol — its logs before the end count; nothing is planned after ended_at', () => {
  const now = at(10, 20, 12);
  const plan = M.curvePlan(run1, e, M.curveGridStart(now, 60), now + 30 * 864e5, now, { logs: RUN1_TAKEN });
  assert.deepEqual([...plan.doses], RUN1_TAKEN.map((r) => Date.parse(r.logged_at)));
  assert.equal(plan.plan.length, 0);
  assert.ok(plan.planned.every((d) => d <= at(10, 7, 18)), 'no slot after the end');
  assert.ok(near(M.estimatedLevelNow(run1, now, { logs: RUN1_TAKEN }).value, sum(RUN1_TAKEN.map((r) => Date.parse(r.logged_at)), now)));
});

test('PK-12: a Restart with a past start date — its declared part starts after the earlier run\'s last logged Taken dose', () => {
  // Run 2 added Thu 2026-10-15 with start date 2026-09-04 (the old start): its declared Fridays would
  // cover 4 Sep … 9 Oct, where run 1's Taken rows already are.
  const run2 = { ...base, id: 2, start_date: '2026-09-04', created_at: iso(at(10, 15, 12)) };
  const now = at(10, 20, 12);
  const data = { logs: [...RUN1_TAKEN, row(2, 'Taken', at(10, 16, 9))], siblings: [run1, run2] };
  const plan2 = M.curvePlan(run2, e, M.curveGridStart(now, 60), now + 7 * 864e5, now, data);
  // Run 1's last Taken row is Fri 2 Oct 10:00 → run 2 declares only Fri 9 Oct (before its creation).
  assert.deepEqual([...plan2.declared], [at(10, 9, 9)]);
  for (const r of RUN1_TAKEN) assert.ok(plan2.declared.every((d) => d > Date.parse(r.logged_at)));
  // The combined testosterone total (run 1 + run 2) never counts a Friday twice.
  const plan1 = M.curvePlan(run1, e, M.curveGridStart(now, 60), now + 7 * 864e5, now, data);
  const combined = M.levelAt(plan1.doses, 100, e, now) + M.levelAt(plan2.doses, 100, e, now);
  const truth = sum([...RUN1_TAKEN.map((r) => Date.parse(r.logged_at)), at(10, 9, 9), at(10, 16, 9)], now);
  assert.ok(near(combined, truth), `${combined} vs ${truth}`);
  // Without the sibling list (nothing known about run 1) the declared part is the whole schedule.
  const alone = M.curvePlan(run2, e, M.curveGridStart(now, 60), now + 7 * 864e5, now, { logs: data.logs });
  assert.equal(alone.declared.length, 6);
});

test('PK-12: the Journey tile reads the ended runs too (data.history), so tile == screen for a Restart', () => {
  const run2 = { ...base, id: 2, start_date: '2026-09-04', created_at: iso(at(10, 15, 12)), active: 1 };
  const now = at(10, 20, 12);
  const logs = [...RUN1_TAKEN, row(2, 'Taken', at(10, 16, 9))];
  const tile = M.defaultCurveLevel([run2], now, undefined, null, { logs, history: [run2, run1] });
  const screen = M.levelAt(M.curvePlan(run2, e, M.curveGridStart(now, 3), now + 7 * 864e5, now, { logs, siblings: [run2, run1] }).doses, 100, e, now);
  assert.equal(tile.value, screen);
});

test('PK review 3 (R12): a sibling running at the same time (split weekly doses) never cuts the estimated past; an ended one does', () => {
  // "Test C Mon": Mondays 09:00 from 2026-07-20, added that day, every Monday logged Taken.
  const mon = { ...base, id: 10, start_date: '2026-07-20', created_at: iso(at(7, 20, 8)), active: 1 };
  const monTaken = [];
  for (let d = new Date(2026, 6, 20, 9); d.getTime() <= at(10, 19, 9); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 9)) monTaken.push(row(10, 'Taken', d.getTime()));
  // "Test C Thu": Thursdays 09:00, added Thu 2026-10-22 12:00 with the start date 3 months back.
  const thu = { ...base, id: 11, start_date: '2026-07-23', created_at: iso(at(10, 22, 12)), active: 1 };
  const now = at(10, 25, 12);
  const thursdays = [];
  for (let d = new Date(2026, 6, 23, 9); d.getTime() <= at(10, 22, 9); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 9)) thursdays.push(d.getTime());
  const plan = (sib) => M.curvePlan(thu, e, M.curveGridStart(now, 120), now + 7 * 864e5, now, { logs: monTaken, siblings: [mon, sib] });
  // Mon is still running: Thu keeps its whole estimated past (13 + 1 Thursdays), the total is not ~50 % low.
  assert.deepEqual([...plan(thu).declared], thursdays.filter((t) => t >= M.curveGridStart(now, 120) - M.curveHistoryDays(e) * 864e5));
  assert.equal(plan(thu).declared.length, 14);
  const monPlan = M.curvePlan(mon, e, M.curveGridStart(now, 120), now + 7 * 864e5, now, { logs: monTaken, siblings: [mon, thu] });
  const combined = M.levelAt(monPlan.doses, 100, e, now) + M.levelAt(plan(thu).doses, 100, e, now);
  const truth = sum([...monTaken.map((r) => Date.parse(r.logged_at)), ...thursdays], now);
  assert.ok(near(combined, truth), `${combined} vs ${truth}`);
  // Mon ended after Thu was added (still running at Thu's creation): no cut either.
  const monEndedLater = { ...mon, active: 0, ended_at: iso(at(10, 24, 18)) };
  assert.equal(M.curvePlan(thu, e, M.curveGridStart(now, 120), now + 7 * 864e5, now, { logs: monTaken, siblings: [monEndedLater, thu] }).declared.length, 14);
  // Mon ended BEFORE Thu was added (a Restart-like run): the estimated past starts after Mon's last Taken row.
  const monEnded = { ...mon, active: 0, ended_at: iso(at(10, 19, 18)) };
  const cut = M.curvePlan(thu, e, M.curveGridStart(now, 120), now + 7 * 864e5, now, { logs: monTaken, siblings: [monEnded, thu] });
  assert.deepEqual([...cut.declared], [at(10, 22, 9)]);
});

test('PK review 2 (R12): a protocol ended today at 12:00 with an unlogged 08:00 slot projects nothing after the end', () => {
  // Daily 08:00, ended Tue 2026-10-20 at 12:00; the 08:00 slot has no row; it is 15:00.
  const daily = { ...base, id: 7, interval_days: 1, start_date: '2026-10-10', created_at: iso(at(10, 10, 7)), active: 0, ended_at: iso(at(10, 20, 12)) };
  const now = at(10, 20, 15);
  const logs = [at(10, 18, 8, 5), at(10, 19, 8, 10)].map((t) => row(7, 'Taken', t));
  const plan = M.curvePlan(daily, e, M.curveGridStart(now, 14), now + 7 * 864e5, now, { logs });
  assert.equal(plan.open, 0);
  assert.ok(plan.doses.every((d) => d <= at(10, 20, 12)), 'no dose after the end');
  assert.deepEqual([...plan.doses], logs.map((r) => Date.parse(r.logged_at)));
  // While it was still running (11:00) the open slot is projected as usual.
  const running = { ...daily, active: 1, ended_at: null };
  assert.equal(M.curvePlan(running, e, M.curveGridStart(at(10, 20, 11), 14), at(10, 27, 11), at(10, 20, 11), { logs }).open, 1);
});
