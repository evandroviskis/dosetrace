// A debounced save that never drops the last value (S-26 BK-10, CLAUDE.md "NEVER lose
// user-entered data"). schedule() waits `delay` ms after the last change, as before;
// flush() writes a pending value right away — call it when the screen unmounts or moves
// (fold / unfold), so a value typed just before leaving is still saved. Pure CommonJS so
// plain Node tests can load it.

function createDebouncedSave(save, delay = 900) {
  let timer = null;
  let pending;
  let has = false;

  function run() {
    if (!has) return;
    const p = pending;
    has = false;
    pending = undefined;
    try {
      const r = save(p);
      if (r && typeof r.catch === 'function') r.catch(() => {}); // fire-and-forget, as before
    } catch { /* a failed save never breaks the screen */ }
  }

  return {
    schedule(payload) {
      pending = payload;
      has = true;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; run(); }, delay);
    },
    flush() {
      if (timer != null) { clearTimeout(timer); timer = null; }
      run();
    },
    hasPending() { return has; },
  };
}

module.exports = { createDebouncedSave };
