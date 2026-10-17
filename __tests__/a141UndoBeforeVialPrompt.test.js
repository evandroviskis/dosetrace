'use strict';
// A-141 (5) — Fold session 2026-10-17 (build 50): marking the LAST dose of a vial opened
// "Todas as doses registradas" (the vial-finished prompt) at once, over the "Dose registrada ·
// Desfazer" bar (u2_toast.png / u2_modal.png). The 2026-10-02 fix (undoToastClock) pauses the
// bar's 4 s behind a pop-up, but the bar stays covered: the prompt is a modal whose only ways out
// are "Protocol finished" or "Log new vial", both real actions. So the user could not Undo the
// take without first ending the protocol or logging a vial.
// Fix (the simplest that always leaves the Undo reachable): the vial-finished prompt waits until
// the take's Undo window has closed (the bar ran its time, or a later take's bar did) and Today is
// in front; Undo of that take drops the waiting prompt (and the questions queued behind it go on);
// a dose deleted meanwhile from the Dose log drops it too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const { vialPromptRelease } = require('../lib/undoBar');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
function fnCode(name) {
  let hit = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string' || hit) return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) { hit = src.slice(node.start, node.end); return; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

const pending = { logId: 41, protocolId: 7 };

test('A-141 (5): the vial-finished prompt waits while the take\'s Undo bar is showing', () => {
  assert.equal(vialPromptRelease({ pending, undoShowing: true, focused: true }), 'wait');
  assert.equal(vialPromptRelease({ pending, undoShowing: false, focused: false }), 'wait', 'never over another tab');
  assert.equal(vialPromptRelease({ pending, undoShowing: false, focused: true }), 'show', 'the bar ran its time');
  assert.equal(vialPromptRelease({ pending: null, undoShowing: false, focused: true }), 'none');
});

test('A-141 (5): Undo of that take (or deleting it from the Dose log) drops the waiting prompt', () => {
  assert.equal(vialPromptRelease({ pending, undoShowing: false, focused: true, undone: true }), 'drop');
  assert.equal(vialPromptRelease({ pending, undoShowing: true, focused: true, undone: true }), 'drop');
  assert.equal(vialPromptRelease({ pending, undoShowing: false, focused: true, deleted: true }), 'drop');
});

test('A-141 (5): Today never opens the vial prompt straight from a take', () => {
  for (const fn of ['markTaken', 'writePending']) {
    const code = fnCode(fn);
    assert.doesNotMatch(code, /showVialPromptFor\(/, `${fn} opens the prompt over the Undo bar`);
    assert.match(code, /queueVialPrompt\(/, `${fn} queues it behind the Undo bar`);
  }
});

test('A-141 (5): the queued prompt is released when the Undo bar closes or Today comes back', () => {
  const release = fnCode('releasePendingVial');
  assert.match(release, /nextVialPrompt\(/); // test build 3 item 5: a queue built on vialPromptRelease (tb3VialQueue)
  assert.match(release, /showVialPromptFor\(/);
  assert.match(src, /useEffect\(\(\) => \{ if \(!undoData\) releasePendingVial\(\); \}, \[undoData\]\);/);
  assert.match(src, /focusedRef\.current = true;[\s\S]{0,200}releasePendingVial\(\);/, 'on focus');
});

test('A-141 (5): applyUndo drops the waiting prompt of that take before the bar closes', () => {
  const undo = fnCode('applyUndo');
  const drop = undo.indexOf('dropPendingVial(record.logId)');
  const close = undo.indexOf('setUndoData(');
  assert.ok(drop > 0, 'applyUndo drops the pending prompt');
  assert.ok(drop < close, 'before the bar closes (else the release effect would open it)');
  const dropFn = fnCode('dropPendingVial');
  assert.match(dropFn, /vialPromptOpenRef\.current = false/, 'questions waiting behind it are free again');
  assert.match(dropFn, /openNextQuestion/);
});
