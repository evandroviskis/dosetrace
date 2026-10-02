'use strict';
// Journey redesign parts 21-23 (founder 2026-10-02, prototype columns): the AI food log chat
// opens full screen with a three-dot typing indicator (21), "See how it works" as is (22),
// and "Fix this entry" slides up, a tap outside cancels, and the item NAME is editable next to
// kcal / carbs / protein (23; no category, the day bar was already done).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('Part 21: the food chat opens full screen (slides up, swipe down to close), not an iOS sheet', () => {
  const app = read('App.js');
  const line = app.match(/<Stack\.Screen name="FoodChat"[^\n]*\/>/);
  assert.ok(line);
  assert.doesNotMatch(line[0], /presentation: 'modal'/, 'no iOS card sheet with the Journey peeking above');
  assert.match(line[0], /cardStyleInterpolator: CardStyleInterpolators\.forVerticalIOS/);
  assert.match(line[0], /gestureDirection: 'vertical'/);
  // Full screen holds the status bar itself: the top edge is padded on both platforms.
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /const edges = embedded \? \['left', 'right'\] : \['top', 'left', 'right', 'bottom'\];/);
});

test('Part 21: "reading" is three blinking dots (prototype .typing .dots), still on Reduce Motion', () => {
  const chat = read('screens/FoodChatScreen.js');
  const typing = chat.match(/case 'typing':[\s\S]*?\);/);
  assert.ok(typing);
  assert.match(typing[0], /<TypingDots /);
  assert.doesNotMatch(typing[0], /ActivityIndicator/);
  assert.match(chat, /function TypingDots\(/);
  assert.match(chat, /useReducedMotion\(\)/);
  assert.match(chat, /dot: \{ width: 5, height: 5, borderRadius: 3, backgroundColor: c\.ink3 \}/);
});

test('Part 22: See how it works — the typing bubble grows with its text, the caret blinks, the prototype spacing', () => {
  const src = read('screens/components/NutritionLogger.js');
  assert.match(src, /appBub: \{ alignSelf: 'flex-start', maxWidth: '100%',/);
  assert.match(src, /setCaretOn\(\(v\) => !v\)/, 'the caret blinks (prototype caretb, 1 s)');
  assert.match(src, /caretOn \? s\.caret : s\.caretOff/);
  assert.match(src, /body: \{ gap: 14 \}/);
  assert.match(src, /tot: \{ borderTopWidth: 1, borderTopColor: c\.line, paddingTop: 8, marginTop: 2, gap: 2 \}/);
  assert.match(src, /cta: \{ minHeight: 52, borderRadius: 26, backgroundColor: c\.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 \}/);
});

test('Part 23: Fix this entry slides up from the bottom and a tap outside cancels', () => {
  const ed = read('screens/components/FoodEntryEditor.js');
  assert.match(ed, /entering=\{SlideInDown\.duration\(280\)\}/);
  assert.match(ed, /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{cancel\}/);
});

test('Part 23: the item name is an editable field; kcal / carbs / protein stay editable', () => {
  const ed = read('screens/components/FoodEntryEditor.js');
  assert.match(ed, /value=\{it\.food == null \? '' : String\(it\.food\)\}/);
  assert.match(ed, /onChangeText=\{\(v\) => setField\(i, 'food', v\)\}/);
  for (const f of ['kcal', 'carb_g', 'protein_g']) assert.match(ed, new RegExp(`setField\\(i, '${f}', v\\)`));
  assert.match(ed, /editedItems\(orig, items\)/);
});

test('Part 23: editedItems — a renamed or re-numbered item is the user\'s; an empty name keeps the old one; nothing else changes', () => {
  const { editedItems } = require('../lib/nutrition');
  const orig = [
    { food: 'rice', qty: 1, kcal: 205, carb_g: 45, protein_g: 4, category: 'meal', confidence: 'low' },
    { food: 'coffee', kcal: 5, carb_g: 0, protein_g: 0, category: 'drink', confidence: 'high', ask: { kind: 'preparation' } },
  ];
  const edits = orig.map((it, i) => ({ ...it, __orig: i }));
  edits[0].food = 'brown rice';
  edits[1].kcal = '5';
  const out = editedItems(orig, edits);
  assert.equal(out[0].food, 'brown rice');
  assert.equal(out[0].confidence, 'user', 'a renamed item is no longer an estimate');
  assert.equal(out[0].category, 'meal', 'the category is kept (FL-23)');
  assert.equal(out[0].qty, 1, 'the quantity is kept');
  assert.equal(out[1].confidence, 'high', 'an untouched item keeps its confidence');
  assert.equal(out[1].kcal, 5);
  assert.ok(!('__orig' in out[0]) && !('__orig' in out[1]), 'the helper key never reaches the database');
  const blank = orig.map((it, i) => ({ ...it, __orig: i }));
  blank[0].food = '   ';
  assert.equal(editedItems(orig, blank)[0].food, 'rice', 'an emptied name falls back to the original');
  // A removed first item: the second still compares against its own original.
  const removed = [{ ...orig[1], __orig: 1 }];
  assert.equal(editedItems(orig, removed)[0].confidence, 'high');
});

test('Food files parse, theme tokens only, no emoji', () => {
  const { parse } = require('@babel/parser');
  for (const f of ['screens/FoodChatScreen.js', 'screens/components/FoodEntryEditor.js']) {
    const src = read(f);
    assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }), f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, f);
  }
});
