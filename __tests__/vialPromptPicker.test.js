'use strict';
// S-20 (A-39 row, point 5: "queued pickers and the vial-finished prompt keep working").
// Bug seen on the simulator 2026-10-01 (Test03, main ced6cba): Mark taken on the LAST
// dose of a vial opened the "All doses logged" prompt AND the site picker in the same
// tick. iOS shows one modal at a time: the picker never appeared, and after "Protocol
// finished" the Today screen stopped taking touches (only the tab bar worked) and the
// Undo bar did nothing. Fix: the picker waits until the vial prompt is closed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planTakeFollowups } = require('../lib/sitePickerActions');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('S-20: the take that finishes a vial shows the vial prompt first; the site picker waits for it', () => {
  assert.deepEqual(planTakeFollowups({ type: 'recon', vialFinished: true }), { vialPrompt: true, picker: 'after-vial-prompt' });
});

test('S-20: an ordinary injectable take opens the site picker at once, no vial prompt', () => {
  assert.deepEqual(planTakeFollowups({ type: 'recon', vialFinished: false }), { vialPrompt: false, picker: 'now' });
  assert.deepEqual(planTakeFollowups({ type: 'rtu', vialFinished: false }), { vialPrompt: false, picker: 'now' });
  // the new-vial prompt is for reconstituted vials only (as before)
  assert.deepEqual(planTakeFollowups({ type: 'rtu', vialFinished: true }), { vialPrompt: false, picker: 'now' });
});

test('S-20: oral doses never open a site picker', () => {
  assert.deepEqual(planTakeFollowups({ type: 'oral', vialFinished: false }), { vialPrompt: false, picker: null });
});

test('S-20: TodayScreen never opens the vial prompt and the site picker together', () => {
  const src = read('screens', 'TodayScreen.js');
  assert.match(src, /planTakeFollowups\(/, 'markTaken follows the planner');
  assert.doesNotMatch(src, /!vialPromptShown\)\s*fx\.siteT/, 'the old "open together" path is gone');
  // every close of the vial prompt goes through ONE function, which then opens the waiting picker
  const closes = src.match(/setShowVialPrompt\(false\)/g) || [];
  assert.equal(closes.length, 1, 'setShowVialPrompt(false) appears once, inside closeVialPrompt');
  const c = src.indexOf('function closeVialPrompt(');
  assert.ok(c > 0, 'closeVialPrompt exists');
  const body = src.slice(c, src.indexOf('\n  }\n', c));
  assert.match(body, /setShowVialPrompt\(false\)/);
  assert.match(body, /openBodyMapForUndo\([^)]*'take'\)/, 'the waiting picker opens as a take picker (Cancel = undo)');
  // "Protocol finished", "Log new vial" and the undo of that dose all close through it
  const finished = src.indexOf("t('today_vial_finished')");
  assert.match(src.slice(finished - 400, finished), /onPress=\{closeVialPrompt\}/, 'Protocol finished closes through closeVialPrompt');
  const nv = src.indexOf('async function createNewVial(');
  assert.match(src.slice(nv, src.indexOf('\n  }\n', nv)), /closeVialPrompt\(\)/, 'Log new vial closes through closeVialPrompt');
});
