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
