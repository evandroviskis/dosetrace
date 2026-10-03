'use strict';
// Bottom sheets float 30 pt above the screen edge (prototype .scrim.bot: padding 8 8 30).
// Bug (2026-10-03, seen first on the new My Body sheets, then in Progress): the scrim was the
// KeyboardAvoidingView itself, and with behavior "padding" React Native sets that view's
// paddingBottom to the keyboard height (0 when closed) — overriding the 30 pt, so the sheet
// sat on the bottom edge. The inset now lives on a View inside the keyboard-avoiding one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

for (const file of ['screens/components/CalculatorSection.js', 'screens/components/FoodEntryEditor.js', 'screens/components/BodySheets.js']) {
  test(`${file}: the keyboard-avoiding wrapper carries no padding; the sheet inset sits inside it`, () => {
    const src = read(file);
    const m = src.match(/<KeyboardAvoidingView style=\{s\.(\w+)\}/);
    assert.ok(m, 'a keyboard-avoiding sheet');
    const style = src.match(new RegExp(`\\n\\s+${m[1]}: \\{([^}]*)\\}`));
    assert.ok(style, `style ${m[1]}`);
    assert.doesNotMatch(style[1], /padding/, `${m[1]} must not hold padding (the keyboard owns paddingBottom)`);
    const after = src.slice(src.indexOf(m[0]), src.indexOf(m[0]) + 400);
    assert.match(after, /<View style=\{s\.scrim\}>/, 'the inset View is the first child');
    assert.match(src.match(/\n\s+scrim: \{([^}]*)\}/)[1], /paddingBottom: 30/);
  });
}
