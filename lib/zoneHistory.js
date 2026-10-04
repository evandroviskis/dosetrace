'use strict';
// A-51: the time zones this device was in, [{ tz, sinceMs }] oldest first (IANA names, so a DST
// switch is not a change). Kept on the device (AsyncStorage, lib/doseActions getMissedWatermark):
// the zone of a day without a dose is known only to the device that was there. Pure, CommonJS.

const DAY = 86400000;
const KEEP_MS = 30 * DAY; // longer than the Missed scan's 14-day look-back
const MAX_ENTRIES = 60;

// The zone in force at ms (null before the history starts).
function zoneAt(history, ms) {
  let tz = null;
  for (const e of history || []) { if (e.sinceMs <= ms) tz = e.tz; else break; }
  return tz;
}

// Drop entries no longer needed: keep the one in force at now − keepMs and everything after.
function prune(history, nowMs, keepMs = KEEP_MS) {
  const h = (history || []).slice();
  const cut = nowMs - keepMs;
  while (h.length > 1 && h[1].sinceMs <= cut) h.shift();
  while (h.length > MAX_ENTRIES) h.shift();
  return h;
}

function recordZone(history, tz, nowMs) {
  if (!tz) return history;
  const h = history || [];
  const last = h[h.length - 1];
  if (last && last.tz === tz) return h;
  return prune([...h, { tz, sinceMs: nowMs }], nowMs);
}

// The history on this run: the stored one, else seeded from S-19's keys (the last zone seen and
// when it last changed; before that the zone is unknown), else (first run ever) from now.
function seedHistory({ stored, storedTz, storedTzSinceMs, storedSinceMs, currentTz, nowMs }) {
  let h = Array.isArray(stored) && stored.length ? stored.filter((e) => e && e.tz && Number.isFinite(e.sinceMs)) : null;
  if (!h || !h.length) {
    if (storedTz) {
      const since = Number.isFinite(storedTzSinceMs) ? storedTzSinceMs : (Number.isFinite(storedSinceMs) ? storedSinceMs : nowMs);
      h = [{ tz: storedTz, sinceMs: since }];
    } else {
      h = currentTz ? [{ tz: currentTz, sinceMs: nowMs }] : [];
    }
  }
  return recordZone(h, currentTz, nowMs);
}

// [{ tz, a, b }] covering [fromMs, toMs) — only where the zone is known.
function intervals(history, fromMs, toMs) {
  const out = [];
  const h = history || [];
  for (let i = 0; i < h.length; i++) {
    const a = Math.max(fromMs, h[i].sinceMs);
    const b = Math.min(toMs, i + 1 < h.length ? h[i + 1].sinceMs : Infinity);
    if (b > a) out.push({ tz: h[i].tz, a, b });
  }
  return out;
}

// Where the Missed scan starts: with a usable history, from its first known zone (never before
// the scan's own first-seen watermark); without one (no zone name), S-19's guard as before.
function scanStart({ baseMs, history, guardSinceMs, currentTz }) {
  if (currentTz && history && history.length) return Math.max(baseMs, history[0].sinceMs);
  return guardSinceMs;
}

function parse(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : null; } catch { return null; }
}

module.exports = { scanStart, zoneAt, prune, recordZone, seedHistory, intervals, parse, KEEP_MS };
