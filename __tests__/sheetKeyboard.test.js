'use strict';
// Found on device 2026-10-17 (Galaxy Z Fold, folded, build 53): Calculator › "Log today's
// weight". Tapping weight, body fat or waist opens the keyboard over the WHOLE sheet — fields,
// Save and title hidden, only the page behind it visible. The user types blind and cannot reach
// Save, so the weigh-in cannot be finished. Pre-existing.
//
// Cause: the app draws edge to edge on Android, so a transparent Modal is never resized for the
// keyboard, and every bottom sheet's KeyboardAvoidingView pads on iPhone only. The same structure
// sits in the calculator's SheetModal (six sheets: weigh-in, reality-check start, typed kcal, fix
// a past weigh-in, add a past weigh-in, target), My Body's BottomSheet (BodyScreen,
// VaccinesSection, the onboarding country sheet; it has a footer under its scroll area) and the
// body map (BodyMapModal's free-text site).
//
// Fix, at sheet level (no per-input wiring): lib/sheetKeyboard (pure) + components/useSheetKeyboard.
// On Android, while the keyboard is up, the sheet is lifted by the keyboard's overlap with the
// Modal (plus a gap), its height is capped to the room above the keyboard so its ScrollView
// scrolls and a footer stays above the keyboard, and the focused field is scrolled into view.
// iPhone is unchanged (KeyboardAvoidingView padding; the hook is off).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sheetKeyboardLift, sheetFocusScrollY } = require('../lib/sheetKeyboard');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// The folded Fold in dp (1080 x 2520 px / 2.625): 411 x 960. The keyboard covers the bottom 45%
// (432 dp) with the 24 dp navigation bar under it; React Native reports its height without
// the bar (408) and its top at 528.
const FOLD = { rootHeight: 960, kbTop: 528, kbHeight: 408 };

test('sheet keyboard: the Fold case — the weigh-in sheet sits wholly above the keyboard', () => {
  const lift = sheetKeyboardLift({ ...FOLD, gap: 8, topRoom: 48 });
  assert.equal(lift.bottom, 432 + 8, 'lifted by the real overlap (navigation bar included) + the gap');
  assert.equal(lift.maxHeight, 960 - 48 - 440, 'capped to the room above the keyboard');
  assert.ok(960 - lift.bottom < FOLD.kbTop, 'the sheet\'s bottom (its Save) is above the keyboard\'s top');
  // The weigh-in sheet (title, weight + body fat, waist, note, Save) is about 330 dp: it fits.
  assert.ok(lift.maxHeight >= 330);
});

test('sheet keyboard: keyboard down = the sheet keeps its place', () => {
  assert.equal(sheetKeyboardLift({ rootHeight: 960, kbTop: null, kbHeight: 0 }), null);
  assert.equal(sheetKeyboardLift({ rootHeight: 960 }), null);
  assert.equal(sheetKeyboardLift(), null);
});

test('sheet keyboard: never lifted less than the keyboard, never more than keyboard + a bar', () => {
  // kbTop below the Modal\'s bottom / missing / nonsense → the keyboard\'s own height
  assert.equal(sheetKeyboardLift({ rootHeight: 960, kbTop: 2000, kbHeight: 408, gap: 0 }).bottom, 408);
  assert.equal(sheetKeyboardLift({ rootHeight: 960, kbTop: undefined, kbHeight: 408, gap: 0 }).bottom, 408);
  // a keyboard top far too high (a wrong origin) is clamped to keyboard + 96
  assert.equal(sheetKeyboardLift({ rootHeight: 960, kbTop: 100, kbHeight: 408, gap: 0 }).bottom, 408 + 96);
  // root unknown (not laid out yet): the keyboard height, no explicit cap
  const noRoot = sheetKeyboardLift({ rootHeight: 0, kbTop: 528, kbHeight: 408 });
  assert.equal(noRoot.bottom, 416);
  assert.equal(noRoot.maxHeight, null);
  // a flush edge sheet (the body map): no gap
  assert.equal(sheetKeyboardLift({ ...FOLD, gap: 0, topRoom: 24 }).bottom, 432);
  assert.equal(sheetKeyboardLift({ ...FOLD, gap: 0, topRoom: 24 }).maxHeight, 960 - 24 - 432);
  // a tiny window never yields a negative cap
  assert.equal(sheetKeyboardLift({ rootHeight: 300, kbTop: 0.5, kbHeight: 290 }).maxHeight, 0);
});

test('sheet keyboard: the focused field is scrolled into the lifted sheet\'s visible part', () => {
  // the lifted, capped sheet's scroll view spans 120–470 (dp, window), the keyboard's top is 528,
  // and the focused field sits at 450–500, half below the scroll view's visible end.
  const y = sheetFocusScrollY({ fieldTop: 450, fieldBottom: 500, viewTop: 120, viewBottom: 470, kbTop: 528, scrollY: 40 });
  assert.equal(y, 40 + (500 + 12 - 470));
  // already visible: no scroll
  assert.equal(sheetFocusScrollY({ fieldTop: 200, fieldBottom: 250, viewTop: 120, viewBottom: 470, kbTop: 528 }), null);
  // the keyboard top above the view\'s bottom wins
  assert.equal(sheetFocusScrollY({ fieldTop: 400, fieldBottom: 450, viewTop: 120, viewBottom: 600, kbTop: 440, scrollY: 0 }), 450 + 12 - 440);
  // a field not in this scroll view (above it), or unmeasured: leave it
  assert.equal(sheetFocusScrollY({ fieldTop: 50, fieldBottom: 90, viewTop: 120, viewBottom: 470 }), null);
  assert.equal(sheetFocusScrollY({ fieldTop: NaN, fieldBottom: 90, viewTop: 120, viewBottom: 470 }), null);
});

test('sheet keyboard: the hook — Android listeners, initial state, off = nothing', () => {
  const src = read('components/useSheetKeyboard.js');
  assert.match(src, /export default function useSheetKeyboard\(enabled, \{ gap = 8, topRoom = 48 \} = \{\}\)/);
  assert.match(src, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(src, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(src, /if \(!enabled\) \{/, 'off: no listeners');
  assert.match(src, /Keyboard\.isVisible\(\)/, 'a sheet opened over an open keyboard lifts at once');
  assert.match(src, /TextInput\.State\.currentlyFocusedInput\(\)/, 'the focused field, no per-input wiring');
  assert.match(src, /sheetKeyboardLift\(/);
  assert.match(src, /sheetFocusScrollY\(/);
  assert.match(src, /onLayout: enabled \?/, 'off: no onLayout');
  assert.match(src, /scrollProps: enabled \? scrollProps : NO_PROPS/, 'off: no scroll props');
});

// file → the sheet's hook call (Android only, while visible) and its wiring
const KAV_IOS = "behavior={Platform.OS === 'ios' ? 'padding' : undefined}";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [file, fn] of [['screens/components/CalculatorSection.js', 'function SheetModal('], ['screens/components/BodySheets.js', 'export function BottomSheet(']]) {
  test(`sheet keyboard: ${file} lifts its sheet on Android only; iPhone unchanged`, () => {
    const src = read(file);
    const body = src.slice(src.indexOf(fn), src.indexOf('</Modal>', src.indexOf(fn)));
    assert.match(src, /import useSheetKeyboard from '\.\.\/\.\.\/components\/useSheetKeyboard';/);
    assert.match(body, /const restGap = useSheetGap\(30\); \/\/ A-136 \(2\)/);
    assert.match(body, /const kb = useSheetKeyboard\(Platform\.OS === 'android' && !!visible\);/);
    assert.match(body, /const gap = kb\.lift \? kb\.lift\.bottom : restGap;/, 'iPhone: the gap is the old gap');
    assert.match(body, new RegExp(`<KeyboardAvoidingView style=\\{s\\.kav\\} ${esc(KAV_IOS)} onLayout=\\{kb\\.onLayout\\}>`));
    assert.match(body, /<View style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}>/);
    assert.match(body, /<View style=\{\[s\.sheet, kb\.sheetStyle\]\}/, 'the cap');
    assert.match(body, /<ScrollView [^>]*\{\.\.\.kb\.scrollProps\}/);
  });
}

test('sheet keyboard: My Body\'s footer sits under the scroll area inside the capped sheet', () => {
  const src = read('screens/components/BodySheets.js');
  const body = src.slice(src.indexOf('export function BottomSheet('), src.indexOf('</Modal>'));
  assert.match(body, /<\/ScrollView>\s*\{footer \? <View style=\{s\.footer\}>\{footer\}<\/View> : null\}\s*<\/View>/);
});

test('sheet keyboard: the body map lifts its edge sheet on Android only; iPhone unchanged', () => {
  const src = read('screens/components/BodyMapModal.js');
  assert.match(src, /import useSheetKeyboard from '\.\.\/\.\.\/components\/useSheetKeyboard';/);
  assert.match(src, /const restPad = useSheetEdgePad\(24\); \/\/ A-136 \(2\)/);
  assert.match(src, /const kb = useSheetKeyboard\(Platform\.OS === 'android' && !!visible, \{ gap: 0, topRoom: 24 \}\);/);
  assert.match(src, /const sheetPad = kb\.lift \? 24 : restPad;/);
  assert.match(src, new RegExp(`<KeyboardAvoidingView style=\\{kb\\.lift \\? \\[s\\.overlay, \\{ paddingBottom: kb\\.lift\\.bottom \\}\\] : s\\.overlay\\} ${esc(KAV_IOS)} onLayout=\\{kb\\.onLayout\\}>`));
  assert.match(src, /<View style=\{\[s\.sheet, \{ paddingBottom: sheetPad \}, kb\.sheetStyle\]\}>/);
  assert.match(src, /<ScrollView\s+\{\.\.\.kb\.scrollProps\}/);
});
