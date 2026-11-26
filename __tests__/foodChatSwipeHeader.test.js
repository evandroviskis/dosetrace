'use strict';
// Bug found 2026-11-26 (founder: "tento puxar para baixo o histórico de conversa ... o registro de
// comida com IA fecha"; reproduced on the Fold in phone width): the stack's vertical close gesture took
// a downward drag from almost anywhere on the screen, so pulling the thread down to read older
// messages closed the chat. FL-32 keeps "closes when swiped down", now only from the title bar; the
// thread scrolls everywhere else. Never while a message is being sent (busy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
const CHAT = fs.readFileSync(path.join(ROOT, 'screens/FoodChatScreen.js'), 'utf8');
const { startsHeaderSwipe, closesOnRelease } = require('../lib/headerSwipe');

test('the stack card has no vertical close gesture over the thread', () => {
  const line = APP.split('\n').find((l) => l.includes('name="FoodChat"'));
  assert.ok(line, 'FoodChat screen exists');
  assert.match(line, /gestureEnabled: false/);
  assert.doesNotMatch(CHAT, /setOptions\(\{ gestureEnabled: !busy/, 'the screen no longer turns the card gesture back on');
});

test('the title bar carries the swipe-down that closes the chat', () => {
  assert.match(CHAT, /<View style=\{s\.header\}\s*\{\.\.\.headerSwipe\.panHandlers\}>/);
  assert.match(CHAT, /if \(!embedded && closesOnRelease\(g\) && !busyRef\.current && navigation\.canGoBack\(\)\) navigation\.goBack\(\)/);
});

test('a downward drag starts the header swipe; a sideways or upward one does not', () => {
  assert.equal(startsHeaderSwipe({ dx: 2, dy: 12 }), true);
  assert.equal(startsHeaderSwipe({ dx: 30, dy: 12 }), false);
  assert.equal(startsHeaderSwipe({ dx: 0, dy: -20 }), false);
  assert.equal(startsHeaderSwipe({ dx: 0, dy: 4 }), false);
});

test('release closes after a real pull down or a quick flick, not a small nudge', () => {
  assert.equal(closesOnRelease({ dy: 90, vy: 0.1 }), true);
  assert.equal(closesOnRelease({ dy: 30, vy: 1.2 }), true);
  assert.equal(closesOnRelease({ dy: 30, vy: 0.2 }), false);
  assert.equal(closesOnRelease({ dy: -80, vy: -1 }), false);
});
