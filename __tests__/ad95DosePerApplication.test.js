'use strict';
// AD-95 B (founder 2026-10-26 21:18 / 21:27 EDT; docs/decisions.md): the curve reflects what the person
// said they injected. A protocol dose change counts only for the doses marked after it; a past dose's
// own amount can be corrected and the curve changes from that dose on, nothing before it; a Missed /
// Skipped dose recovered later counts at the dose in effect at its time. Spec PK-10: "250 mg weekly for
// 8 weeks, changed to 125 mg today: the level 7 days ago is unchanged; the future uses 125".
const test = require('node:test');
const assert = require('node:assert/strict');
const { doseInEffect, nextDoseHistory, stampForTaken, curveWeight } = require('../lib/doseStamp');
const { curvePlan, levelAt } = require('../lib/serumModel');
const { getHalfLifeEntry, amountFraction, doseInCurveUnit } = require('../lib/halfLives');
const { sampleLevelsAt } = require('../lib/curveSampling');

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

test('doseInEffect: no history = the current dose; with history, the entry in force at that moment', () => {
  const p = { dose: '200', dose_unit: 'mg', dose_history: null };
  assert.deepEqual(doseInEffect(p, Date.now()), { dose: 200, unit: 'mg' });
  const t0 = Date.parse('2026-10-20T12:00:00Z');
  const h = nextDoseHistory({ dose: '200', dose_unit: 'mg', dose_history: null }, '100', 'mg', iso(t0));
  const q = { dose: '100', dose_unit: 'mg', dose_history: h };
  assert.deepEqual(doseInEffect(q, t0 - 1), { dose: 200, unit: 'mg' }, 'before the change: the old dose');
  assert.deepEqual(doseInEffect(q, t0), { dose: 100, unit: 'mg' });
  assert.deepEqual(doseInEffect(q, t0 + DAY), { dose: 100, unit: 'mg' });
});

test('nextDoseHistory: unchanged dose keeps the history; each change appends; comma decimals are numbers', () => {
  const p = { dose: '0,5', dose_unit: 'mg', dose_history: null };
  assert.equal(nextDoseHistory(p, '0.5', 'mg', '2026-10-26T00:00:00Z'), null, 'same value written differently is no change');
  const h1 = nextDoseHistory(p, '0.25', 'mg', '2026-10-26T00:00:00Z');
  assert.deepEqual(JSON.parse(h1), [{ from: null, dose: 0.5, unit: 'mg' }, { from: '2026-10-26T00:00:00Z', dose: 0.25, unit: 'mg' }]);
  const h2 = nextDoseHistory({ dose: '0.25', dose_unit: 'mg', dose_history: h1 }, '0.3', 'mg', '2026-10-27T00:00:00Z');
  assert.equal(JSON.parse(h2).length, 3);
  assert.equal(nextDoseHistory({ dose: '0.25', dose_unit: 'mg', dose_history: h1 }, '250', 'mcg', '2026-10-27T00:00:00Z') !== null, true, 'a unit change is a change');
  assert.equal(nextDoseHistory({ dose: '', dose_unit: 'mg' }, '5', 'mg', 'x'), null, 'no previous dose: nothing to remember');
});

test('stampForTaken: a dose marked now takes the current dose; a recovered past slot the dose of its time', () => {
  const t0 = Date.parse('2026-10-20T12:00:00Z');
  const p = { dose: '100', dose_unit: 'mg', dose_history: nextDoseHistory({ dose: '200', dose_unit: 'mg' }, '100', 'mg', iso(t0)) };
  assert.deepEqual(stampForTaken(p, t0 + 3600000), { dose_amount: 100, dose_unit: 'mg' });
  assert.deepEqual(stampForTaken(p, t0 - DAY), { dose_amount: 200, dose_unit: 'mg' });
  assert.equal(stampForTaken({ dose: '', dose_unit: 'mg' }, t0), null, 'no dose on the protocol: no stamp');
});

test('curveWeight: own amount over the current dose, units converted; unknown = 1', () => {
  const entry = getHalfLifeEntry('Testosterone Cypionate');
  assert.equal(curveWeight({ dose: '100', dose_unit: 'mg' }, entry, 200, 'mg'), 2);
  assert.equal(curveWeight({ dose: '1', dose_unit: 'mg' }, entry, 500, 'mcg'), 0.5);
  assert.equal(curveWeight({ dose: '100', dose_unit: 'mg' }, entry, null, null), 1);
  // a blend component compares totals (its parent's dose)
  assert.equal(curveWeight({ dose: '5', __parentDose: '10', dose_unit: 'mg' }, entry, 5, 'mg'), 0.5);
});

// PK-10, end to end: weekly testosterone, 250 mg for 8 weeks (each dose marked with its amount), the
// protocol changed to 125 mg today. The level 7 days ago is exactly what it was before the change; the
// future uses 125.
function pk10(now, current, history) {
  const entry = getHalfLifeEntry('Testosterone Cypionate');
  const created = now - 60 * DAY;
  const p = { id: 1, type: 'rtu', name: 'Testosterone Cypionate', compound_id: 'testosterone_cypionate', dose: String(current), dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: new Date(created).toISOString().slice(0, 10), created_at: iso(created), dose_history: history };
  const logs = [];
  for (let k = 8; k >= 1; k--) logs.push({ id: k, protocol_id: 1, outcome: 'Taken', logged_at: iso(now - k * 7 * DAY + 3600000), dose_amount: 250, dose_unit: 'mg' });
  const start = now - 59 * DAY, end = now + 14 * DAY;
  const plan = curvePlan(p, entry, start, end, now, { logs });
  const doseMg = doseInCurveUnit(Number(current), 'mg', entry);
  return { entry, plan, doseMg };
}

test('PK-10: changing the protocol dose today leaves the past level unchanged; the future uses the new dose', () => {
  const now = Date.parse('2026-10-26T15:00:00Z');
  const before = pk10(now, 250, null);
  const after = pk10(now, 125, nextDoseHistory({ dose: '250', dose_unit: 'mg' }, '125', 'mg', iso(now - 60000)));
  const T = now - 7 * DAY;
  const lvBefore = levelAt(before.plan.doses, before.doseMg, before.entry, T);
  const lvAfter = levelAt(after.plan.doses, after.doseMg, after.entry, T);
  assert.ok(lvBefore > 0);
  assert.ok(Math.abs(lvAfter - lvBefore) < 1e-9 * lvBefore, `level 7 days ago: ${lvBefore} vs ${lvAfter}`);
  // the samples the screen draws agree with levelAt (the carried path)
  const s = sampleLevelsAt(after.plan.doses, after.doseMg, after.entry, [T], amountFraction).points[0];
  assert.ok(Math.abs(s - lvBefore) < 1e-6 * lvBefore, `drawn ${s} vs ${lvBefore}`);
  // the future: each planned dose adds 125, not 250
  const F = now + 13 * DAY;
  const lvF250 = levelAt(before.plan.doses, before.doseMg, before.entry, F);
  const lvF125 = levelAt(after.plan.doses, after.doseMg, after.entry, F);
  assert.ok(lvF125 < lvF250, 'the future is lower with 125');
});

test('editing ONE past dose changes the curve from that dose on, nothing before it', () => {
  const now = Date.parse('2026-10-26T15:00:00Z');
  const entry = getHalfLifeEntry('Testosterone Cypionate');
  const p = { id: 1, type: 'rtu', name: 'Testosterone Cypionate', compound_id: 'testosterone_cypionate', dose: '200', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z' };
  const mk = (second) => [1, 2, 3].map((k) => ({ id: k, protocol_id: 1, outcome: 'Taken', logged_at: iso(now - (4 - k) * 7 * DAY), dose_amount: k === 2 ? second : 200, dose_unit: 'mg' }));
  const run = (second) => curvePlan(p, entry, now - 40 * DAY, now + 7 * DAY, now, { logs: mk(second) }).doses;
  const a = run(200), b = run(180);
  const edited = now - 2 * 7 * DAY;
  assert.equal(levelAt(a, 200, entry, edited - 1), levelAt(b, 200, entry, edited - 1), 'before the edited dose: identical');
  assert.ok(levelAt(b, 200, entry, edited + DAY) < levelAt(a, 200, entry, edited + DAY), 'after it: lower');
  const ratio = (levelAt(a, 200, entry, edited + DAY) - levelAt(b, 200, entry, edited + DAY)) / (20 * amountFraction(entry, 24));
  assert.ok(Math.abs(ratio - 1) < 1e-9, 'the difference is exactly the 20 mg of that one dose');
});
