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
// A-123 F4: App.js asks for a sync on return to the foreground at most once a minute; a sync result
// newer than that is fresh enough, so the gate stays open for it (and never waits on a sync that
// App.js's throttle will not ask for). Keep equal to App.js's throttle (missedScanGate test).
const FOREGROUND_FRESH_MS = 60000;

// One gate for the app session, over lib/sync's events. Created when the screen module loads, so
// it hears the first pass even when Today mounts after it. A full import (new device / another
// account) replaces the local data: the gate closes until it ends.
// A-123 F4: back in the foreground (addForegroundListener: AppState 'active') after a while, the phone
// may have slept through a night and doses logged on the other phone: the gate closes again until
// the foreground sync's result (success or error) or a known-offline state — unless the last result
// is under FOREGROUND_FRESH_MS old. now: the clock (tests).
export function createFirstSyncGate({ addSyncListener, isOnlineNow, addForegroundListener, now = () => Date.now() }) {
  let settled = false;
  let settledAt = null;
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
    if (SETTLES.includes(e.type)) { settled = true; settledAt = now(); }
    flush();
  });
  if (typeof addForegroundListener === 'function') {
    addForegroundListener(() => {
      if (settled && settledAt != null && now() - settledAt < FOREGROUND_FRESH_MS) return;
      settled = false;
    });
  }
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
