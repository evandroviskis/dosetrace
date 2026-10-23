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

const { expectedSlotTimesOn, sortedDoseTimes } = require('./schedule');
const { wallParts, wallToEpoch, daysBetween } = require('./zoneTime');
const { intervals, zoneAt } = require('./zoneHistory');
const { endedAtMs } = require('./protocolEnd');

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
  // A-176: a slot is listed once even if the zone intervals overlap (an out-of-order history).
  // Keyed by moment AND dose index, so a protocol with the same time twice keeps both doses.
  const seen = new Set();
  return out.sort((a, b) => a.slotMs - b.slotMs).filter((s) => {
    const k = s.slotMs + '|' + s.ti;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
//   opts.pulledThroughMs : A-177 — when this phone last finished a successful pull of dose_logs
//                      (lib/pullStamp). When passed, a slot is written only if that pull finished at or
//                      after slot + LATE_MS (a dose logged on the other phone is here by then); null /
//                      undefined = no pull known → no slot. Left out (other callers): as before.
function computeMissedDoses(protocols, logs, nowMs, sinceMs, opts = {}) {
  const lookbackDays = opts.lookbackDays != null ? opts.lookbackDays : 14;
  const includeToday = !!opts.includeToday;
  const pullGated = 'pulledThroughMs' in opts;
  const pulledMs = pullGated && Number.isFinite(opts.pulledThroughMs) ? opts.pulledThroughMs : -Infinity;
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
      if (nowMs - slotMs >= LATE_MS && slotMs >= sinceMs && slotMs >= existedFrom && (!pullGated || slotMs + LATE_MS <= pulledMs)) {
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

// A-123: the app's Missed rows a Taken / Skipped row now makes redundant — a dose logged on another
// phone that arrived after this phone had written the Missed row (or one logged after the scan by any
// path). The watermark does not apply (it only stops new rows). Rows the user entered are never
// returned. Founder rule (never destroy on a maybe; journey review 2026-10-15, F1–F6): a Missed row
// goes ONLY when all of these hold, otherwise it stays next to the Taken (the safe status quo):
//   (a) a Taken / Skipped row of that protocol lies on the slot's OWN calendar day (in that day's
//       zone, A-51) — never one of the next morning (F2: the slot + 12 h window crosses midnight);
//   (b) of that day's slots, the Missed row's slot is the one strictly nearest to that row; a tie
//       (a dose exactly between two slots) cannot say which dose it was, so it removes nothing (F3);
//       and the scanner's own matcher (computeMissedDoses), run over what is left, would not write
//       the row back (no delete-then-recreate: a 15:00 dose it counts for 08:00 removes no 20:00 row);
//   (c) the protocol's schedule is known unchanged since the start of that day: past days are rebuilt
//       with today's schedule, so after a time / frequency edit a Missed row can sit at a slot that
//       did not exist then (F1). opts.scheduleSince[p.id] (noteSchedules, the scan's ledger) or,
//       without it, the protocol's updated_at; nothing known → nothing removed;
//   (d) ended protocols count too (F6), up to their end: the end day itself is left alone (its slots
//       are cut at the end moment, so "nearest" cannot be trusted there).
//   logs: dose_log rows ({ id, protocol_id, outcome, logged_at });
//   opts: lookbackDays, zoneHistory, scheduleSince ({ [protocol id]: ms }).
const COVERING = ['Taken', 'Skipped'];
function coveredMissedRows(protocols, logs, nowMs, opts = {}) {
  const all = logs || [];
  if (!all.some((l) => l.outcome === 'Missed')) return [];
  const o = { lookbackDays: opts.lookbackDays, zoneHistory: opts.zoneHistory };
  const since = opts.scheduleSince || {};
  const out = [];
  for (const p of protocols || []) {
    const mine = all.filter((l) => l.protocol_id === p.id);
    const missed = mine.filter((l) => l.outcome === 'Missed');
    if (!missed.length) continue;
    const stableSince = Number.isFinite(since[p.id]) ? since[p.id] : updatedAtCert(p, nowMs);
    if (!Number.isFinite(stableSince)) continue; // (c) nothing known about the schedule
    const covering = mine.filter((l) => COVERING.includes(l.outcome));
    if (!covering.length) continue;
    const coverMs = covering.map((l) => new Date(l.logged_at).getTime()).filter((t) => !isNaN(t));
    const endMs = endedAtMs(p);
    // The window's slots by day (same window as the scan: past days only).
    const byDay = {};
    for (const s of windowSlots(p, nowMs, o)) (byDay[s.dayStartMs] || (byDay[s.dayStartMs] = [])).push(s);
    const clear = new Set(); // slot moments whose Missed rows go
    for (const day of Object.values(byDay)) {
      const { dayStartMs, dayEndMs } = day[0];
      if (dayStartMs < stableSince) continue; // (c)
      if (endMs != null && endMs >= dayStartMs && endMs <= dayEndMs) continue; // (d) the end day
      for (const c of coverMs) {
        if (c < dayStartMs || c > dayEndMs) continue; // (a)
        let best = null;
        let tie = false;
        for (const s of day) {
          const d = Math.abs(c - s.slotMs);
          if (!best || d < best.d) { best = { slotMs: s.slotMs, d }; tie = false; } else if (d === best.d) tie = true;
        }
        if (best && !tie) clear.add(best.slotMs); // (b)
      }
    }
    if (!clear.size) continue;
    const gone = missed.filter((l) => clear.has(new Date(l.logged_at).getTime()));
    if (!gone.length) continue;
    // (b) The scan runs over what is left: if it would write any of these slots back, remove none.
    const goneIds = new Set(gone.map((l) => l.id));
    const back = computeMissedDoses([p], mine.filter((l) => !goneIds.has(l.id)), nowMs, -Infinity, o);
    if (back.some((m) => clear.has(m.scheduledAtMs))) continue;
    out.push(...gone);
  }
  return out;
}

// A-149: Missed rows the scan could not have written at the phone's clock now. The scan writes a
// Missed row only for a slot at least LATE_MS old, and only the scan writes Missed rows (the Dose log
// can turn one into Taken / Skipped or keep it, never create one), so a Missed row dated later than
// now − LATE_MS was written while the clock was ahead (a clock moved days forward, then put back).
// Taken / Skipped rows dated ahead are the user's and are never returned. Once the slot really is
// LATE_MS old with nothing logged, the scan writes it again.
// nowMs: serverConfirmedNow, so a clock put BACK never makes real rows look ahead.
function notYetDueMissedRows(logs, nowMs) {
  return (logs || []).filter((l) => l.outcome === 'Missed' && Date.parse(l.logged_at) > nowMs - LATE_MS);
}

// A-149: a time that has certainly passed — the later of the device clock and the newest cloud stamp
// on a synced row. The cloud sets updated_at itself (dose_logs: default now() + moddatetime trigger;
// the app never sends it), and a synced row keeps the cloud's stamp; a pending row's stamp is the
// device clock and proves nothing.
function serverConfirmedNow(logs, nowMs) {
  let t = nowMs;
  for (const l of logs || []) {
    if (l.sync_status !== 'synced') continue;
    const u = Date.parse(l.updated_at);
    if (u > t) t = u;
  }
  return t;
}

// The scan window's slots of p (computeMissedDoses' window, past days only), each with its own
// day's bounds: zone-aware with a zone history (A-51), device local without one.
function windowSlots(p, nowMs, opts = {}) {
  const lookbackDays = opts.lookbackDays != null ? opts.lookbackDays : 14;
  const zh = Array.isArray(opts.zoneHistory) && opts.zoneHistory.length ? opts.zoneHistory : null;
  if (zh) {
    const zToday = todayStartMs(zh, nowMs);
    return zoneSlots(p, zh, zToday - lookbackDays * 86400000, zToday).map((s) => ({ slotMs: s.slotMs, dayStartMs: s.dayStartMs, dayEndMs: s.dayEndMs }));
  }
  const out = [];
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  for (let back = 1; back <= lookbackDays; back++) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const dayStartMs = day.getTime();
    const dayEndMs = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() - 1;
    for (const t of expectedSlotTimesOn(p, day)) {
      const [h, m] = t.split(':').map(Number);
      const dt = new Date(day);
      dt.setHours(h, m, 0, 0);
      out.push({ slotMs: dt.getTime(), dayStartMs, dayEndMs });
    }
  }
  return out.sort((a, b) => a.slotMs - b.slotMs);
}

// (c) The fields that decide a protocol's slots (lib/schedule.js expectedSlotTimesOn). The end
// (active / ended_at) is left out on purpose: it only removes slots after it, and the cleanup never
// looks at the end day.
const SCHEDULE_FIELDS = ['reminder_time', 'doses_per_day', 'interval_days', 'start_date', 'created_at'];
function scheduleFingerprint(p) {
  return JSON.stringify(SCHEDULE_FIELDS.map((k) => (p && p[k] != null ? String(p[k]) : null)));
}

// updated_at as proof: no write at all since then, so no schedule edit either. A future stamp
// (a clock change) proves nothing.
function updatedAtCert(p, nowMs) {
  const u = p && p.updated_at ? Date.parse(p.updated_at) : NaN;
  return Number.isFinite(u) && u <= nowMs ? u : Infinity;
}

// (c) The scan's schedule ledger (device-only, kept by lib/doseActions observeSchedules): for each
// protocol the schedule this phone saw and since when it has seen it unchanged at every scan.
// updated_at moves on any write (an oral dose updates units_taken every day), so it alone would stop
// the cleanup for good; the ledger says the schedule itself did not move. Once the ledger has SEEN a
// change, only the ledger counts (an older-looking updated_at — another phone's clock, a clock
// change — never certifies the days before it saw the change). First sight: updated_at, or now.
//   stored: the ledger ({ key: { fp, sinceMs, changed } }) or null; protocols: rows of this user.
// Returns { next (the ledger to store: this user's current protocols only), sinceById }.
function noteSchedules(stored, protocols, { userId, nowMs }) {
  const prev = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const next = {};
  const sinceById = {};
  for (const p of protocols || []) {
    const key = `${userId}|${p.remote_id ? 'r:' + p.remote_id : 'l:' + p.id}`;
    const fp = scheduleFingerprint(p);
    const old = prev[key];
    const valid = old && Number.isFinite(old.sinceMs) && old.sinceMs <= nowMs;
    let entry;
    if (valid && old.fp === fp) entry = { fp, sinceMs: old.sinceMs, changed: !!old.changed };
    else if (valid) entry = { fp, sinceMs: nowMs, changed: true };
    else entry = { fp, sinceMs: nowMs, changed: false };
    next[key] = entry;
    sinceById[p.id] = entry.changed ? entry.sinceMs : Math.min(entry.sinceMs, updatedAtCert(p, nowMs));
  }
  return { next, sinceById };
}

// A-176: the identical app-written Missed copies of one slot (same protocol, same instant) that an
// out-of-order zone history wrote twice. A copy the user edited (an injection site or a note) is
// never returned. Only Missed rows: Taken / Skipped are the user's own. → the rows to delete
// (their deletion is pushed to the cloud as a tombstone).
// Gate B: every phone keeps the SAME copy — synced first, then the smallest cloud id, then the
// local id — so two phones never delete each other's keeper. Council (build 6): a row is matched
// to its protocol (by cloud id, else local id); a row whose protocol is not in `protocols` is never
// touched, nor is a protocol with the same dose time twice (two real doses at one moment).
function duplicateMissedRows(logs, protocols) {
  const byLocal = {};
  const byRemote = {};
  for (const p of protocols || []) {
    if (!p) continue;
    if (p.id != null) byLocal[p.id] = p;
    if (p.remote_id) byRemote[p.remote_id] = p;
  }
  const repeats = (p) => {
    const times = sortedDoseTimes(p).slice(0, p.doses_per_day || 1).map((x) => x.trim());
    return new Set(times).size !== times.length;
  };
  const groups = {};
  for (const l of logs || []) {
    if (!l || l.outcome !== 'Missed') continue;
    const t = new Date(l.logged_at).getTime();
    if (isNaN(t)) continue;
    const p = (l.protocol_remote_id && byRemote[l.protocol_remote_id]) || (l.protocol_id != null && byLocal[l.protocol_id]) || null;
    if (!p || repeats(p)) continue;
    const k = (p.remote_id || 'L' + p.id) + '|' + t;
    (groups[k] || (groups[k] = [])).push(l);
  }
  const keeperOrder = (a, b) => {
    if (!!a.remote_id !== !!b.remote_id) return a.remote_id ? -1 : 1;
    if (a.remote_id && b.remote_id && a.remote_id !== b.remote_id) return a.remote_id < b.remote_id ? -1 : 1;
    return a.id - b.id;
  };
  const out = [];
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const edited = (l) => !!(l.injection_site || l.notes);
    const plain = g.filter((l) => !edited(l)).sort(keeperOrder);
    out.push(...(g.some(edited) ? plain : plain.slice(1)));
  }
  return out;
}

// A-177: app-written Missed rows next to a dose that WAS taken (or skipped) — written by a phone that
// had not pulled the other phone's Taken yet. Zone-free (the A-123 rule needs zone-history slots, a
// schedule ledger and an exact slot match, so it can never remove rows written before 1.3.0 or in
// another zone offset) and limited to the plainest case. A Missed row goes only when ALL hold:
//   - matched to its protocol (cloud id, else local id; a row of an unknown protocol is never touched);
//     that protocol has one dose a day and no dose time listed twice;
//   - outcome Missed, no injection site, no note (never a row the user edited), logged_at exactly on a
//     minute (the scan writes slots that way; a user's tap carries seconds), within opts.lookbackDays
//     (default 60);
//   - a Taken or Skipped of the same protocol lies within ±NEAR_TAKEN_MS (3 h), and this row is the
//     Missed nearest to it (a tie removes nothing): one Taken / Skipped clears at most one Missed.
// → the rows to delete (deleteDoseLog: the deletion is pushed to the cloud as a tombstone).
const NEAR_TAKEN_MS = 3 * 60 * 60 * 1000;
function falseMissedRows(protocols, logs, nowMs, opts = {}) {
  const lookbackDays = opts.lookbackDays != null ? opts.lookbackDays : 60;
  const fromMs = nowMs - lookbackDays * 86400000;
  const byLocal = new Map();
  const byRemote = new Map();
  for (const p of protocols || []) {
    if (!p) continue;
    if (p.id != null) byLocal.set(p.id, p);
    if (p.remote_id) byRemote.set(p.remote_id, p);
  }
  const protoOf = (l) => (l.protocol_remote_id && byRemote.get(l.protocol_remote_id)) || (l.protocol_id != null && byLocal.get(l.protocol_id)) || null;
  const oneDose = (p) => {
    if (Number(p.doses_per_day || 1) !== 1) return false;
    const times = sortedDoseTimes(p).map((x) => x.trim());
    return new Set(times).size === times.length;
  };
  const groups = new Map(); // protocol → { missed: [{ l, t }], cover: [ms] }
  for (const l of logs || []) {
    if (!l || !(l.outcome === 'Missed' || COVERING.includes(l.outcome))) continue;
    const t = new Date(l.logged_at).getTime();
    if (isNaN(t)) continue;
    const p = protoOf(l);
    if (!p || !oneDose(p)) continue;
    if (!groups.has(p)) groups.set(p, { missed: [], cover: [] });
    const g = groups.get(p);
    if (l.outcome === 'Missed') g.missed.push({ l, t });
    else g.cover.push(t);
  }
  const out = new Set();
  const atDoseTime = (p, t) => {
    const d = new Date(t);
    const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return sortedDoseTimes(p).some((x) => x.trim() === hhmm);
  };
  for (const [p, { missed, cover }] of groups.entries()) {
    for (const c of cover) {
      let best = null;
      let tie = false;
      for (const m of missed) {
        const d = Math.abs(m.t - c);
        if (!best || d < best.d) { best = { m, d }; tie = false; } else if (d === best.d) tie = true;
      }
      if (!best || tie || best.d > NEAR_TAKEN_MS) continue;
      const { l, t } = best.m;
      if (t < fromMs || t % 60000 !== 0 || l.injection_site || l.notes) continue;
      // Gate B (2026-10-23): only a Missed at one of the schedule's own dose times (this phone's wall
      // clock) — one from an older schedule (2 doses → 1, a time moved) may be a real miss: kept.
      if (!atDoseTime(p, t)) continue;
      out.add(l);
    }
  }
  return [...out];
}

module.exports = { falseMissedRows, NEAR_TAKEN_MS, duplicateMissedRows, zoneSlots, todayStartMs, computeMissedDoses, coveredMissedRows, notYetDueMissedRows, serverConfirmedNow, noteSchedules, scheduleFingerprint, LATE_MS, EARLY_MS, coverStartMs, missedScanWatermark, lateSameDayPass, slotDayEndMs };
