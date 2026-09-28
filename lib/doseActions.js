import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProtocolById, getActiveVials, insertDoseLog, updateDoseLog, updateVial, updateProtocol, getActiveProtocols, getLogsSince } from './database';
import { getCachedUser } from './supabase';
import { dosesPerVial } from './doseMath';
import { computeServings } from './oralMath';
import { computeMissedDoses } from './missedDoses';
import { elapsedDoseSlots } from './schedule';
import { planMarkTaken, markTakenDay } from './markTaken';

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
  if (!protocol || protocol.active === 0 || protocol.deleted_at || protocol.sync_status === 'deleted') return null;

  const nowMs = Date.now();
  const day = markTakenDay({ dayKey: opts.dayKey, atNow: opts.atNow, nowMs });
  const dayLogs = (getLogsSince(protocol.user_id, new Date(day.dayStart).toISOString()) || [])
    .filter((l) => l.protocol_id === protocol.id && new Date(l.logged_at).getTime() < day.dayEnd);
  let vial = null;
  try { vial = (getActiveVials(protocol.user_id) || []).find((v) => v.protocol_id === protocol.id) || null; } catch { /* no vial */ }

  const plan = planMarkTaken({ protocol, vial, todayLogs: dayLogs, dayKey: day.dayKey, slotMs: opts.slotMs, atNow: opts.atNow, nowMs });
  if (plan.alreadyTaken) return { logId: null, protocol, alreadyLogged: true, dayKey: plan.dayKey };

  let logId;
  if (plan.update) {
    updateDoseLog(plan.update.id, { outcome: 'Taken' });
    logId = plan.update.id;
  } else {
    logId = insertDoseLog(plan.insert);
  }

  // Supply bookkeeping is best-effort: the dose itself is already saved.
  let vialId = null;
  try {
    if (plan.vialUpdate) {
      const { id, ...fields } = plan.vialUpdate;
      updateVial(id, fields);
      vialId = id;
    }
  } catch { /* vial update is best-effort */ }
  let oralPrevUnitsTaken = null;
  try {
    if (plan.oralUpdate) {
      updateProtocol(protocol.id, plan.oralUpdate);
      oralPrevUnitsTaken = plan.prevUnitsTaken;
    }
  } catch { /* supply update is best-effort */ }

  return {
    logId, protocol, dayKey: plan.dayKey, flipped: plan.flipped,
    vialId, prevVialDosesTaken: vialId ? plan.prevVialDosesTaken : null,
    vialFinished: !!(vialId && plan.vialFinished), oralPrevUnitsTaken, takenAfter: plan.takenAfter,
  };
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
