'use strict';
// Council 2026-11-26 (senior engineer, QA): the goodbye said "at HH:MM I'll ask about lunch" when the
// food reminders were not switched off in the account — even if the phone's notification permission
// was denied or never asked (iPhone: undetermined until a protocol is saved). That promises a question
// that never comes. The goodbye's time line needs BOTH the account switch and the phone permission,
// and it follows a meal-time change made while the chat is open.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');

test('the reminder line in the goodbye needs the phone notification permission', () => {
  assert.match(src, /notificationsGranted/, 'imports and uses notificationsGranted');
  const load = src.slice(src.indexOf('async function load()'), src.indexOf('if (!uid) { setLoaded(true); return; }'));
  assert.match(load, /meta\.food_reminders !== false && granted/, 'on = account switch AND permission');
});

test('a meal-time change while the chat is open reaches the goodbye', () => {
  assert.match(src, /onMealsChanged\(/);
  assert.match(src, /mealMetaRef\.current = \{ \.\.\.mealMetaRef\.current, meals:/);
});
