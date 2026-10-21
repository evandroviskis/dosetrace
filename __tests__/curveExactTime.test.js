'use strict';
// DoseTrace 1.3.1 — the curve rows approved for 1.3.0 and found not built (docs/review/dv-audit-1.3.0.md):
//   DV-068 (spec R4, R14): no 6 h grid snap. A dose sits at its exact instant, so the Journey tile
//          (14-day grid) and the curve screen (3-day grid) can never disagree, also across a clock change.
//   DV-069 / DL-31 (spec R5): the plan uses the protocol's OWN slot times (lib/schedule expectedSlotTimesOn);
//          08:00 only for a protocol without times (DL-77), never the old 12:00 / 06+18 grid hours.
// Pure math, schedule-driven (1.3.1 keeps the planned curve; option B, logged doses, is 1.3.2).
// This file runs in America/New_York (US fall back 2026-11-01); curveExactTimeBerlin.test.js runs the
// same checks in Europe/Berlin (EU fall back 2026-10-25). node --test runs every file in its own process.
process.env.TZ = 'America/New_York';
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
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

test('DV-068: BPC-157 (t½ 0.5 h) dosed 1 h ago reads 0.25 × 2^(−2) mg, no snap', () => {
  const now = new Date(2026, 10, 6, 11, 30).getTime(); // Fri 2026-11-06 11:30, after the US clock change
  const lv = M.estimatedLevelNow(bpc(), now);
  assert.ok(near(lv.value, 0.25 * Math.pow(2, -2)), `level ${lv.value}`);
  assert.equal(lv.unit, 'mg');
});

test('DV-068: a dose 30 min ago is never left out of the level now (no rounding into the future)', () => {
  const now = new Date(2026, 10, 6, 11, 0).getTime();
  const lv = M.estimatedLevelNow(bpc(), now);
  assert.ok(near(lv.value, 0.25 * Math.pow(2, -1)), `level ${lv.value}`);
});

test('DV-068: the Journey tile, the curve screen and the date estimate read the same number across the clock change', () => {
  // DV-068 failing case: BPC-157 250 mcg daily, New York, 2026-11-06 11:30 and 12:30.
  for (const rt of ['12:00', '10:30', '08:00,20:00']) {
    const p = bpc({ reminder_time: rt, doses_per_day: rt.split(',').length });
    const e = entryOf(p);
    const doseMg = H.doseInCurveUnit(250, 'mcg', e);
    for (const now of [new Date(2026, 10, 6, 12, 30).getTime(), new Date(2026, 10, 6, 11, 30).getTime(), new Date(2026, 10, 2, 0, 15).getTime()]) {
      const tile = M.defaultCurveLevel([p], now).value;              // Journey tile (14-day model)
      const screenDoses = M.scheduledDoses(p, e, M.curveGridStart(now, M.CURVE_DEFAULT_PAST_DAYS), now + 7 * 864e5, now);
      const screen = M.levelAt(screenDoses, doseMg, e, now);          // curve screen "Est. level · now"
      assert.equal(tile, screen, `${rt} @ ${new Date(now).toString()}: tile ${tile} vs screen ${screen}`);
      // The same dose instants whatever the window (no window-dependent grid).
      const tileDoses = M.scheduledDoses(p, e, M.curveGridStart(now), now, now);
      assert.deepEqual(tileDoses.filter((d) => d <= now), screenDoses.filter((d) => d <= now));
      // "Estimate on a date": today reads at this moment.
      assert.equal(M.readoutMoment('2026-11-06', '2026-11-06', now), now);
    }
  }
});

test('DV-068: a past date estimate reads at that day\'s local noon, never shifted by the 6 h grid across DST', () => {
  const now = new Date(2026, 10, 6, 15, 37).getTime();
  for (const iso of ['2026-10-30', '2026-11-01', '2026-11-02']) {
    const T = M.readoutMoment(iso, '2026-11-06', now);
    const d = new Date(T);
    assert.equal(d.getHours(), 12, iso);
    assert.equal(d.getMinutes(), 0, iso);
    assert.equal(T, new Date(iso + 'T12:00:00').getTime());
  }
});

test('DV-069: a daily 22:00 protocol is drawn at 22:00 — at 13:00 today\'s dose is not in the level now', () => {
  const p = bpc({ reminder_time: '22:00' });
  const e = entryOf(p);
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now + 2 * 864e5, now);
  assert.ok(doses.includes(new Date(2026, 9, 20, 22, 0).getTime()), 'today 22:00 is planned');
  assert.ok(!doses.includes(new Date(2026, 9, 20, 12, 0).getTime()), 'no dose at the old 12:00 grid hour');
  for (const d of doses) assert.equal(new Date(d).getHours(), 22);
  // Yesterday 22:00 is 15 h ago: 0.25 × 2^(−30); the old 12:00 placement read 0.25 × 2^(−2).
  const lv = M.estimatedLevelNow(p, now).value;
  assert.ok(near(lv, 0.25 * Math.pow(2, -30) + 0.25 * Math.pow(2, -78), 1e-15), `level ${lv}`);
});

test('DV-069: twice daily at the user\'s own times (07:15, 19:45), one dose each, never 06:00 / 18:00', () => {
  const p = bpc({ reminder_time: '19:45,07:15', doses_per_day: 2 });
  const e = entryOf(p);
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now + 864e5, now);
  const today = doses.filter((d) => new Date(d).getDate() === 20).map((d) => new Date(d).toTimeString().slice(0, 5));
  assert.deepEqual(today, ['07:15', '19:45']);
});

test('DL-77: a protocol without reminder times is placed at 08:00', () => {
  const p = bpc({ reminder_time: null });
  const e = entryOf(p);
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now + 864e5, now);
  assert.ok(doses.length >= 3);
  for (const d of doses) assert.equal(new Date(d).toTimeString().slice(0, 5), '08:00');
});

test('DV-069 review: more doses a day than reminder times never stack on one instant (distinct times, one rule)', () => {
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const at = (h, m = 0) => new Date(2026, 9, 19, h, m).getTime();
  const dayOf = (p) => {
    const e = entryOf(p);
    return M.scheduledDoses(p, e, M.curveGridStart(now, 3), now, now).filter((d) => new Date(d).getDate() === 19);
  };
  // Legacy rows: 2 a day with no times, 2 a day with one time, the same time picked twice, 3 a day with one time.
  assert.deepEqual(dayOf(bpc({ reminder_time: null, doses_per_day: 2 })), [at(8), at(16)]);
  assert.deepEqual(dayOf(bpc({ reminder_time: '08:00', doses_per_day: 2 })), [at(8), at(16)]);
  assert.deepEqual(dayOf(bpc({ reminder_time: '08:00,08:00', doses_per_day: 2 })), [at(8), at(16)]);
  assert.deepEqual(dayOf(bpc({ reminder_time: '20:00', doses_per_day: 3 })), [at(20), at(21, 20), at(22, 40)]);
  // The rule never moves the user's own distinct times.
  assert.deepEqual(dayOf(bpc({ reminder_time: '07:15,19:45', doses_per_day: 2 })), [at(7, 15), at(19, 45)]);
  // The level counts each dose once at its own instant (no double-height spike).
  const p = bpc({ reminder_time: '08:00,08:00', doses_per_day: 2 });
  const doses = M.scheduledDoses(p, entryOf(p), M.curveGridStart(now, 3), now, now);
  assert.equal(doses.length, new Set(doses).size, 'no two doses at one instant');
});

test('DV-069 review: on the end day an extra dose is never placed after the end', () => {
  const p = bpc({ reminder_time: '08:00,08:00', doses_per_day: 2, ended_at: new Date(2026, 9, 19, 12, 0).toISOString(), active: 0 });
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, entryOf(p), M.curveGridStart(now, 3), now + 864e5, now);
  for (const d of doses) assert.ok(d <= new Date(2026, 9, 19, 12, 0).getTime(), new Date(d).toString());
});

test('DV-069: the end day draws only the slots up to the end (no dose after the end)', () => {
  const p = bpc({ reminder_time: '08:00,20:00', doses_per_day: 2, ended_at: new Date(2026, 9, 19, 15, 0).toISOString(), active: 0 });
  const e = entryOf(p);
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now + 3 * 864e5, now);
  const end = new Date(2026, 9, 19, 15, 0).getTime();
  assert.ok(doses.includes(new Date(2026, 9, 19, 8, 0).getTime()), 'the 08:00 dose of the end day');
  for (const d of doses) assert.ok(d <= end, `dose after the end: ${new Date(d).toString()}`);
});

test('DV-069: the creation day keeps its one loggable dose at the protocol\'s own time', () => {
  // Created at 23:30 after the 21:00 dose: the creation-day floor of 1 is that 21:00 dose, not 08:00/12:00.
  const p = bpc({ reminder_time: '21:00', start_date: '2026-10-18', created_at: new Date(2026, 9, 18, 23, 30).toISOString() });
  const e = entryOf(p);
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 3), now, now).filter((d) => d <= now);
  assert.deepEqual(doses.map((d) => new Date(d).toString()), [new Date(2026, 9, 18, 21, 0), new Date(2026, 9, 19, 21, 0)].map(String));
});

test('A-101b / R14: across the US fall back (2026-11-01) a daily 22:00 dose stays at local 22:00, once per day', () => {
  const p = bpc({ reminder_time: '22:00' });
  const e = entryOf(p);
  const now = new Date(2026, 10, 3, 9, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 5), now + 3 * 864e5, now);
  const days = doses.map((d) => new Date(d).toDateString());
  assert.equal(days.length, new Set(days).size, 'one dose per calendar day');
  for (const d of doses) assert.equal(new Date(d).toTimeString().slice(0, 5), '22:00');
  const oct31 = new Date(2026, 9, 31, 22, 0).getTime();
  const nov1 = new Date(2026, 10, 1, 22, 0).getTime();
  assert.ok(doses.includes(oct31) && doses.includes(nov1));
  assert.equal(nov1 - oct31, 25 * HOUR, 'the 25 h day: 22:00 to 22:00 is 25 real hours');
});

test('R14: across the US spring forward (2027-03-14) a daily 09:00 dose stays at local 09:00', () => {
  const p = bpc({ reminder_time: '09:00', start_date: '2027-03-01', created_at: '2027-03-01T00:00:00' });
  const e = entryOf(p);
  const now = new Date(2027, 2, 16, 12, 0).getTime();
  const doses = M.scheduledDoses(p, e, M.curveGridStart(now, 5), now, now);
  for (const d of doses) assert.equal(new Date(d).toTimeString().slice(0, 5), '09:00');
  assert.equal(new Date(2027, 2, 14, 9, 0).getTime() - new Date(2027, 2, 13, 9, 0).getTime(), 23 * HOUR);
});

test('upcoming dose days (the Estimate on a date chips) follow the own times: a 22:00 dose today is still upcoming at 13:00', () => {
  const p = bpc({ reminder_time: '22:00', interval_days: 3, start_date: '2026-10-20' });
  const now = new Date(2026, 9, 20, 13, 0).getTime();
  assert.deepEqual(M.upcomingDoseDays([p], now, 2), ['2026-10-20', '2026-10-23']);
});
