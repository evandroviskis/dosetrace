// DV-084 (DL-57; parked-error sweep 2026-10-31): signing in with Apple on iPhone wrote display_name whenever Apple
// sent a name — over a name the person already had (or changed in the app); Google never filled it at all. Both
// now fill display_name only when it is missing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nameToFill } = require('../lib/profileName');

test('DV-084: a sign-in name fills only an empty display_name', () => {
  assert.equal(nameToFill({}, 'Ana Souza'), 'Ana Souza');
  assert.equal(nameToFill({ display_name: '  ' }, 'Ana Souza'), 'Ana Souza');
  assert.equal(nameToFill({ display_name: 'Ana' }, 'Ana Souza'), null, 'never over a name already there');
  assert.equal(nameToFill({}, '  '), null);
  assert.equal(nameToFill(null, 'Ana'), 'Ana');
});

test('DV-084: Apple and Google go through it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/supabase.js'), 'utf8');
  assert.match(src, /const fill = signInName\(\{ meta: data && data\.user && data\.user\.user_metadata, providerName: full,/);
  assert.match(src, /const gName = signInName\(\{ meta: m, providerName: m\.full_name \|\| m\.name,/);
});

// Gate B review 2026-10-31 (B1): a new Google / Apple sign-up right after onboarding — the name the person typed
// in onboarding (the fresh stash) wins over the provider's; the provider's fills only when nothing was typed.
test('DV-084 (review B1): the typed onboarding name wins over the provider name', () => {
  const { signInName } = require('../lib/profileName');
  assert.equal(signInName({ meta: {}, providerName: 'Evandro Santos', stash: { display_name: 'Evo' }, stashFresh: true }), 'Evo');
  assert.equal(signInName({ meta: {}, providerName: 'Evandro Santos', stash: { display_name: 'Evo' }, stashFresh: false }), 'Evandro Santos', 'an old stash is not this person\'s');
  assert.equal(signInName({ meta: {}, providerName: 'Evandro Santos', stash: null, stashFresh: true }), 'Evandro Santos');
  assert.equal(signInName({ meta: { display_name: 'Ana' }, providerName: 'X', stash: { display_name: 'Evo' }, stashFresh: true }), null, 'never over a stored name');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/supabase.js'), 'utf8');
  assert.equal(src.split('signInName({ meta:').length - 1, 2, 'Apple and Google');
});
