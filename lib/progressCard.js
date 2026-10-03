'use strict';
// The Progress screen's one card (docs/specs/progress-one-card.md, founder 2026-10-02):
// weight + daily burn, Your target, Log today's weight, Weigh-ins and Your numbers in ONE
// card on top, then the daily plan and the reality check. Pure (node --test); the screen
// localizes the words. Never advisory: it only arranges and repeats the user's own numbers.
const { mergeWeighIn } = require('./weighInAccess');
const { lbToKg, inToCm } = require('./energyCalc');

const num = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// The order of the card and of the screen. filled = the user's numbers give (or gave, this
// visit) a daily burn: the card folds Your numbers away at its end. Before that (first use)
// Your numbers is open right under the hero, with no fold. Log today's weight shows once a
// weigh-in or the numbers exist; the daily plan only with a daily burn.
function progressLayout({ filled = false, hasPlan = false, weighInCount = 0 } = {}) {
  const showLogWeight = !!hasPlan || weighInCount > 0;
  const log = showLogWeight ? ['logWeight'] : [];
  const card = filled
    ? ['hero', 'target', ...log, 'weighIns', 'numbers']
    : ['hero', 'numbers', 'target', ...log, 'weighIns'];
  return { card, screen: hasPlan ? ['card', 'plan', 'rc'] : ['card', 'rc'], numbersFoldable: !!filled, showLogWeight };
}

// Founder option A: the daily burn needs weight, height, age and sex. Body fat (when its
// source is known) only sharpens it — the engine (lib/energyCalc) still picks
// Katch-McArdle then. sexKnown = sex set in the profile (never the 'male' default).
function burnInputsComplete({ weightKg, heightCm, age, sexKnown } = {}) {
  return pos(weightKg) && pos(heightCm) && pos(age) && !!sexKnown;
}

// legacyBurn: an existing user whose daily burn came from weight + body fat before this
// rule keeps that number (and is asked to complete the numbers) — never lost on update.
function dailyBurnGate({ weightKg, heightCm, age, sexKnown, bodyFatPct = null, legacyBurn = false } = {}) {
  if (burnInputsComplete({ weightKg, heightCm, age, sexKnown })) return { show: true, complete: true };
  if (legacyBurn && pos(weightKg) && bodyFatPct != null) return { show: true, complete: false };
  return { show: false, complete: false };
}

// Saved calculator inputs (calc_inputs payload, display units) → metric numbers.
function savedMetrics(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const imp = s.unit === 'imperial';
  const w = num(s.weight), h = num(s.height);
  return {
    weightKg: w == null ? null : (imp ? lbToKg(w) : w),
    heightCm: h == null ? null : (imp ? inToCm(h) : h),
    bodyFatPct: s.bfSource === 'unknown' ? null : num(s.bodyFat),
  };
}

// Does this account keep its weight + body fat daily burn? Decided from what was saved
// BEFORE this version (no oneCard marker), or kept from an earlier decision (legacyBurn).
// A payload saved by this version without the flag is a new user: option A applies.
function legacyBurnFromSaved({ saved, sexKnown = false, age = null } = {}) {
  if (!saved || typeof saved !== 'object') return false;
  if (saved.legacyBurn === true) return true;
  if (saved.oneCard) return false;
  const m = savedMetrics(saved);
  if (burnInputsComplete({ weightKg: m.weightKg, heightCm: m.heightCm, age: num(age), sexKnown })) return false;
  return pos(m.weightKg) && m.bodyFatPct != null;
}

// The folded Your numbers line: "84.6 kg · 181 cm · 38 yr · Male · 21% BF · Moderate".
function numbersLine({ weight, wUnit, height, hUnit, age, yr, sexLabel, bodyFat, bfShort, activityLabel } = {}) {
  return [
    num(weight) != null ? `${String(weight).trim()} ${wUnit}` : null,
    num(height) != null ? `${String(height).trim()} ${hUnit}` : null,
    num(age) != null ? `${String(age).trim()} ${yr}` : null,
    sexLabel || null,
    num(bodyFat) != null ? `${String(bodyFat).trim()}% ${bfShort}` : null,
    activityLabel || null,
  ].filter((p) => p != null && String(p).trim() !== '').join(' · ');
}

// The folded Weigh-ins line: "5 · last Sep 28 · 84.6 kg · 21% BF", or "None yet".
// rows: { date, weightKg, bodyFatPct } (any order).
function weighInsLine({ rows, template, none, fmtDate, fmtWeight, bfShort }) {
  const list = (rows || []).filter((r) => r && r.date);
  if (!list.length) return none;
  const last = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[list.length - 1];
  let line = String(template)
    .replace('{n}', String(list.length))
    .replace('{date}', fmtDate(last.date))
    .replace('{w}', last.weightKg != null ? fmtWeight(last.weightKg) : '—');
  if (last.bodyFatPct != null) line += ` · ${Math.round(last.bodyFatPct * 10) / 10}% ${bfShort}`;
  return line;
}

// Weigh-ins (calc_snapshots rows) that hold a weight, newest last.
const weighed = (rows) => (rows || [])
  .filter((r) => r && r.entry_date && typeof r.weight_kg === 'number')
  .sort((a, b) => (String(a.entry_date) < String(b.entry_date) ? -1 : String(a.entry_date) > String(b.entry_date) ? 1 : 0));

// Weight changed in Your numbers (founder 2026-10-02): with no weigh-ins it saves and becomes
// the first weigh-in ('first', founder "A"); with weigh-ins it works like a weigh-in, so the
// user is asked: update the latest weigh-in, or save as today's (only "update" when the
// latest IS today — one row per day).
function weightEditAsk({ rows, oldWeightKg, newWeightKg, todayISO }) {
  const w = weighed(rows);
  if (!w.length) return { kind: 'first' };
  if (oldWeightKg != null && newWeightKg != null && Math.abs(oldWeightKg - newWeightKg) < 0.005) return { kind: 'none' };
  const latestDate = String(w[w.length - 1].entry_date).slice(0, 10);
  return { kind: 'ask', latestDate, options: latestDate === todayISO ? ['update'] : ['update', 'today'] };
}

// The one row to write for the answer (merged — body fat, waist and computed fields of that
// day are kept), or null (Cancel / nothing to update). upsertCalcSnapshot keys it by day.
// 'first' (PO-17): only while there is no weigh-in yet — today's row with the weight and the
// form's body fat / waist when given (a waist-only row of today is merged into).
function weightEditWrite({ choice, rows, newWeightKg, todayISO, bodyFatPct = null, waistCm = null }) {
  if (newWeightKg == null) return null;
  if (choice === 'first') {
    if (weighed(rows).length) return null;
    const existing = (rows || []).find((r) => r && String(r.entry_date).slice(0, 10) === todayISO) || null;
    return mergeWeighIn(existing, { date: todayISO, weightKg: newWeightKg, bodyFatPct, waistCm });
  }
  if (choice === 'update') {
    const w = weighed(rows);
    if (!w.length) return null;
    const latest = w[w.length - 1];
    return mergeWeighIn(latest, { date: String(latest.entry_date).slice(0, 10), weightKg: newWeightKg });
  }
  if (choice === 'today') {
    const existing = (rows || []).find((r) => r && String(r.entry_date).slice(0, 10) === todayISO) || null;
    return mergeWeighIn(existing, { date: todayISO, weightKg: newWeightKg });
  }
  return null;
}

module.exports = {
  progressLayout, burnInputsComplete, dailyBurnGate, savedMetrics, legacyBurnFromSaved,
  numbersLine, weighInsLine, weightEditAsk, weightEditWrite,
};
