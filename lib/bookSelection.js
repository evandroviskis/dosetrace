// Which item is open on each tab's right page (S-26 BK-8: kept while the app is open, not
// stored). Shared by the tab screens and the pushed stack screens so folding and unfolding
// can move the item between a pushed screen and the right page (BK-10). Pure CommonJS.

const state = {}; // tab → { sel, explicit, params }
const listeners = new Set();

function getSelection(tab) {
  return state[tab] || null;
}

// explicit: the user chose it (a tap, a deep link, or an unfold). Defaults are not stored.
function setSelection(tab, sel, { explicit = true, params = null } = {}) {
  const prev = state[tab];
  if (prev && prev.sel === sel && prev.explicit === explicit && prev.params === params) return;
  state[tab] = { sel, explicit, params };
  listeners.forEach((fn) => { try { fn(tab, state[tab]); } catch { /* a listener never breaks another */ } });
}

function clearSelection(tab) {
  if (!state[tab]) return;
  delete state[tab];
  listeners.forEach((fn) => { try { fn(tab, null); } catch { /* ignore */ } });
}

function onSelectionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resetAllSelections() {
  Object.keys(state).forEach((k) => delete state[k]);
}

module.exports = { getSelection, setSelection, clearSelection, onSelectionChange, resetAllSelections };
