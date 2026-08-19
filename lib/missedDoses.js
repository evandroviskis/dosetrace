// Pure, deterministic core of the missed-dose scanner — no React Native / Expo
// imports, so it runs under plain Node's test runner (CommonJS like schedule.js).
//
// A dose "slot" (one scheduled dose on one day) is Missed when:
//   1. it is a slot the protocol actually expected that day (start/interval +
//      creation-day rule, via expectedSlotTimesOn),
//   2. at least LATE_MS (12 h) have passed since its scheduled moment,
//   3. no dose was logged near it — see below, and
//   4. its scheduled moment is at or after `sinceMs` — the "first seen" watermark
//      that stops the feature from retroactively rewriting pre-feature history.
//
// Logs are matched to slots by TIME PROXIMITY, not by calendar day. Dose logs are
// stamped at tap time (not the scheduled time), so a dose taken just after
// midnight for the prior evening's slot would fall on the wrong calendar day —
// a day-bucketed count would then invent a false Missed for the real slot and
// hide a genuine miss on the new day. Instead, a log "covers" a slot when it
// lands within [slot − EARLY_MS, slot + LATE_MS]; each log covers at most one
// slot (nearest wins). A written Missed row (logged_at = its slot) covers its own
// slot exactly, so the scan is idempotent.
//
// The caller passes today's slots via `includeToday`; by default only slots on
// days that have already rolled over are considered, so today's doses stay live
// on the Today screen and there is no double-log race with logging them now.

const { expectedSlotTimesOn } = require('./schedule');

const LATE_MS = 12 * 60 * 60 * 1000;
const EARLY_MS = 3 * 60 * 60 * 1000; // a dose logged up to 3 h before its slot still counts

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
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < avail.length; i++) {
        if (used[i]) continue;
        const d = avail[i] - slotMs;
        if (d >= -EARLY_MS && d <= LATE_MS && Math.abs(d) < bestDist) {
          bestDist = Math.abs(d);
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        used[bestIdx] = true; // slot covered
      } else if (nowMs - slotMs >= LATE_MS && slotMs >= sinceMs) {
        out.push({ protocol_id: p.id, user_id: p.user_id, scheduledAtMs: slotMs });
      }
    }
  }

  return out;
}

module.exports = { computeMissedDoses, LATE_MS };
