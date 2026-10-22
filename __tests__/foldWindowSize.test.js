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
  // A-135: one app root (the loading gate and the app share it, so nothing is re-created when it opens).
  assert.equal((app.match(/<WindowSizeRoot>/g) || []).length, 1, 'the app root is measured');
  const w = read('lib/windowSize.js');
  assert.match(w, /onLayout/);
  assert.match(w, /export function useWindowSize\(/);
});

// A-129 (founder 2026-10-15): every foldable re-lays out when it is closed or opened. No file may
// size anything from React Native's window size, which can stay at the other size after a fold:
// width/height come from the measured root (lib/windowSize useWindowSize), and so do fontScale and
// scale (useWindowSize passes them through). The only direct read left is listed below, with why.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
// A-161 (2026-10-22): BookPanes no longer reads the screen posture, so no direct read is left.
const ALLOWED_DIMENSIONS = [];
function sourceFiles() {
  const out = ['App.js'];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(r);
    }
  };
  ['screens', 'components', 'lib'].forEach(walk);
  return out;
}
// Code only: block comments and whole-line comments are dropped, so a comment may still name the API.
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('A-129: no screen, component or lib reads React Native window size directly (whole app)', () => {
  const files = sourceFiles();
  assert.ok(files.length > 50, 'the walk found the app sources');
  const bad = [];
  for (const f of files) {
    if (f === 'lib/windowSize.js') continue;
    let code = codeOf(read(f));
    if (/\buseWindowDimensions\b/.test(code)) bad.push(`${f}: useWindowDimensions (use useWindowSize from lib/windowSize)`);
    for (const a of ALLOWED_DIMENSIONS.filter((x) => x.file === f)) {
      assert.ok(code.includes(a.code), `${f}: allow-list entry still matches the code (${a.reason})`);
      code = code.split(a.code).join('');
    }
    // What is left may only import Dimensions (for an allowed read), never call it.
    const uses = code.replace(/import\s*\{[^}]*\}\s*from\s*'react-native'/g, '');
    if (/\bDimensions\b/.test(uses)) bad.push(`${f}: Dimensions (get / addEventListener) sizes from the stale window`);
    if (/\buseSafeAreaFrame\b|\binitialWindowMetrics\b\.frame/.test(uses)) bad.push(`${f}: a safe-area frame read for layout`);
  }
  assert.deepEqual(bad, [], 'every size decision reads the measured root');
});

test('A-129: the measured size reaches every sheet and modal (they render under WindowSizeRoot)', () => {
  // A React Native Modal (or a portal) is still a child in the React tree, so it reads the context
  // of the WindowSizeRoot above it; the size is right only if nothing renders outside that root.
  const app = read('App.js');
  const returns = app.split('\n').reduce((acc, l, i, all) => (/^\s*return \($/.test(l) && /<WindowSizeRoot>|<SafeAreaProvider/.test(all[i + 1] || '') ? acc.concat(all[i + 1].trim()) : acc), []);
  assert.equal(returns.length, 1, 'the one app root found (A-135: the gate renders inside it)');
  for (const r of returns) assert.equal(r, '<WindowSizeRoot>', 'the measured root is the outermost element of the app root');
  const idx = codeOf(read('index.js'));
  assert.doesNotMatch(idx, /AppRegistry\.registerComponent/, 'no second React root outside App');
  assert.equal((idx.match(/registerRootComponent\(/g) || []).length, 1, 'one root: App');
  for (const f of ['screens/components/BodyMapModal.js', 'screens/components/CalculatorSection.js', 'components/FeatureExplainers.js', 'components/FeaturePreviews.js', 'screens/JourneyScreen.js']) {
    assert.match(read(f), /import \{ useWindowSize \} from '..\/(..\/)?lib\/windowSize'/, `${f} imports the measured size`);
    assert.match(read(f), /= useWindowSize\(\)/, `${f} reads the measured size`);
  }
  // The modal sheets size themselves from it: a closed Fold gets a sheet that fits the cover screen.
  const sheetW = (winW) => Math.min(winW - 16, 560);
  assert.equal(sheetW(pickWindowSize({ width: 411, height: 860 }, { width: 884, height: 920 }).width), 395);
});

test('A-129: the one allowed screen read (BookPanes posture) can never keep the book on a closed Fold', () => {
  // React Native refreshes its screen size only on a rotation, so after closing the phone the screen
  // can still be the unfolded one. Posture only decides "hinge vertical?"; the size is the measured root.
  const staleInner = { width: 750, height: 832 };
  const cover = pickWindowSize({ width: 411, height: 860 }, { width: 750, height: 790 });
  assert.equal(isBook(cover.width, cover.height, 'android', staleInner), false, 'closed: one column even with the stale unfolded screen');
  assert.equal(isBook(750, 790, 'android', { width: 411, height: 915 }), true, 'opened, held normally, stale cover screen: two pages');
  const src = read('components/BookPanes.js');
  assert.match(src, /const \{ width, height \} = useWindowSize\(\)/, 'useBook sizes from the measured root');
});
