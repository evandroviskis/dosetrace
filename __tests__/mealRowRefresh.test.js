'use strict';
// Fold 2026-11-26 (test account): after starting a Reality check, "Your meals" was answered
// (breakfast, lunch, dinner, saved in the account) but the Reality check card row under it kept
// saying "One question at 8 PM" until the screen was left and opened again. A meal choice saved
// from any sheet must reach every meals row that is on screen at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/mealReminders');

test('a saved meal choice reaches every listener, and an unsubscribed one hears nothing', () => {
  const heard = [];
  const off1 = M.onMealsChanged((n) => heard.push(['a', n && n.plan]));
  const off2 = M.onMealsChanged((n) => heard.push(['b', n && n.plan]));
  M.emitMealsChanged({ plan: 'three', meals: [] });
  off2();
  M.emitMealsChanged({ plan: 'five', meals: [] });
  off1();
  M.emitMealsChanged({ plan: 'every3h', meals: [] });
  assert.deepEqual(heard, [['a', 'three'], ['b', 'three'], ['a', 'five']]);
});

test('a listener that throws never stops the others', () => {
  const heard = [];
  const off1 = M.onMealsChanged(() => { throw new Error('boom'); });
  const off2 = M.onMealsChanged((n) => heard.push(n.plan));
  M.emitMealsChanged({ plan: 'three', meals: [] });
  off1(); off2();
  assert.deepEqual(heard, ['three']);
});

test('the sheet announces a save and the row listens while mounted', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'MealTimesSheet.js'), 'utf8');
  const save = src.slice(src.indexOf('async function save()'), src.indexOf('function setTime('));
  assert.match(save, /emitMealsChanged\(/, 'save() tells every meals row');
  const row = src.slice(src.indexOf('export function MealTimesRow'));
  assert.match(row, /onMealsChanged\(/, 'the row subscribes');
  assert.match(row, /useEffect\(\(\) => onMealsChanged\(/, 'and unsubscribes when it leaves the screen');
});
