'use strict';
// Found on device 2026-10-17 (Galaxy Z Fold, folded, 1080x2520, build 53): in the AI food log,
// "Fix this entry" — tap a number of the LAST item (the third item's kcal, y ≈ 2150 px of 2520):
// the keyboard opens over the bottom ~45% of the screen and covers the field. The sheet does not
// move and cannot be scrolled to bring the field up; typing works blind.
//
// Cause: the app draws edge to edge on Android, so neither the window nor the Modal's dialog is
// resized for the keyboard, and the sheet's KeyboardAvoidingView has behavior undefined on
// Android (padding is iPhone only), so nothing lifts the sheet. The ScrollView's content is no
// taller than the sheet, so there is nothing to scroll either.
//
// Fix (same rule as A-136 (9), lib/keyboardLift + components/useKeyboardLift): on Android, while
// the keyboard is up, the sheet's scroll content gets a spacer as tall as the keyboard (the sheet
// grows up to its cap, then scrolls), and the focused field (an item's name or kcal / carbs /
// protein) is scrolled to just above the keyboard — on focus and again once the keyboard has
// opened. iPhone is unchanged: KeyboardAvoidingView padding, no spacer, no lift.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { liftScrollY } = require('../lib/keyboardLift');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const EDITOR = 'screens/components/FoodEntryEditor.js';

test('food editor keyboard: the Fold case — the last item\'s kcal lands just above the keyboard', () => {
  // px on the folded Fold (the rule is unit-free; 16 dp ≈ 42 px): kcal field 2085–2215, the
  // keyboard covers the bottom 45% (top at 1386), the sheet's scroll view starts at 200.
  const kbTop = 2520 - Math.round(2520 * 0.45);
  const y = liftScrollY({ fieldTop: 2085, fieldBottom: 2215, kbTop, viewTop: 200, scrollY: 0, margin: 42 });
  assert.equal(y, 2215 + 42 - kbTop, 'its bottom sits one margin above the keyboard');
  // The keyboard-tall spacer is room enough: lifting the lowest field never needs more than
  // the keyboard's height (growth of the sheet up to its cap + scroll range = the spacer).
  assert.ok(y <= 2520 - kbTop, 'the lift fits in the spacer');
});

test('food editor keyboard: on Android the sheet scrolls the focused field above the keyboard', () => {
  const src = read(EDITOR);
  assert.match(src, /import useKeyboardLift from '\.\.\/\.\.\/components\/useKeyboardLift';/);
  assert.match(src, /const lift = useKeyboardLift\(null, Platform\.OS === 'android'\);/, 'Android only');
  assert.match(src, /<ScrollView bounces=\{false\} keyboardShouldPersistTaps="handled" \{\.\.\.lift\.scrollProps\} contentContainerStyle=\{s\.body\}>/);
  assert.match(src, /\{lift\.spacer\}\s*<\/ScrollView>/, 'the spacer ends the scroll content');
  // the item's name
  assert.match(src, /ref=\{\(n\) => \{ nameRefs\.current\[i\] = n; \}\}/);
  assert.match(src, /onFocus=\{\(\) => lift\.liftField\(\{ current: nameRefs\.current\[i\] \}\)\}/);
  // kcal / carbs / protein
  assert.equal((src.match(/<EditNum .*onFocus=\{lift\.liftField\} \/>/g) || []).length, 3, 'every number field asks to be lifted');
  const num = src.slice(src.indexOf('function EditNum('));
  assert.match(num, /function EditNum\(\{[^}]*onFocus[^}]*\}\)/);
  assert.match(num, /const ref = useRef\(null\);/);
  assert.match(num, /ref=\{ref\}/);
  assert.match(num, /onFocus=\{\(\) => \{ if \(onFocus\) onFocus\(ref\); \}\}/);
});

test('food editor keyboard: iPhone is unchanged (KeyboardAvoidingView padding)', () => {
  const src = read(EDITOR);
  assert.match(src, /<KeyboardAvoidingView style=\{s\.kav\} behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}>/);
  const hook = read('components/useKeyboardLift.js');
  assert.match(hook, /export default function useKeyboardLift\(extRef, enabled = true\)/);
  assert.match(hook, /if \(!enabled\) \{[^}]*return undefined;\s*\}\s*const show = Keyboard\.addListener/, 'no keyboard listeners when off (the off branch returns before adding them)');
  assert.match(hook, /spacer: enabled && kbHeight > 0 \?/, 'no spacer when off');
  assert.match(hook, /liftField: \(ref\) => \{ if \(!enabled\) return;/, 'no lift when off');
});
