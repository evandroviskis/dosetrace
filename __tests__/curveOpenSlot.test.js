'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-4, R6): a slot already due with no row yet (open) is NOT in
// the level now; it is projected as a planned dose placed at now; it drops out once a row closes it; a
// late Taken counts at its own time.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const at = (m, d, h, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();
const iso = (ms) => new Date(ms).toISOString();
// Weekly Testosterone Cypionate 100 mg, Fridays 09:00 (start Fri 2026-10-02, created that morning).
const weekly = (over = {}) => ({
  id: 3, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '100', dose_unit: 'mg',
  interval_days: 7, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-02', created_at: iso(at(10, 2, 7)), ...over,
});
const row = (outcome, ms) => ({ protocol_id: 3, outcome, logged_at: iso(ms), sync_status: 'synced' });
const e = H.getHalfLifeEntry('Testosterone Cypionate');
const NOW = at(10, 23, 11); // Fri 23 Oct, 11:00 — today's 09:00 slot is 2 h overdue
const PAST = [at(10, 2, 9, 5), at(10, 9, 9, 10), at(10, 16, 8, 50)].map((t) => row('Taken', t));
const sum = (times, T) => times.reduce((s, t) => s + 100 * H.amountFraction(e, (T - t) / HOUR), 0);
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function plan(logs, now = NOW) {
  return M.curvePlan(weekly(), e, M.curveGridStart(now, 3), now + 7 * 864e5, now, { logs });
}

test('PK-4: the open slot (due 2 h ago, no row) is not in the level now', () => {
  const p = plan(PAST);
  const pastTimes = PAST.map((r) => Date.parse(r.logged_at));
  assert.ok(near(M.levelAt(p.doses, 100, e, NOW), sum(pastTimes, NOW)));
  assert.ok(near(M.estimatedLevelNow(weekly(), NOW, { logs: PAST }).value, sum(pastTimes, NOW)));
  assert.equal(p.open, 1);
});

test('PK-4: the projection an hour later includes a dose placed at now', () => {
  const p = plan(PAST);
  const T = NOW + HOUR;
  const pastTimes = PAST.map((r) => Date.parse(r.logged_at));
  const expected = sum([...pastTimes, NOW + M.OPEN_AT_NOW_MS], T);
  assert.ok(near(M.levelAt(p.doses, 100, e, T), expected), `${M.levelAt(p.doses, 100, e, T)} vs ${expected}`);
  assert.ok(p.doses.includes(NOW + M.OPEN_AT_NOW_MS), 'placed at now');
  assert.ok(!p.doses.includes(at(10, 23, 9)), 'never at the passed 09:00 slot');
  // The next week is the plan at its own slot.
  assert.ok(p.doses.includes(at(10, 30, 9)));
});

test('PK-4: after a Missed row closes the slot the planned dose drops out', () => {
  const p = plan([...PAST, row('Missed', at(10, 23, 9))]);
  assert.equal(p.open, 0);
  assert.ok(!p.doses.some((d) => d > NOW - HOUR && d < at(10, 30, 0)), 'nothing planned for today');
  // Skipped closes it the same way.
  assert.equal(plan([...PAST, row('Skipped', at(10, 23, 10, 30))]).open, 0);
});

test('R6: a late Taken counts at its own time, and the open dose is gone', () => {
  const late = at(10, 23, 10, 40);
  const p = plan([...PAST, row('Taken', late)]);
  assert.equal(p.open, 0);
  assert.ok(p.doses.includes(late));
  const pastTimes = [...PAST.map((r) => Date.parse(r.logged_at)), late];
  assert.ok(near(M.levelAt(p.doses, 100, e, NOW), sum(pastTimes, NOW)));
});

test('R6: the open dose follows now (a later compute places it at that moment)', () => {
  const later = NOW + 2 * HOUR;
  const p = plan(PAST, later);
  assert.ok(p.doses.includes(later + M.OPEN_AT_NOW_MS));
  assert.ok(!p.doses.includes(NOW + M.OPEN_AT_NOW_MS));
});

// PK review of AD-96 B (2026-10-26), finding 1 (R6 amendment, needs the founder's signature): a 4×/day
// protocol with nothing logged by 19:00 has three open slots (08:00, 12:00, 16:00). Projecting each as a
// dose at now drew them as one spike at Now — it read like "take the missed doses together now". At
// most ONE open slot per day is projected (the latest due one); the earlier ones add nothing until a row
// closes them.
const fourADay = (over = {}) => ({
  id: 5, type: 'recon', name: 'BPC-157', compound_id: null, dose: '250', dose_unit: 'mcg',
  interval_days: 1, doses_per_day: 4, reminder_time: '08:00,12:00,16:00,20:00', start_date: '2026-10-20',
  created_at: iso(at(10, 20, 7)), ...over,
});
const bpc = H.getHalfLifeEntry('BPC-157');
const row5 = (outcome, ms) => ({ protocol_id: 5, outcome, logged_at: iso(ms), sync_status: 'synced' });
const plan4 = (logs, now) => M.curvePlan(fourADay(), bpc, M.curveGridStart(now, 3), now + 2 * 864e5, now, { logs });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

test('PK review 1 (R6): a 4×/day protocol with nothing logged by 19:00 projects ONE dose at now, never three', () => {
  const now = at(10, 23, 19);
  const p = plan4([], now);
  assert.equal(p.open, 1);
  assert.deepEqual(p.doses.filter((d) => d > now - 12 * HOUR && d <= now + 1), [now + M.OPEN_AT_NOW_MS]);
  // The 20:00 slot is still the plan, at its own time; tomorrow is the full schedule.
  assert.deepEqual(p.doses.filter((d) => d > now && sameDay(d, now)), [now + M.OPEN_AT_NOW_MS, at(10, 23, 20)]);
  assert.equal(p.doses.filter((d) => sameDay(d, at(10, 24, 12))).length, 4);
});

test('PK review 1 (R6): one open dose while any due slot is open; none once every due slot is closed', () => {
  const now = at(10, 23, 19, 10);
  // One Taken at 19:05: it closes one slot; two due slots are still open → still one dose at now.
  const one = plan4([row5('Taken', at(10, 23, 19, 5))], now);
  assert.equal(one.open, 1);
  assert.ok(one.doses.includes(at(10, 23, 19, 5)));
  assert.ok(one.doses.includes(now + M.OPEN_AT_NOW_MS));
  // Every due slot answered (Taken, Skipped, Missed): nothing at now; 20:00 stays planned.
  const all = plan4([row5('Taken', at(10, 23, 8, 2)), row5('Skipped', at(10, 23, 12, 1)), row5('Missed', at(10, 23, 16))], now);
  assert.equal(all.open, 0);
  assert.ok(!all.doses.includes(now + M.OPEN_AT_NOW_MS));
  assert.ok(all.doses.includes(at(10, 23, 20)));
});
