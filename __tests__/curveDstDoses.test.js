'use strict';
// A-101b (found 2026-10-06 on the store prints): the demo Testosterone's +30d projection spiked to
// 649 mg. Cause: scheduledDoses stepped through the days in fixed 24 h steps from local midnight, so
// on the day the clock goes back (US: 2026-11-01, a 25 h day) it visited that day twice and counted
// its dose twice. Each calendar day must be visited exactly once, in every time zone.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const p = { id: 1, name: 'Testosterone Cypionate', compound_id: 'rtu_testosterone_cypionate', dose: '250', dose_unit: 'mg',
  interval_days: 7, doses_per_day: 1, reminder_time: '13:20', start_date: '2026-09-06', type: 'rtu', active: 1 };

test('A-101b: no dose is counted twice across a clock change (fall back and spring forward)', () => {
  const e = H.getHalfLifeEntry(M.matchName(p));
  for (const [nowIso, days] of [['2026-10-06T12:00:00', 30], ['2027-03-01T12:00:00', 30]]) {
    const now = new Date(nowIso).getTime();
    const doses = M.scheduledDoses(p, e, M.curveGridStart(now), now + days * 864e5, now);
    assert.equal(doses.length, new Set(doses).size, `${nowIso}: duplicate dose times`);
    const daysOf = doses.map((d) => new Date(d).toDateString());
    assert.equal(daysOf.length, new Set(daysOf).size, `${nowIso}: one weekly dose per dosing day`);
  }
});

test('A-101b: the weekly 250 mg projection settles near its steady state, no spike', () => {
  const e = H.getHalfLifeEntry(M.matchName(p));
  const now = new Date('2026-10-06T12:00:00').getTime();
  const end = now + 30 * 864e5;
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now), end, now);
  let mx = 0;
  for (let T = now - 3 * 864e5; T <= end; T += 3600e3) mx = Math.max(mx, M.levelAt(doses, 250, e, T));
  assert.ok(mx < 600, `peak ${mx.toFixed(0)} mg`);
});
