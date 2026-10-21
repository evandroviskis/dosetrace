'use strict';
// DV-068 / DV-069 in Europe/Berlin (EU fall back 2026-10-25, spring forward 2027-03-28): exact dose
// instants at the protocol's own local times, the same number on the Journey tile and the curve screen
// in the days after a clock change (the 14-day and 3-day windows used to snap to grids 1 h apart).
// Companion of curveExactTime.test.js (America/New_York); each file runs in its own process.
process.env.TZ = 'Europe/Berlin';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const bpc = (over = {}) => ({
  id: 7, type: 'recon', compound_id: 'lyo_bpc_157', name: 'BPC-157', dose: 250, dose_unit: 'mcg',
  interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', created_at: '2026-10-01T00:00:00', reminder_time: '10:30', ...over,
});
const entryOf = (p) => H.getHalfLifeEntry(M.matchName(p));

test('DV-068 Berlin: tile = screen in the 14 days after the EU clock change, for every hour of a day', () => {
  for (const rt of ['12:00', '10:30', '07:00,19:00']) {
    const p = bpc({ reminder_time: rt, doses_per_day: rt.split(',').length });
    const e = entryOf(p);
    const doseMg = H.doseInCurveUnit(250, 'mcg', e);
    // From the 28th the 3-day window starts after the change (CET) while the 14-day one starts before it (CEST).
    for (let h = 0; h < 24 * 6; h++) {
      const now = new Date(2026, 9, 28, h, 30).getTime();
      const tile = M.defaultCurveLevel([p], now).value;
      const screen = M.levelAt(M.scheduledDoses(p, e, M.curveGridStart(now, 3), now + 7 * 864e5, now), doseMg, e, now);
      assert.equal(tile, screen, `${rt} @ ${new Date(now).toString()}`);
    }
  }
});

test('DV-068 Berlin: BPC-157 dosed 1 h ago reads 0.25 × 2^(−2) mg two days after the change', () => {
  const now = new Date(2026, 9, 27, 11, 30).getTime();
  const v = M.estimatedLevelNow(bpc(), now).value;
  assert.ok(Math.abs(v - 0.0625) <= 1e-12, `level ${v}`);
});

test('A-101b / R14 Berlin: a daily 22:00 dose stays at local 22:00 across 2026-10-25, once per day', () => {
  const p = bpc({ reminder_time: '22:00' });
  const e = entryOf(p);
  const now = new Date(2026, 9, 27, 9, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 5), now + 3 * 864e5, now);
  const days = doses.map((d) => new Date(d).toDateString());
  assert.equal(days.length, new Set(days).size);
  for (const d of doses) assert.equal(new Date(d).toTimeString().slice(0, 5), '22:00');
  assert.equal(new Date(2026, 9, 25, 22, 0).getTime() - new Date(2026, 9, 24, 22, 0).getTime(), 25 * HOUR);
});

test('R14 Berlin: across the spring forward (2027-03-28) a twice-daily 08:00 / 20:00 protocol keeps its local times', () => {
  const p = bpc({ reminder_time: '08:00,20:00', doses_per_day: 2, start_date: '2027-03-20', created_at: '2027-03-20T00:00:00' });
  const e = entryOf(p);
  const now = new Date(2027, 2, 30, 12, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 5), now, now);
  for (const d of doses) assert.ok(['08:00', '20:00'].includes(new Date(d).toTimeString().slice(0, 5)));
  const mar28 = doses.filter((d) => new Date(d).getDate() === 28 && new Date(d).getMonth() === 2);
  assert.equal(mar28.length, 2);
});

test('DV-069 re-review Berlin: spring forward (2026-03-29) with 02:00,03:00 — the count matches Today', () => {
  const { daySlots } = require('../lib/dosePageState');
  const p = bpc({ reminder_time: '02:00,03:00', doses_per_day: 2, start_date: '2026-03-20', created_at: '2026-03-20T00:00:00' });
  const now = new Date(2026, 2, 30, 12, 0).getTime();
  const doses = M.scheduledDoses(p, entryOf(p), M.curveGridStart(now, 5), now, now)
    .filter((d) => new Date(d).getDate() === 29 && new Date(d).getMonth() === 2);
  assert.equal(doses.length, daySlots({ protocol: p, dayKey: '2026-03-29' }).length);
  assert.equal(doses.length, 2);
});

test('DV-068 Berlin: a past date estimate reads at local noon of that date', () => {
  const now = new Date(2026, 9, 30, 9, 0).getTime();
  for (const iso of ['2026-10-24', '2026-10-25', '2026-10-26']) {
    assert.equal(new Date(M.readoutMoment(iso, '2026-10-30', now)).getHours(), 12, iso);
  }
});
