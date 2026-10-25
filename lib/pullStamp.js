'use strict';
// A-177: when this phone last finished a SUCCESSFUL pull of dose_logs from the cloud (lib/sync.js
// pullCloudChanges / fullImportFromCloud: the dose_logs fetch had no error). The Missed scan writes a
// slot only when such a pull finished after slot + 12 h (lib/missedDoses computeMissedDoses
// opts.pulledThroughMs): a dose logged on the other phone is in the cloud by then, and the scan's
// gate (lib/firstSyncGate) also opens on sync_error, offline or a cap — none of which brings it.
// Stored as { userId, atMs } under one key, so another account on this phone never uses it; a full
// import (the local data replaced) drops it first. A stamp ahead of the clock (taken while the clock
// was ahead, then put back) proves nothing. No imports: the storage (AsyncStorage) is passed in.
// Never throws.

const DOSE_LOGS_PULLED_KEY = 'dosetrace_dose_logs_pulled';

// The stored value → the pull time for userId, or null (none / another account / ahead of nowMs).
function pulledThroughMs(raw, userId, nowMs) {
  let v = null;
  try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
  if (!v || typeof v !== 'object' || !userId || v.userId !== userId) return null;
  const at = Number(v.atMs);
  if (!Number.isFinite(at) || at > nowMs) return null;
  return at;
}

async function readDoseLogsPull(storage, userId, nowMs) {
  try { return pulledThroughMs(await storage.getItem(DOSE_LOGS_PULLED_KEY), userId, nowMs); } catch { return null; }
}

// Overwritten at each successful pull (never the max: after a clock put back, the next pull fixes it).
async function recordDoseLogsPull(storage, userId, atMs) {
  if (!userId || !Number.isFinite(atMs)) return;
  try { await storage.setItem(DOSE_LOGS_PULLED_KEY, JSON.stringify({ userId, atMs })); } catch { /* the next pull */ }
}

async function forgetDoseLogsPull(storage) {
  try { await storage.removeItem(DOSE_LOGS_PULLED_KEY); } catch { /* best effort */ }
}

module.exports = { DOSE_LOGS_PULLED_KEY, pulledThroughMs, readDoseLogsPull, recordDoseLogsPull, forgetDoseLogsPull };
