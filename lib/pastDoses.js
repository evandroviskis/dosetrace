'use strict';
// Founder 2026-10-27 ("Chegamos num acordo… Execute as correções"): a protocol added with a start date in
// the past asks ONE question for the curve and the vial — "Desde {date}, seriam {n} doses de {dose}. Você
// aplicou todas?". n = every dose the schedule had from the real start to before today (today's is marked
// on Today, never twice). The supply follows only what it can know (council 2026-10-27):
// - a mixed vial: the doses since it was mixed, never more than it holds; all of them = finished;
// - a ready-to-use pen (no mix date): the doses since the start when they fit in one pen (all = finished);
//   more than one pen holds came from earlier pens — vialUnknown, the person enters this pen's count;
// - an oral bottle: n × units per dose when they fit in the bottle (unitsUsed), else never inferred.
// curveAsk: the curve's own question applies (lib/declared historyQuestion — a half-life of a day or more).
// → null (nothing to ask) or { n, vialUsed, total, finished, vialUnknown, unitsUsed }. Pure.
const { elapsedDoseSlots } = require('./schedule');
const { oralUnitsPerDose } = require('./deleteDose');

function dayStartMs(key) {
  const d = new Date(String(key).slice(0, 10) + 'T00:00:00');
  return d.getTime();
}

function pastStartAsk({ protocol, vial = null, nowMs = Date.now(), curveAsk = false }) {
  if (!protocol || !protocol.start_date) return null;
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const today0 = today.getTime();
  const start = dayStartMs(protocol.start_date);
  if (!Number.isFinite(start) || start >= today0) return null;
  const days = Math.ceil((today0 - start) / 86400000) + 2; // the whole span: every dose since the real start
  const slots = elapsedDoseSlots(protocol, today0 - 1, days).filter((ms) => ms < today0);
  if (!slots.length) return null;
  const n = slots.length;
  let vialUsed = 0, finished = false, vialUnknown = false, unitsUsed = 0;
  const total = vial && Number(vial.total_doses) > 0 ? Number(vial.total_doses) : null;
  if (vial && total) {
    if (vial.mixed_on) {
      const since = slots.filter((ms) => ms >= dayStartMs(vial.mixed_on)).length;
      vialUsed = Math.min(total, since);
      finished = since >= total;
    } else if (n > total) {
      vialUnknown = true;
    } else {
      vialUsed = n;
      finished = n === total;
    }
  }
  if (!vial && protocol.type === 'oral') {
    const per = oralUnitsPerDose(protocol);
    const container = Number(protocol.container_units) || 0;
    if (per && container > 0 && n * per <= container) unitsUsed = Math.round(n * per * 100) / 100;
  }
  if (!curveAsk && vialUsed === 0 && !vialUnknown && unitsUsed === 0) return null;
  const out = { n, vialUsed, total, finished };
  if (vialUnknown) out.vialUnknown = true;
  out.unitsUsed = unitsUsed;
  return out;
}

// What each answer writes (council delta 3: tested as behaviour, not as source text). answer: 'yes' | 'almost' | 'no'.
// - no: the curve starts today (history_from); Editar frasco opens when doses came from the vial.
// - yes: the curve estimates the period; the vial takes the doses since it was mixed (all of them = finished,
//   and a mixed vial's new-vial window opens); a pen with more doses than it holds opens Editar frasco; an oral
//   bottle takes n × units per dose.
// - almost: the curve estimates the period like yes; the vial first holds yes's count (never finished) and
//   Editar frasco opens so the person takes away the doses missed — Cancelar keeps yes's count, never 0; an
//   oral bottle has no field to correct, so it takes yes's estimate.
// Never a dose row. → { historyFrom, vialUpdate, unitsTaken, openEditVial, openNewVialWindow }.
function pastStartWrites(answer, ask, { hasVial = false, recon = false, today = null } = {}) {
  const w = { historyFrom: null, vialUpdate: null, unitsTaken: null, openEditVial: false, openNewVialWindow: false };
  if (!ask) return w;
  if (answer === 'no') {
    w.historyFrom = today;
    w.openEditVial = hasVial && (ask.vialUsed > 0 || !!ask.vialUnknown);
    return w;
  }
  if (hasVial && ask.vialUsed > 0) {
    if (answer === 'yes') {
      w.vialUpdate = ask.finished ? { doses_taken: ask.vialUsed, active: 0 } : { doses_taken: ask.vialUsed };
      w.openNewVialWindow = !!ask.finished && recon;
    } else {
      w.vialUpdate = { doses_taken: ask.vialUsed };
      w.openEditVial = true;
    }
  } else if (hasVial && ask.vialUnknown) {
    w.openEditVial = true;
  } else if (ask.unitsUsed > 0) {
    w.unitsTaken = ask.unitsUsed;
  }
  return w;
}

module.exports = { pastStartAsk, pastStartWrites };
