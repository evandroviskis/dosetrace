'use strict';
// A-127 UN-2 "never over another sheet": every DoseTrace sheet (DTSheet, DTActionSheet, DTPickerSheet,
// BottomSheet) reports while it is open; the update invitation shows only when none is.
// Plain CommonJS; the React hook is a thin wrapper (useSheetPresence) so the counter runs under node.

let open = 0;

// → close(): call once when the sheet closes (a second call does nothing).
function markSheet(isOpen) {
  if (!isOpen) return () => {};
  open += 1;
  let done = false;
  return () => { if (!done) { done = true; open = Math.max(0, open - 1); } };
}

function openSheetCount() { return open; }

// React: counts this sheet while `visible` is true (and stops on unmount).
function useSheetPresence(visible) {
  const { useEffect } = require('react');
  useEffect(() => markSheet(!!visible), [!!visible]); // eslint-disable-line react-hooks/exhaustive-deps
}

module.exports = { markSheet, openSheetCount, useSheetPresence };
