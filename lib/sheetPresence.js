'use strict';
// A-127 UN-2 "never over another sheet", and the required screen never swapped in over a form: every
// Modal in the app reports while it is visible (components/PresenceModal wraps React Native's Modal;
// __tests__/updateNoticeReview.test.js fails on any <Modal that does not come from it). The update
// notice waits while the count is above 0 and re-checks when it changes (onSheetsChange).
// Plain CommonJS; the React hook is a thin wrapper (useSheetPresence) so the counter runs under node.

let open = 0;
const subs = new Set();
function changed() { for (const fn of subs) { try { fn(open); } catch { /* UI only */ } } }

// → close(): call once when the sheet closes (a second call does nothing).
function markSheet(isOpen) {
  if (!isOpen) return () => {};
  open += 1;
  changed();
  let done = false;
  return () => { if (!done) { done = true; open = Math.max(0, open - 1); changed(); } };
}

function openSheetCount() { return open; }
function onSheetsChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// React: counts this sheet while `visible` is true (and stops on unmount).
function useSheetPresence(visible) {
  const { useEffect } = require('react');
  useEffect(() => markSheet(!!visible), [!!visible]); // eslint-disable-line react-hooks/exhaustive-deps
}

module.exports = { markSheet, openSheetCount, onSheetsChange, useSheetPresence };
