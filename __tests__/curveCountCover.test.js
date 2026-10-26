'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-5, PK-6, R7, R14): today's plan counts by number —
// planned slots left today = max(0, expected today − today's Taken / Skipped / Missed rows), on the
// remaining slot times — so an early dose or a zone change never plans a second one.
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const bpc = (over = {}) => ({
  id: 8, type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg',
  interval_days: 1, doses_per_day: 1, reminder_time: '20:00', start_date: '2026-10-01', created_at: '2026-10-01T03:00:00Z', ...over,
});
const row = (outcome, ms) => ({ protocol_id: 8, outcome, logged_at: iso(ms), sync_status: 'synced' });
const e = H.getHalfLifeEntry('BPC-157');
const dayOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

test('PK-5: the 20:00 dose logged at 15:00 → no 20:00 dose projected today', () => {
  const now = new Date(2026, 9, 20, 16, 0).getTime();
  const logged = new Date(2026, 9, 20, 15, 0).getTime();
  const plan = M.curvePlan(bpc(), e, M.curveGridStart(now, 3), now + 3 * 864e5, now, { logs: [row('Taken', logged)] });
  assert.ok(!plan.doses.includes(new Date(2026, 9, 20, 20, 0).getTime()), 'no 20:00 dose today');
  assert.ok(plan.doses.includes(logged), 'the dose counts at 15:00');
  assert.ok(plan.doses.includes(new Date(2026, 9, 21, 20, 0).getTime()), 'tomorrow is planned');
  // The "Estimate on a date" chips: today is no longer a dose day.
  assert.deepEqual(M.upcomingDoseDays([bpc()], now, 2, 180, { logs: [row('Taken', logged)] }), ['2026-10-21', '2026-10-22']);
  assert.deepEqual(M.upcomingDoseDays([bpc()], now, 1, 180, { logs: [] }), ['2026-10-20'], 'with no row today stays');
});

test('PK-5: twice daily (08:00, 20:00) with 1 logged keeps 1 planned, at 20:00', () => {
  const p = bpc({ reminder_time: '08:00,20:00', doses_per_day: 2 });
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 864e5, now, { logs: [row('Taken', new Date(2026, 9, 20, 8, 10).getTime())] });
  const todayAhead = plan.doses.filter((d) => d > now && dayOf(d) === dayOf(now));
  assert.deepEqual(todayAhead, [new Date(2026, 9, 20, 20, 0).getTime()]);
  assert.equal(plan.open, 0);
  // Both taken early (one at 08:10, one at 12:00): nothing left today.
  const both = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 864e5, now, {
    logs: [row('Taken', new Date(2026, 9, 20, 8, 10).getTime()), row('Taken', new Date(2026, 9, 20, 12, 0).getTime())],
  });
  assert.deepEqual(both.doses.filter((d) => d > now && dayOf(d) === dayOf(now)), []);
});

test('PK-6: a zone change mid-day (UTC−3 → UTC+1) with today\'s dose logged plans no second dose today', () => {
  const p = bpc({ reminder_time: '18:00' });
  // São Paulo (UTC−3): Taken at 09:00 local = 12:00Z on 2026-10-20.
  const logged = Date.UTC(2026, 9, 20, 12, 0);
  const logs = [row('Taken', logged)];
  // Then the phone is in Lagos (UTC+1, no DST): now 14:00 local = 13:00Z, today's 18:00 slot is ahead.
  process.env.TZ = 'Africa/Lagos';
  try {
    const now = Date.UTC(2026, 9, 20, 13, 0);
    assert.equal(new Date(now).getHours(), 14, 'the zone took effect');
    const plan = M.curvePlan(p, e, M.curveGridStart(now, 3), now + 2 * 864e5, now, { logs });
    assert.ok(!plan.doses.includes(new Date(2026, 9, 20, 18, 0).getTime()), 'no second dose planned today');
    assert.ok(plan.doses.includes(logged), 'the logged dose keeps its absolute instant (R14)');
    assert.ok(plan.doses.includes(new Date(2026, 9, 21, 18, 0).getTime()), 'tomorrow at 18:00 local');
    // The level now is that one dose, 1 h ago: 0.25 × 2^-2 mg.
    const lv = M.estimatedLevelNow(p, now, { logs }).value;
    assert.ok(Math.abs(lv - 0.25 * Math.pow(2, -2)) < 1e-12, `level ${lv}`);
  } finally {
    process.env.TZ = 'America/Sao_Paulo';
  }
});
