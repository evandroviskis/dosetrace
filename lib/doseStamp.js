'use strict';
// AD-95 B (founder 2026-10-26; docs/decisions.md): every Taken dose keeps the dose it was taken at.
// "a curva tem que mudar só a partir da dose que ela mudou… a pessoa não vai milagrosamente deixar de
// ter a dose… até ontem." Pure — no React Native / Expo imports (node --test).
//
// protocols.dose_history (TEXT, JSON): written only when the dose or its unit changes —
// [{ from: null, dose, unit }, { from: ISO, dose, unit }, …]; the first entry is the dose before the
// first change (in force from the beginning), each next one from the moment the change was saved.
// No history = the protocol's dose was never changed: the current dose has always been in force.
// dose_logs.dose_amount / dose_unit: the dose a Taken row was taken at (lib/database stamps it).
const { parseDecimal } = require('./doseMath');
const { doseInCurveUnit } = require('./halfLives');

const MAX_ENTRIES = 100;
const num = (v) => { const n = parseDecimal(v); return Number.isFinite(n) && n > 0 ? n : null; };
const unitOf = (u) => String(u || 'mg').trim();

function historyOf(p) {
  if (!p || !p.dose_history) return [];
  try {
    const h = typeof p.dose_history === 'string' ? JSON.parse(p.dose_history) : p.dose_history;
    return Array.isArray(h) ? h.filter((e) => e && num(e.dose) != null) : [];
  } catch { return []; }
}

// The dose in force at moment atMs: { dose, unit } or null when the protocol has no dose.
function doseInEffect(p, atMs) {
  const h = historyOf(p);
  let hit = null;
  for (const e of h) {
    const from = e.from == null ? -Infinity : Date.parse(e.from);
    if (!Number.isNaN(from) && from <= atMs) hit = e;
  }
  if (!hit && h.length) hit = h[0]; // before the first recorded moment: the earliest dose known
  if (hit) return { dose: num(hit.dose), unit: unitOf(hit.unit) };
  const d = num(p && p.dose);
  return d == null ? null : { dose: d, unit: unitOf(p.dose_unit) };
}

// The history to save with an edit that sets the dose to (nextDose, nextUnit) at nowIso, or null when
// nothing changes (same value, however it was written, and same unit) or there was no dose before.
function nextDoseHistory(prev, nextDose, nextUnit, nowIso) {
  const before = num(prev && prev.dose);
  const after = num(nextDose);
  if (before == null || after == null) return null;
  const uBefore = unitOf(prev.dose_unit);
  const uAfter = unitOf(nextUnit != null ? nextUnit : prev.dose_unit);
  if (before === after && uBefore === uAfter) return null;
  const h = historyOf(prev);
  const out = h.length ? h.slice() : [{ from: null, dose: before, unit: uBefore }];
  out.push({ from: nowIso, dose: after, unit: uAfter });
  return JSON.stringify(out.length > MAX_ENTRIES ? [out[0], ...out.slice(out.length - MAX_ENTRIES + 1)] : out);
}

// The stamp a row gets when it becomes Taken at moment atMs (its logged_at): the dose in force then.
function stampForTaken(p, atMs) {
  const d = doseInEffect(p, Number.isFinite(atMs) ? atMs : Date.now());
  return d && d.dose != null ? { dose_amount: d.dose, dose_unit: d.unit } : null;
}

// The curve draws a protocol at its current dose; a dose given at another amount weighs
// amount / current (in the curve's unit). A blend component compares the totals (its parent's dose,
// __parentDose): the components split the total in fixed parts. Anything unknown weighs 1.
function curveWeight(p, entry, amount, unit) {
  const cur = num(p && (p.__parentDose != null ? p.__parentDose : p.dose));
  const own = num(amount);
  if (cur == null || own == null || !entry) return 1;
  const a = doseInCurveUnit(own, unitOf(unit), entry);
  const b = doseInCurveUnit(cur, unitOf(p.dose_unit), entry);
  if (!(a > 0) || !(b > 0)) return 1;
  return a / b;
}

module.exports = { doseInEffect, nextDoseHistory, stampForTaken, curveWeight, historyOf };
