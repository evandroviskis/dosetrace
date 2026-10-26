'use strict';
// A-169 review (2026-10-26), finding 4: the profile card became the real (tappable) card only after
// `await getCachedUser()`; fetchUser has no try/catch, so a read that hung or threw left the
// untappable skeleton forever. Now the A-120 cap (lib/firstLoad whenAllSettled, 4 s) counts from
// the start of the read, and a failed read settles it at once. Runs the real fetchUser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { settings, USER, tick, SRC } = require('./helpers/settingsFetchUser');

test('A-169 review 4: a getCachedUser() that never answers still turns the card real at the A-120 cap', async () => {
  const S = settings({ getCachedUser: () => new Promise(() => {}), cap: 60 });
  S.fetchUser().catch(() => {});
  await tick(150);
  assert.equal(S.state.cardReady, true, 'never the untappable skeleton forever');
});

test('A-169 review 4: a getCachedUser() that throws turns the card real at once', async () => {
  const S = settings({ getCachedUser: async () => { throw new Error('keychain'); }, cap: 5000 });
  await S.fetchUser().catch(() => {});
  await tick(10);
  assert.equal(S.state.cardReady, true);
});

test('A-169 review 4: the normal read still waits for the user and its plan', async () => {
  const S = settings({ getCachedUser: async () => USER, cap: 5000 });
  await S.fetchUser();
  await tick(10);
  assert.equal(S.state.cardReady, true);
  assert.equal(S.state.premium, true);
  assert.equal(S.state.displayName, 'Sam Carter');
  assert.equal(S.state.country, 'US');
  assert.match(SRC, /whenAllSettled\(\[premiumRead\]\)\.then\(\(\) => setCardReady\(true\)\)/);
});
