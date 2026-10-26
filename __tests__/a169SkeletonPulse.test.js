'use strict';
// A-169 review (2026-10-26), finding 3: the profile-card skeleton's pulse (withRepeat -1) ran for
// the whole session, because usePulse() was called in SettingsScreen itself — a tab that stays
// mounted. Now the skeleton is its own small component, so the pulse stops when the skeleton
// unmounts (TodaySkeleton usePulse cancels its animation on unmount).
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock } = require('./helpers/extractFn');
const { SRC } = require('./helpers/settingsFetchUser');

test('A-169 review 3: the profile-card skeleton is its own component; SettingsScreen never runs the pulse', () => {
  const screen = sliceBlock(SRC, 'export default function SettingsScreen(');
  assert.doesNotMatch(screen, /usePulse\(/, 'no pulse hook in the screen (a tab that stays mounted)');
  const comp = sliceBlock(SRC, 'function ProfileCardSkeleton(');
  assert.match(comp, /const pulse = usePulse\(\);/, 'the skeleton runs it, so it stops when it unmounts');
  assert.match(sliceBlock(SRC, 'function renderProfileSkeleton()'), /<ProfileCardSkeleton /);
  assert.match(sliceBlock(SRC, 'function renderProfileCard()'), /if \(!cardReady\) return renderProfileSkeleton\(\);/);
});
