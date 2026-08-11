import { getProtocolById, getActiveVials, getTodayLogs, insertDoseLog, updateVial } from './database';
import { dosesPerVial } from './doseMath';

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

  return { logId, protocol };
}
