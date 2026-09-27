'use strict';
// S-15 connection tests (docs/specs/fixes-1.2.5.md FX-2…FX-5; docs/review/app-map.md).
// They guard links BETWEEN tabs/modules. Tests marked { todo } describe behavior
// whose fix is a later scope item: they run and report red now (the proof the gap
// exists) without failing the suite, and the todo flag is removed in the same
// commit that fixes the item (FX-2 → S-02, FX-4 → S-06, FX-5 → S-03).
const test = require('node:test');
const assert = require('node:assert/strict');

// Loads a module that the fix introduces; until then the test is red.
function load(path) { return require(path); }

// ── FX-3: food rows → 7-day run → reality check → Your daily plan "Measured" (L-17 → L-18)
test('FX-3 chain: 7 consecutive logged days feed the reality check, whose measured maintenance sets the daily plan', () => {
  const { intakeRun } = require('../lib/nutrition');
  const { realityCheckTDEE, goalsForTdee } = require('../lib/energyCalc');
  const start = '2026-09-01';
  const today = '2026-09-22'; // day 22 of the check
  const rows = [];
  for (let d = 1; d <= 21; d++) {
    const iso = `2026-09-${String(d).padStart(2, '0')}`;
    rows.push({ id: d, entry_date: iso, parse_status: 'done', source: 'ai', kcal: 2000 });
  }
  const run = intakeRun(rows, start, today);
  assert.equal(run.ok, true);
  assert.equal(run.days, 21);
  assert.equal(run.avgKcal, 2000);

  // Lost 1.5 kg over 21 days eating 2000/day → maintenance ≈ 2000 + 1.5×7700/21 = 2550.
  const rc = realityCheckTDEE({ avgDailyCalories: run.avgKcal, weightChangeKg: 1.5, days: 21 });
  assert.equal(rc.status, 'ok');
  assert.equal(Math.round(rc.tdee), 2550);

  const plan = goalsForTdee(rc.tdee, { bmr: 1800, sex: 'male' });
  assert.equal(Math.round(plan.maintain.mid), 2550);
  assert.ok(plan.lose.mid >= 1800, 'lose target respects the BMR floor');
});

test('FX-3 chain: a gap in the food log gives no intake number (reality check cannot run on guesses)', () => {
  const { intakeRun } = require('../lib/nutrition');
  const rows = [];
  for (const d of [1, 2, 3, 5, 6, 7]) rows.push({ id: d, entry_date: `2026-09-0${d}`, parse_status: 'done', source: 'ai', kcal: 2000 });
  const run = intakeRun(rows, '2026-09-01', '2026-09-08');
  assert.equal(run.ok, false);
  assert.equal(run.current, 3); // 5,6,7 in a row
});

// ── FX-2: one mark-taken for Today and the notification (L-07, L-08) → S-02
test('FX-2: mark taken plans ONE Taken row, flips an auto-Missed row instead of duplicating, and moves the vial count once', { todo: 'S-02 (one shared mark-taken)' }, () => {
  const { planMarkTaken } = load('../lib/markTaken');
  const protocol = { id: 1, type: 'recon', doses_per_day: 1, interval_days: 1, dose: '250', dose_unit: 'mcg', amount: '5', unit: 'mg' };
  const vial = { id: 9, doses_taken: 3, total_doses: 20 };
  const missed = { id: 55, protocol_id: 1, outcome: 'Missed', logged_at: '2026-09-27T09:00:00' };
  const plan = planMarkTaken({ protocol, vial, todayLogs: [missed], dayKey: '2026-09-27', slotMs: Date.parse('2026-09-27T09:00:00') });
  assert.equal(plan.insert, null, 'no new row when a Missed row exists for that slot');
  assert.equal(plan.update.id, 55);
  assert.equal(plan.update.outcome, 'Taken');
  assert.equal(plan.vialUpdate.doses_taken, 4);
  const again = planMarkTaken({ protocol, vial: { ...vial, doses_taken: 4 }, todayLogs: [{ ...missed, outcome: 'Taken' }], dayKey: '2026-09-27', slotMs: Date.parse('2026-09-27T09:00:00') });
  assert.equal(again.alreadyTaken, true, 'a dose already logged is never logged twice');
});

// ── FX-4: one entitlement answer everywhere, store unreachable (L-24 + L-34) → S-06
test('FX-4: store unreachable → the cached entitlement decides, with its expiration date', { todo: 'S-06 (one entitlement helper)' }, () => {
  const { entitlementFrom } = load('../lib/entitlement');
  const now = Date.parse('2026-09-27T12:00:00Z');
  const paying = entitlementFrom({ live: null, cache: { premium: true, expiresAt: '2026-10-27T00:00:00Z' }, now });
  assert.equal(paying.premium, true, 'paying user offline keeps full access');
  const expired = entitlementFrom({ live: null, cache: { premium: true, expiresAt: '2026-09-01T00:00:00Z' }, now });
  assert.equal(expired.premium, false, 'cached expiration passed → not paying');
  const unknown = entitlementFrom({ live: null, cache: null, now });
  assert.equal(unknown.premium, false, 'never known paying → free tier');
});

// ── FX-5: reality-check start/stop and its reminders (L-20, L-21, L-47) → S-03
test('FX-5: Stop clears the open check and cancels the day-21 and 8 PM reminders', { todo: 'S-03 (synced reality-check storage)' }, () => {
  const { stopRealityCheckPlan } = load('../lib/realityCheckStore');
  const plan = stopRealityCheckPlan({ open: { date: '2026-09-10', weightKg: 88 } });
  assert.equal(plan.open, null);
  assert.deepEqual(plan.cancelReminders.sort(), ['food_evening', 'reality_check_day21']);
  assert.equal(plan.keepFoodLogs, true);
});
