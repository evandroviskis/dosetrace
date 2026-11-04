import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProtocolById, getActiveVials, getVialById, unrecordedDataKey, insertDoseLog, updateDoseLog, deleteDoseLog, updateVial, updateProtocol, getActiveProtocols, getEndedProtocols, getLogsSince, doseLogBySourceKey, withImmediateTransaction, recordDoseTapKey } from './database';
import { getCachedUser } from './supabase';
import { LATE_MS, computeMissedDoses, coveredMissedRows, duplicateMissedRows, falseMissedRows, notYetDueMissedRows, serverConfirmedNow, missedScanWatermark, noteSchedules } from './missedDoses';
import { firstSyncGate } from './firstSyncGate';
import { readDoseLogsPull } from './pullStamp';
import { heldMissedSlots, unsyncedNotice, gapsWithMisses } from './unsyncedDoses';
import { planMarkTaken, markTakenDay, planSkipPending, planSkipToday } from './markTaken';
import { questionAnswered } from './siteQuestion';
import H from './zoneHistory';
import Z from './zoneTime';
import { unrecordedAsks, cardSummary, labWindow, planUnrecordedAnswer, removeUnknownRange, stillOpen, LOOKBACK_DAYS as UNRECORDED_LOOKBACK_DAYS } from './unrecordedPeriod';
import { vialCapacity } from './supplyLow';
import { splitCurveProtocols, curveHistoryDays, matchName } from './serumModel';
import { getHalfLifeEntry } from './halfLives';

// A-40 (S-17): "ignore yesterday's" for a Pending-from-yesterday slot — one Skipped
// row at that slot's time (lib/markTaken.js planSkipPending), never the tap time.
// Returns { logId } or null when nothing was written (already has a row / invalid).
export function recordSkipPending(protocolId, { dayKey, slotMs }) {
  const protocol = getProtocolById(protocolId);
  if (!protocol || protocol.active === 0 || protocol.deleted_at || protocol.sync_status === 'deleted') return null;
  const nowMs = Date.now();
  const day = markTakenDay({ dayKey, nowMs });
  const dayLogs = (getLogsSince(protocol.user_id, new Date(day.dayStart).toISOString()) || [])
    .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at).getTime() < day.dayEnd);
  const plan = planSkipPending({ protocol, todayLogs: dayLogs, dayKey: day.dayKey, slotMs, nowMs });
  if (!plan.insert) return null;
  return { logId: insertDoseLog(plan.insert), protocol, dayKey: plan.dayKey };
}

// A-78: Skip on a Today card — one Skipped row stamped at the slot it skips (the card's
// earliest open slot; lib/markTaken.js planSkipToday), never the tap time, so a later Mark
// taken can name that slot. Returns { logId, protocol } or null when nothing was written.
export function recordSkipToday(protocolId, { slotMs = null } = {}) {
  const protocol = getProtocolById(protocolId);
  if (!protocol || protocol.active === 0 || protocol.deleted_at || protocol.sync_status === 'deleted') return null;
  const nowMs = Date.now();
  const day = markTakenDay({ nowMs });
  const dayLogs = (getLogsSince(protocol.user_id, new Date(day.dayStart).toISOString()) || [])
    .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at).getTime() < day.dayEnd);
  const plan = planSkipToday({ protocol, todayLogs: dayLogs, slotMs, nowMs });
  if (!plan.insert) return null;
  return { logId: insertDoseLog(plan.insert), protocol };
}

// Log a dose as "Taken" — the ONE mark-taken path (S-02, FX-2/FX-7): Today's
// button and the notification "Mark as taken" action both call this, and it
// applies lib/markTaken.js planMarkTaken (never a second row for a logged dose;
// an auto-Missed row is flipped, not duplicated; vial and oral counts move once).
// No UI coupling, so it can run outside React, possibly in the background.
//
// opts.dayKey ("YYYY-MM-DD", local): the day the reminder was FOR. A banner left
// from yesterday and tapped today logs yesterday's dose (at its scheduled time),
// never today's. opts.slotMs: that slot's scheduled time. opts.atNow: log now,
// today (a snoozed copy tapped late).
//
// Returns { logId, protocol, dayKey, flipped, vialId, prevVialDosesTaken,
// vialFinished, oralPrevUnitsTaken, takenAfter } / { alreadyLogged } or null when the
// protocol no longer exists or was deleted/paused (never log against those).
export function recordDoseTaken(protocolId, opts = {}) {
  const protocol = getProtocolById(protocolId);
  if (!protocol || protocol.deleted_at || protocol.sync_status === 'deleted') return null;
  // DV-204 (DL-76): an ENDED protocol (stopped, not deleted — lib/protocolEnd isEnded) takes a past-day
  // complete from the Dose log only, named by opts.pastEnded: the same row, cap and bottle change as any
  // other take. Everything else still refuses an inactive protocol.
  if (protocol.active === 0 && !opts.pastEnded) return null;

  // S-25: the dose's time is the TAP of Mark taken (the answer to the site question
  // may come later, even after midnight); without a tap time, now.
  const nowMs = Number.isFinite(opts.tapMs) ? opts.tapMs : Date.now();
  // DV-184 re-verification C: opts.sourceKey (a notification tap) — a row already written by this
  // very tap (also one deleted by an Undo) means nothing to log; otherwise the key goes into the same
  // INSERT / flip UPDATE. Read and write inside BEGIN IMMEDIATE.
  const sourceKey = opts.sourceKey || null;
  const writeDose = () => {
    if (sourceKey && doseLogBySourceKey(sourceKey)) return { same: true };
    const day = markTakenDay({ dayKey: opts.dayKey, atNow: opts.atNow, nowMs });
    const dayLogs = (getLogsSince(protocol.user_id, new Date(day.dayStart).toISOString()) || [])
      .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at).getTime() < day.dayEnd);
    let vial = null;
    try { vial = (getActiveVials(protocol.user_id) || []).find((v) => v.protocol_id === protocol.id) || null; } catch { /* no vial */ }

    // opts.flipRowId (A-78): the Skipped row this tap logs (a skipped slot's line / dose page).
    const plan = planMarkTaken({ protocol, vial, todayLogs: dayLogs, dayKey: day.dayKey, slotMs: opts.slotMs, atNow: opts.atNow, nowMs, injectionSite: opts.injectionSite || null, flipRowId: opts.flipRowId != null ? opts.flipRowId : null });
    if (plan.alreadyTaken) return { plan };
    let logId;
    if (plan.update) {
      const { id: flipId, ...flipFields } = plan.update;
      updateDoseLog(flipId, sourceKey ? { ...flipFields, source_key: sourceKey } : flipFields);
      logId = plan.update.id;
    } else {
      logId = insertDoseLog(sourceKey ? { ...plan.insert, source_key: sourceKey } : plan.insert);
    }
    // The tap ledger, same transaction: still found after an Undo pushed removes this row.
    if (sourceKey) recordDoseTapKey(sourceKey);
    // DV-039: the vial / bottle count goes in the SAME transaction as the dose — an app kill between
    // the two can no longer leave a logged dose without its supply change. A failing supply write is
    // still best-effort (the dose is kept).
    let vialId = null;
    try {
      if (plan.vialUpdate) {
        const { id, ...fields } = plan.vialUpdate;
        updateVial(id, fields);
        vialId = id;
      }
    } catch { /* vial update is best-effort */ }
    let oralPrevUnitsTaken = null;
    let oralUnitsAdded = null; // what this dose used, so an undo can give back exactly that
    try {
      if (plan.oralUpdate) {
        updateProtocol(protocol.id, plan.oralUpdate);
        oralPrevUnitsTaken = plan.prevUnitsTaken;
        oralUnitsAdded = plan.oralUpdate.units_taken - plan.prevUnitsTaken;
      }
    } catch { /* supply update is best-effort */ }
    return { plan, logId, vialId, oralPrevUnitsTaken, oralUnitsAdded };
  };
  const written = withImmediateTransaction(writeDose);
  if (written.same) return { logId: null, protocol, alreadyLogged: true, sameTap: true };
  const { plan, logId, vialId, oralPrevUnitsTaken, oralUnitsAdded } = written;
  if (plan.alreadyTaken) return { logId: null, protocol, alreadyLogged: true, dayKey: plan.dayKey };

  return {
    logId, protocol, dayKey: plan.dayKey, flipped: plan.flipped, flippedFrom: plan.flippedFrom,
    prevLoggedAt: plan.prevLoggedAt, prevInjectionSite: plan.prevInjectionSite, // A-78: Undo restores them
    prevOutcomeByPerson: plan.prevOutcomeByPerson, // UP-36: and who had written the flipped row
    vialId, prevVialDosesTaken: vialId ? plan.prevVialDosesTaken : null,
    vialFinished: !!(vialId && plan.vialFinished), oralPrevUnitsTaken, oralUnitsAdded, takenAfter: plan.takenAfter,
  };
}

// S-25: before asking where a dose was injected — is that dose already logged (another
// device, a banner), or the protocol paused / deleted? Then there is nothing to ask.
// Same reads and plan as recordDoseTaken, no write. opts: as recordDoseTaken.
export function isDoseAlreadyLogged(protocolId, opts = {}) {
  const protocol = getProtocolById(protocolId);
  if (!protocol || protocol.active === 0 || protocol.deleted_at || protocol.sync_status === 'deleted') return true;
  const nowMs = Number.isFinite(opts.tapMs) ? opts.tapMs : Date.now();
  const day = markTakenDay({ dayKey: opts.dayKey, atNow: opts.atNow, nowMs });
  const dayLogs = (getLogsSince(protocol.user_id, new Date(day.dayStart).toISOString()) || [])
    .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at).getTime() < day.dayEnd);
  // This very question answered already (its row at the tap time or the slot): never twice.
  if (Number.isFinite(opts.tapMs) && questionAnswered(dayLogs, { protocolId: protocol.id, tapMs: opts.tapMs, slotMs: opts.slotMs })) return true;
  return !!planMarkTaken({ protocol, todayLogs: dayLogs, dayKey: day.dayKey, slotMs: opts.slotMs, atNow: opts.atNow, nowMs, flipRowId: opts.flipRowId != null ? opts.flipRowId : null }).alreadyTaken;
}


const MISSED_SINCE_KEY = 'dosetrace_missed_since';
const MISSED_LOOKBACK_DAYS = 14;
// A-177: how far back the zone-free cleanup of false Missed rows looks (lib/missedDoses falseMissedRows).
const FALSE_MISSED_LOOKBACK_DAYS = 60;
// A-49 guard (S-19): the last zone name seen on this device and when it changed.
const MISSED_TZ_KEY = 'dosetrace_missed_tz';
const MISSED_TZ_SINCE_KEY = 'dosetrace_missed_tz_since';
// A-51: the zones this device was in ({ tz, sinceMs }[], lib/zoneHistory) — device-only on purpose.
const ZONE_HISTORY_KEY = 'dosetrace_zone_history';

function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

// The Missed scan's starting point, through the time-zone guard
// (lib/missedDoses.js missedScanWatermark). Remembers the zone, and when it changes
// moves the start to now. Also used by Today's Pending-from-yesterday block
// (tzSinceMs). First run ever: the scan starts from now (old history untouched).
export async function getMissedWatermark(nowMs = Date.now()) {
  const [[, since], [, tz], [, tzSince], [, hist]] = await AsyncStorage.multiGet([MISSED_SINCE_KEY, MISSED_TZ_KEY, MISSED_TZ_SINCE_KEY, ZONE_HISTORY_KEY]);
  const num = (v) => (v != null && v !== '' ? parseInt(v, 10) : NaN);
  // Fresh start from the server (reinstall, sign-in, takeover, new phone): no start on this phone — the
  // scan covers its whole window, as if the phone had never left (founder 2026-11-03).
  const storedSinceMs = Number.isFinite(num(since)) ? num(since) : nowMs - (MISSED_LOOKBACK_DAYS + 1) * 86400000;
  const fresh = !Number.isFinite(num(since));
  const currentTz = deviceTimeZone();
  const w = missedScanWatermark({ storedSinceMs, storedTz: tz || null, storedTzSinceMs: num(tzSince), currentTz, nowMs });
  // A-51: past slots are rebuilt in the zone of their own day (lib/zoneHistory), so a zone
  // change no longer has to move the scan's start (S-19 kept as the fallback without a zone name).
  const stored = H.parse(hist);
  const history = H.seedHistory({ stored, storedTz: tz || null, storedTzSinceMs: num(tzSince), storedSinceMs, currentTz, nowMs, fromMs: fresh ? storedSinceMs : null });
  // Used only when this engine really converts named zones (lib/zoneTime zonesWork).
  const usable = !!(currentTz && history.length && Z.zonesWork());
  w.zoneHistory = usable ? history : null;
  w.sinceMs = H.scanStart({ baseMs: Number.isFinite(storedSinceMs) ? storedSinceMs : nowMs, history, guardSinceMs: w.sinceMs, currentTz: usable ? currentTz : null });
  const writes = [];
  if (fresh) writes.push([MISSED_SINCE_KEY, String(storedSinceMs)]);
  if (w.tz && w.tz !== tz) writes.push([MISSED_TZ_KEY, w.tz]);
  if (w.tzChanged) writes.push([MISSED_TZ_SINCE_KEY, String(w.tzSinceMs)]);
  if (history.length && JSON.stringify(history) !== JSON.stringify(stored)) writes.push([ZONE_HISTORY_KEY, JSON.stringify(history)]);
  if (writes.length) await AsyncStorage.multiSet(writes).catch(() => {});
  return w;
}

// A-123 (c): the schedule ledger — for each protocol the schedule this phone saw at each scan and
// since when it has stayed the same (lib/missedDoses noteSchedules). Device-only on purpose (what THIS
// phone saw); lost with the app's storage it starts again from now (the cleanup only waits longer).
const SCHEDULE_SEEN_KEY = 'dosetrace_missed_schedule_seen';
// → { [protocol id]: ms since the schedule is known unchanged }. Never throws.
export async function observeSchedules(userId, protocols, nowMs) {
  let stored = null;
  try { stored = JSON.parse((await AsyncStorage.getItem(SCHEDULE_SEEN_KEY)) || 'null'); } catch { stored = null; }
  const { next, sinceById } = noteSchedules(stored, protocols, { userId, nowMs });
  try { if (JSON.stringify(next) !== JSON.stringify(stored)) await AsyncStorage.setItem(SCHEDULE_SEEN_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
  return sinceById;
}

// DV-246: the scan's schedule ledger for this user, over the same protocols the scan notes (active and
// ended — the ledger keeps only the protocols it is given), for "Did you take yesterday's dose?".
// null when it cannot be read (the question is then asked as before).
export async function scheduleSinceNow(userId, nowMs = Date.now()) {
  try {
    return await observeSchedules(userId, [...(getActiveProtocols(userId) || []), ...(getEndedProtocols(userId) || [])], nowMs);
  } catch { return null; }
}

// A-181 (founder 2026-10-26, option B): what the Dose log and the report say while this phone has not
// synced — the slots the A-177 rule holds back, as the last scan computed them from its own cleaned rows
// (scanMissedDoses → _lastHeld; code review 2026-10-26: one definition, never a second copy of its
// inputs). Read after the scan. A pull since then lets some through: they are dropped here; a protocol
// no longer active drops its slots. → { pulledMs, held, notice } (notice null: nothing to say). Never throws.
let _lastHeld = null; // { userId, held }
export async function unsyncedState() {
  try {
    const user = await getCachedUser();
    if (!user) return { pulledMs: null, held: [], notice: null };
    const nowMs = Date.now();
    const pulledMs = await readDoseLogsPull(AsyncStorage, user.id, nowMs);
    const pulled = Number.isFinite(pulledMs) ? pulledMs : -Infinity;
    const active = new Set((getActiveProtocols(user.id) || []).map((p) => p.id));
    const held = (_lastHeld && _lastHeld.userId === user.id ? _lastHeld.held : [])
      .filter((h) => active.has(h.protocol_id) && h.scheduledAtMs + LATE_MS > pulled);
    return { pulledMs, held, notice: unsyncedNotice({ pulledMs, nowMs, held }) };
  } catch {
    return { pulledMs: null, held: [], notice: null };
  }
}

// A-181 code review #3: the stored gaps (lib/pullStamp) in which the scan would have written at least one
// miss — the scan's own watermark, zone history, schedule ledger and active protocols. → [{ fromMs, toMs, count }].
export async function unrecordedGapsWithMisses(gaps) {
  try {
    if (!gaps || !gaps.length) return [];
    const user = await getCachedUser();
    if (!user) return [];
    const nowMs = Date.now();
    const { sinceMs, zoneHistory } = await getMissedWatermark(nowMs);
    const protocols = getActiveProtocols(user.id) || [];
    if (!protocols.length) return [];
    // The ledger keeps only the protocols it is given: the same list as the scan (ended ones too).
    const scheduleSince = await observeSchedules(user.id, [...protocols, ...(getEndedProtocols(user.id) || [])], nowMs);
    const fromMs = Math.min(...gaps.map((g) => g.fromMs));
    const logs = getLogsSince(user.id, new Date(fromMs - 2 * 86400000).toISOString()) || [];
    return gapsWithMisses(gaps, protocols, logs, nowMs, sinceMs, { zoneHistory, scheduleSince });
  } catch {
    return [];
  }
}

// Guard against overlapping scans (Today + Log can gain focus back-to-back).
// The idempotency check reads logs then inserts across an `await`, so two
// concurrent runs could both read the pre-insert state and double-create.
let _missedScanInFlight = false;

// Record any dose slot that went 12h+ past its scheduled time without being
// logged, as an editable 'Missed' entry. Idempotent (already-written Missed rows
// count toward a day's logs, so the same slot is never double-created — see
// computeMissedDoses). On the very first run it stamps a "first seen" watermark
// so the feature never retroactively rewrites pre-existing history as Missed.
// Only prior-day slots are considered (today's doses stay live on the Today
// screen). Returns the number of Missed rows created or removed. Best-effort; never throws.
// A-123: it runs only after the session's first sync result or when known offline
// (lib/firstSyncGate, the gate "Still going?" uses), so a dose logged on the other phone has
// arrived; opts.maxWaitMs caps that wait (the Settings report): past it, no scan. An app Missed row
// that a Taken / Skipped of the same day now certainly duplicates is removed (lib/missedDoses
// coveredMissedRows: same day, nearest slot, schedule known unchanged since; active AND ended
// protocols). The removal is pushed to the cloud; another phone that still has the row keeps it
// until it re-derives the same removal (tombstones everywhere: OPEN-16 b / A-119).
// A-177: the gate also opens on sync_error, offline or a cap, so a new Missed row is written only for
// a slot that a successful dose_logs pull finished at least 12 h after (lib/pullStamp; none → no new
// row, a later scan after a good pull writes it). And over 60 days an app Missed row of a 1-dose/day
// protocol next to a Taken / Skipped within 3 h is removed (lib/missedDoses falseMissedRows).
export async function scanMissedDoses({ maxWaitMs } = {}) {
  try {
    if (Number.isFinite(maxWaitMs)) { if (!(await firstSyncGate.whenOpenWithin(maxWaitMs))) return 0; }
    else await firstSyncGate.whenOpen();
  } catch { return 0; }
  if (_missedScanInFlight) return 0;
  _missedScanInFlight = true;
  try {
    const user = await getCachedUser();
    if (!user) return 0;
    const nowMs = Date.now();

    // First run: from now on (old history untouched). After a time-zone change:
    // from the change (A-49 guard).
    const { sinceMs, zoneHistory } = await getMissedWatermark(nowMs);

    const protocols = getActiveProtocols(user.id) || [];
    // F6: the cleanup also runs over ended protocols, up to their end (no new Missed rows for them).
    const ended = getEndedProtocols(user.id) || [];
    if (!protocols.length) _lastHeld = { userId: user.id, held: [] };
    if (!protocols.length && !ended.length) return 0;
    const scheduleSince = await observeSchedules(user.id, [...protocols, ...ended], nowMs);

    const sinceDate = new Date(nowMs - (MISSED_LOOKBACK_DAYS + 1) * 86400000).toISOString();
    const all = getLogsSince(user.id, sinceDate) || [];
    // A-149: first the Missed rows a clock that was ahead left on slots not yet due.
    // A clock put back never makes real rows look ahead: now is at least the newest cloud stamp.
    // A row never pushed carries the phone's own stamp: it goes only where the scan can write it
    // again (an active protocol), so a clock put back never drops an ended protocol's real miss.
    const activeIds = new Set(protocols.map((p) => p.id));
    const early = notYetDueMissedRows(all, serverConfirmedNow(all, nowMs))
      .filter((r) => r.sync_status === 'synced' || activeIds.has(r.protocol_id));
    for (const row of early) deleteDoseLog(row.id);
    const notYet = new Set(early.map((r) => r.id));
    const logs = early.length ? all.filter((l) => !notYet.has(l.id)) : all;
    // A-176: then the identical copies of one Missed slot (an out-of-order zone history wrote two).
    const dups = duplicateMissedRows(logs, [...protocols, ...ended]);
    for (const row of dups) deleteDoseLog(row.id);
    const dupIds = new Set(dups.map((r) => r.id));
    const deduped = dups.length ? logs.filter((l) => !dupIds.has(l.id)) : logs;
    // A-177: then the app Missed rows next to a Taken / Skipped within 3 h (1-dose/day protocols), over
    // 60 days — its own read (the rows deleted above are gone from it).
    const wide = getLogsSince(user.id, new Date(nowMs - (FALSE_MISSED_LOOKBACK_DAYS + 1) * 86400000).toISOString()) || [];
    const falses = falseMissedRows([...protocols, ...ended], wide, nowMs, { lookbackDays: FALSE_MISSED_LOOKBACK_DAYS });
    for (const row of falses) deleteDoseLog(row.id);
    const falseIds = new Set(falses.map((r) => r.id));
    const unique = falses.length ? deduped.filter((l) => !falseIds.has(l.id)) : deduped;
    // A-123: then the app Missed rows a Taken / Skipped of the same day certainly duplicates.
    const covered = coveredMissedRows([...protocols, ...ended], unique, nowMs, { lookbackDays: MISSED_LOOKBACK_DAYS, zoneHistory, scheduleSince });
    for (const row of covered) deleteDoseLog(row.id);
    const gone = new Set(covered.map((r) => r.id));
    const kept = covered.length ? unique.filter((l) => !gone.has(l.id)) : unique;
    const removed = early.length + dups.length + falses.length + covered.length;
    // A-177: always passed (null when no successful pull is known → no new Missed row).
    const pulledThroughMs = await readDoseLogsPull(AsyncStorage, user.id, nowMs);
    // DV-244: never a Missed before the current schedule is known to be in force (the ledger above).
    // DV-031 / DL-05: ended protocols too, up to their end (they keep their history, A-83; the rings
    // already count them) — computeMissedDoses never owes a slot after ended_at.
    const scanned = [...protocols, ...ended];
    const missed = computeMissedDoses(scanned, kept, nowMs, sinceMs, { lookbackDays: MISSED_LOOKBACK_DAYS, zoneHistory, pulledThroughMs, scheduleSince });
    // A-181: the slots this same pass holds back for want of a good pull (never one it writes above).
    _lastHeld = { userId: user.id, held: protocols.length ? heldMissedSlots(protocols, kept, nowMs, sinceMs, { pulledMs: pulledThroughMs, zoneHistory, scheduleSince }) : [] };
    if (!missed.length) return removed;

    const byId = {};
    for (const p of scanned) byId[p.id] = p;
    for (const m of missed) {
      const p = byId[m.protocol_id];
      insertDoseLog({
        user_id: m.user_id,
        protocol_id: m.protocol_id,
        protocol_remote_id: p ? (p.remote_id || null) : null,
        outcome: 'Missed',
        logged_at: new Date(m.scheduledAtMs).toISOString(),
        outcome_by_person: false, // UP-36: written by the app, not the person
      });
    }
    return missed.length + removed;
  } catch {
    return 0;
  } finally {
    _missedScanInFlight = false;
  }
}

// ── Unrecorded period beyond 14 days, option B (founder 2026-11-03 "B"; answers 2026-11-04; UP-1 … UP-36) ──
// The pure rules are lib/unrecordedPeriod.js; these read the phone's rows and write one answer at a time.

// UP-22: the days of history the curve uses for a protocol (its compound's window, lib/serumModel
// curveHistoryDays; a blend: its longest component), or null when the curve does not draw it (oral, IU,
// no data, no dose).
export function unrecordedChartDays(p) {
  try {
    const { active } = splitCurveProtocols([p]);
    if (!active || !active.length) return null;
    const days = active.map((x) => curveHistoryDays(getHalfLifeEntry(matchName(x)))).filter((d) => Number.isFinite(d) && d > 0);
    return days.length ? Math.max(...days) : null;
  } catch { return null; }
}

// The questions (active AND ended protocols, the scan's zone history and pull stamp): → { asks, card }.
// opts.examDay ('YYYY-MM-DD', UP-22): only the protocols the curve draws, only the slots before that day
// that still count in its level. Never throws (nothing to ask on any error).
export async function unrecordedQueue({ examDay = null } = {}) {
  try {
    const user = await getCachedUser();
    if (!user) return { asks: [], card: null };
    const nowMs = Date.now();
    const { zoneHistory } = await getMissedWatermark(nowMs);
    const pulledThroughMs = await readDoseLogsPull(AsyncStorage, user.id, nowMs);
    // Review #2: nothing changed (rows, protocols, pull, day) → the last answer, no 365-day recompute.
    let key = null;
    if (!examDay) {
      try { key = `${user.id}|${unrecordedDataKey(user.id)}|${pulledThroughMs}|${new Date(nowMs).toDateString()}|${zoneHistory ? zoneHistory.length : 0}`; } catch { key = null; }
      if (key && _unrecCache && _unrecCache.key === key) return _unrecCache.result;
    }
    let protocols = [...(getActiveProtocols(user.id) || []), ...(getEndedProtocols(user.id) || [])];
    if (!protocols.length) { const none = { asks: [], card: null }; if (key) _unrecCache = { key, result: none }; return none; }
    const logs = getLogsSince(user.id, new Date(nowMs - (UNRECORDED_LOOKBACK_DAYS + 2) * 86400000).toISOString()) || [];
    let windowFor = null;
    if (examDay) {
      const days = new Map(protocols.map((p) => [p.id, unrecordedChartDays(p)]));
      protocols = protocols.filter((p) => days.get(p.id));
      windowFor = (p) => labWindow(examDay, days.get(p.id));
    }
    const asks = unrecordedAsks(protocols, logs, { nowMs, zoneHistory, pulledThroughMs, windowFor });
    const result = { asks, card: examDay ? null : cardSummary(asks, nowMs, zoneHistory) };
    if (key) _unrecCache = { key, result };
    return result;
  } catch {
    return { asks: [], card: null };
  }
}
let _unrecCache = null; // review #2: { key, result } of the last full read

// UP-17: one answer = one transaction (rows, the vial and the "Não lembro" range together or nothing).
// A slot that already has a row of this protocol at its exact time (a double tap, a row written meanwhile)
// gets no second row. → { plan, undo } or null (the protocol is gone, or nothing is left to answer).
export function saveUnrecordedAnswer({ protocolId, entries, choice, picked = null }) {
  const p = getProtocolById(protocolId);
  if (!p || p.deleted_at || p.purged_at || p.sync_status === 'deleted') return null;
  const nowMs = Date.now();
  return withImmediateTransaction(() => {
    const list = (entries || []).slice().sort((a, b) => a.slotMs - b.slotMs);
    if (!list.length) return null;
    const near = (getLogsSince(p.user_id, new Date(list[0].slotMs - 2 * 86400000).toISOString()) || [])
      .filter((l) => l.protocol_id === p.id);
    // Review #1: re-checked now with the scan's own matching — a dose marked meanwhile is never doubled.
    const fresh = stillOpen(p, list, near, { nowMs });
    if (!fresh.length) return null;
    let vial = null;
    try { vial = (getActiveVials(p.user_id) || []).find((v) => v.protocol_id === p.id) || null; } catch { vial = null; }
    const plan = planUnrecordedAnswer({ protocol: p, entries: fresh, choice, picked, vial, nowMs, capacityOf: vialCapacity });
    const insertedIds = plan.inserts.map((r) => insertDoseLog(r));
    const restore = [];
    for (const u of plan.updates) {
      const e = fresh.find((x) => x.row && x.row.id === u.id);
      updateDoseLog(u.id, { outcome: u.outcome, outcome_by_person: 1 });
      const was = e && e.row.outcome_by_person != null ? (e.row.outcome_by_person ? 1 : 0) : null;
      restore.push({ id: u.id, outcome: e ? e.row.outcome : 'Missed', outcome_by_person: was });
    }
    const removed = [];
    for (const id of plan.removes) {
      const e = fresh.find((x) => x.row && x.row.id === id);
      deleteDoseLog(id);
      if (e) removed.push({ user_id: p.user_id, protocol_id: p.id, protocol_remote_id: p.remote_id || null, outcome: 'Missed', logged_at: e.row.logged_at, outcome_by_person: false });
    }
    let vialRestore = null;
    if (plan.vialUpdate && vial) {
      const { id, ...fields } = plan.vialUpdate;
      updateVial(id, fields);
      // Review #4a: Undo gives back THIS answer's doses (a delta), never an old absolute count.
      vialRestore = { id, used: (fields.doses_taken || 0) - (vial.doses_taken || 0), finished: fields.active === 0 };
    }
    if (plan.unknownNext) updateProtocol(p.id, { unrecorded_unknown: plan.unknownNext });
    return { plan, undo: { protocolId: p.id, insertedIds, restore, removed, vialRestore, unknownRange: plan.unknownRange } };
  });
}

// UP-17: "Desfazer" undoes the whole answer — the new rows go, the app's rows get back their outcome and
// marker, removed rows come back (as new rows: the removal may already be in the cloud), the vial count and
// the "Não lembro" range go back. One transaction.
export function undoUnrecordedAnswer(undo) {
  if (!undo) return false;
  return withImmediateTransaction(() => {
    for (const id of undo.insertedIds || []) deleteDoseLog(id);
    for (const r of undo.restore || []) updateDoseLog(r.id, { outcome: r.outcome, outcome_by_person: r.outcome_by_person });
    for (const r of undo.removed || []) insertDoseLog(r);
    // Review #4a: the answer's doses come off the vial as it is NOW (a dose marked inside the Undo window
    // stays); a vial the answer finished reopens only when no other vial of the protocol is active.
    const r = undo.vialRestore;
    const now = r ? getVialById(r.id) : null;
    if (r && now) {
      const fields = { doses_taken: Math.max(0, (now.doses_taken || 0) - r.used) };
      if (r.finished && now.active === 0 && !(getActiveVials(now.user_id) || []).some((v) => v.protocol_id === now.protocol_id && v.id !== now.id)) fields.active = 1;
      updateVial(r.id, fields);
    }
    if (undo.unknownRange) {
      const p = getProtocolById(undo.protocolId);
      if (p) updateProtocol(p.id, { unrecorded_unknown: removeUnknownRange(p.unrecorded_unknown || null, undo.unknownRange) });
    }
    return true;
  });
}
