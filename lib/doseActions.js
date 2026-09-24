import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProtocolById, getActiveVials, insertDoseLog, updateDoseLog, updateVial, updateProtocol, getActiveProtocols, getLogsSince } from './database';
import { getCachedUser } from './supabase';
import { dosesPerVial } from './doseMath';
import { computeServings } from './oralMath';
import { computeMissedDoses } from './missedDoses';
import { elapsedDoseSlots } from './schedule';

// Log a dose as "Taken" and update the active vial — with NO UI coupling, so it
// can run from the notification "Mark as taken" action (which fires outside React,
// possibly in the background). TodayScreen has its own richer flow (undo toast,
// body-map prompt, continuation-vial prompt); this is the minimal data path.
//
// opts.dayKey ("YYYY-MM-DD", local): the day the reminder was FOR. A banner left
// from yesterday and tapped today logs yesterday's dose (at its scheduled time),
// never today's. opts.slotMs: that slot's scheduled time.
//
// Returns { logId, protocol, dayKey } / { alreadyLogged } or null when the
// protocol no longer exists or was deleted/paused (never log against those).
export function recordDoseTaken(protocolId, opts = {}) {
  const protocol = getProtocolById(protocolId);
  if (!protocol || protocol.active === 0 || protocol.deleted_at || protocol.sync_status === 'deleted') return null;

  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const now = new Date();
  const todayKey = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(opts.dayKey || '') && opts.dayKey <= todayKey ? opts.dayKey : todayKey;
  const [y, m, d] = dayKey.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);

  // Idempotency guard: a persistent-mode reminder delivers a main notification
  // plus follow-ups per slot, all carrying the "mark as taken" button. Cancelling
  // can't recall an already-delivered follow-up, so without this a user tapping
  // several would double-log the dose and over-count the vial. Never log beyond
  // THAT day's scheduled dose count.
  const dosesPerDay = protocol.doses_per_day || 1;
  const dayLogs = (getLogsSince(protocol.user_id, dayStart.toISOString()) || [])
    .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at) < dayEnd);
  const takenThatDay = dayLogs.filter((l) => l.outcome === 'Taken').length;
  if (takenThatDay >= dosesPerDay) return { logId: null, protocol, alreadyLogged: true, dayKey };

  let logId;
  // Missed rows carry their scheduled time: flip the one for THIS slot (closest
  // to slotMs), else the day's earliest.
  const missedRows = dayLogs.filter((l) => l.outcome === 'Missed');
  const missed = Number.isFinite(opts.slotMs)
    ? missedRows.sort((p, q) => Math.abs(new Date(p.logged_at) - opts.slotMs) - Math.abs(new Date(q.logged_at) - opts.slotMs))[0]
    : missedRows.sort((p, q) => (p.logged_at < q.logged_at ? -1 : 1))[0];
  if (missed) {
    // The 12h scan already wrote this slot as Missed — it WAS taken: flip it,
    // don't add a second row for the same slot.
    updateDoseLog(missed.id, { outcome: 'Taken' });
    logId = missed.id;
  } else {
    const loggedAt = dayKey === todayKey
      ? now
      : new Date(Number.isFinite(opts.slotMs) && opts.slotMs >= dayStart.getTime() && opts.slotMs < dayEnd.getTime() ? opts.slotMs : dayStart.getTime() + 12 * 3600000);
    logId = insertDoseLog({
      user_id: protocol.user_id,
      protocol_id: protocol.id,
      protocol_remote_id: protocol.remote_id || null,
      outcome: 'Taken',
      logged_at: loggedAt.toISOString(),
    });
  }

  // Best-effort vial bookkeeping (mirrors TodayScreen.markTaken's data effects).
  try {
    const vial = (getActiveVials(protocol.user_id) || []).find((v) => v.protocol_id === protocol.id);
    if (vial) {
      const newTaken = (vial.doses_taken || 0) + 1;
      updateVial(vial.id, { doses_taken: newTaken });
      const capacity = (vial.total_doses && vial.total_doses > 0)
        ? vial.total_doses
        : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });
      if (capacity && newTaken >= capacity) updateVial(vial.id, { active: 0 });
    }
  } catch { /* vial update is best-effort */ }

  // Oral supply: subtract the calculated units-per-dose from the bottle.
  try {
    if (protocol.type === 'oral' && protocol.container_units) {
      const r = computeServings({
        targetDose: protocol.dose, doseUnit: protocol.dose_unit,
        servingStrength: protocol.serving_strength, servingStrengthUnit: protocol.serving_strength_unit,
        servingUnits: protocol.serving_units, form: protocol.notes,
      });
      if (r.valid && r.unitsNeeded > 0) {
        updateProtocol(protocol.id, { units_taken: (protocol.units_taken || 0) + r.unitsNeeded });
      }
    }
  } catch { /* supply update is best-effort */ }

  return { logId, protocol, dayKey };
}

// Backfill every scheduled dose from a protocol's (past) start_date up to now as
// Taken — for a compound the user started BEFORE installing the app (e.g. "started
// tirzepatide 2 weeks ago"). Applies to every type (recon / RTU / oral). The serum
// curve is already schedule-driven off start_date; this fills in the logged history
// so adherence + the Log tab reflect the elapsed doses. Returns the count logged.
export function backfillTakenDoses(protocolId, nowMs = Date.now()) {
  const protocol = getProtocolById(protocolId);
  if (!protocol) return 0;
  const slots = elapsedDoseSlots(protocol, nowMs);
  if (!slots.length) return 0;

  for (const ms of slots) {
    insertDoseLog({
      user_id: protocol.user_id,
      protocol_id: protocol.id,
      protocol_remote_id: protocol.remote_id || null,
      outcome: 'Taken',
      logged_at: new Date(ms).toISOString(),
    });
  }

  // Supply bookkeeping — best-effort, batched (mirrors recordDoseTaken's effects).
  try {
    const vial = (getActiveVials(protocol.user_id) || []).find((v) => v.protocol_id === protocol.id);
    if (vial) {
      const capacity = (vial.total_doses && vial.total_doses > 0)
        ? vial.total_doses
        : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });
      const newTaken = (vial.doses_taken || 0) + slots.length;
      const capped = (capacity && capacity > 0) ? Math.min(newTaken, capacity) : newTaken;
      updateVial(vial.id, { doses_taken: capped });
      if (capacity && capped >= capacity) updateVial(vial.id, { active: 0 });
    }
  } catch { /* best-effort */ }
  try {
    if (protocol.type === 'oral' && protocol.container_units) {
      const r = computeServings({
        targetDose: protocol.dose, doseUnit: protocol.dose_unit,
        servingStrength: protocol.serving_strength, servingStrengthUnit: protocol.serving_strength_unit,
        servingUnits: protocol.serving_units, form: protocol.notes,
      });
      if (r.valid && r.unitsNeeded > 0) {
        updateProtocol(protocol.id, { units_taken: (protocol.units_taken || 0) + r.unitsNeeded * slots.length });
      }
    }
  } catch { /* best-effort */ }

  return slots.length;
}

const MISSED_SINCE_KEY = 'dosetrace_missed_since';
const MISSED_LOOKBACK_DAYS = 14;

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
// screen). Returns the number of Missed rows created. Best-effort; never throws.
export async function scanMissedDoses() {
  if (_missedScanInFlight) return 0;
  _missedScanInFlight = true;
  try {
    const user = await getCachedUser();
    if (!user) return 0;
    const nowMs = Date.now();

    let sinceMs;
    const stored = await AsyncStorage.getItem(MISSED_SINCE_KEY);
    if (stored != null && stored !== '') sinceMs = parseInt(stored, 10);
    if (!Number.isFinite(sinceMs)) {
      sinceMs = nowMs; // first run — mark from now on, don't touch old history
      await AsyncStorage.setItem(MISSED_SINCE_KEY, String(nowMs)).catch(() => {});
    }

    const protocols = getActiveProtocols(user.id) || [];
    if (!protocols.length) return 0;

    const sinceDate = new Date(nowMs - (MISSED_LOOKBACK_DAYS + 1) * 86400000).toISOString();
    const logs = getLogsSince(user.id, sinceDate) || [];
    const missed = computeMissedDoses(protocols, logs, nowMs, sinceMs, { lookbackDays: MISSED_LOOKBACK_DAYS });
    if (!missed.length) return 0;

    const byId = {};
    for (const p of protocols) byId[p.id] = p;
    for (const m of missed) {
      const p = byId[m.protocol_id];
      insertDoseLog({
        user_id: m.user_id,
        protocol_id: m.protocol_id,
        protocol_remote_id: p ? (p.remote_id || null) : null,
        outcome: 'Missed',
        logged_at: new Date(m.scheduledAtMs).toISOString(),
      });
    }
    return missed.length;
  } catch {
    return 0;
  } finally {
    _missedScanInFlight = false;
  }
}
