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

module.exports = { undoBarRuns, vialPromptRelease };
