'use strict';
// The Undo bar's 4 s only run while the user can see the bar: never behind one of Today's
// pop-ups (vial finished, site picker, still-going, Skip dose?). When the pop-up closes the
// bar gets its full time again (bug found 2026-10-02: the vial-finished pop-up hid the Undo
// until it expired). Pure, for the Node test runner.
function undoBarRuns({ hasUndo, popupOpen }) {
  return !!hasUndo && !popupOpen;
}

// A-141 (5) (Fold 2026-10-17): pausing was not enough — the vial-finished prompt still covered the
// bar, and its only ways out are real actions (Protocol finished / Log new vial). The prompt of a
// take now waits until that take's Undo window has closed and Today is in front; Undo of the take
// (or deleting it from the Dose log) drops it. → 'none' | 'wait' | 'show' | 'drop'.
function vialPromptRelease({ pending, undoShowing, focused, undone, deleted }) {
  if (!pending) return 'none';
  if (undone || deleted) return 'drop';
  if (undoShowing || !focused) return 'wait';
  return 'show';
}

// Test build 3 council item 5: two recon vials can finish inside one Undo window (take A empties its
// vial, take B another before A's bar closed). One waiting slot lost A's prompt; now a queue, one
// prompt per protocol (the newer take of the same protocol replaces the older), shown one after
// another. → { action: 'none' | 'wait' | 'show' | 'drop', item?, queue } ('drop': every waiting
// prompt was undone or deleted — the questions behind them may go on).
function enqueueVialPrompt(queue, item) {
  const q = Array.isArray(queue) ? queue : [];
  return [...q.filter((p) => !(p && p.protocol && item && item.protocol && p.protocol.id === item.protocol.id)), item];
}

function nextVialPrompt({ queue, undoShowing, focused, promptShowing, undone, deleted }) {
  const q = Array.isArray(queue) ? queue : [];
  const live = q.filter((p) => vialPromptRelease({
    pending: p, undoShowing, focused,
    undone: !!(undone && undone(p.logId)), deleted: !!(deleted && deleted(p.logId)),
  }) !== 'drop');
  if (!live.length) return { action: q.length ? 'drop' : 'none', queue: [] };
  if (promptShowing) return { action: 'wait', queue: live };
  if (vialPromptRelease({ pending: live[0], undoShowing, focused }) !== 'show') return { action: 'wait', queue: live };
  return { action: 'show', item: live[0], queue: live.slice(1) };
}

module.exports = { undoBarRuns, vialPromptRelease, enqueueVialPrompt, nextVialPrompt };
