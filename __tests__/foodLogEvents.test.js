'use strict';
// Founder 2026-11-26 ("5, sim", aba fad1b69b): measure whether the recent-meals row brings people
// back — one anonymous event per food entry with how it was made (typed to the AI or repeated from
// the row), and one when a repeat is undone. Through lib/analytics logEvent (no account id, the
// analytics switch respected); nothing about the food itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const a = fs.readFileSync(path.join(__dirname, '..', 'lib', 'analytics.js'), 'utf8');
const s = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');

test('the two events exist and carry only how the entry was made', () => {
  assert.match(a, /foodLogged: \(source\) => logEvent\('food_logged', \{ source: source === 'recent' \? 'recent' : 'typed' \}\)/);
  assert.match(a, /foodRecentUndo: \(\) => logEvent\('food_recent_undo', \{\}\)/);
});

test('the chat fires them at the typed send, the recent tap and the undo', () => {
  assert.match(s, /import \{ Analytics \} from '\.\.\/lib\/analytics';/);
  const tap = s.slice(s.indexOf('async function repeatMeal('), s.indexOf('function undoRepeat()'));
  assert.match(tap, /Analytics\.foodLogged\('recent'\)/);
  const undo = s.slice(s.indexOf('function undoRepeat()'), s.indexOf('useEffect(() => () => clearTimeout(undoTimer.current)'));
  assert.match(undo, /Analytics\.foodRecentUndo\(\)/);
  const typed = s.slice(s.indexOf("const id = insertFoodLog({ user_id: userId, entry_date: day, raw_text: raw, parse_status: 'pending' });"));
  assert.match(typed.slice(0, 300), /Analytics\.foodLogged\('typed'\)/);
});
