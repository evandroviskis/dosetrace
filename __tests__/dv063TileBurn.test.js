// DV-063 (parked-error sweep 2026-10-31; seen on the iPhone: the Evolução Progress tile said 2.350 kcal while
// the Progress page said 2.340). The tile computed the burn from the saved calculator weight while the page
// takes the newest weigh-in (lib/numbersWeight, A-101e). The tile now takes the same weight.
const test = require('node:test');
const assert = require('node:assert/strict');
const { progressTile } = require('../lib/progressTile');
const { energyPlan } = require('../lib/energyCalc');

test('DV-063: the tile burn is the burn at the weight the Progress page uses (the newer weigh-in)', () => {
  const base = { unit: 'metric', bfSource: 'unknown', height: '178', activity: 1.375, goal: 'lose' };
  const meta = { gender: 'male', birth_year: 1985 };
  const snapshots = [{ entry_date: '2026-10-01', weight_kg: 86 }, { entry_date: '2026-10-12', weight_kg: 80 }];
  const r = progressTile({ saved: { ...base, weight: '86', weightAt: '2026-10-01' }, meta, snapshots, checks: [], now: new Date(2026, 9, 31) });
  const at80 = energyPlan({ weightKg: 80, heightCm: 178, age: 41, sex: 'male', bodyFatPct: null, activity: 1.375, goal: 'lose' });
  assert.equal(r.weight, '80.0');
  assert.equal(r.tdee, Math.round(at80.tdeeVal / 10) * 10);
  // the typed weight is newer than every weigh-in: it stays
  const typed = progressTile({ saved: { ...base, weight: '83', weightAt: '2026-10-20' }, meta, snapshots, checks: [], now: new Date(2026, 9, 31) });
  const at83 = energyPlan({ weightKg: 83, heightCm: 178, age: 41, sex: 'male', bodyFatPct: null, activity: 1.375, goal: 'lose' });
  assert.equal(typed.tdee, Math.round(at83.tdeeVal / 10) * 10);
});
