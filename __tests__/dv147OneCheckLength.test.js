// DV-147 (parked-error sweep 2026-10-31): the reality check's 21 days were hard-coded again in FoodLogHero and
// foodThread. One constant now (lib/realityCheckRules REALITY_CHECK_DAYS), re-exported by lib/notifications.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-147: one 21-day constant', () => {
  assert.equal(require('../lib/realityCheckRules').REALITY_CHECK_DAYS, 21);
  assert.doesNotMatch(read('screens/components/FoodLogHero.js'), /const CHECK_DAYS = 21;/);
  assert.doesNotMatch(read('lib/foodThread.js'), /checkDays = 21/);
  assert.match(read('lib/notifications.js'), /export \{ REALITY_CHECK_DAYS \} from '\.\/realityCheckRules';|export const REALITY_CHECK_DAYS = RC_DAYS;/);
});
