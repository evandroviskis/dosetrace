'use strict';
// A-190 (Fold, 2026-10-27; founder picked A in docs/design/a190-month-row.html): the month rows
// (Edit vial / New vial mix date and box expiry, the protocol sheet's mix date and vial expiry) are
// horizontal scrolls that started at Jan, so a chosen October sat off-screen. Rule (lib/monthRow):
// on open — and whenever the chosen month is not fully in view (Yesterday / Today moved it) — the
// row scrolls so the chosen month is the second one shown, the month before it half visible. A tap
// on a month already in view does not move the row (no jump under the finger). Calendar order kept.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chosenScrollX } = require('../lib/monthRow');

// 12 pills, 60 dp wide, 8 dp apart (x = i * 68).
const L = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, { x: i * 68, width: 60 }]));

test('A-190: on open the chosen month comes into view, the one before it half shown', () => {
  assert.equal(chosenScrollX({ layouts: L, chosen: 9, offset: 0, viewport: 300, force: true }), 8 * 68 + 30);
  assert.equal(chosenScrollX({ layouts: L, chosen: 0, offset: 0, viewport: 300, force: true }), 0, 'January: the row stays at its start');
  assert.equal(chosenScrollX({ layouts: L, chosen: 1, offset: 0, viewport: 300, force: true }), 30);
});

test('A-190: a month already in view does not move the row; one out of view does', () => {
  assert.equal(chosenScrollX({ layouts: L, chosen: 2, offset: 0, viewport: 300 }), null, 'Mar fully visible at offset 0');
  assert.equal(chosenScrollX({ layouts: L, chosen: 9, offset: 0, viewport: 300 }), 8 * 68 + 30, 'Oct off-screen: brought in');
  assert.equal(chosenScrollX({ layouts: L, chosen: 4, offset: 300, viewport: 300 }), 3 * 68 + 30, 'May half hidden on the left: brought in');
});

test('A-190: nothing chosen or layouts not measured yet -> no scroll', () => {
  assert.equal(chosenScrollX({ layouts: L, chosen: null, offset: 0, viewport: 300, force: true }), null);
  assert.equal(chosenScrollX({ layouts: {}, chosen: 9, offset: 0, viewport: 300, force: true }), null);
  assert.equal(chosenScrollX({ layouts: { 9: { x: 612, width: 60 } }, chosen: 9, offset: 0, viewport: 300, force: true }), null, 'the month before not measured yet');
});

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('A-190: every month row uses the shared hook (vial windows and the protocol sheet)', () => {
  const prompt = read('screens/components/NewVialPrompt.js');
  assert.equal((prompt.match(/useChosenInView\((month|expMonth)\)/g) || []).length, 2, 'mix date + box expiry');
  const sheet = read('screens/ProtocolsScreen.js');
  assert.match(sheet, /useChosenInView\(vialMonth\)/);
  assert.match(sheet, /useChosenInView\(vialExpMonth\)/);
  const hook = read('components/useChosenInView.js');
  assert.match(hook, /chosenScrollX/);
});
