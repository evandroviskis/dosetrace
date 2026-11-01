// Parked-error sweep 2026-10-31 (DIVERGENCES DV-101 / AD-14, DV-102 / AD-15).
// DV-101: the reality check's "free" flag was the food log's canLog, which is also true in a lapsed payer's
//   grace week — so a non-Premium user started checks and saw results beyond FL-41. Free = the free days only.
// DV-102: the typed-calories link (FL-48 "A", Premium only) showed to free-days and grace users.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');

test('DV-101: rcFree is the free days (trial), never the grace week', () => {
  const sets = src.match(/setRcFree\([^;]*\);/g) || [];
  assert.equal(sets.length >= 2, true);
  for (const s of sets.filter((x) => /access/.test(x))) assert.match(s, /access\.mode === 'trial'/, s);
});

test('DV-102: the typed-calories link and sheet are Premium only', () => {
  assert.match(src, /\{premium \? \(\s*<TouchableOpacity onPress=\{openTypedKcal\}/);
  assert.match(src, /function openTypedKcal\(\) \{\s*if \(!rcStart \|\| checkSaved \|\| !premium\) return;/);
});
