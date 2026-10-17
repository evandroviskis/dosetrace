'use strict';
// Found on device 2026-10-17 (Galaxy Z Fold, folded, 1080x2520, build 52): in the AI food log,
// "Fix this entry" / "Corrigir este registro" showed only its top strip (Cancel · title · Save and
// the day bar) at the bottom of the screen; the item names, kcal / carbs / protein and Remove
// entry were below the edge and a swipe did nothing. The iOS simulator showed the whole sheet.
//
// Cause: the sheet was an Animated.View with entering={SlideInDown} inside the transparent Modal.
// The editor's first render is empty (items [] and date null until its useEffect copies the row),
// so the entering animation starts on a sheet that holds only the header and Remove entry. While
// a Reanimated 4 entering animation runs, every frame writes the view's FIRST layout (its
// finalView: height and position) with the animated originY (LayoutAnimationsProxy
// addOngoingAnimations); the next commit, where the day bar and items arrive and the sheet grows
// upward, is pushed and then overwritten by the next frame. On Android the sheet stays at that
// first, header-sized frame; overflow: hidden clips the rest, and the ScrollView inside has its
// full new height so it has nothing to scroll. The uiautomator bounds fit: header top to the
// clip is about the height of the empty sheet (header + Remove entry + padding).
//
// Fix: on Android the sheet has no Reanimated entering animation (it fades in with the Modal's
// scrim and is laid out normally); iPhone keeps the approved slide-up unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EDITOR = 'screens/components/FoodEntryEditor.js';

test('food editor: on Android the sheet does not use a Reanimated entering animation inside the Modal', () => {
  const src = read(EDITOR);
  assert.match(src, /<Modal visible=\{!!row\} transparent/, 'the sheet still lives in a transparent Modal');
  assert.doesNotMatch(src, /entering=\{SlideInDown/, 'no unconditional SlideInDown on the sheet');
  assert.match(
    src,
    /const SHEET_ENTERING = Platform\.OS === 'ios' \? SlideInDown\.duration\(280\) : undefined;/,
    'the slide-up is iPhone only',
  );
  assert.match(src, /<Animated\.View entering=\{SHEET_ENTERING\} style=\{s\.sheet\}>/);
});

test('food editor: iPhone keeps the approved slide-up (part 23, 280 ms)', () => {
  const src = read(EDITOR);
  assert.match(src, /import Animated, \{ SlideInDown \} from 'react-native-reanimated';/);
  assert.match(src, /Platform\.OS === 'ios' \? SlideInDown\.duration\(280\)/);
});

test('food editor: the sheet keeps its on-screen layout (bottom-anchored, capped, scrollable, above the system bar)', () => {
  const src = read(EDITOR);
  assert.match(src, /scrim: \{ flex: 1, justifyContent: 'flex-end'/);
  assert.match(src, /sheet: \{[^}]*maxHeight: '100%'[^}]*\}/);
  assert.match(src, /<View style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}>/);
  assert.match(src, /const gap = useSheetGap\(30\);/);
  assert.match(src, /<ScrollView bounces=\{false\} keyboardShouldPersistTaps="handled"/);
});

// A guard for new code: no bottom sheet may slide in with a Reanimated entering animation inside
// a Modal on Android. The two feature sheets below use the same pattern but mount with their full
// content (shown/feature is set before the Animated.View renders) and nothing in them changes
// layout during the slide, so they have not shown this bug; they are listed, not changed
// (reported 2026-10-17). Anything new must gate its entering to iOS.
const KNOWN_SAME_PATTERN = new Set(['components/FeatureExplainers.js', 'components/FeaturePreviews.js']);

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.(js|jsx|tsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('no other sheet adds an ungated Reanimated entering animation inside a Modal', () => {
  const found = [];
  for (const f of [...jsFiles('screens'), ...jsFiles('components')]) {
    const src = read(f);
    if (!/<Modal\b/.test(src)) continue;
    if (!/entering=\{(SlideIn|FadeIn|ZoomIn|BounceIn|FlipIn|LightSpeedIn|PinwheelIn|RollIn|StretchIn|RotateIn)/.test(src)) continue;
    found.push(f.split(path.sep).join('/'));
  }
  for (const f of found) assert.ok(KNOWN_SAME_PATTERN.has(f), `${f}: entering animation inside a Modal; gate it to iOS (Android keeps the first layout)`);
});
