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
  // A blend component compares totals (curveWeight): its fallback is its parent's total dose (review 1).
  const d = num(p && (p.__parentDose != null ? p.__parentDose : p.dose));
  return d == null ? null : { dose: d, unit: unitOf(p.dose_unit) };
}

// Same quantity written two ways (0,25 mg = 250 mcg)? IU only equals IU. Founder 2026-10-27: a unit-only
// change with the same mass is not a dose change — no question, no history.
const MASS_F = { mcg: 0.001, mg: 1, g: 1000 };
function sameMass(a, ua, b, ub) {
  const x = num(a), y = num(b);
  if (x == null || y == null) return false;
  const u1 = unitOf(ua).toLowerCase(), u2 = unitOf(ub).toLowerCase();
  if (u1 === 'iu' || u2 === 'iu') return u1 === u2 && Math.abs(x - y) < 1e-9;
  if (!MASS_F[u1] || !MASS_F[u2]) return u1 === u2 && Math.abs(x - y) < 1e-9;
  return Math.abs(x * MASS_F[u1] - y * MASS_F[u2]) < 1e-9 * Math.max(1, x * MASS_F[u1]);
}

// The history to save with an edit that sets the dose to (nextDose, nextUnit), or null when nothing
// changes (same quantity, however written) or there was no dose before. mode (founder 2026-10-27,
// option A "Desde quando você usa…?"): 'now' — the new dose from atIso (now) on; 'from' — from atIso (the
// first dose the person said was wrong; a date in the past); 'start' — the current value was wrong from
// its beginning: it is replaced (with no history, from the very start, estimated past included). The
// older forms true / false mean 'now' / 'start'.
function nextDoseHistory(prev, nextDose, nextUnit, atIso, mode = 'now') {
  if (mode === true) mode = 'now';
  if (mode === false) mode = 'start';
  const before = num(prev && prev.dose);
  const after = num(nextDose);
  if (before == null || after == null) return null;
  const uBefore = unitOf(prev.dose_unit);
  const uAfter = unitOf(nextUnit != null ? nextUnit : prev.dose_unit);
  if (sameMass(before, uBefore, after, uAfter)) return null;
  const h = historyOf(prev);
  if (mode === 'start') {
    if (h.length <= 1) return h.length ? JSON.stringify([{ from: null, dose: after, unit: uAfter }]) : null;
    const fixed = h.slice();
    fixed[fixed.length - 1] = { ...fixed[fixed.length - 1], dose: after, unit: uAfter };
    return JSON.stringify(fixed);
  }
  const out = h.length ? h.slice() : [{ from: null, dose: before, unit: uBefore }];
  out.push({ from: atIso, dose: after, unit: uAfter });
  out.sort((x, y) => (x.from == null ? -Infinity : Date.parse(x.from)) - (y.from == null ? -Infinity : Date.parse(y.from)));
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

module.exports = { doseInEffect, nextDoseHistory, stampForTaken, curveWeight, historyOf, sameMass };
