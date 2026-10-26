'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-7, PK-8, PK-9, R1, R2): the boundary C = created_at − 1 h
// (lib/declared grace). Before C the past comes from the schedule (the A-30 part estimated from the
// start date), or nothing when history_from is set; from C to now the Taken rows only; Taken rows dated
// before C (the old backfill) add nothing; on the creation day the declared slots plus the rows that
// closed it never exceed that day's expected count.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const e = H.getHalfLifeEntry('Testosterone Cypionate');
// Daily 10 mg at 08:00, started 30 days before "now" (2026-10-25 12:00), added to the app 5 days ago.
const NOW = at(25, 12);
const prot = (over = {}) => ({
  id: 4, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '10', dose_unit: 'mg',
  interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-09-25', created_at: iso(at(20, 14)), ...over,
});
const row = (outcome, ms, extra = {}) => ({ protocol_id: 4, outcome, logged_at: iso(ms), sync_status: 'synced', ...extra });
const sum = (times, T) => times.reduce((s, t) => s + 10 * H.amountFraction(e, (T - t) / HOUR), 0);
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const C = at(20, 13); // created 14:00 − 1 h
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

test('PK-7: start 30 days ago, created 5 days ago, 5 backfill Taken rows before creation → schedule before C + logs after; the backfill adds 0', () => {
  const p = prot();
  const backfill = [15, 16, 17, 18, 19].map((d) => row('Taken', at(d, 8, 0)));
  const after = [21, 22, 24].map((d) => row('Taken', at(d, 9, 15)));
  const sched = M.scheduledDoses(p, e, M.curveGridStart(NOW), NOW, NOW).filter((d) => d < C);
  // the creation day's 08:00 slot is the expectedDosesOn floor (all of its slots were before C): declared
  assert.ok(sched.includes(at(20, 8)));
  const expected = sum([...sched, ...after.map((r) => Date.parse(r.logged_at))], NOW);
  const lv = M.estimatedLevelNow(p, NOW, { logs: [...backfill, ...after] }).value;
  assert.ok(near(lv, expected), `${lv} vs ${expected}`);
  // The backfill rows change nothing.
  assert.equal(M.estimatedLevelNow(p, NOW, { logs: after }).value, lv);
  // The 23rd (no row) is not counted: the planned level is higher.
  const planned = M.levelAt(M.scheduledDoses(p, e, M.curveGridStart(NOW), NOW, NOW), 10, e, NOW);
  assert.ok(lv < planned);
});

test('PK-7 / R1: the boundary is created_at − 1 h, exactly (a Taken row at C counts, one just before does not)', () => {
  const p = prot();
  const plan = M.curvePlan(p, e, M.curveGridStart(NOW, 14), NOW, NOW, { logs: [row('Taken', C), row('Taken', C - 1000)] });
  assert.ok(plan.doses.includes(C));
  assert.ok(!plan.doses.includes(C - 1000));
});

test('PK-8: the creation day, start in the past, today\'s dose (slot 08:00) marked at 16:30 → today counts once, at 16:30', () => {
  const p = prot({ created_at: iso(at(25, 14)) });
  const now = at(25, 18);
  const marked = at(25, 16, 30);
  const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [row('Taken', marked)] });
  const today = plan.doses.filter((d) => sameDay(d, now));
  assert.deepEqual(today, [marked]);
  // Not marked: the declared 08:00 dose counts (estimated from the start date), once.
  const none = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [] });
  assert.deepEqual(none.doses.filter((d) => sameDay(d, now)), [at(25, 8)]);
  // Skipped at 16:30: nothing today.
  const skipped = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [row('Skipped', marked)] });
  assert.deepEqual(skipped.doses.filter((d) => sameDay(d, now)), []);
  // And nothing is planned later today either (the day's one dose is answered).
  assert.ok(!plan.doses.some((d) => d > now && sameDay(d, now)));
});

test('PK-8: the creation day, start TODAY, slot already passed → no declared dose (level 0 until a dose is logged)', () => {
  const p = prot({ start_date: '2026-10-25', created_at: iso(at(25, 14)) });
  const now = at(25, 15);
  assert.equal(M.estimatedLevelNow(p, now, { logs: [] }).value, 0);
  const marked = at(25, 14, 5);
  const lv = M.estimatedLevelNow(p, now, { logs: [row('Taken', marked)] }).value;
  assert.ok(near(lv, sum([marked], now)));
});

test('PK-9: history_from set — nothing from the schedule before it; the Taken rows after it count', () => {
  const p = prot({ history_from: '2026-10-20' });
  const backfill = row('Taken', at(19, 8));
  const after = [21, 23].map((d) => row('Taken', at(d, 8, 30)));
  const plan = M.curvePlan(p, e, M.curveGridStart(NOW, 14), NOW, NOW, { logs: [backfill, ...after] });
  assert.deepEqual(plan.declared, []);
  assert.deepEqual(plan.doses, after.map((r) => Date.parse(r.logged_at)));
  assert.ok(near(M.estimatedLevelNow(p, NOW, { logs: [backfill, ...after] }).value, sum(after.map((r) => Date.parse(r.logged_at)), NOW)));
});

test('PK review 5 (R6): created today at 14:00 with start TODAY — the 08:00 slot Today shows as due is an open slot, projected at now', () => {
  const p = prot({ start_date: '2026-10-25', created_at: iso(at(25, 14)) });
  const now = at(25, 15);
  const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [] });
  assert.equal(plan.open, 1);
  assert.ok(plan.doses.includes(now + M.OPEN_AT_NOW_MS));
  assert.equal(M.levelAt(plan.doses, 10, e, now), 0, 'not in the level now');
  // Nothing else today (one dose a day); tomorrow at 08:00 as planned.
  assert.deepEqual(plan.doses.filter((d) => sameDay(d, now)), [now + M.OPEN_AT_NOW_MS]);
  assert.ok(plan.doses.includes(at(26, 8)));
  // A row closes it: Skipped → nothing at now; Taken → counts at its own time, nothing at now.
  assert.equal(M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [row('Skipped', at(25, 14, 20))] }).open, 0);
  const taken = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [row('Taken', at(25, 14, 5))] });
  assert.equal(taken.open, 0);
  assert.deepEqual(taken.doses.filter((d) => sameDay(d, now)), [at(25, 14, 5)]);
  // Created on an earlier day (start that day): its catch-up slot is past, never projected at a later now.
  const older = prot({ start_date: '2026-10-24', created_at: iso(at(24, 14)) });
  assert.equal(M.curvePlan(older, e, M.curveGridStart(at(25, 7), 3), at(25, 7) + 864e5, at(25, 7), { logs: [] }).open, 0);
});

test('PK review 4 (R3): a Skipped or Missed row on an estimated day before creation answers that day\'s slot — it adds nothing', () => {
  const p = prot();
  // Backfill before C: 15th Skipped, 16th Missed (half an hour after the slot), 17th Taken (it counts once,
  // as the estimated slot), 18th–20th nothing (estimated as scheduled).
  const backfill = [row('Skipped', at(15, 8, 0)), row('Missed', at(16, 8, 30)), row('Taken', at(17, 8, 0))];
  const after = [21, 22, 24].map((d) => row('Taken', at(d, 9, 15)));
  const plan = M.curvePlan(p, e, M.curveGridStart(NOW, 14), NOW, NOW, { logs: [...backfill, ...after] });
  const sched = M.scheduledDoses(p, e, M.curveGridStart(NOW, 14), NOW, NOW).filter((d) => d < C);
  const expectedDeclared = sched.filter((d) => d !== at(15, 8) && d !== at(16, 8));
  assert.deepEqual([...plan.declared], expectedDeclared);
  assert.ok(plan.declared.includes(at(17, 8)), 'a Taken backfill keeps its estimated slot, once');
  assert.equal(plan.doses.filter((d) => sameDay(d, at(17, 8))).length, 1);
  const lv = M.estimatedLevelNow(p, NOW, { logs: [...backfill, ...after] }).value;
  // The level is the one without those rows minus exactly the two answered days.
  const without = M.estimatedLevelNow(p, NOW, { logs: after }).value;
  assert.ok(near(lv, without - sum([at(15, 8), at(16, 8)], NOW)), `${lv} vs ${without - sum([at(15, 8), at(16, 8)], NOW)}`);
  // No solid (estimated-dose) tick on those two days; the Taken backfill day keeps its tick.
  const ticks = M.doseTicks(p, plan.planned, [...backfill, ...after], NOW);
  assert.ok(!ticks.some((k) => k.ts === at(15, 8) || k.ts === at(16, 8)));
  assert.ok(ticks.some((k) => k.ts === at(17, 8) && !k.hollow));
});
