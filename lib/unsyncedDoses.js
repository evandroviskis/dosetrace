'use strict';
// A-181 (founder 2026-10-26, option B of docs/design/a181-a160-proposals.html): what the Dose log and
// the adherence report say while this phone has not synced. A-177 writes a Missed only after a
// successful dose_logs pull finished 12 h after the slot (lib/pullStamp), so until then those slots
// are "held": not missed yet, not taken either. Held = the slots the scan would write if a pull had
// finished now (lib/missedDoses computeMissedDoses with the scan's own gates), minus the ones the
// pull already lets through. The 14-day lookback of the scan does not change; held slots older than
// that are counted, since they are the ones that will never be written. Pure — no imports from the app.

const { computeMissedDoses, LATE_MS } = require('./missedDoses');

const DAY_MS = 24 * 60 * 60 * 1000;
// The notice waits for more than a day without a good pull (the app syncs at every opening).
const NOTICE_AFTER_MS = DAY_MS;
// Past a week the notice adds that misses older than 14 days are not recorded later.
const OLD_AFTER_MS = 7 * DAY_MS;
const SCAN_LOOKBACK_DAYS = 14;
const HELD_MAX_DAYS = 60;

// opts: pulledMs (lib/pullStamp; null = none on this phone) plus the scan's own zoneHistory and
// scheduleSince, passed through only when given (lib/missedDoses reads their presence).
function heldMissedSlots(protocols, logs, nowMs, sinceMs, opts = {}) {
  const pulled = Number.isFinite(opts.pulledMs) ? opts.pulledMs : -Infinity;
  const backDays = Number.isFinite(opts.pulledMs) ? Math.ceil((nowMs - opts.pulledMs) / DAY_MS) + 1 : SCAN_LOOKBACK_DAYS;
  const scan = { lookbackDays: Math.min(HELD_MAX_DAYS, Math.max(SCAN_LOOKBACK_DAYS, backDays)) };
  if ('zoneHistory' in opts) scan.zoneHistory = opts.zoneHistory;
  if ('scheduleSince' in opts) scan.scheduleSince = opts.scheduleSince;
  return computeMissedDoses(protocols, logs, nowMs, sinceMs, scan).filter((m) => m.scheduledAtMs + LATE_MS > pulled);
}

// → null (nothing to say) or { sinceMs, never, count, byProtocol, old }.
function unsyncedNotice({ pulledMs, nowMs, held }) {
  const list = Array.isArray(held) ? held : [];
  if (!list.length) return null;
  const known = Number.isFinite(pulledMs);
  if (known && nowMs - pulledMs <= NOTICE_AFTER_MS) return null;
  return { sinceMs: known ? pulledMs : null, never: !known, count: list.length, byProtocol: heldByProtocol(list, -Infinity, Infinity), old: known && nowMs - pulledMs > OLD_AFTER_MS };
}

// { [protocol id]: n } for the held slots in [fromMs, toMs].
function heldByProtocol(held, fromMs, toMs) {
  const out = {};
  for (const h of held || []) {
    if (h.scheduledAtMs < fromMs || h.scheduledAtMs > toMs) continue;
    out[h.protocol_id] = (out[h.protocol_id] || 0) + 1;
  }
  return out;
}

// The stored gaps (lib/pullStamp) that touch the report period, clipped to it.
function reportGaps(gaps, sinceMs, nowMs) {
  return (gaps || [])
    .filter((g) => g.toMs > sinceMs && g.fromMs < nowMs)
    .map((g) => ({ fromMs: Math.max(g.fromMs, sinceMs), toMs: Math.min(g.toMs, nowMs) }));
}

module.exports = { heldMissedSlots, unsyncedNotice, heldByProtocol, reportGaps, NOTICE_AFTER_MS, OLD_AFTER_MS };
