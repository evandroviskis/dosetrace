'use strict';
// A-136 (2) — guided device session 2026-10-17 (Galaxy Z Fold7 unfolded): the curve's
// "Escolher compostos" sheet had its last row behind the Samsung taskbar. On Android the app
// draws edge to edge and a transparent Modal covers the whole window, taskbar included; every
// bottom sheet used a fixed gap (30 pt floating, 32 / 24 pt inside an edge sheet) taken from the
// iPhone prototype, never the system's bottom inset. The tab bar learned the inset on 2026-10-04
// (tabBarInsets.test.js); the sheets never did.
// Fix: one rule, lib/sheetInset (pure) + components/useSheetInset (the hook): iPhone keeps the
// approved gaps; on Android a floating sheet floats at least 8 above the system bar and an edge
// sheet adds the inset under its content. Every bottom sheet uses it: DTActionSheet,
// DTPickerSheet and DTSheet (ProtocolParts), the curve picker, My Body's BottomSheet, the
// calculator's SheetModal, the food entry editor, the fit explainer, the onboarding language
// sheet and the body map. (The dose log sheet already added insets.bottom.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sheetGap, sheetEdgePad } = require('../lib/sheetInset');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-136 (2): iPhone keeps the approved gaps', () => {
  for (const inset of [0, 21, 34]) {
    assert.equal(sheetGap(30, inset, 'ios'), 30);
    assert.equal(sheetEdgePad(32, inset, 'ios'), 32);
  }
});

test('A-136 (2): Android clears the navigation bar / taskbar', () => {
  for (const inset of [0, 16, 24, 48, 56, 72.4]) {
    const g = sheetGap(30, inset, 'android');
    assert.ok(g >= 30, `gap ${g} keeps the approved minimum`);
    assert.ok(g >= inset + 8, `inset ${inset}: the floating sheet sits ${g} up, above the bar`);
    assert.equal(sheetEdgePad(32, inset, 'android'), 32 + Math.ceil(inset), 'edge sheet: content above the bar');
  }
  assert.equal(sheetGap(30, 0, 'android'), 30, 'no inset: unchanged look');
  assert.equal(sheetGap(30, undefined, 'android'), 30);
});

test('A-136 (2): the hook reads the bottom inset and the platform', () => {
  const src = read('components/useSheetInset.js');
  assert.match(src, /useSafeAreaInsets\(\)/);
  assert.match(src, /export function useSheetGap\(base\)/);
  assert.match(src, /export function useSheetEdgePad\(base\)/);
  assert.match(src, /Platform\.OS/);
});

// file → the pattern that proves the sheet's bottom uses the rule
const SHEETS = {
  'screens/components/ProtocolParts.js': [
    /<Pressable style=\{\[s\.scrim, s\.scrimBottom, \{ paddingBottom: gap \}\]\} onPress=\{onClose\}>/, // DTActionSheet
    /<Pressable style=\{\[s\.scrim, s\.scrimBottom, \{ paddingBottom: gap \}\]\} onPress=\{onDone\}>/, // DTPickerSheet
    /<Pressable style=\{\[s\.scrim, \{ paddingBottom: centerGap \}\]\} onPress=\{dismiss\}/, // DTSheet
  ],
  'screens/SerumCurveScreen.js': [/<Pressable style=\{\[s\.sheet, \{ paddingBottom: pickerPad \}\]\}/],
  'screens/components/BodySheets.js': [/<View style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}>/],
  'screens/components/CalculatorSection.js': [/<View style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}>/],
  'screens/components/FoodEntryEditor.js': [/<View style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}>/],
  'screens/components/FitExplainer.js': [/<Pressable style=\{\[s\.scrim, \{ paddingBottom: gap \}\]\}/],
  'screens/OnboardingFlowScreen.js': [/style=\{\[s\.langBackdrop, \{ paddingBottom: langGap \}\]\}/],
  'screens/components/BodyMapModal.js': [/<View style=\{\[s\.sheet, \{ paddingBottom: sheetPad \}\]\}>/],
};

for (const [file, pats] of Object.entries(SHEETS)) {
  test(`A-136 (2): ${file} sheet clears the system bottom bar`, () => {
    const src = read(file);
    assert.match(src, /from '(\.\.\/)+components\/useSheetInset'/, 'uses the shared rule');
    for (const p of pats) assert.match(src, p);
  });
}
