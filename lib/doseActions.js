import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProtocolById, getActiveVials, getTodayLogs, insertDoseLog, updateVial, updateProtocol, getActiveProtocols, getLogsSince } from './database';
import { getCachedUser } from './supabase';
import { dosesPerVial } from './doseMath';
import { computeServings } from './oralMath';
import { computeMissedDoses } from './missedDoses';

// Log a dose as "Taken" and update the active vial — with NO UI coupling, so it
// can run from the notification "Mark as taken" action (which fires outside React,
// possibly in the background). TodayScreen has its own richer flow (undo toast,
// body-map prompt, continuation-vial prompt); this is the minimal data path.
//
// Returns { logId, protocol } or null if the protocol no longer exists.
export function recordDoseTaken(protocolId) {
  const protocol = getProtocolById(protocolId);
  if (!protocol) return null;

  // Idempotency guard: a persistent-mode reminder delivers a main notification
  // plus follow-ups per slot, all carrying the "mark complete" button. Cancelling
  // can't recall an already-delivered follow-up, so without this a user tapping
  // several would double-log the dose and over-count the vial. Never log beyond
  // the day's scheduled dose count.
  const dosesPerDay = protocol.doses_per_day || 1;
  const takenToday = (getTodayLogs(protocol.user_id) || [])
    .filter((l) => l.protocol_id === protocol.id && l.outcome === 'Taken').length;
  if (takenToday >= dosesPerDay) return { logId: null, protocol, alreadyLogged: true };

  const logId = insertDoseLog({
    user_id: protocol.user_id,
    protocol_id: protocol.id,
    protocol_remote_id: protocol.remote_id || null,
    outcome: 'Taken',
  });

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

  return { logId, protocol };
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
