'use strict';
// Founder 2026-10-27 ("Chegamos num acordo… Execute as correções"): a protocol added with a start date in
// the past asks ONE question for the curve and the vial — "Desde {date}, seriam {n} doses de {dose}. Você
// aplicou todas?". n = the doses the schedule had before today (today's is marked on Today, never twice);
// vialUsed = those since the vial was mixed (a ready-to-use vial: since the start), never more than it holds.
// curveAsk: the curve's own question applies (lib/declared historyQuestion — a half-life of a day or more).
// → null (nothing to ask) or { n, vialUsed, total }. Pure.
const { elapsedDoseSlots } = require('./schedule');

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
  const slots = elapsedDoseSlots(protocol, today0 - 1, 400).filter((ms) => ms < today0);
  if (!slots.length) return null;
  let vialUsed = 0;
  const total = vial && Number(vial.total_doses) > 0 ? Number(vial.total_doses) : null;
  if (vial && total) {
    const from = vial.mixed_on ? dayStartMs(vial.mixed_on) : start;
    vialUsed = Math.min(total, slots.filter((ms) => ms >= from).length);
  }
  if (!curveAsk && vialUsed === 0) return null;
  return { n: slots.length, vialUsed, total };
}

module.exports = { pastStartAsk };
