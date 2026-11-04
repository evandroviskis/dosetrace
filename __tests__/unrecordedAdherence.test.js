'use strict';
// UP-18: adherence (rings, the provider report), the Dose log counts and the streak treat a dose answered in the
// unrecorded-period question exactly like a dose corrected later in the Dose log: Taken counts as taken, Skipped
// as not taken. The answer writes ordinary rows at the slot (lib/unrecordedPeriod planUnrecordedAnswer), so the
// same numbers come out as from the rows the Dose log's one-by-one path writes (lib/markTaken planMarkTaken).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../lib/unrecordedPeriod');
const { planMarkTaken, planSkipPending } = require('../lib/markTaken');
const { slotCounts } = require('../lib/adherenceRings');
const { adherenceStats } = require('../lib/adherenceReport');
const { reportStreaks } = require('../lib/doseStreak');

const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const NOW = L(2026, 11, 3, 10);
const keyOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const p = { id: 2, user_id: 'u', remote_id: 'r2', name: 'BPC-157', type: 'recon', dose: '250', dose_unit: 'mcg', reminder_time: '08:00', doses_per_day: 1, interval_days: 1, start_date: '2026-09-15', active: 1, created_at: new Date(L(2026, 9, 15, 7)).toISOString() };

function bothWays() {
  const entries = U.gapEntries(p, [], { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null });
  const picked = new Set(entries.filter((_, i) => i % 3 !== 0).map((e) => e.slotMs));
  const answered = U.planUnrecordedAnswer({ protocol: p, entries, choice: 'pick', picked, nowMs: NOW }).inserts
    .map((r, i) => ({ id: 100 + i, ...r }));
  const oneByOne = entries.map((e, i) => {
    const plan = picked.has(e.slotMs)
      ? planMarkTaken({ protocol: p, todayLogs: [], dayKey: keyOf(e.slotMs), slotMs: e.slotMs, nowMs: NOW })
      : planSkipPending({ protocol: p, todayLogs: [], dayKey: keyOf(e.slotMs), slotMs: e.slotMs, nowMs: NOW });
    return { id: 200 + i, ...plan.insert };
  });
  return { answered, oneByOne };
}

test('UP-18: the rings / report slot counts are the same as for doses corrected one by one', () => {
  const { answered, oneByOne } = bothWays();
  const from = L(2026, 9, 15);
  assert.deepEqual(slotCounts([p], answered, from, NOW), slotCounts([p], oneByOne, from, NOW));
  const a = adherenceStats({ protocols: [p], logs: answered, sinceMs: from, nowMs: NOW });
  const b = adherenceStats({ protocols: [p], logs: oneByOne, sinceMs: from, nowMs: NOW });
  assert.deepEqual(a, b);
  const c = slotCounts([p], answered, from, NOW)[p.id];
  assert.ok(c.taken > 0 && c.taken < c.due, 'Taken counts as taken, Skipped as not taken');
});

test('UP-18: the streak and the Dose log counts are the same', () => {
  const { answered, oneByOne } = bothWays();
  const takenA = answered.filter((r) => r.outcome === 'Taken');
  const takenB = oneByOne.filter((r) => r.outcome === 'Taken');
  assert.deepEqual(reportStreaks([p], takenA, new Date(NOW)), reportStreaks([p], takenB, new Date(NOW)));
  const count = (rows, o) => rows.filter((r) => r.outcome === o).length;
  for (const o of ['Taken', 'Skipped', 'Missed']) assert.equal(count(answered, o), count(oneByOne, o), o);
});
