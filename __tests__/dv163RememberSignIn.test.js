// DV-163 / DL-59 (parked-error sweep 2026-10-31): someone who typed onboarding answers and then chose "Sign in"
// was sent back to the onboarding after a restart (the stash with answers reopened it). The choice is remembered:
// a restart opens Sign in; Back to the onboarding, or a sign-in, forgets it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startEntry } = require('../lib/pendingProfile');

test('DV-163: the first screen after a restart', () => {
  assert.deepEqual(startEntry({ seen: true, stash: { display_name: 'Evo' }, choice: 'signin' }), { seen: true, mode: 'signin' });
  assert.deepEqual(startEntry({ seen: true, stash: { display_name: 'Evo' }, choice: null }), { seen: false, mode: undefined }, 'answers without the choice: the onboarding, as before');
  assert.deepEqual(startEntry({ seen: true, stash: null, choice: null }), { seen: true, mode: undefined });
  assert.deepEqual(startEntry({ seen: false, stash: null, choice: null }), { seen: false, mode: undefined });
});

test('DV-163: App remembers and forgets the choice', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /if \(mode === 'signin'\) rememberSignInChoice\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(app, /forgetSignInChoice\(\)\.catch\(\(\) => \{\}\); \/\/ DV-163: back to the onboarding/);
  assert.match(app, /const e = startEntry\(\{ seen, stash, choice \}\);/);
});
