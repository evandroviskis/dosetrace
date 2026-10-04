'use strict';
// Recently deleted multi-select (founder 2026-10-03, approved from the pictures): the selection as
// plain data. null = not selecting; an array = the chosen protocol ids. Pure, CommonJS.

function start() { return []; }
function toggle(sel, id) { return sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; }
function toggleAll(sel, ids) { return sel.length === ids.length ? [] : [...ids]; }
function allLabelKey(sel, ids) { return sel && ids.length && sel.length === ids.length ? 'protocols_deselect_all' : 'protocols_select_all'; }
// Ids that left the list (restored or deleted elsewhere) leave the selection.
function prune(sel, ids) { return sel.filter((id) => ids.includes(id)); }
// The bottom bar: "Restore (N)" / "Delete forever (N)", off at 0.
function bar(sel) { const n = sel ? sel.length : 0; return { n, enabled: n > 0 }; }
// The confirm sheet: one protocol → "Delete this protocol forever?", several → "Delete N protocols forever?".
function confirmKeys(n) {
  return n === 1
    ? { title: 'protocols_purge_title_single', body: 'protocols_purge_body_single' }
    : { title: 'protocols_purge_title_many', body: 'protocols_purge_body_many' };
}
// Restore several / delete several: the existing one-item action per id, in order.
function forEachSelected(ids, one) { return ids.map((id) => one(id)); }

module.exports = { start, toggle, toggleAll, allLabelKey, prune, bar, confirmKeys, forEachSelected };
