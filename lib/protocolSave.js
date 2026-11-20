'use strict';
// The ONE save of a new protocol (docs/specs/onboarding-protocol.md OB-22): the add-protocol form
// (screens/ProtocolsScreen.js saveProtocol) and the protocol the onboarding built before the account
// (lib/onboardingDraft, written after SIGNED_IN) both go through here, so a protocol from the
// onboarding is the same rows the form writes — the protocol, its first vial (reconstituted or ready
// to use) — and the same past-doses answer ("Desde {data}, seriam {n} doses. Você aplicou todas?").
// The database calls are passed in (deps), so it runs under node --test.

// form: the add-protocol form (lib/protocolForm newProtocolForm shape). startDate: a valid YYYY-MM-DD.
// skipVial: no vial for a reconstituted protocol ("Ainda não sei esses números" / "skip vial").
// mixedOn: the reconstituted vial's mix date (YYYY-MM-DD) or null.
// deps: { insertProtocol, insertVial, protocolPayload, parseDecimal, dosesPerVial, rtuVialFields }.
// → { newId, newVialId }
function insertNewProtocol({ form, userId, language, frequencyLabel, startDate, skipVial = false, mixedOn = null }, deps) {
  const f = form || {};
  const newId = deps.insertProtocol({ user_id: userId, ...deps.protocolPayload(f, frequencyLabel, language), start_date: startDate });
  let newVialId = null;
  if (f.type === 'recon' && !skipVial) {
    newVialId = deps.insertVial({
      user_id: userId, protocol_id: newId,
      mixed_on: mixedOn,
      water_ml: deps.parseDecimal(f.water, language) || null,
      // Vial capacity is derived (vial amount ÷ dose), not asked.
      total_doses: deps.dosesPerVial({ amount: f.amount, unit: f.unit, dose: f.dose, doseUnit: f.doseUnit, language }),
      doses_taken: 0,
    });
  }
  // Ready-to-use vial: injections = (concentration × ml) ÷ dose; optional expiry from the box.
  const rtuVial = deps.rtuVialFields(f, language);
  if (rtuVial) newVialId = deps.insertVial({ user_id: userId, protocol_id: newId, doses_taken: 0, ...rtuVial });
  return { newId, newVialId };
}

// The past-doses answer given BEFORE the save (the onboarding asks it on "Quando você começa"),
// written with the form's own rules (lib/pastDoses pastStartAsk + pastStartWrites): the curve's
// history_from, the vial's doses taken, an oral bottle's units. Nothing is ever written to the Dose
// log. answer: 'yes' | 'almost' | 'no' | null. deps: { getProtocolById, getVialById, updateProtocol,
// updateVial, pastStartAsk, pastStartWrites, historyQuestion }. → the writes made (for the caller and
// the tests) or null when there was nothing to ask.
function applyPastAnswer({ newId, newVialId, answer, nowMs, today }, deps) {
  if (!answer) return null;
  const protocol = deps.getProtocolById(newId);
  if (!protocol) return null;
  const vial = newVialId != null ? deps.getVialById(newVialId) : null;
  const ask = deps.pastStartAsk({ protocol, vial, nowMs, curveAsk: !!deps.historyQuestion(protocol, nowMs) });
  if (!ask) return null;
  const w = deps.pastStartWrites(answer, ask, { hasVial: !!vial, recon: protocol.type === 'recon', today });
  if (w.historyFrom) deps.updateProtocol(newId, { history_from: w.historyFrom });
  if (w.vialUpdate && vial) deps.updateVial(vial.id, w.vialUpdate);
  if (w.unitsTaken != null) deps.updateProtocol(newId, { units_taken: w.unitsTaken });
  return w;
}

module.exports = { insertNewProtocol, applyPastAnswer };
