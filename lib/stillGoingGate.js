// A-122 (founder 2026-10-15): "Still going?" asked about a protocol taken yesterday on the other
// phone. Today decided "no dose for N days" from the phone's local dose_logs before the session's
// startup download from the cloud had brought that dose. The decision now waits for the session's
// first sync result (success OR error), or for a known-offline state (no download is coming, so an
// offline user is still asked from what the phone has). No imports: lib/sync's listener bus and
// connectivity are passed in (pure, runs under plain node).

// May Today decide "no dose for N days" now?
export function mayCheckStillGoing({ firstSyncSettled, online } = {}) {
  if (firstSyncSettled) return true;
  return online === false;
}

const SETTLES = ['sync_complete', 'sync_error', 'import_complete', 'import_error'];

// One gate for the app session, over lib/sync's events. Created when the screen module loads, so
// it hears the first pass even when Today mounts after it. A full import (new device / another
// account) replaces the local data: the gate closes until it ends.
export function createFirstSyncGate({ addSyncListener, isOnlineNow }) {
  let settled = false;
  let waiters = [];
  const online = () => { try { return isOnlineNow(); } catch { return null; } };
  const isOpen = () => mayCheckStillGoing({ firstSyncSettled: settled, online: online() });
  function flush() {
    if (!waiters.length || !isOpen()) return;
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  }
  addSyncListener((e) => {
    if (!e) return;
    if (e.type === 'import_start') { settled = false; return; }
    if (SETTLES.includes(e.type)) settled = true;
    flush();
  });
  return {
    isOpen,
    whenOpen: () => (isOpen() ? Promise.resolve() : new Promise((resolve) => { waiters.push(resolve); })),
    // A-123: the same wait with a cap (the Settings report must never hang): true when the gate
    // opened in time, false when the cap ran out first.
    whenOpenWithin: (maxMs) => (isOpen() ? Promise.resolve(true) : new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), maxMs);
      waiters.push(() => { clearTimeout(timer); resolve(true); });
    })),
  };
}
