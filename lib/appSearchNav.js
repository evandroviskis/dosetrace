// App search: where a tap lands (logic 3, AS-7…AS-10, AS-18, AS-27). A place opens through its
// normal path: the search closes, the app switches to the path's tab and opens the place as if it
// was reached by that path (Back behaves as it does today, "‹ Hoje" on the Dose log). On the
// unfolded Fold the place opens on that tab's right page (BK-3…BK-7). A text opens over the
// search, so "Concluído" / Back returns to the search with the typed text.
// The search never acts (logic 4): every action below only opens or scrolls; nothing saves,
// changes, deletes, sends, exports or signs out. Pure CommonJS (node --test).
'use strict';

let seq = 0;
const nonce = () => { seq += 1; return seq; };

// A place or record row → { type, tab, ... }
//   'push'     : switch to `tab`, then open stack screen `route` with `params` (phone)
//   'bookPage' : switch to `tab`, its right page shows `sel` with `params` (Fold, unfolded)
//   'tab'      : switch to `tab` with params.search = { target, … } (the tab lands itself, both layouts)
function placeAction(row, { book = false } = {}) {
  const o = (row && row.open) || {};
  if (o.push) {
    // A landing (a Progress focus, a Dose log filter) lands again on every tap, even on a screen or a
    // right page already open (nonce).
    const params = o.params ? { ...o.params, nonce: nonce() } : null;
    if (book && o.book) return { type: 'bookPage', tab: o.tab, sel: o.book.sel, params };
    return { type: 'push', tab: o.tab, route: o.push, params };
  }
  const search = { target: o.target, n: nonce() };
  if (o.group) search.group = o.group;
  if (o.row) search.row = o.row;
  if (o.doc) search.doc = o.doc;
  if (row.protocolId != null) search.protocolId = row.protocolId;
  if (o.key != null) search.key = o.key;
  return { type: 'tab', tab: o.tab, params: { search } };
}

// A text hit → 'legal' (the LegalModal opened by the search itself, at that paragraph) or
// 'over' (a stack screen pushed over the search: the FAQ with the question open; Progress with the
// "Entenda os números" item open, the same LearnBlock Evolução shows).
function textAction(hit, q) {
  const o = (hit && hit.unit && hit.unit.open) || {};
  if (o.kind === 'legal') return { type: 'legal', doc: o.doc, block: o.block, q };
  if (o.kind === 'faq') return { type: 'over', route: 'FAQ', params: { openQuestion: o.id ? { id: o.id } : { ci: o.ci, qi: o.qi }, mark: q } };
  if (o.kind === 'learn') return { type: 'over', route: 'Progress', params: { focus: 'learn', learnItem: o.key, mark: q, nonce: nonce() } };
  return null;
}

module.exports = { placeAction, textAction };
