// AD-92 (founder 2026-10-15) — parked-error sweep 2026-10-31, the parts that need no picture:
// DV-104: a check whose weight barely moved (|Δ| < 0.2 kg) is a real result — the daily burn is the average
//   eaten — saved like any other (it was never saved and the check never closed).
// DV-150: "too short" is only an average of 0 kcal (no food logged on the run's days); its copy said
//   "use weigh-ins 14 days apart", which was never the cause. Rewritten ×6.
// DV-205: an implausible result above 5,000 kcal was explained as a LOW one ("you ate more than you
//   logged"); a high value has its own message ×6. (The close-once-seen + Start over part is DV-058's
//   picture, AD-79.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { realityCheckTDEE } = require('../lib/energyCalc');
const { rcStatusKey } = require('../lib/realityCheckRules');

test('DV-104: weight change under 0.2 kg with food logged → a result, tdee = average intake', () => {
  assert.deepEqual(realityCheckTDEE({ avgDailyCalories: 2200, weightChangeKg: 0.1, days: 21 }), { status: 'ok', tdee: 2200, maintenance: true });
  assert.equal(realityCheckTDEE({ avgDailyCalories: 6000, weightChangeKg: 0.1, days: 21 }).status, 'implausible', 'still checked for plausibility');
});

test('DV-150: an average of 0 is too_short, even when the weight barely moved', () => {
  assert.equal(realityCheckTDEE({ avgDailyCalories: 0, weightChangeKg: 0.1, days: 21 }).status, 'too_short');
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(translations[l].cal_rc_too_short, /14/, l);
});

test('DV-205: a high implausible result gets the high message', () => {
  const hi = realityCheckTDEE({ avgDailyCalories: 4500, weightChangeKg: 3, days: 21 });
  assert.equal(hi.status, 'implausible');
  assert.equal(rcStatusKey(hi), 'cal_rc_implausible_high');
  assert.equal(rcStatusKey(realityCheckTDEE({ avgDailyCalories: 300, weightChangeKg: 0.3, days: 28 })), 'cal_rc_implausible');
  assert.equal(rcStatusKey({ status: 'too_short', tdee: null }), 'cal_rc_too_short');
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  assert.match(src, /<Text style=\{s\.sec2\}>\{t\(rcStatusKey\(outcomeResult\)\)\}<\/Text>/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[l].cal_rc_implausible_high, l);
    assert.equal(translations[l].cal_rc_maintenance, undefined, `${l}: maintenance is a result now, its no-result copy is gone`);
  }
});
