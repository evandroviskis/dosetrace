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

// A-181 (founder 2026-10-26, option B): a good pull after more than 14 days without one leaves the
// slots between the previous pull and the scan's window (14 days back from the start of today,
// lib/doseActions MISSED_LOOKBACK_DAYS) never written as Missed. That gap is kept per account on this
// phone (not with the pull stamp: a full import forgets the stamp, never the gaps) for 60 days after
// its end, so the adherence report can say so while it falls in its 30 days.
const UNRECORDED_GAPS_KEY = 'dosetrace_unrecorded_gaps';
const LATE_MS = 12 * 60 * 60 * 1000; // lib/missedDoses LATE_MS (no imports here)
const GAP_LOOKBACK_DAYS = 14;
const GAP_KEEP_MS = 60 * 24 * 60 * 60 * 1000;

// The previous pull → this pull: { fromMs, toMs } of the slots no scan will write, or null.
function unrecordedGap(prevMs, atMs, lookbackDays = GAP_LOOKBACK_DAYS) {
  if (!Number.isFinite(prevMs) || !Number.isFinite(atMs) || prevMs >= atMs) return null;
  const day = new Date(atMs);
  const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate() - lookbackDays).getTime();
  const fromMs = prevMs - LATE_MS; // a slot later than this was still held at the previous pull
  return windowStart > fromMs ? { fromMs, toMs: windowStart } : null;
}

function parseGaps(raw) {
  let v = null;
  try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// The gaps of userId still kept at nowMs (never throws).
function gapsFor(raw, userId, nowMs) {
  const list = userId ? parseGaps(raw)[userId] : null;
  if (!Array.isArray(list)) return [];
  return list.filter((g) => g && Number.isFinite(g.fromMs) && Number.isFinite(g.toMs) && g.toMs + GAP_KEEP_MS >= nowMs);
}

async function readUnrecordedGaps(storage, userId, nowMs) {
  try { return gapsFor(await storage.getItem(UNRECORDED_GAPS_KEY), userId, nowMs); } catch { return []; }
}

async function keepGap(storage, userId, gap, nowMs) {
  try {
    const all = parseGaps(await storage.getItem(UNRECORDED_GAPS_KEY));
    all[userId] = [...gapsFor(JSON.stringify(all), userId, nowMs), gap];
    await storage.setItem(UNRECORDED_GAPS_KEY, JSON.stringify(all));
  } catch { /* best effort: the report then says nothing of this gap */ }
}

// Overwritten at each successful pull (never the max: after a clock put back, the next pull fixes it).
// A-181: the previous stamp of the same account first tells whether this pull closed a long gap.
async function recordDoseLogsPull(storage, userId, atMs) {
  if (!userId || !Number.isFinite(atMs)) return;
  let prevMs = null;
  try {
    let v = null;
    try { v = JSON.parse((await storage.getItem(DOSE_LOGS_PULLED_KEY)) || 'null'); } catch { v = null; }
    if (v && v.userId === userId && Number.isFinite(Number(v.atMs))) prevMs = Number(v.atMs);
  } catch { prevMs = null; }
  const gap = unrecordedGap(prevMs, atMs);
  if (gap) await keepGap(storage, userId, gap, atMs);
  try { await storage.setItem(DOSE_LOGS_PULLED_KEY, JSON.stringify({ userId, atMs })); } catch { /* the next pull */ }
}

async function forgetDoseLogsPull(storage) {
  try { await storage.removeItem(DOSE_LOGS_PULLED_KEY); } catch { /* best effort */ }
}

module.exports = { DOSE_LOGS_PULLED_KEY, UNRECORDED_GAPS_KEY, pulledThroughMs, readDoseLogsPull, recordDoseLogsPull, forgetDoseLogsPull, unrecordedGap, gapsFor, readUnrecordedGaps };
