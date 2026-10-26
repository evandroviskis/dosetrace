// What "start a new vial" writes (S-01). Pure, CommonJS so it's unit-testable.
// Today's new-vial prompt uses this to decide the vial row and any protocol change.
const { dosesPerVial, parseDecimal } = require('./doseMath');
const { supplyState } = require('./supplyLow');
const { DEFAULT_VALID_DAYS, daysUntilExpiry } = require('./vialExpiry');

function newVialRecords(protocol, mixDate, userId, opts = {}) {
  // AD-80: a ready-to-use vial — the same size as the one in use (its stored volume and count),
  // a full count, and the new box's month/year (null = blank, never the old box's date).
  if (protocol.type === 'rtu') {
    const old = opts.oldVial || {};
    const { capacity } = supplyState(old, protocol);
    return {
      vial: {
        user_id: userId,
        protocol_id: protocol.id,
        protocol_remote_id: protocol.remote_id || null,
        mixed_on: null,
        water_ml: old.water_ml != null ? old.water_ml : null,
        total_doses: capacity || 0,
        doses_taken: 0,
        expires_on: opts.expiresOn || null,
      },
      protocolUpdate: null,
    };
  }
  const totalDoses = dosesPerVial({
    amount: protocol.amount, unit: protocol.unit,
    dose: protocol.dose, doseUnit: protocol.dose_unit,
  });
  const vial = {
    user_id: userId,
    protocol_id: protocol.id,
    protocol_remote_id: protocol.remote_id || null,
    mixed_on: mixDate,
    // Comma decimals ("2,5" = 2.5) — S-09 / FX-14; parseFloat read "2,5" as 2.
    water_ml: protocol.water && Number.isFinite(parseDecimal(protocol.water)) ? parseDecimal(protocol.water) : null,
    total_doses: totalDoses,
    doses_taken: 0,
  };
  // The protocol is NOT changed: the vial's own mixed_on carries its expiry, and the
  // protocol's start_date anchors the schedule, curve, adherence and streaks —
  // rewriting it erased all history before the new vial (journey review F4).
  return { vial, protocolUpdate: null };
}

// A-132: the ONE write of a new reconstituted vial — after the last dose (Today's prompt), from
// "+ Add vial" / "+ New vial" on Today, and from "New vial" on the protocol page. The vial still in
// use (an expired one with doses left) only leaves use (active 0): its count, mix date and every dose
// logged stay exactly as they were, so it sits in the history with its leftover doses. Never two
// active vials. `db` = lib/database.js { deactivateVialsByProtocol, insertVial, updateProtocol }
// (synced through syncCore). Returns the new vial's local id. AD-80: a ready-to-use vial goes the
// same way (opts = { oldVial, expiresOn }), mixDate null.
// All or nothing (data review 2026-10-26): the writes run in db.withImmediateTransaction, so a
// failure between retiring the old vial and inserting the new one leaves the old one in use.
function startNewVial(protocol, mixDate, userId, db, opts = {}) {
  const { vial, protocolUpdate } = newVialRecords(protocol, mixDate, userId, opts);
  return db.withImmediateTransaction(() => {
    db.deactivateVialsByProtocol(protocol.id);
    const id = db.insertVial(vial);
    if (protocolUpdate) db.updateProtocol(protocol.id, protocolUpdate);
    return id;
  });
}

// Screen 2 = A: "+ New vial" on Today's card — a reconstituted vial past its window
// (the same day count the card shows as "Past window").
function vialPastWindow(protocol, vial, now) {
  if (!protocol || protocol.type !== 'recon' || !vial || !vial.mixed_on) return false;
  const days = daysUntilExpiry(vial.mixed_on, protocol.vial_valid_days || DEFAULT_VALID_DAYS, now);
  return days != null && days <= 0;
}

// Screen 3: "New vial" on the protocol page — any active reconstituted vial (expired or not);
// a ready-to-use vial as before (once a dose was used).
function showsNewVialButton(protocol, vial) {
  if (!protocol || !vial) return false;
  if (protocol.type === 'recon') return true;
  if (protocol.type === 'rtu') return (vial.doses_taken || 0) > 0;
  return false;
}

// Screen 4: the window's words. 'new' = asked for ("+ Add vial", "+ New vial", "New vial");
// 'finished' = after the last dose of a vial (unchanged).
function vialPromptKeys(mode) {
  return mode === 'finished'
    ? { title: 'today_vial_done_title', sub: 'today_vial_done_sub', secondary: 'today_vial_finished', primary: 'today_vial_add' }
    : { title: 'protocols_new_vial', sub: 'protocols_new_vial_body', secondary: 'cancel', primary: 'protocols_start_new' };
}

// The line about the vial going to the history: its mix date and its leftover doses
// (left null when unknown or none — the line then carries the date only). Without a mix date (a
// ready-to-use vial, AD-80) it is "the previous vial" with its leftover doses, or no line at all.
// No old vial → no line.
function oldVialNote(protocol, oldVial) {
  if (!oldVial) return null;
  const { remaining } = supplyState(oldVial, protocol);
  const left = remaining > 0 ? remaining : null;
  if (!oldVial.mixed_on) return left != null ? { mixedOn: null, left } : null;
  return { mixedOn: String(oldVial.mixed_on).slice(0, 10), left };
}

// The "Vial expiring" alert: one vial opens that protocol's page; several open the list.
function vialAlertTarget(expiring) {
  const list = expiring || [];
  return list.length === 1 && list[0].protocolId != null
    ? { screen: 'Protocols', params: { openProtocolId: list[0].protocolId } }
    : { screen: 'Protocols', params: undefined };
}

module.exports = { newVialRecords, startNewVial, vialPastWindow, showsNewVialButton, vialPromptKeys, oldVialNote, vialAlertTarget };
