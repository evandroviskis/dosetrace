'use strict';
// DV-072 C (AD-96 C, OPEN-11) — 1.3.1: the curve stays schedule-driven (the level is unchanged), and each
// planned dose tick under the axis shows what the Dose log says about it: a planned dose in the logged era
// (from the protocol's creation − 1 h, spec R1) with no Taken row — Skipped, Missed, never answered, or due
// and still open — is drawn HOLLOW (spec R16); a Taken dose, the declared part before creation and the
// plan after Now stay solid. Option B (the past from Taken rows only) is 1.3.2 — not built here.
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const sqlite = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' '); // SQLite datetime(): UTC, no zone
const daily = (over = {}) => ({
  id: 5, type: 'rtu', compound_id: 'rtu_testosterone_cypionate', name: 'Testosterone Cypionate', dose: 20, dose_unit: 'mg',
  interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-10', created_at: iso(at(10, 7)), ...over,
});
const entryOf = (p) => H.getHalfLifeEntry(M.matchName(p));
const row = (pid, outcome, ms, extra = {}) => ({ protocol_id: pid, outcome, logged_at: iso(ms), sync_status: 'synced', ...extra });

function setup(p, now) {
  const e = entryOf(p);
  return { e, doses: M.scheduledDoses(p, e, M.curveGridStart(now, 14), now + 7 * 864e5, now) };
}

test('DV-072 C: 7 Taken / 2 Skipped / 1 Missed over 10 days → exactly those 3 ticks hollow, the level unchanged', () => {
  const p = daily();
  const now = at(19, 15);
  const { e, doses } = setup(p, now);
  const outcomes = { 10: 'Taken', 11: 'Taken', 12: 'Skipped', 13: 'Taken', 14: 'Missed', 15: 'Taken', 16: 'Taken', 17: 'Skipped', 18: 'Taken', 19: 'Taken' };
  const logs = Object.entries(outcomes).map(([d, o]) => row(5, o, o === 'Missed' ? at(+d, 9) : at(+d, 9, 20)));
  const ticks = M.doseTicks(p, doses, logs, now);
  assert.deepEqual(ticks.map((k) => k.ts), doses, 'one tick per planned dose');
  const hollowDays = ticks.filter((k) => k.hollow).map((k) => new Date(k.ts).getDate());
  assert.deepEqual(hollowDays, [12, 14, 17]);
  // The future plan stays solid.
  assert.ok(ticks.filter((k) => k.ts > now).every((k) => !k.hollow));
  // C: the number is the planned one (schedule-driven), whatever the log says.
  assert.equal(M.estimatedLevelNow(p, now).value, M.levelAt(doses.filter((d) => d <= now), 20, e, now));
});

test('DV-072 C / R16: a past planned dose with no row at all (never answered) and the open slot are hollow', () => {
  const p = daily({ reminder_time: '09:00,13:00', doses_per_day: 2, start_date: '2026-10-18', created_at: iso(at(18, 6)) });
  const now = at(19, 14);
  const { doses } = setup(p, now);
  const logs = [row(5, 'Taken', at(18, 9, 5)), row(5, 'Taken', at(18, 13, 30)), row(5, 'Taken', at(19, 9, 2))];
  const map = Object.fromEntries(M.doseTicks(p, doses, logs, now).map((k) => [new Date(k.ts).toString(), k.hollow]));
  assert.equal(map[new Date(at(18, 9)).toString()], false);
  assert.equal(map[new Date(at(18, 13)).toString()], false);
  assert.equal(map[new Date(at(19, 9)).toString()], false);
  assert.equal(map[new Date(at(19, 13)).toString()], true, 'due 1 h ago, no row yet → hollow');
  assert.equal(map[new Date(at(20, 9)).toString()], false, 'future plan stays solid');
});

test('DV-072 C: a Taken row late on the slot\'s own day still covers it (counting by number, R7)', () => {
  const p = daily({ reminder_time: '08:00,20:00', doses_per_day: 2, start_date: '2026-10-18', created_at: iso(at(18, 6)) });
  const now = at(19, 23);
  const { doses } = setup(p, now);
  // 18th: the 08:00 dose marked at 15:00, nothing for 20:00. 19th: Skipped at 08:10, Taken at 20:40.
  const logs = [row(5, 'Taken', at(18, 15)), row(5, 'Skipped', at(19, 8, 10)), row(5, 'Taken', at(19, 20, 40))];
  const hollow = M.doseTicks(p, doses, logs, now).filter((k) => k.ts <= now).map((k) => [new Date(k.ts).getDate(), new Date(k.ts).getHours(), k.hollow]);
  assert.deepEqual(hollow, [[18, 8, false], [18, 20, true], [19, 8, true], [19, 20, false]]);
});

test('DV-072 C: the declared part before creation stays solid (no log is expected there, spec R1)', () => {
  const p = daily({ start_date: '2026-10-05', created_at: iso(at(15, 16)) });
  const now = at(17, 12);
  const { doses } = setup(p, now);
  const ticks = M.doseTicks(p, doses, [row(5, 'Taken', at(16, 9)), row(5, 'Taken', at(17, 9))], now);
  for (const k of ticks) {
    const d = new Date(k.ts).getDate();
    if (k.ts < at(15, 15)) assert.equal(k.hollow, false, `declared ${d}`);
  }
  // The creation day's 09:00 dose (before creation − 1 h) is declared → solid even without a row.
  assert.ok(!ticks.find((k) => k.ts === at(15, 9)) || ticks.find((k) => k.ts === at(15, 9)).hollow === false);
  assert.deepEqual(ticks.filter((k) => k.hollow).map((k) => new Date(k.ts).getDate()), []);
});

test('DV-072 C: deleted rows, other protocols\' rows, future-dated and unparseable rows never make a tick solid; SQLite times parse', () => {
  const p = daily({ start_date: '2026-10-17', created_at: iso(at(17, 6)) });
  const now = at(19, 12);
  const { doses } = setup(p, now);
  const logs = [
    row(5, 'Taken', at(17, 9), { sync_status: 'deleted' }),           // deleted → not taken
    row(6, 'Taken', at(18, 9)),                                        // another protocol
    { protocol_id: 5, outcome: 'Taken', logged_at: sqlite(at(19, 9, 1)), sync_status: 'synced' }, // SQLite format → taken
    { protocol_id: 5, outcome: 'Taken', logged_at: 'garbage', sync_status: 'synced' },
  ];
  let ticks;
  assert.doesNotThrow(() => { ticks = M.doseTicks(p, doses, logs, now); });
  const past = ticks.filter((k) => k.ts <= now).map((k) => [new Date(k.ts).getDate(), k.hollow]);
  assert.deepEqual(past, [[17, true], [18, true], [19, false]]);
  // A Taken row dated after now (a phone clock that was ahead) does not cover today's due slot.
  const ahead = M.doseTicks(daily({ reminder_time: '11:00', start_date: '2026-10-19', created_at: iso(at(19, 6)) }), [at(19, 11)], [row(5, 'Taken', at(19, 13))], now);
  assert.deepEqual(ahead, [{ ts: at(19, 11), hollow: true }]);
});

test('DV-072 C: a blend component reads the blend protocol\'s own rows', () => {
  const blend = { id: 9, type: 'recon', compound_id: 'lyo_wolverine', name: 'Wolverine', dose: 5, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-18', created_at: iso(at(18, 6)) };
  const comp = M.splitCurveProtocols([blend]).active[0];
  assert.match(String(comp.id), /^9__/);
  const now = at(19, 12);
  const { doses } = setup(comp, now);
  const ticks = M.doseTicks(comp, doses, [row(9, 'Taken', at(18, 9)), row(9, 'Skipped', at(19, 9))], now);
  assert.deepEqual(ticks.filter((k) => k.ts <= now).map((k) => k.hollow), [false, true]);
});

test('DV-072 C: no logs at all → every logged-era past tick hollow, no crash on a missing log list', () => {
  const p = daily({ start_date: '2026-10-18', created_at: iso(at(18, 6)) });
  const now = at(19, 12);
  const { doses } = setup(p, now);
  assert.deepEqual(M.doseTicks(p, doses, null, now).filter((k) => k.ts <= now).map((k) => k.hollow), [true, true]);
});
