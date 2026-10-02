'use strict';
// Bug found on the sim 2026-10-02 (founder: "corrige o erro do Undo"): taking the last dose of
// a vial opened the vial-finished pop-up over the "Site saved · Undo" bar while the bar's 4 s
// ran out behind it, so the Undo was gone before the user could see it. On a phone there is no
// other Undo for a take on Today. Rule: the Undo bar's time only runs while no Today pop-up is
// in front; when the pop-up closes the bar gets its full time again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { undoBarRuns } = require('../lib/undoBar');

test('the Undo bar time runs only when nothing covers it', () => {
  assert.equal(undoBarRuns({ hasUndo: true, popupOpen: false }), true);
  assert.equal(undoBarRuns({ hasUndo: true, popupOpen: true }), false);
  assert.equal(undoBarRuns({ hasUndo: false, popupOpen: false }), false);
});

test('Today arms the Undo bar time from one effect that pauses behind every pop-up', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  assert.ok(!/const timer = setTimeout\(\(\) => setUndoData\(null\), TOAST_MS\)/.test(src),
    'a take still starts its own 4 s timer that keeps running behind a pop-up');
  assert.match(src, /const popupOpen = showVialPrompt \|\| bodyMapVisible \|\| showInactivePrompt \|\| !!skipAsk;/);
  assert.match(src, /undoBarRuns\(\{ hasUndo: !!undoData, popupOpen \}\)/);
  assert.match(src, /setTimeout\(\(\) => setUndoData\(null\), TOAST_MS\)/);
});
