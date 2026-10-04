'use strict';
// Pre-build pass 2026-10-03, m14 (known A-54): the profile said Moderate while the Journey
// calculator said Light — two stored answers to one question. One source of truth: the profile's
// 5-level activity (user_metadata.activity_level). Rule, decided here and tested:
//   • the calculator, the Journey Progress tile and Edit profile all show the SAME level;
//   • the latest user choice wins: a choice in the calculator is written to the profile too
//     (merge-only, stamped activity_set_at), and a choice in Edit profile is stamped the same way;
//   • with no stamp on either side (values saved before this version) the profile wins;
//   • nothing is silently erased: reading never writes, the calculator's own copy stays in its
//     payload, and an old 4-level profile answer is kept as activity_level_legacy when replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { activitySource, activityKeyForMultiplier } = require('../lib/activityLevels');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Test03 today: profile Moderate, calculator Light, no stamps → both show Moderate (the profile)', () => {
  const r = activitySource({ meta: { activity_level: 'moderate' }, saved: { activity: 1.375 } });
  assert.deepEqual(r, { key: 'moderate', multiplier: 1.55, from: 'profile' });
});

test('the latest stamped choice wins, whichever screen it was made on', () => {
  const calcNewer = activitySource({
    meta: { activity_level: 'moderate', activity_set_at: '2026-10-01T10:00:00Z' },
    saved: { activity: 1.375, activitySetAt: '2026-10-02T10:00:00Z' },
  });
  assert.equal(calcNewer.key, 'light');
  assert.equal(calcNewer.from, 'calculator');
  const profileNewer = activitySource({
    meta: { activity_level: 'high', activity_set_at: '2026-10-03T10:00:00Z' },
    saved: { activity: 1.375, activitySetAt: '2026-10-02T10:00:00Z' },
  });
  assert.equal(profileNewer.key, 'high');
  assert.equal(profileNewer.multiplier, 1.725);
});

test('a stamped calculator choice beats an unstamped (older) profile value', () => {
  const r = activitySource({ meta: { activity_level: 'moderate' }, saved: { activity: 1.2, activitySetAt: '2026-10-02T10:00:00Z' } });
  assert.equal(r.key, 'sedentary');
});

test('only one side known, legacy profile keys, nothing known', () => {
  assert.equal(activitySource({ meta: {}, saved: { activity: 1.9 } }).key, 'very_high');
  assert.equal(activitySource({ meta: { activity_level: 'active' }, saved: null }).key, 'high');
  assert.deepEqual(activitySource({ meta: {}, saved: {} }), { key: null, multiplier: null, from: 'none' });
  assert.equal(activityKeyForMultiplier(1.55), 'moderate');
  assert.equal(activityKeyForMultiplier(1.4), null);
});

test('the calculator reads the one source and writes a user choice to the profile too', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /activitySource\(\{ meta: user\?\.user_metadata, saved: savedForBody \}\)/);
  assert.match(src, /onPress=\{\(\) => chooseActivity\(a\.value\)\}/);
  const fn = src.slice(src.indexOf('function chooseActivity'), src.indexOf('}', src.indexOf('supabase.auth.updateUser', src.indexOf('function chooseActivity'))));
  assert.match(fn, /activity_level: key/);
  assert.match(fn, /activity_set_at: at/);
  assert.match(fn, /legacyActivity\(/);
  assert.match(src, /activitySetAt/);
});

test('Edit profile shows the same level and stamps only a changed answer', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /setActivityLevel\(activitySourceKey\(user\.user_metadata, await getCalcInputs\(\)\.catch\(\(\) => null\)\)\)/);
  assert.match(src, /activity_set_at: new Date\(\)\.toISOString\(\)/);
  assert.match(src, /activityLevel !== normalizeActivityLevel\(user\?\.user_metadata\?\.activity_level\)/);
});

test('the Journey Progress tile uses the same level as the calculator', () => {
  const { progressTile } = require('../lib/progressTile');
  const base = { unit: 'metric', weight: '86', height: '177', bfSource: 'unknown', goal: 'lose' };
  const meta = { gender: 'male', birth_year: 1985, activity_level: 'moderate' };
  const a = progressTile({ saved: { ...base, activity: 1.375 }, meta, snapshots: [], checks: [], now: new Date(2026, 9, 3) });
  const b = progressTile({ saved: { ...base, activity: 1.55 }, meta, snapshots: [], checks: [], now: new Date(2026, 9, 3) });
  assert.equal(a.tdee, b.tdee, 'profile Moderate wins over the unstamped calculator Light');
});
