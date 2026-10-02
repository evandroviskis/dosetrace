'use strict';
// The Undo bar's 4 s only run while the user can see the bar: never behind one of Today's
// pop-ups (vial finished, site picker, still-going, Skip dose?). When the pop-up closes the
// bar gets its full time again (bug found 2026-10-02: the vial-finished pop-up hid the Undo
// until it expired). Pure, for the Node test runner.
function undoBarRuns({ hasUndo, popupOpen }) {
  return !!hasUndo && !popupOpen;
}

module.exports = { undoBarRuns };
