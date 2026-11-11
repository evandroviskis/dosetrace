'use strict';
// Found on the S25 (2026-11-11): a meal typed in airplane mode was read when the connection came back and
// the chat said it twice in a row — "Anotado: 1 × maçã · ~95 kcal." (the thread's echo under the row) and
// then "Atualizado — 1 × maçã · ~95 kcal." The catch-up notice only adds something when the rows it reports
// are not the last ones in the chat (their echo sits higher up). When they are the newest rows, the echo is
// right above and the notice goes. A follow-up answer's "Atualizado" (no catchUp flag) is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { liveNotice } = require('../lib/foodThread');

const at = (h) => new Date(2026, 10, 11, h).toISOString();
const row = (id, h) => ({ id, source: 'ai', parse_status: 'done', sync_status: 'synced', entry_date: '2026-11-11', created_at: at(h) });

test('catch-up of the newest row: no repeated Updated bubble', () => {
  const n = { kind: 'updated', text: '1 × maçã · ~95 kcal', rowIds: [9], catchUp: true };
  assert.equal(liveNotice(n, [row(7, 8), row(9, 12)]), null);
});

test('catch-up of several newest rows together: no repeated bubble', () => {
  const n = { kind: 'updated', text: 'x', rowIds: [8, 9], catchUp: true };
  assert.equal(liveNotice(n, [row(7, 8), row(8, 10), row(9, 12)]), null);
});

test('catch-up of an older row with newer messages below it: the bubble stays', () => {
  const n = { kind: 'updated', text: 'x', rowIds: [7], catchUp: true };
  assert.deepEqual(liveNotice(n, [row(7, 8), row(9, 12)]), n);
});

test('a follow-up answer keeps its Updated bubble', () => {
  const n = { kind: 'updated', text: 'x', rowIds: [9] };
  assert.deepEqual(liveNotice(n, [row(7, 8), row(9, 12)]), n);
});

test('the screen marks the catch-up notices', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/FoodChatScreen.js'), 'utf8');
  const marked = src.match(/setNotice\(\{ kind: 'updated', text: e, rowIds: updatedRowIds \|\| \[\], catchUp: true \}\)/g) || [];
  assert.equal(marked.length, 2);
});
