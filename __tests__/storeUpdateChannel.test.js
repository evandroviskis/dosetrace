'use strict';
// Store builds get their own update channel (founder 2026-10-27 "Crie o canal de atualizações", after
// the council's release note on the first EAS Update): test binaries (TestFlight / Play internal) are
// built with the "production" profile and listen to the "production" channel, where tester updates
// go (decision 2026-10-23: store users get an update only when the founder says). A binary for the
// stores is built with the "store" profile and listens to "store", so a tester update can never reach
// store users. The same binary cannot serve both: the channel is fixed at build time, so a store
// release is its own build from the tested commit, never the promoted test binary.
const test = require('node:test');
const assert = require('node:assert/strict');
const eas = require('../eas.json');

test('store builds listen to their own channel; test builds keep production', () => {
  assert.equal(eas.build.production.channel, 'production', 'test binaries: tester updates');
  assert.equal(eas.build.store.channel, 'store', 'store binaries: only updates the founder releases');
  assert.notEqual(eas.build.store.channel, eas.build.production.channel);
  assert.equal(eas.build.store.extends, 'production', 'same env, version rules and credentials as the tested build');
});

test('a store build can be submitted with its own profile (same targets as production)', () => {
  assert.equal(eas.submit.store.extends, 'production');
});

test('eas.json is outside the runtime fingerprint (.fingerprintignore), so editing build profiles never orphans installed binaries', () => {
  const fs = require('fs');
  const path = require('path');
  const lines = fs.readFileSync(path.join(__dirname, '..', '.fingerprintignore'), 'utf8').split('\n').map((l) => l.trim());
  require('node:assert/strict').ok(lines.includes('eas.json'));
});
