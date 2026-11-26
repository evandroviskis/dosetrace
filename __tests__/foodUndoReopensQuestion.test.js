'use strict';
// Council 2026-11-26 (journey review): a recent-meal tap closes an open AI follow-up question for good
// (the earlier item is marked ask_skipped, FL-27). "Desfazer" deleted the copy but never reopened that
// question, so a slip during "how much rice?" lost the question and left the item an estimate.
// Undo must put back everything the tap changed: the copy goes, the question comes back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
const { openFollowup } = require('../lib/foodThread');

test('the tap remembers the follow-up it closed, and Undo reopens it', () => {
  const tap = src.slice(src.indexOf('async function repeatMeal('), src.indexOf('function undoRepeat()'));
  assert.match(tap, /setUndo\(\{ rowId: id, label: meal\.label, reopen: open \? \{ rowId: open\.rowId, index: open\.index \} : null \}\)/);
  const undo = src.slice(src.indexOf('function undoRepeat()'), src.indexOf('useEffect(() => () => clearTimeout(undoTimer.current)'));
  assert.match(undo, /if \(u\.reopen\) updateItem\(u\.reopen\.rowId, u\.reopen\.index, \(it\) => \{ const \{ ask_skipped, \.\.\.rest \} = it \|\| \{\}; return rest; \}\);/);
});

test('an item without ask_skipped is an open follow-up again', () => {
  const row = (skipped) => ({ id: 7, entry_date: '2026-11-26', parse_status: 'done', kcal: 200, created_at: '2026-11-26T12:00:00Z',
    parsed_items: JSON.stringify([{ food: 'arroz', qty: null, unit: '', kcal: 200, asked: true, ask: { kind: 'size', options: ['100 g'] }, ...(skipped ? { ask_skipped: true } : {}) }]) });
  assert.equal(openFollowup([row(true)]), null, 'closed while skipped');
  const back = openFollowup([row(false)]);
  assert.ok(back && back.rowId === 7 && back.index === 0, 'open again once ask_skipped is gone');
});
