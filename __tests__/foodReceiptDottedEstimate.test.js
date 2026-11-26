'use strict';
// Fold 2026-11-26: on Android the estimate in the receipt showed a plain black underline — React
// Native draws textDecorationStyle 'dotted' and textDecorationColor only on iOS. FR-8 asks for a
// dotted underline in the attention colour on every phone, so it is drawn as a dotted bottom border
// of a box around the item name (Views draw dotted borders on Android and iOS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');

test('FR-8: the estimate underline is a dotted border in the attention colour, not a text decoration', () => {
  const box = src.match(/lnEstBox:\s*\{([^}]*)\}/);
  assert.ok(box, 'a box style for the estimate exists');
  assert.match(box[1], /borderStyle:\s*'dotted'/);
  assert.match(box[1], /borderBottomWidth/);
  assert.match(box[1], /borderColor:\s*c\.attention/);
  assert.match(src, /flag && s\.lnEstBox/, 'the box is used only for an estimate');
  assert.doesNotMatch(src, /textDecorationStyle:\s*'dotted'/, 'no iOS-only dotted text decoration left');
});
