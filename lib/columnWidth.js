'use strict';
// The pure part of components/useColumnWidth (review 2026-10-02): a list column as wide as
// its widest cell, kept per language. A layout reported for another language (a late event
// from the rows that were on screen before the switch) is ignored, so the column shrinks
// back when the new language's dates are shorter.

// state: { key, w } | null. event: { key: language the cell was laid out in, w: its width,
// current: the language now (defaults to key) }.
function columnWidthState(state, { key, w, current }) {
  const now = current === undefined ? key : current;
  if (key !== now) return state; // stale: laid out in the previous language
  const base = state && state.key === key ? state.w : 0;
  const width = Math.ceil(Number(w) || 0);
  if (width > base) return { key, w: width };
  return state && state.key === key ? state : { key, w: base };
}

// The column's width for this language: the widest cell, never less than min.
function columnWidthOf(state, key, min) {
  return Math.max(min, state && state.key === key ? state.w : 0);
}

module.exports = { columnWidthState, columnWidthOf };
