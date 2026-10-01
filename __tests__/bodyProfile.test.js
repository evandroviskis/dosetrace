'use strict';
// S-04 / FX-10: the PROFILE (sex assigned at birth, birth year) is the only source for
// the BMR. Saved calculator inputs used to override it, so changing the profile in
// Settings did not change the calculation, and the typed age never moved with time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const bp = () => require('../lib/bodyProfile');
const NOW = new Date(2026, 9, 1);

test('S-04: profile sex wins over a saved calculator sex; age follows the birth year', () => {
  const { profileBodyInputs } = bp();
  assert.deepEqual(profileBodyInputs({ meta: { gender: 'female', birth_year: 1985 }, saved: { sex: 'male', age: 30 }, now: NOW }), { sex: 'female', profileSex: 'female', age: '41', ageFromProfile: true });
  // A year later the age moves by itself.
  assert.equal(profileBodyInputs({ meta: { gender: 'female', birth_year: 1985 }, saved: null, now: new Date(2027, 9, 1) }).age, '42');
});

test('S-04: changing the profile changes the result — no saved value can override it', () => {
  const { profileBodyInputs } = bp();
  const saved = { sex: 'female', age: 25 };
  assert.equal(profileBodyInputs({ meta: { gender: 'male', birth_year: 1990 }, saved, now: NOW }).sex, 'male');
  assert.equal(profileBodyInputs({ meta: { gender: 'male', birth_year: 1990 }, saved, now: NOW }).age, '36');
});

test('S-04: no profile values yet → the saved calculator values are kept (never lose what was typed)', () => {
  const { profileBodyInputs } = bp();
  assert.deepEqual(profileBodyInputs({ meta: {}, saved: { sex: 'female', age: 33 }, now: NOW }), { sex: 'female', profileSex: null, age: '33', ageFromProfile: false });
  assert.deepEqual(profileBodyInputs({ meta: { birth_year: 'abc' }, saved: null, now: NOW }), { sex: 'male', profileSex: null, age: '', ageFromProfile: false });
});

test('S-04: the calculator applies the profile on EVERY focus (a Settings change shows up) and locks the age to it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'CalculatorSection.js'), 'utf8');
  const l = src.indexOf('async function load()');
  const guard = src.indexOf('if (loadedRef.current) return;', l);
  const apply = src.indexOf('profileBodyInputs(', l);
  assert.ok(apply > l && apply < guard, 'profile applied before the one-time seeding guard');
  assert.doesNotMatch(src.slice(guard, guard + 2500), /if \(saved\.sex\) setSex|if \(saved\.age != null\) setAge/, 'saved inputs never override the profile');
  assert.match(src, /value=\{age\} onChangeText=\{setAge\} editable=\{!ageFromProfile\}/);
});
