// DV-195 (parked-error sweep 2026-10-31): Paywall entry points without a `source` hid where a purchase started
// (the food chat's locked card). Every navigation to the Paywall names its source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-195: every navigate(\'Paywall\') carries a source', () => {
  const dirs = ['screens', 'screens/components', 'components'];
  const bad = [];
  for (const d of dirs) for (const f of fs.readdirSync(path.join(__dirname, '..', d)).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(__dirname, '..', d, f), 'utf8');
    for (const m of src.matchAll(/navigate\('Paywall'(\)|, \{[^}]*\})/g)) if (!/source/.test(m[0])) bad.push(`${d}/${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});
