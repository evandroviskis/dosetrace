// DV-162 (parked-error sweep 2026-10-31): the profile gate checked presence only, so old data such as
// birth_year "abc" passed and the BMR math read garbage. The age field counts only a real year (1900…this year)
// and month; anything else is asked again by onboarding.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-162: the age field requires a valid birth year and month', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/supabase.js'), 'utf8');
  assert.match(src, /case 'age': return validBirthYear\(m\.birth_year\) && validBirthMonth\(m\.birth_month\);/);
  const { validBirthYear, validBirthMonth } = require('../lib/profileName');
  assert.equal(validBirthYear('abc'), false);
  assert.equal(validBirthYear(1985), true);
  assert.equal(validBirthYear('1985'), true);
  assert.equal(validBirthYear(1850), false);
  assert.equal(validBirthYear(new Date().getFullYear() + 1), false);
  assert.equal(validBirthMonth(0), true);
  assert.equal(validBirthMonth('x'), false);
  assert.equal(validBirthMonth(null), false);
});

// Gate B review N3: the gate itself, with real metadata.
test('DV-162 behaviour: the age field with real user metadata', () => {
  const { loadFn } = require('./helpers/extractFn');
  const { validBirthYear, validBirthMonth } = require('../lib/profileName');
  const present = loadFn('lib/supabase.js', 'function fieldPresent(', 'fieldPresent', { validBirthYear, validBirthMonth });
  assert.equal(present({ birth_year: 1985, birth_month: 0 }, 'age'), true, 'a legacy 0-based month');
  assert.equal(present({ birth_year: '1985', birth_month: '3' }, 'age'), true);
  assert.equal(present({ birth_year: 'abc', birth_month: 3 }, 'age'), false);
  assert.equal(present({ birth_year: '', birth_month: 3 }, 'age'), false);
});
