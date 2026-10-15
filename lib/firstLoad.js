// A-120 (founder 2026-10-15): a screen's first view appears ONCE, complete — never a false empty
// state, never sections popping in one by one while its reads finish. Later updates (sync,
// data_changed, a dose written) still update the screen in place.

// Resolves when every task has settled (a failed read still ends the wait), or at capMs: a read
// that never ends (e.g. a hung token refresh) must not keep the screen on its spinner.
export function whenAllSettled(tasks, { capMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (timedOut) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ timedOut });
    };
    timer = setTimeout(() => finish(true), capMs);
    Promise.allSettled((tasks || []).map((x) => Promise.resolve(x))).then(() => finish(false));
  });
}

// A promise with its resolve beside it (a screen's "first load done" / "first screen shown").
export function deferred() {
  let resolve;
  const p = new Promise((r) => { resolve = r; });
  return { p, resolve };
}

// The Dose log's list: 'loading' until its first load has finished (never "No doses yet" or
// 0 / 0 / 0 before the rows are read), then 'empty' or 'list'.
export function logListState({ loaded, rows }) {
  if (!loaded) return 'loading';
  return Array.isArray(rows) && rows.length > 0 ? 'list' : 'empty';
}
