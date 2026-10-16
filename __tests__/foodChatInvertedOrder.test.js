'use strict';
// Bug 2026-10-15 (store capture, appreview): the food chat showed the user's answer
// "150g" ABOVE the app's question "How much rice?". The chat is an inverted FlatList,
// and React Native lays out an inverted cell's children in reverse (column-reverse,
// VirtualizedListCellRenderer). A row that renders two bubbles as a fragment therefore
// shows them upside down. Every row of an inverted list must render ONE root view.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');

test('food chat: the list is inverted (the premise of this guard)', () => {
  assert.match(src, /<FlatList[\s\S]*?\binverted\b/);
});

test('food chat: no row renders a fragment (an inverted cell would reverse its bubbles)', () => {
  assert.doesNotMatch(src, /<>|<\/>|Fragment/, 'wrap multi-bubble rows in one <View>');
});

test("food chat: the answered question shows the app's question first, then the user's answer, inside one view", () => {
  const m = src.match(/case 'asked':[\s\S]*?case 'answer_pending':/);
  assert.ok(m, 'asked row found');
  const block = m[0];
  assert.match(block, /return \(\s*<View/, 'one root view');
  assert.ok(block.indexOf('nutri_ask_') < block.indexOf('x.answer'), 'question before answer');
});
