// Book layout on foldables (S-26, docs/specs/book-layout.md, founder-signed 2026-10-01).
// Pure rules, CommonJS so plain Node tests can load them (no React Native imports).
//
// Wide enough (BK-1) → two pages: the list on the left, the opened item on the right, a
// gutter over the hinge (BK-9). Otherwise one column, exactly as today (BK-2).

const BOOK_MIN_W = 700;
const BOOK_MIN_H = 560;
const GUTTER = 22;

// BK-1: both sides must be large. An iPhone in landscape (956 × 440) stays one column.
function isBook(width, height) {
  return Number(width) >= BOOK_MIN_W && Number(height) >= BOOK_MIN_H;
}

// Two equal pages around a centred gutter, so the fold lands in the gutter (BK-9).
function paneWidths(width) {
  const each = Math.floor((Number(width) - GUTTER) / 2);
  return { left: each, right: each, gutter: GUTTER };
}

// The right page when the user has not chosen anything yet in that tab (BK-3…BK-7).
function defaultSelection(tab, data = {}) {
  switch (tab) {
    case 'Today': return 'log';
    case 'Protocols': return data.openProtocolId || (data.protocolIds && data.protocolIds[0]) || null;
    case 'Journey': return 'progress';
    case 'Body': return data.newestReportKey || null;
    case 'Settings': return 'notifications';
    default: return null;
  }
}

// Right-page items that live on a pushed stack screen when the app is one column.
const STACK_ROUTE = {
  Today: { log: 'Log' },
  Journey: { progress: 'Progress', curve: 'SerumCurve', food: 'FoodChat' },
};

// BK-10, folding: the item the user opened on the right page becomes a pushed screen.
// Items that live inside the tab's own screen (a protocol, a lab test, a Settings group,
// a dose) need no push: the tab shows them itself. A default nobody chose is not pushed.
function foldPlan({ tab, sel, explicit }) {
  if (!explicit || !sel) return null;
  const route = STACK_ROUTE[tab] && STACK_ROUTE[tab][sel];
  return route ? { route } : null;
}

// BK-10, unfolding: a pushed stack screen moves onto its tab's right page.
const ROUTE_HOME = {
  Log: { tab: 'Today', sel: 'log' },
  Progress: { tab: 'Journey', sel: 'progress' },
  SerumCurve: { tab: 'Journey', sel: 'curve' },
  FoodChat: { tab: 'Journey', sel: 'food' },
};
function unfoldPlan(routeName) {
  return ROUTE_HOME[routeName] ? { ...ROUTE_HOME[routeName] } : null;
}

module.exports = { BOOK_MIN_W, BOOK_MIN_H, GUTTER, isBook, paneWidths, defaultSelection, foldPlan, unfoldPlan };
