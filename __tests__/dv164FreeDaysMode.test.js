// DV-164 (DL-61; parked-error sweep 2026-10-31): "trial" is the store's intro offer only. The food log's 7 free
// days are mode 'free_days' in code too (the copy already says "free days"); no food-log path says 'trial'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { foodLogAccess } = require('../lib/foodThread');

test('DV-164: a free user is in free_days', () => {
  assert.equal(foodLogAccess({ premium: false, firstUse: null, todayISO: '2026-09-10' }).mode, 'free_days');
});

test('DV-164: no food-log access path calls its mode trial', () => {
  for (const f of ['lib/foodThread.js', 'screens/FoodChatScreen.js', 'screens/components/CalculatorSection.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(src, /mode: (inGrace \? 'grace' : )?'trial'|mode === 'trial'|\binTrial\b/, f);
  }
});
