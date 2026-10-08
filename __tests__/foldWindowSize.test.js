'use strict';
// Founder's Fold 2026-10-07 (test build 3): closing the phone left the two-page book on the narrow
// cover screen. With the activity handling fold changes itself (plugins/withFoldConfigChanges) the
// new-architecture host only refreshes React Native's window size behind a feature flag
// (ReactHostImpl.onConfigurationChanged), so useWindowDimensions can keep the unfolded size. The app
// measures its own root instead: the laid-out size always follows the real window.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { pickWindowSize, isBook } = require('../lib/bookLayout');

test('fold: the laid-out root size wins over a stale window size', () => {
  const staleUnfolded = { width: 884, height: 920, fontScale: 1, scale: 2.625 };
  const cover = { width: 411, height: 860 };
  const s = pickWindowSize(cover, staleUnfolded);
  assert.equal(s.width, 411); assert.equal(s.height, 860); assert.equal(s.fontScale, 1, 'other fields kept');
  assert.equal(isBook(s.width, s.height, 'android', { width: 1080, height: 2520 }), false, 'closed Fold: one column');
  assert.deepEqual(pickWindowSize(null, staleUnfolded), staleUnfolded, 'before the first layout: the window size');
  assert.deepEqual(pickWindowSize({ width: 0, height: 0 }, staleUnfolded), staleUnfolded);
});

test('fold: the book, the responsive hook and every width-sized screen read the measured size', () => {
  assert.match(read('components/BookPanes.js'), /useWindowSize\(\)/);
  assert.doesNotMatch(read('components/BookPanes.js'), /useWindowDimensions\(\)/);
  assert.match(read('lib/responsive.js'), /useWindowSize\(\)/);
  for (const f of ['screens/PaywallScreen.js', 'screens/BodyScreen.js', 'screens/ProgressScreen.js', 'screens/SerumCurveScreen.js', 'screens/OnboardingFlowScreen.js', 'screens/ProtocolsScreen.js', 'screens/TodayScreen.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /const \{ width[^}]*\} = useWindowDimensions\(\)/, `${f} reads the width from the measured size`);
  }
  const app = read('App.js');
  assert.equal((app.match(/<WindowSizeRoot>/g) || []).length, 2, 'both app roots are measured');
  const w = read('lib/windowSize.js');
  assert.match(w, /onLayout/);
  assert.match(w, /export function useWindowSize\(/);
});
