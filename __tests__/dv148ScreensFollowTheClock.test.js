// DV-148 (parked-error sweep 2026-10-31): screens left open did not re-render when time passed — Progress
// and the food card across midnight (yesterday's day number and food run), the curve's Now, Today's Due tag
// and an alert's snooze expiry. One clock (components/useClock + lib/dayChange nextTickDelay): every screen
// re-renders at the next local midnight; Today and the curve also every minute while in front.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nextTickDelay } = require('../lib/dayChange');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-148: the next tick is the next local midnight (+1 s), or the next whole minute when asked', () => {
  const t = new Date(2026, 9, 31, 23, 59, 30).getTime();
  assert.equal(nextTickDelay(t), 31000);
  const t2 = new Date(2026, 9, 31, 14, 10, 20).getTime();
  assert.equal(nextTickDelay(t2, true), 40050);
  assert.equal(nextTickDelay(t, true), 30050, 'the minute comes before midnight + 1 s');
  // A fake clock past midnight lands on the new day.
  const { dayKeyAt } = require('../lib/dayChange');
  assert.equal(dayKeyAt(t + nextTickDelay(t)), '2026-11-01');
});

test('DV-148: the screens use the clock', () => {
  const hook = read('components/useClock.js');
  assert.match(hook, /setTimeout\(\(\) => \{ setNowMs\(Date\.now\(\)\); arm\(\); \}, nextTickDelay\(Date\.now\(\), everyMinute\)\)/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /const \{ dayKey \} = useClock\(\);/);
  assert.equal((calc.match(/\[foodRows, rcStart, dayKey\]/g) || []).length, 2, 'the food run and the so-far list follow the day');
  assert.match(calc, /\[rcStart, snapshots, foodRun, typedKcal, dayKey\]/);
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /const \{ dayKey \} = useClock\(\);/);
  assert.match(hero, /if \(readRef\.current\) readRef\.current\(\)\.catch\(\(\) => \{\}\);\s*\}, \[dayKey\]\);/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /useClock\(\{ everyMinute: true, enabled: isFocused \}\);/);
  const curve = read('screens/SerumCurveScreen.js');
  assert.match(curve, /const \{ minuteKey \} = useClock\(\{ everyMinute: true, enabled: isFocused \}\);/);
  assert.match(curve, /hourMode, hoursChoice, stepMs, minuteKey\]\);/);
});
