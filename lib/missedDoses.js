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
const { wallParts, wallToEpoch, daysBetween } = require('./zoneTime');
const { intervals, zoneAt } = require('./zoneHistory');

const LATE_MS = 12 * 60 * 60 * 1000;
const CREATION_GRACE_MS = 60 * 60 * 1000;
const EARLY_MS = 3 * 60 * 60 * 1000; // a dose logged up to 3 h before its slot still counts (also across midnight)

// Start of a slot's covering window. Local midnight comes from date methods,
// never "slot minus N hours", so 23 h / 25 h DST days are right.
// A-51: dayStartMs = the start of the slot's own day in ITS zone (zone-aware slots).
function coverStartMs(slotMs, dayStartMs) {
  if (Number.isFinite(dayStartMs)) return Math.min(slotMs - EARLY_MS, dayStartMs);
  const d = new Date(slotMs);
  d.setHours(0, 0, 0, 0);
  return Math.min(slotMs - EARLY_MS, d.getTime());
}

// A-51: the protocol's slots in [fromMs, toMs), each built in the zone the device was in then
// (lib/zoneHistory) and kept only inside that zone's interval — what Today and the reminders
// showed at the time. Nothing where the zone is unknown (before the history starts).
// → [{ slotMs, ti, dayKey, dayStartMs, dayEndMs }] earliest first.
function zoneSlots(p, history, fromMs, toMs) {
  const out = [];
  for (const iv of intervals(history, fromMs, toMs)) {
    for (const day of daysBetween(iv.tz, iv.a, iv.b)) {
      expectedSlotTimesOn(p, new Date(day.y, day.m - 1, day.d)).forEach((s, ti) => {
        const [h, m] = s.split(':').map(Number);
        const slotMs = wallToEpoch(iv.tz, day.y, day.m, day.d, h, m);
        if (slotMs >= iv.a && slotMs < iv.b) out.push({ slotMs, ti, dayKey: day.key, dayStartMs: day.startMs, dayEndMs: day.endMs - 1 });
      });
    }
  }
  return out.sort((a, b) => a.slotMs - b.slotMs);
}

// The start of today in the zone the device is in now (A-51; device local without a history).
function todayStartMs(history, nowMs) {
  const tz = history && history.length ? zoneAt(history, nowMs) : null;
  const t = wallParts(tz, nowMs);
  return wallToEpoch(tz, t.y, t.m, t.d, 0, 0);
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

  // A-51: with the device's zone history every slot is built in the zone of its own day.
  const zh = Array.isArray(opts.zoneHistory) && opts.zoneHistory.length ? opts.zoneHistory : null;
  const zToday = zh ? todayStartMs(zh, nowMs) : null;

  for (const p of protocols || []) {
    const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
    const existedFrom = Number.isFinite(createdMs) ? createdMs - CREATION_GRACE_MS : -Infinity;
    // All expected slot moments across the window, earliest first.
    const slots = [];
    const dayOf = {}; // slotMs → { dayStartMs, dayEndMs } (zone-aware slots)
    if (zh) {
      for (const s of zoneSlots(p, zh, zToday - lookbackDays * 86400000, includeToday ? nowMs + 1 : zToday)) {
        slots.push(s.slotMs);
        dayOf[s.slotMs] = s;
      }
    }
    const firstBack = includeToday ? 0 : 1;
    for (let back = firstBack; !zh && back <= lookbackDays; back++) {
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
    const uncovered = [];

    for (const slotMs of slots) {
      // Nearest unused log within the slot's covering window covers it.
      const startMs = coverStartMs(slotMs, dayOf[slotMs] && dayOf[slotMs].dayStartMs);
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
      if (bestIdx >= 0) used[bestIdx] = true; // slot covered
      else uncovered.push(slotMs);
    }
    // F1 (Today v2.1): a dose logged later on the slot's OWN day (an 08:00 dose marked at
    // 21:00) covers it — a second pass, so a log never leaves a closer slot of that day.
    for (const slotMs of lateSameDayPass(uncovered, avail, used, (s) => (dayOf[s] ? dayOf[s].dayEndMs : slotDayEndMs(s)))) {
      if (nowMs - slotMs >= LATE_MS && slotMs >= sinceMs && slotMs >= existedFrom) {
        out.push({ protocol_id: p.id, user_id: p.user_id, scheduledAtMs: slotMs });
      }
    }
  }

  return out;
}

// End of a slot's own local day (F1).
function slotDayEndMs(slotMs) {
  const d = new Date(slotMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

// F1 second pass, shared with lib/pendingYesterday: each slot still uncovered after the
// slot + 12 h pass takes the nearest unused log later on that same local day. Returns the
// slots that stay uncovered. Marks the logs it uses in `used`.
// endOf(slotMs): the end of the slot's own day (A-51: in its zone); default device local.
function lateSameDayPass(uncoveredSlots, avail, used, endOf = slotDayEndMs) {
  const left = [];
  for (const slotMs of uncoveredSlots) {
    const end = endOf(slotMs);
    let bestIdx = -1;
    for (let i = 0; i < avail.length; i++) {
      if (used[i] || avail[i] < slotMs || avail[i] > end) continue;
      if (bestIdx < 0 || avail[i] < avail[bestIdx]) bestIdx = i;
    }
    if (bestIdx >= 0) used[bestIdx] = true;
    else left.push(slotMs);
  }
  return left;
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

module.exports = { zoneSlots, todayStartMs, computeMissedDoses, LATE_MS, EARLY_MS, coverStartMs, missedScanWatermark, lateSameDayPass, slotDayEndMs };
