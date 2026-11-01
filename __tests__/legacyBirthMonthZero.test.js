// Gate B review N2 / founder 2026-10-31 ("Concordo com as duas"): old app versions stored the birth month 0-based
// (January = 0); today 1–12 is stored and 0 was read as missing (onboarding) or as month −1 (Settings). A stored 0
// is now read as January everywhere and rewritten as 1 when Settings opens; 1–12 stay as they are (an old 3 and a
// new 3 cannot be told apart).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { birthMonthIndex } = require('../lib/profileName');

test('birth month: stored 0 = January, 1–12 as stored, anything else unknown', () => {
  assert.equal(birthMonthIndex(0), 0);
  assert.equal(birthMonthIndex('0'), 0);
  assert.equal(birthMonthIndex(1), 0);
  assert.equal(birthMonthIndex(12), 11);
  assert.equal(birthMonthIndex(13), null);
  assert.equal(birthMonthIndex(null), null);
  const { formFrom } = require('../lib/onboardingSteps');
  assert.equal(formFrom({ birth_month: 0, birth_year: 1985 }).birthMonth, 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SettingsScreen.js'), 'utf8');
  assert.match(src, /setBirthMonth\(birthMonthIndex\(pm\.birth_month\)\);/); // DV-114 Gate B 2: pm = profileMeta(user)
  assert.match(src, /if \(String\(user\.user_metadata\?\.birth_month\) === '0'\) supabase\.auth\.updateUser\(\{ data: \{ birth_month: 1 \} \}\)\.catch\(\(\) => \{\}\);/);
});
