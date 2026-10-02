'use strict';
// One segmented bar for the whole app (founder 2026-10-02, "Barras: Q1=C Q2=B Q3=C Q4=B").
// Q4 = B: every existing segmented bar becomes the ONE shared bar, drawn like the Settings
// bar he approved: well track (padding 3, gap 2, radius 14), equal segments full width
// (minHeight 42, radius 11, 15/500 ink2), the chosen one raised with a 1 pt line ring and
// ink 700 text. Rebuild = replace: no per-screen seg styles are left behind.
// Q2 = B: the Dose log filter (All / Taken / Skipped / Missed) is the same bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

test('Q4: components/SegmentedBar.js exists and draws the approved Settings bar from theme tokens', () => {
  assert.ok(exists('components', 'SegmentedBar.js'), 'components/SegmentedBar.js not built yet');
  const src = read('components', 'SegmentedBar.js');
  assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.match(src, /useTheme\(\)/, 'reads colors from the theme hook');
  assert.match(src, /track: \{[^}]*flexDirection: 'row'[^}]*gap: 2[^}]*padding: 3[^}]*borderRadius: 14[^}]*backgroundColor: c\.well/);
  assert.match(src, /item: \{[^}]*flex: 1[^}]*minHeight: 42[^}]*borderRadius: 11/);
  assert.match(src, /itemOn: \{ backgroundColor: c\.raised, borderColor: c\.line \}/);
  assert.match(src, /text: \{[^}]*fontSize: 15[^}]*fontWeight: '500'[^}]*color: c\.ink2/);
  assert.match(src, /textOn: \{ color: c\.ink, fontWeight: '700' \}/);
  assert.match(src, /borderWidth: 1\b/, '1 pt ring on the chosen segment (and a matching one on the others so nothing shifts)');
  // Long languages (German "Eingenommen", "Übersprungen") shrink to fit on one line.
  assert.match(src, /numberOfLines=\{1\}/);
  assert.match(src, /adjustsFontSizeToFit/);
  assert.match(src, /minimumFontScale=\{0\.8\}/);
  assert.match(src, /accessibilityRole="radiogroup"/);
  assert.match(src, /accessibilityRole="radio"/);
  assert.match(src, /accessibilityState=\{\{ selected/);
  // Both themes: tokens only.
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex');
  assert.doesNotMatch(src, /'(white|black|transparent)'/, 'no named colors');
  assert.doesNotMatch(src, /rgba?\(/, 'no rgba');
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, 'no emoji');
});

test('Q4: the tap rule is pure — pick a segment; tapping the chosen one clears it only when allowDeselect', () => {
  assert.ok(exists('lib', 'segmented.js'), 'lib/segmented.js not built yet');
  const { segmentNext } = require('../lib/segmented');
  assert.equal(segmentNext('light', 'dark', false), 'dark');
  assert.equal(segmentNext('dark', 'dark', false), 'dark', 'without allowDeselect the chosen one stays chosen');
  assert.equal(segmentNext('yes', 'yes', true), null, 'allowDeselect: tapping the chosen one clears it');
  assert.equal(segmentNext(null, 'no', true), 'no');
  assert.equal(segmentNext(100, 50, false), 50, 'numeric keys work (syringe size, doses per day)');
  const src = read('components', 'SegmentedBar.js');
  assert.match(src, /segmentNext\(value, it\.key, allowDeselect\)/, 'the bar uses the pure rule');
});

// Every place that had its own segmented bar now renders the shared one (inventory
// S6–S20 wizard, S24/S25 site picker, S27 labs, S30 curve, S34/S35 calculator, S44/S46
// onboarding, S48/S49/S52/S55 settings) plus the new Dose log filter (S23) and the food
// editor day bar (Q3).
const USES = [
  ['screens/SettingsScreen.js', 4],
  ['screens/OnboardingFlowScreen.js', 2],
  ['screens/BodyScreen.js', 1],
  ['screens/SerumCurveScreen.js', 1],
  ['screens/components/CalculatorSection.js', 2],
  ['screens/components/BodyMapModal.js', 3],
  ['screens/ProtocolsScreen.js', 6],
  ['screens/LogScreen.js', 1],
  ['screens/components/FoodEntryEditor.js', 1],
];

test('Q4: every segmented bar in the app is the shared SegmentedBar', () => {
  for (const [f, n] of USES) {
    const src = read(f);
    assert.match(src, /import SegmentedBar from '\.\.\/(\.\.\/)?components\/SegmentedBar'/, `${f}: imports SegmentedBar`);
    const uses = (src.match(/<SegmentedBar\b/g) || []).length;
    assert.ok(uses >= n, `${f}: ${uses} SegmentedBar, expected at least ${n}`);
  }
});

test('Q4: rebuild = replace — no per-screen segmented styles or Seg component are left', () => {
  for (const [f] of USES) {
    const src = read(f);
    assert.doesNotMatch(src, /\n\s+seg[A-Za-z]*: \{/, `${f}: a per-screen seg style is still defined`);
    assert.doesNotMatch(src, /s\.seg[A-Za-z]*\b/, `${f}: a per-screen seg style is still used`);
    assert.doesNotMatch(src, /function Seg\(/, `${f}: the old Seg component is still there`);
  }
});

test('Q4: the site picker Front / Back bar is full width at 42 pt, not the 34 pt content-sized one', () => {
  const src = read('screens', 'components', 'BodyMapModal.js');
  assert.doesNotMatch(src, /minHeight: 34/);
  const i = src.indexOf('items={views.map(');
  assert.ok(i > 0, 'the view bar is the shared bar');
  const open = src.lastIndexOf('<SegmentedBar', i);
  const bar = src.slice(open, src.indexOf('/>', i));
  assert.doesNotMatch(bar, /style=|compact/, 'no override: full width, 42 pt like every bar');
});

test('Q2: the Dose log filter is the shared bar with the same keys and filter logic', () => {
  const src = read('screens', 'LogScreen.js');
  const i = src.indexOf('<SegmentedBar');
  assert.ok(i > 0);
  const bar = src.slice(i, src.indexOf('/>', i));
  assert.match(bar, /items=\{filters\}/);
  assert.match(bar, /value=\{filter\}/);
  assert.match(bar, /onChange=\{setFilter\}/);
  assert.match(src, /\{ key: 'All', label: t\('log_all'\) \}/);
  assert.match(src, /\{ key: 'Missed', label: t\('log_missed'\) \}/);
  assert.match(src, /if \(filter === 'All'\) return true;\s*return l\.outcome === filter;/);
  assert.doesNotMatch(src, /\n\s+pills?(On|Text|TextOn)?: \{/, 'the old filter pill styles are gone');
});
