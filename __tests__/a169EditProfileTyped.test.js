'use strict';
// A-169 review (2026-10-26), finding 5: the profile card is tappable on its first frame; text typed
// in Edit profile before fetchUser() landed was overwritten by it (never lose user input). Now
// Edit profile opens once the profile is read (at most the A-120 cap), and fetchUser() never
// overwrites the editor's fields while it is open. Cancel / Save still close and reload the saved
// values. Runs the real fetchUser / openEditProfile / setEditProfileOpen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock } = require('./helpers/extractFn');
const { settings, USER, tick, SRC } = require('./helpers/settingsFetchUser');

test('A-169 review 5: Edit profile opens once the profile is read — the first read never lands over typed text', async () => {
  // The first read answers when the test says so; later reads (focus, Cancel) answer at once.
  let answer;
  const first = new Promise((r) => { answer = r; });
  let reads = 0;
  const S = settings({ getCachedUser: () => (reads++ === 0 ? first : Promise.resolve(USER)), cap: 5000 });
  assert.equal(typeof S.openEditProfile, 'function', 'openEditProfile');
  const loading = S.fetchUser();
  S.openEditProfile(); // the tap on the first frame
  await tick(10);
  assert.equal(S.state.showEditProfile, false, 'waits for the read (a few ms in practice)');
  answer(USER);
  await loading;
  await tick(10);
  assert.equal(S.state.showEditProfile, true, 'then opens with the saved values');
  assert.equal(S.state.country, 'US');
  // The user types; a later fetchUser (a focus, a sync) never overwrites the open editor.
  S.deps.setDisplayName('Samantha');
  S.deps.setCountry('PT');
  await S.fetchUser();
  assert.equal(S.state.displayName, 'Samantha');
  assert.equal(S.state.country, 'PT');
  // Cancel (or Save) closes, then fetchUser reloads the saved values (Cancel undoes).
  S.setEditProfileOpen(false);
  await S.fetchUser();
  assert.equal(S.state.showEditProfile, false);
  assert.equal(S.state.displayName, 'Sam Carter');
  assert.equal(S.state.country, 'US');
});

test('A-169 review 5: a read that never ends still lets Edit profile open at the cap', async () => {
  const S = settings({ getCachedUser: () => new Promise(() => {}), cap: 60 });
  S.fetchUser().catch(() => {});
  S.openEditProfile();
  await tick(150);
  assert.equal(S.state.showEditProfile, true);
});

test('A-169 review 5: every open and close of Edit profile goes through setEditProfileOpen', () => {
  const card = sliceBlock(SRC, 'function renderProfileCard()');
  assert.match(card, /onPress=\{openEditProfile\}/, 'the card opens through the wait');
  assert.doesNotMatch(SRC, /setShowEditProfile\((true|false)\)/, 'no direct open/close that would skip the guard');
  assert.match(sliceBlock(SRC, 'function setEditProfileOpen('), /editProfileOpen\.current = /);
});
