'use strict';
// Found on the S25 (2026-11-11, airplane mode): a meal sent offline showed the same sentence twice in a row —
// "Salvo — vou estimar as calorias quando você estiver online de novo." under the message AND as the app's
// bubble right after it. The bubble explains once; while it is on screen for that row, the row's own note
// is not repeated (it comes back once the bubble is gone, e.g. on reopening the chat).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pendingNoteShown } = require('../lib/foodThread');

test('the row the offline/retry bubble talks about has no repeated note', () => {
  const row = { type: 'user', rowId: 7, status: 'pending' };
  assert.equal(pendingNoteShown(row, { kind: 'offline', rowId: 7 }), false);
  assert.equal(pendingNoteShown(row, { kind: 'retry', rowId: 7 }), false);
});

test('every other pending row keeps its note', () => {
  const row = { type: 'user', rowId: 7, status: 'pending' };
  assert.equal(pendingNoteShown(row, null), true, 'no bubble: the note explains');
  assert.equal(pendingNoteShown(row, { kind: 'offline', rowId: 8 }), true, 'bubble about another row');
  assert.equal(pendingNoteShown(row, { kind: 'quota' }), true, 'a different bubble');
  assert.equal(pendingNoteShown({ ...row, status: 'done' }, null), false, 'only pending rows have this note');
});

test('the screen passes the row to the bubble and asks pendingNoteShown', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/FoodChatScreen.js'), 'utf8');
  assert.match(src, /setNotice\(\{ kind: fail, rowId: id \}\)/);
  assert.match(src, /pendingNoteShown\(x, notice\)/);
});
