'use strict';
// Unrecorded period beyond 14 days — "Você tomou?" (founder 2026-11-03 "B"; answers 2026-11-04 10:04 EST;
// docs/specs/unrecorded-period.md UP-1 … UP-36). Pure, CommonJS (node --test); the app reads and writes
// through lib/doseActions.js (unrecordedQueue / saveUnrecordedAnswer).
//
// The red "Perdida" the Missed scan writes covers only its 14-day window (lib/doseActions
// MISSED_LOOKBACK_DAYS). Every scheduled slot before that window — at most 365 days back (the curve's
// reach) and never before the protocol was in the app — that no dose row covers, plus every "Perdida" the
// APP wrote there (founder answer 3: one the person marked stays red and out), is asked once per protocol:
// "De {de} a {até} há {n} doses de {nome} sem registro. Você tomou?" → Tomei todas no horário / Escolher
// quais / Não tomei, and the link "Não lembro". The app never assumes a dose was taken.
//
// - Slots are built here, day by day (never by the scan with a longer look-back), with the schedule in
//   force on their own day (lib/scheduleHistory scheduleOn) and in the zone of their own day: inside the
//   zone history its zone, older than it the oldest known zone, without one the device's (UP-3, UP-4, UP-12).
// - "Covered" is the scan's own matching (lib/missedDoses uncoveredSlots, "no dose" rows first, slot_at),
//   except an app-written Missed row older than the window: it does not cover its slot, it is attached to it
//   so the answer changes that very row (UP-5, UP-36).
// - Nothing is asked before a successful dose_logs pull that reaches the slot + 12 h (UP-6, lib/pullStamp).
// - "Não lembro" ranges live on the protocol (protocols.unrecorded_unknown, JSON TEXT, synced like
//   schedule_history), so the question never comes back for them, on a new phone included (UP-35).
const { expectedSlotTimesOn } = require('./schedule');
const { scheduleOn } = require('./scheduleHistory');
const { uncoveredSlots, todayStartMs, LATE_MS } = require('./missedDoses');
const { intervals } = require('./zoneHistory');
const { daysBetween, wallToEpoch } = require('./zoneTime');
const { endedAtMs } = require('./protocolEnd');
const { isNoDose, noDoseMs, dropAnsweredSlots } = require('./noDose');

const DAY = 86400000;
const HOUR = 3600000;
const SCAN_DAYS = 14; // the Missed scan's window (lib/doseActions MISSED_LOOKBACK_DAYS)
const LOOKBACK_DAYS = 365; // the curve's reach (lib/serumModel CURVE_MAX_PAST_DAYS)
const CREATION_GRACE_MS = HOUR; // lib/missedDoses: never before created_at − 1 h
const SAME_SLOT_MS = 60 * 1000; // rows written for a slot sit at its exact time

const dayStart = (key) => {
  const t = new Date(String(key).slice(0, 10) + 'T00:00:00').getTime();
  return Number.isFinite(t) ? t : NaN;
};
const coverMsOf = (l) => new Date(l.slot_at || l.logged_at).getTime();

// Who wrote a row's outcome (founder answer 3, dose_logs.outcome_by_person): true only when the person set
// it. Rows without the field (older versions, a cloud without the column) count as written by the app.
function isPersonMarked(l) {
  return !!l && (l.outcome_by_person === 1 || l.outcome_by_person === true || l.outcome_by_person === '1');
}

// The start of the Missed scan's window, computed exactly as computeMissedDoses does: with a zone history
// today's start in today's zone minus 14 × 24 h; without one, local midnight 14 calendar days back.
function scanWindowStartMs(nowMs, zoneHistory, scanDays = SCAN_DAYS) {
  const zh = Array.isArray(zoneHistory) && zoneHistory.length ? zoneHistory : null;
  if (zh) return todayStartMs(zh, nowMs) - scanDays * DAY;
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - scanDays);
  return d.getTime();
}

// The earliest moment a protocol can owe a slot here (UP-3, UP-7): the latest of created_at − 1 h (before
// it existed in the app, the past-start question answered it), history_from (the curve starts there), the
// start date, and 365 days back.
function periodFloorMs(p, nowMs, lookbackDays = LOOKBACK_DAYS) {
  const c = p && p.created_at ? Date.parse(p.created_at) : NaN;
  const parts = [nowMs - lookbackDays * DAY];
  if (Number.isFinite(c)) parts.push(c - CREATION_GRACE_MS);
  if (p && p.history_from) { const h = dayStart(p.history_from); if (Number.isFinite(h)) parts.push(h); }
  if (p && p.start_date) { const s = dayStart(p.start_date); if (Number.isFinite(s)) parts.push(s); }
  return Math.max(...parts);
}

// "Não lembro" ranges of a protocol: [{ fromMs, toMs, atMs }] (bad JSON → none).
function unknownRanges(p) {
  const raw = p && p.unrecorded_unknown;
  if (!raw) return [];
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list.map((r) => ({ fromMs: Date.parse(r && r.from), toMs: Date.parse(r && r.to), atMs: Date.parse(r && r.at) }))
      .filter((r) => Number.isFinite(r.fromMs) && Number.isFinite(r.toMs));
  } catch { return []; }
}
const toJson = (ranges) => JSON.stringify(ranges.map((r) => ({ from: new Date(r.fromMs).toISOString(), to: new Date(r.toMs).toISOString(), ...(Number.isFinite(r.atMs) ? { at: new Date(r.atMs).toISOString() } : {}) })));
function addUnknownRange(raw, { fromMs, toMs, atMs }) {
  return toJson([...unknownRanges({ unrecorded_unknown: raw }), { fromMs, toMs, atMs }].slice(-200));
}
// Undo: exactly that range goes; an empty list stays a list ("[]", never null, so the removal is sent).
function removeUnknownRange(raw, { fromMs, toMs }) {
  const list = unknownRanges({ unrecorded_unknown: raw });
  const i = list.findIndex((r) => r.fromMs === fromMs && r.toMs === toMs);
  if (i >= 0) list.splice(i, 1);
  return toJson(list);
}
const inRanges = (ranges, ms) => ranges.some((r) => ms >= r.fromMs - SAME_SLOT_MS && ms <= r.toMs + SAME_SLOT_MS);

// The protocol's slots in [fromMs, toMs): [{ slotMs, dayStartMs, dayEndMs }], each day with the schedule
// in force that day, in the zone of that day (UP-4: before the zone history, its oldest zone).
function buildSlots(p, fromMs, toMs, zoneHistory) {
  const out = [];
  if (!(toMs > fromMs)) return out;
  const zh = Array.isArray(zoneHistory) && zoneHistory.length ? zoneHistory : null;
  const spans = zh
    ? intervals([{ tz: zh[0].tz, sinceMs: Math.min(fromMs, zh[0].sinceMs) }, ...zh.slice(1)], fromMs, toMs)
    : [{ tz: null, a: fromMs, b: toMs }];
  for (const iv of spans) {
    for (const day of daysBetween(iv.tz, iv.a, iv.b)) {
      const date = new Date(day.y, day.m - 1, day.d);
      for (const s of expectedSlotTimesOn(scheduleOn(p, date), date)) {
        const [h, m] = s.split(':').map(Number);
        const slotMs = wallToEpoch(iv.tz, day.y, day.m, day.d, h, m);
        if (slotMs >= iv.a && slotMs < iv.b) out.push({ slotMs, dayStartMs: day.startMs, dayEndMs: day.endMs - 1 });
      }
    }
  }
  const seen = new Set();
  return out.sort((a, b) => a.slotMs - b.slotMs).filter((s) => (seen.has(s.slotMs) ? false : (seen.add(s.slotMs), true)));
}

// The unrecorded period of ONE protocol → [{ slotMs, row }] earliest first (row = the app-written Missed
// row of that slot, else null).
//   logs: dose rows (any outcome, deleted ones already left out); only this protocol's are used.
//   opts: nowMs, zoneHistory (lib/doseActions getMissedWatermark), pulledThroughMs (lib/pullStamp; none →
//   nothing), fromMs / beforeMs (the lab subset, UP-22), scanDays, lookbackDays.
function gapEntries(p, logs, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  if (!p || p.deleted_at || p.purged_at || p.sync_status === 'deleted') return [];
  const pulled = Number.isFinite(opts.pulledThroughMs) ? opts.pulledThroughMs : null;
  if (pulled == null) return []; // UP-6
  const zh = Array.isArray(opts.zoneHistory) && opts.zoneHistory.length ? opts.zoneHistory : null;
  const lookbackDays = opts.lookbackDays || LOOKBACK_DAYS;
  const windowStart = scanWindowStartMs(nowMs, zh, opts.scanDays || SCAN_DAYS);
  const floor = Math.max(periodFloorMs(p, nowMs, lookbackDays), Number.isFinite(opts.fromMs) ? opts.fromMs : -Infinity);
  const ended = endedAtMs(p);
  const ceiling = Math.min(windowStart, ended != null ? ended : Infinity, Number.isFinite(opts.beforeMs) ? opts.beforeMs : Infinity);
  const yearAgo = nowMs - lookbackDays * DAY;
  const ranges = unknownRanges(p);

  const mine = (logs || []).filter((l) => l && l.protocol_id === p.id && l.sync_status !== 'deleted');
  // UP-36: an app-written Missed row older than the window is asked, not a cover.
  const appOld = mine.filter((l) => l.outcome === 'Missed' && !isPersonMarked(l) && Date.parse(l.logged_at) < windowStart);
  const appIds = new Set(appOld.map((l) => l.id));
  const covering = mine.filter((l) => !appIds.has(l.id));

  const built = buildSlots(p, floor, ceiling, zh);
  const dayOf = {};
  for (const s of built) dayOf[s.slotMs] = s;
  // DV-243: a slot answered "no dose" is not owed; a "no dose" row off every slot covers like any row.
  const noDose = covering.filter(isNoDose).map(noDoseMs).filter(Number.isFinite);
  const answered = dropAnsweredSlots(built.map((s) => s.slotMs), noDose);
  const avail = covering.filter((l) => !isNoDose(l)).map(coverMsOf).filter(Number.isFinite).concat(answered.unused);
  const open = uncoveredSlots(p, answered.slots, avail, { dayOf, zh });

  const ok = (ms) => ms + LATE_MS <= pulled && ms >= yearAgo && !inRanges(ranges, ms)
    && (!Number.isFinite(opts.fromMs) || ms >= opts.fromMs) && (!Number.isFinite(opts.beforeMs) || ms < opts.beforeMs);
  const out = open.filter(ok).map((slotMs) => ({ slotMs, row: null }));
  for (const r of appOld) {
    const t = Date.parse(r.logged_at);
    if (!Number.isFinite(t) || !ok(t)) continue;
    const hit = out.find((e) => !e.row && Math.abs(e.slotMs - t) < SAME_SLOT_MS);
    if (hit) hit.row = r;
    else out.push({ slotMs: t, row: r });
  }
  return out.sort((a, b) => a.slotMs - b.slotMs);
}

// Every protocol's question, in the order given → [{ protocol, entries }] (protocols with nothing left out).
function unrecordedAsks(protocols, logs, opts = {}) {
  const out = [];
  for (const p of protocols || []) {
    const entries = gapEntries(p, logs, { ...opts, ...(opts.windowFor ? opts.windowFor(p) || {} : {}) });
    if (entries.length) out.push({ protocol: p, entries });
  }
  return out;
}

// The vial's start (UP-15): the day it was mixed, else the day it was added.
function vialStartMs(vial) {
  if (!vial) return NaN;
  if (vial.mixed_on) return dayStart(vial.mixed_on);
  const c = Date.parse(vial.created_at);
  if (!Number.isFinite(c)) return NaN;
  const d = new Date(c); d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// What one answer writes, and the summary shown before Salvar (UP-14: the same function).
//   choice: 'all' | 'none' | 'pick' (picked: Set of slotMs taken) | 'unknown'.
//   vial: the protocol's ACTIVE vial (or null). capacityOf(vial, protocol): lib/supplyLow vialCapacity.
// → { inserts, updates, removes, vialUpdate, vialFinished, unknownNext, unknownRange, summary }.
function planUnrecordedAnswer({ protocol: p, entries, choice, picked = null, vial = null, nowMs = Date.now(), capacityOf = null }) {
  const list = (entries || []).slice().sort((a, b) => a.slotMs - b.slotMs);
  const taken = choice === 'all' ? list : choice === 'pick' ? list.filter((e) => picked && picked.has(e.slotMs)) : [];
  const takenSet = new Set(taken.map((e) => e.slotMs));
  const skipped = choice === 'none' ? list : choice === 'pick' ? list.filter((e) => !takenSet.has(e.slotMs)) : [];
  const inserts = [];
  const updates = [];
  const write = (e, outcome) => {
    const at = new Date(e.slotMs).toISOString();
    if (e.row && e.row.id != null) updates.push({ id: e.row.id, outcome, outcome_by_person: 1 });
    else inserts.push({ user_id: p.user_id, protocol_id: p.id, protocol_remote_id: p.remote_id || null, outcome, logged_at: at, slot_at: at, outcome_by_person: 1 });
  };
  for (const e of list) {
    if (takenSet.has(e.slotMs)) write(e, 'Taken');
    else if (skipped.includes(e)) write(e, 'Skipped');
  }
  const removes = choice === 'unknown' ? list.filter((e) => e.row && e.row.id != null).map((e) => e.row.id) : [];
  const unknownRange = choice === 'unknown' && list.length ? { fromMs: list[0].slotMs, toMs: list[list.length - 1].slotMs, atMs: nowMs } : null;
  const unknownNext = unknownRange ? addUnknownRange(p.unrecorded_unknown || null, unknownRange) : null;

  // UP-15: only Taken doses on or after the vial's day, never more than it holds; UP-16: never a bottle.
  let vialUpdate = null;
  let vialFinished = false;
  let vialSum = null;
  if (vial && taken.length && p.type !== 'oral') {
    const start = vialStartMs(vial);
    const since = Number.isFinite(start) ? taken.filter((e) => e.slotMs >= start).length : 0;
    const before = vial.doses_taken || 0;
    const cap = capacityOf ? capacityOf(vial, p) : (Number(vial.total_doses) > 0 ? Number(vial.total_doses) : null);
    const used = cap ? Math.max(0, Math.min(since, cap - before)) : since;
    if (used > 0) {
      const after = before + used;
      vialFinished = !!(cap && after >= cap);
      vialUpdate = vialFinished ? { id: vial.id, doses_taken: after, active: 0 } : { id: vial.id, doses_taken: after };
    }
    vialSum = { startMs: start, used, others: taken.length - used, finished: vialFinished, left: cap ? Math.max(0, cap - before - used) : null, prev: before };
  }
  const summary = {
    choice, n: list.length, taken: taken.length, skipped: skipped.length,
    fromMs: list.length ? list[0].slotMs : null, toMs: list.length ? list[list.length - 1].slotMs : null,
    takenMs: taken.map((e) => e.slotMs), skippedMs: skipped.map((e) => e.slotMs), allMs: list.map((e) => e.slotMs),
    vial: vialSum, bottle: p.type === 'oral',
    appWritten: list.filter((e) => e.row).map((e) => e.slotMs),
  };
  return { inserts, updates, removes, vialUpdate, vialFinished, unknownNext, unknownRange, summary };
}

// "Escolher quais" (UP-13): a daily (or several-a-day) protocol is grouped by week, Monday to Sunday.
function groupsByWeek(p) {
  return !!p && (Number(p.interval_days) || 1) === 1;
}
function mondayOf(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
}
// → [{ startMs (Monday 00:00), endMs (next Monday 00:00), slots: entries newest first }] newest week first.
function weekGroups(entries) {
  const by = new Map();
  for (const e of entries || []) {
    const k = mondayOf(e.slotMs);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([startMs, slots]) => {
    const end = new Date(startMs); end.setDate(end.getDate() + 7);
    return { startMs, endMs: end.getTime(), slots: slots.slice().sort((a, b) => b.slotMs - a.slotMs) };
  });
}

// The Dose log card (UP-24): the same slots as the question. → null or { n, k, fromMs, toMs, beforeMs }.
function cardSummary(asks, nowMs, zoneHistory) {
  const list = (asks || []).filter((a) => a && a.entries && a.entries.length);
  if (!list.length) return null;
  const all = list.flatMap((a) => a.entries.map((e) => e.slotMs));
  return { n: all.length, k: list.length, fromMs: Math.min(...all), toMs: Math.max(...all), beforeMs: scanWindowStartMs(nowMs, zoneHistory) };
}

// The lab subset (UP-22): the days before the exam that still count in the level on that day.
function labWindow(examDayKey, historyDays) {
  const beforeMs = dayStart(examDayKey);
  return { beforeMs, fromMs: beforeMs - Math.max(1, historyDays || 0) * DAY };
}

// The lab line (UP-34): Missed rows with their slot in the 14 days before the exam day (exam − 14 d ≤ slot <
// exam), any protocol; app-written ones older than today's 14-day window are in the question instead.
function labMissedCount(logs, examDayKey, { nowMs = Date.now(), zoneHistory = null } = {}) {
  const exam = dayStart(examDayKey);
  if (!Number.isFinite(exam)) return 0;
  const from = new Date(exam); from.setDate(from.getDate() - SCAN_DAYS);
  const windowStart = scanWindowStartMs(nowMs, zoneHistory);
  let n = 0;
  for (const l of logs || []) {
    if (!l || l.outcome !== 'Missed' || l.sync_status === 'deleted') continue;
    const t = coverMsOf(l);
    if (!(t >= from.getTime() && t < exam)) continue;
    if (!isPersonMarked(l) && t < windowStart) continue;
    n++;
  }
  return n;
}

// Today's trigger (UP-20 / UP-21), a per-phone convenience: { day, later, newestMs } or null.
function todayMayAsk(st, { dayKey, newestMs }) {
  if (!st) return true;
  const newer = Number.isFinite(newestMs) && newestMs > (Number.isFinite(st.newestMs) ? st.newestMs : -Infinity);
  if (st.day === dayKey && !newer) return false;
  if ((st.later || 0) >= 3 && !newer) return false;
  return st.day !== dayKey || newer;
}
function afterShown(st, { dayKey, newestMs }) {
  const prev = st || { later: 0, newestMs: null };
  const newer = Number.isFinite(newestMs) && newestMs > (Number.isFinite(prev.newestMs) ? prev.newestMs : -Infinity);
  return { day: dayKey, later: newer && prev.newestMs != null ? 0 : (prev.later || 0), newestMs: newer ? newestMs : prev.newestMs };
}
function afterLater(st) { return { ...(st || {}), later: ((st && st.later) || 0) + 1 }; }
function afterAnswered(st) { return { ...(st || {}), later: 0 }; }

module.exports = {
  SCAN_DAYS, LOOKBACK_DAYS, isPersonMarked, scanWindowStartMs, periodFloorMs, unknownRanges, addUnknownRange,
  removeUnknownRange, buildSlots, gapEntries, unrecordedAsks, vialStartMs, planUnrecordedAnswer, groupsByWeek, weekGroups,
  cardSummary, labWindow, labMissedCount, todayMayAsk, afterShown, afterLater, afterAnswered,
};
