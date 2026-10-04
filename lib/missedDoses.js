// Pure, deterministic core of the missed-dose scanner — no React Native / Expo
// imports, so it runs under plain Node's test runner (CommonJS like schedule.js).
//
// A dose "slot" (one scheduled dose on one day) is Missed when:
//   1. it is a slot the protocol actually expected that day (start/interval +
//      creation-day rule, via expectedSlotTimesOn),
//   2. at least LATE_MS (12 h) have passed since its scheduled moment,
//   3. no dose was logged near it — see below, and
//   4. its scheduled moment is at or after `sinceMs` — the "first seen" watermark
//      that stops the feature from retroactively rewriting pre-feature history, and
//   5. the protocol already existed: never before created_at − 1 h (A-32 / F-MISS-1; the
//      1-hour creation-day grace of lib/schedule.js stays a real expected dose). A protocol
//      set up with a past start date never gets Missed rows for the days before it was added.
//
// Logs are matched to slots by TIME PROXIMITY, not by calendar day. Dose logs are
// stamped at tap time (not the scheduled time), so a dose taken just after
// midnight for the prior evening's slot would fall on the wrong calendar day —
// a day-bucketed count would then invent a false Missed for the real slot and
// hide a genuine miss on the new day. Instead, a log "covers" a slot when it
// lands within [coverStartMs(slot), slot + LATE_MS]; each log covers at most one
// slot (nearest wins, earliest slot first). The window starts at the EARLIER of
// slot − EARLY_MS and the slot's own local midnight (A-43 / S-18): Today lets a
// dose be marked taken or skipped all day, so a 20:00 dose logged at 10:00 that
// day covers its slot instead of getting a false Missed next to it. On multi-dose
// days early logs count by NUMBER, not by which slot each one was meant for. A written Missed row (logged_at = its slot) covers its own
// slot exactly, so the scan is idempotent.
//
// The caller passes today's slots via `includeToday`; by default only slots on
// days that have already rolled over are considered, so today's doses stay live
// on the Today screen and there is no double-log race with logging them now.

const { expectedSlotTimesOn } = require('./schedule');

const LATE_MS = 12 * 60 * 60 * 1000;
const CREATION_GRACE_MS = 60 * 60 * 1000;
const EARLY_MS = 3 * 60 * 60 * 1000; // a dose logged up to 3 h before its slot still counts (also across midnight)

// Start of a slot's covering window. Local midnight comes from date methods,
// never "slot minus N hours", so 23 h / 25 h DST days are right.
function coverStartMs(slotMs) {
  const d = new Date(slotMs);
  d.setHours(0, 0, 0, 0);
  return Math.min(slotMs - EARLY_MS, d.getTime());
}

// Returns [{ protocol_id, user_id, scheduledAtMs }] for every slot that should be
// recorded as Missed.
//   protocols : active protocol rows ({ id, user_id, remote_id, ...schedule })
//   logs      : dose_log rows ({ protocol_id, logged_at }) — ANY outcome counts
//   nowMs     : current epoch ms
//   sinceMs   : watermark; slots scheduled before this are ignored
//   opts.lookbackDays : how many days back to scan (default 14)
//   opts.includeToday : also consider today's already-late slots (default false)
function computeMissedDoses(protocols, logs, nowMs, sinceMs, opts = {}) {
  const lookbackDays = opts.lookbackDays != null ? opts.lookbackDays : 14;
  const includeToday = !!opts.includeToday;
  const out = [];

  // Group log timestamps by protocol.
  const logsByProto = {};
  for (const l of logs || []) {
    const t = new Date(l.logged_at).getTime();
    if (isNaN(t)) continue;
    (logsByProto[l.protocol_id] || (logsByProto[l.protocol_id] = [])).push(t);
  }

  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);

  for (const p of protocols || []) {
    const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
    const existedFrom = Number.isFinite(createdMs) ? createdMs - CREATION_GRACE_MS : -Infinity;
    // All expected slot moments across the window, earliest first.
    const slots = [];
    const firstBack = includeToday ? 0 : 1;
    for (let back = firstBack; back <= lookbackDays; back++) {
      const day = new Date(today);
      day.setDate(day.getDate() - back);
      for (const s of expectedSlotTimesOn(p, day)) {
        const [h, m] = s.split(':').map(Number);
        const dt = new Date(day);
        dt.setHours(h, m, 0, 0);
        slots.push(dt.getTime());
      }
    }
    if (!slots.length) continue;
    slots.sort((a, b) => a - b);

    const avail = (logsByProto[p.id] || []).slice();
    const used = new Array(avail.length).fill(false);

    for (const slotMs of slots) {
      // Nearest unused log within the slot's covering window covers it.
      const startMs = coverStartMs(slotMs);
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < avail.length; i++) {
        if (used[i]) continue;
        const d = avail[i] - slotMs;
        if (avail[i] >= startMs && d <= LATE_MS && Math.abs(d) < bestDist) {
          bestDist = Math.abs(d);
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        used[bestIdx] = true; // slot covered
      } else if (nowMs - slotMs >= LATE_MS && slotMs >= sinceMs && slotMs >= existedFrom) {
        out.push({ protocol_id: p.id, user_id: p.user_id, scheduledAtMs: slotMs });
      }
    }
  }

  return out;
}

// A-49 guard (S-19). Past slots are rebuilt in the device's CURRENT zone, so after a
// time-zone change doses logged at the old zone's slot times no longer match and
// would be written as Missed. Cheap guard: when the zone NAME (IANA, e.g.
// "America/New_York" — never the UTC offset, so a DST switch does not count) differs
// from the last one seen, the scan starts from now: days before the change are never
// scanned. Cost: a dose really missed just before the change is not recorded. The
// full fix (zone stored on the protocol) is A-51.
//   storedSinceMs   : the scan's "first seen" watermark (null on the very first run)
//   storedTz        : the zone name seen last time (null on the first run after the update)
//   storedTzSinceMs : when the zone last changed (null if never)
//   currentTz       : the device zone name now (null when unavailable → guard skipped)
// Returns { sinceMs (what the scan uses), tz + tzSinceMs (to store), tzChanged }.
function missedScanWatermark({ storedSinceMs, storedTz, storedTzSinceMs, currentTz, nowMs }) {
  const base = Number.isFinite(storedSinceMs) ? storedSinceMs : nowMs;
  const tzChanged = !!(currentTz && storedTz && currentTz !== storedTz);
  const tzSinceMs = tzChanged ? nowMs : (Number.isFinite(storedTzSinceMs) ? storedTzSinceMs : null);
  return {
    sinceMs: tzSinceMs != null ? Math.max(base, tzSinceMs) : base,
    tz: currentTz || storedTz || null,
    tzSinceMs,
    tzChanged,
  };
}

module.exports = { computeMissedDoses, LATE_MS, EARLY_MS, coverStartMs, missedScanWatermark };
