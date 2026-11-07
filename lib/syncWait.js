'use strict';
// Small pure helpers for the reminder health read and the reminder conversation (second independent
// review 2026-11-05). Pure: no React Native, tested in __tests__/reminderConversation.test.js.

// Wait for the reminder resync in flight — and for one that starts while waiting (A, then B) — up to
// `limit` rounds, so a read never sees a half-done queue and never waits forever.
// getSync() → the promise of the resync running now, or null. → true when nothing is running any more.
// maxMs (S25 2026-11-07): a resync that never settles must not hold the read — and the screen — forever.
async function awaitSyncs(getSync, limit = 5, maxMs = 8000) {
  const deadline = Date.now() + maxMs;
  for (let i = 0; i < limit; i++) {
    const p = getSync();
    if (!p) return true;
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => r('late'), left); });
    let res;
    try { res = await Promise.race([p, late]); } catch { /* read anyway */ }
    clearTimeout(timer);
    if (res === 'late') return false;
  }
  return !getSync();
}

// The screen's timers, cleared together when it goes away: nothing runs or updates state after that.
function timerBag() {
  const ids = new Set();
  let alive = true;
  return {
    later(fn, ms) {
      if (!alive) return null;
      const id = setTimeout(() => { ids.delete(id); if (alive) fn(); }, ms);
      ids.add(id);
      return id;
    },
    stop() { alive = false; for (const id of ids) clearTimeout(id); ids.clear(); },
    alive: () => alive,
  };
}

module.exports = { awaitSyncs, timerBag };
