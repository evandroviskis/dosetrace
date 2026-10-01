// What "start a new vial" writes (S-01). Pure, CommonJS so it's unit-testable.
// Today's new-vial prompt uses this to decide the vial row and any protocol change.
const { dosesPerVial, parseDecimal } = require('./doseMath');

function newVialRecords(protocol, mixDate, userId) {
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

module.exports = { newVialRecords };
