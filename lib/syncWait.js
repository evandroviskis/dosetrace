'use strict';
// Small pure helpers for the reminder health read and the reminder conversation (second independent
// review 2026-11-05). Pure: no React Native, tested in __tests__/reminderConversation.test.js.

// Wait for the reminder resync in flight — and for one that starts while waiting (A, then B) — up to
// `limit` rounds, so a read never sees a half-done queue and never waits forever.
// getSync() → the promise of the resync running now, or null. → true when nothing is running any more.
async function awaitSyncs(getSync, limit = 5) {
  for (let i = 0; i < limit; i++) {
    const p = getSync();
    if (!p) return true;
    try { await p; } catch { /* read anyway */ }
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
