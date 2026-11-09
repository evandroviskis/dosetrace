'use strict';
// CP-1 pen path (docs/specs/pen-path.md, picture docs/design/pen-path.html). Pure rules for a protocol
// whose form is a pen (protocols.type = 'pen'). CommonJS so node --test runs it.
//
// Founder rules that never bend: only the doses printed on the pen are accepted; the app never counts
// clicks, fractions, extra doses or the leftover; it never says whether a pen can still be used. The
// list below holds LABEL facts (FDA/EMA/emc, Second Brain/dosetrace/conversas/canetas-pesquisa.md) as
// suggestions the person can change — never a recommended dose.
//
// Storage: protocols.pen (TEXT, JSON) = { kind: 'single'|'fixed'|'dial', catalog, name, doses (printed),
// perPen (fixed), perDose { dose: count } (dial, label numbers), stock (closed pens of the CURRENT dose,
// founder P3), fridgeDays, fridgeOut { count, since, days } (single-dose pens, founder P4) }.
// A fixed/dial pen in use is a vials row: total_doses = doses in this pen (never from mg), doses_taken,
// mixed_on = the day it was opened (null = not started yet or "I don't remember": no countdown).
// The validity after opening is protocols.vial_valid_days (null = no countdown, never the powder's 30).
// A single-dose pen has no vials row: each taken dose takes one pen from the stock.

const { SUPPLY_LOW_DAYS, daysOfSupply } = require('./supplyLow');
const { daysUntilExpiry, parseDateOnly } = require('./vialExpiry');

// The switch (PN-28): off until every row of the spec is built.
const PEN_PATH_ENABLED = false;

const TIRZ = [2.5, 5, 7.5, 10, 12.5, 15];
const VALID_56_US = { US: 56, default: 42 }; // Ozempic / Wegovy FlexTouch: 56 days US, 6 weeks UK/BR

// The short list (founder 2026-11-09). perDose of the dial pens stays empty until the label number for
// each printed dose is confirmed: an empty entry asks the number on the box (PN-4, never total ÷ dose).
const PEN_CATALOG = [
  { id: 'mounjaro_kwikpen', name: 'Mounjaro KwikPen', compound: 'rtu_tirzepatide', kind: 'fixed', doses: TIRZ, perPen: 4, validDays: 30 },
  { id: 'mounjaro_single', name: 'Mounjaro', compound: 'rtu_tirzepatide', kind: 'single', doses: TIRZ, fridgeDays: 21 },
  { id: 'zepbound_kwikpen', name: 'Zepbound KwikPen', compound: 'rtu_tirzepatide', kind: 'fixed', doses: TIRZ, perPen: 4, validDays: 30 },
  { id: 'zepbound_single', name: 'Zepbound', compound: 'rtu_tirzepatide', kind: 'single', doses: TIRZ, fridgeDays: 21 },
  { id: 'ozempic', name: 'Ozempic', compound: 'rtu_semaglutide', devices: [
    { id: 'ozempic_low', kind: 'dial', doses: [0.25, 0.5], perDose: {}, validDays: VALID_56_US },
    { id: 'ozempic_1', kind: 'fixed', doses: [1], perPen: 4, validDays: VALID_56_US },
    { id: 'ozempic_2', kind: 'fixed', doses: [2], perPen: 4, validDays: VALID_56_US },
  ] },
  { id: 'wegovy', name: 'Wegovy', compound: 'rtu_semaglutide', devices: [
    { id: 'wegovy_single', kind: 'single', doses: [0.25, 0.5, 1, 1.7, 2.4, 7.2], fridgeDays: 28 },
    { id: 'wegovy_flextouch', kind: 'fixed', doses: [0.25, 0.5, 1, 1.7, 2.4], perPen: 4, validDays: VALID_56_US },
  ] },
  { id: 'saxenda', name: 'Saxenda', compound: null, kind: 'dial', doses: [0.6, 1.2, 1.8, 2.4, 3], perDose: {}, validDays: 30 },
  { id: 'victoza', name: 'Victoza', compound: null, kind: 'dial', doses: [0.6, 1.2, 1.8], perDose: {}, validDays: 30 },
  { id: 'trulicity', name: 'Trulicity', compound: null, kind: 'single', doses: [0.75, 1.5, 3, 4.5], fridgeDays: 14 },
  // Xyosted: kept at room temperature (label: do not refrigerate) — no fridge countdown.
  { id: 'xyosted', name: 'Xyosted', compound: 'rtu_testosterone_enanthate', kind: 'single', doses: [50, 75, 100], fridgeDays: null, noFridge: true },
];

function catalogEntry(id) {
  for (const e of PEN_CATALOG) {
    if (e.id === id) return e;
    for (const d of e.devices || []) if (d.id === id) return { ...d, name: e.name, compound: e.compound, parent: e.id };
  }
  return null;
}

// The label's validity after opening for the phone's region (a suggestion the person can change).
function validDaysFor(entry, region) {
  const v = entry && entry.validDays;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return v[String(region || '').toUpperCase()] != null ? v[String(region).toUpperCase()] : v.default;
}

const isPen = (p) => !!p && p.type === 'pen';
function penOf(protocol) {
  if (!protocol || !protocol.pen) return null;
  if (typeof protocol.pen === 'object') return protocol.pen;
  try { const x = JSON.parse(protocol.pen); return x && typeof x === 'object' ? x : null; } catch { return null; }
}
const serialize = (p) => JSON.stringify(p);
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const sameDose = (a, b) => Math.abs(a - b) < 1e-9;

function isPrintedDose(p, dose) {
  const d = num(dose);
  return d != null && Array.isArray(p && p.doses) && p.doses.some((x) => sameDose(Number(x), d));
}

// Doses ONE pen gives at this dose (PN-3/4/5): single 1; fixed its number; dial the label's number for a
// printed dose (null = not known: ask the box); never derived from mg.
function dosesPerPen(p, dose) {
  if (!p) return null;
  if (p.kind === 'single') return 1;
  if (p.kind === 'fixed') return Number(p.perPen) > 0 ? Number(p.perPen) : null;
  if (p.kind === 'dial') {
    if (!isPrintedDose(p, dose)) return null;
    const d = num(dose);
    const key = Object.keys(p.perDose || {}).find((k) => sameDose(Number(k), d));
    return key != null && Number(p.perDose[key]) > 0 ? Number(p.perDose[key]) : null;
  }
  return null;
}

// PN-19: only a Taken dose takes from the pen.
const takesFromPen = (outcome) => outcome === 'Taken';

// PN-5 / PN-9 / PN-22: what a Taken dose changes. single: one pen less (a pen out of the fridge first);
// fixed/dial: the pen in use counts it, and a new pen opens on the day of its first dose.
function afterTaken(protocol, vial, dayKey) {
  const p = { ...(penOf(protocol) || {}) };
  if (p.kind === 'single') {
    p.stock = Math.max(0, (Number(p.stock) || 0) - 1);
    if (p.fridgeOut && Number(p.fridgeOut.count) > 0) {
      const left = Number(p.fridgeOut.count) - 1;
      p.fridgeOut = left > 0 ? { ...p.fridgeOut, count: left } : null;
    }
    return { pen: p, vial: null };
  }
  if (!vial) return { pen: p, vial: null };
  const v = { ...vial, doses_taken: (Number(vial.doses_taken) || 0) + 1 };
  if (!v.mixed_on && !vial.opened_unknown) v.mixed_on = String(dayKey).slice(0, 10);
  return { pen: p, vial: v };
}

// PN-13/14/15/21: the block's numbers. remaining = doses left in the pen in use (single: pens left);
// available = what can still be used (0 once past the validity — the rest is to discard, PN-15).
function penState(vial, protocol, now = new Date()) {
  const p = penOf(protocol) || {};
  const stock = Math.max(0, Number(p.stock) || 0);
  if (p.kind === 'single') {
    const remaining = stock;
    return { kind: 'single', capacity: null, remaining, available: remaining, stock, daysLeft: null, expired: false,
      low: remaining > 0 && (remaining === 1 || daysOfSupply(remaining, protocol) <= SUPPLY_LOW_DAYS + 1e-9),
      lastDoseInPen: false, noClosedPens: false };
  }
  const capacity = vial && Number(vial.total_doses) > 0 ? Number(vial.total_doses) : null;
  const taken = vial ? Number(vial.doses_taken) || 0 : 0;
  const remaining = capacity != null ? Math.max(0, capacity - taken) : null;
  const valid = Number(protocol && protocol.vial_valid_days) > 0 ? Number(protocol.vial_valid_days) : null;
  const daysLeft = vial && vial.mixed_on && valid ? daysUntilExpiry(vial.mixed_on, valid, now) : null;
  const expired = daysLeft != null && daysLeft <= 0;
  const available = expired ? 0 : remaining;
  const perPen = dosesPerPen(p, protocol && protocol.dose) || capacity || 0;
  const total = (available || 0) + stock * perPen;
  const started = taken > 0;
  return { kind: p.kind || null, capacity, remaining, available, stock, daysLeft, expired,
    low: started && total > 0 && (total === 1 || daysOfSupply(total, protocol) <= SUPPLY_LOW_DAYS + 1e-9),
    lastDoseInPen: started && available === 1, noClosedPens: stock === 0 };
}

function newPenVial(protocol, perPen) {
  return { user_id: protocol.user_id || null, protocol_id: protocol.id, protocol_remote_id: protocol.remote_id || null,
    mixed_on: null, water_ml: null, total_doses: perPen, doses_taken: 0, expires_on: null };
}

// PN-16: a new dose. fixed/single: a new pen of the new dose (asked: how many pens of it — P3), the old pen
// leaves use with what it had; dial: the same pen, a printed dose only. Capacity never from mg.
function changeDoseRecords(protocol, vial, { dose, newStock = 0 }) {
  const p = { ...(penOf(protocol) || {}) };
  const d = num(dose);
  if (p.kind === 'dial') {
    if (!isPrintedDose(p, d)) throw new Error('not a printed dose of this pen');
    return { retireVial: null, vial: null, protocolUpdate: { dose: String(d), pen: serialize(p) } };
  }
  if (p.catalog && Array.isArray(p.doses) && p.doses.length && !isPrintedDose(p, d)) throw new Error('not a printed dose of this pen');
  p.stock = Math.max(0, Number(newStock) || 0);
  const per = p.kind === 'single' ? null : (Number(p.perPen) > 0 ? Number(p.perPen) : (vial && Number(vial.total_doses)) || null);
  return {
    retireVial: vial ? vial.id : null,
    vial: p.kind === 'single' ? null : newPenVial(protocol, per),
    protocolUpdate: { dose: String(d), pen: serialize(p) },
  };
}

// PN-17: a dose edit never touches a pen's capacity.
function capacityAfterDoseEdit(vial) { return vial ? Number(vial.total_doses) || null : null; }

// PN-18: discard the pen in use — it leaves use with its leftover (history), the next closed pen comes in
// (stock − 1); no closed pen = no pen in use ("New pen" is offered). Never a dose row.
function discardRecords(protocol, vial) {
  const p = { ...(penOf(protocol) || {}) };
  const stock = Math.max(0, Number(p.stock) || 0);
  const per = Number(p.perPen) > 0 ? Number(p.perPen) : (vial && Number(vial.total_doses)) || null;
  if (stock > 0) p.stock = stock - 1;
  return { retireVial: vial ? vial.id : null, vial: stock > 0 ? newPenVial(protocol, per) : null, protocolUpdate: { pen: serialize(p) } };
}

// "New pen": a closed pen comes into use (stock − 1, never below 0: a pen just bought is not in the stock).
function newPenRecords(protocol, vial) {
  const p = { ...(penOf(protocol) || {}) };
  p.stock = Math.max(0, (Number(p.stock) || 0) - 1);
  const per = dosesPerPen(p, protocol.dose) || (vial && Number(vial.total_doses)) || null;
  return { retireVial: vial ? vial.id : null, vial: newPenVial(protocol, per), protocolUpdate: { pen: serialize(p) } };
}

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function addDays(key, n) { const d = parseDateOnly(key); d.setDate(d.getDate() + n); return keyOf(d); }

// PN-22/23: out of the fridge (single-dose pens). → null when none is out.
function fridgeState(p, now = new Date()) {
  const f = p && p.fridgeOut;
  if (!f || !(Number(f.count) > 0) || !f.since) return null;
  const limit = Number(f.days) > 0 ? Number(f.days) : Number(p.fridgeDays) > 0 ? Number(p.fridgeDays) : null;
  const ref = new Date(now); ref.setHours(0, 0, 0, 0);
  const daysOut = Math.round((ref - parseDateOnly(f.since)) / 86400000);
  if (!limit) return { count: Number(f.count), since: f.since, until: null, daysLeft: null, daysOut, passed: false };
  const until = addDays(f.since, limit);
  return { count: Number(f.count), since: f.since, until, daysLeft: limit - daysOut, daysOut, passed: daysOut > limit };
}
// The alert day: two days before the limit.
function fridgeAlertDate(p) {
  const s = fridgeState(p, p && p.fridgeOut ? parseDateOnly(p.fridgeOut.since) : new Date());
  return s && s.until ? addDays(s.until, -2) : null;
}

// PN-10 (founder P1): the dose steps before setup → the schedule's start (the anchor's weekday kept), the
// dose history the curve reads (lib/doseStamp: [{from:null,…},{from:ISO,…}]) and each period's count of
// scheduled doses before today. Never a dose row (lib/pastDoses: the curve estimates the period).
function stepsToPast(steps, sched, todayKey) {
  const list = (steps || []).filter((s) => s && num(s.dose) != null && parseDateOnly(s.since)).sort((a, b) => (a.since < b.since ? -1 : 1));
  const empty = { start: null, doseHistory: null, periods: [], doses: [], total: 0 };
  if (!list.length) return empty;
  const interval = Number(sched && sched.interval_days) > 0 ? Number(sched.interval_days) : 1;
  const perDay = Number(sched && sched.doses_per_day) > 0 ? Number(sched.doses_per_day) : 1;
  const anchor = parseDateOnly((sched && sched.anchor) || todayKey);
  const first = parseDateOnly(list[0].since);
  const today = parseDateOnly(todayKey);
  // the scheduled days: anchor − k·interval, from the first step's day up to before today
  const back = Math.floor((anchor - first) / 86400000 / interval);
  const startDay = new Date(anchor); startDay.setDate(startDay.getDate() - back * interval);
  const doses = [];
  for (const d = new Date(startDay); d < today; d.setDate(d.getDate() + interval)) {
    const k = keyOf(d);
    let step = list[0];
    for (const s of list) if (s.since <= k) step = s;
    for (let i = 0; i < perDay; i++) doses.push({ day: k, dose: num(step.dose), unit: step.unit || 'mg' });
  }
  const periods = list.map((s, i) => {
    const to = i + 1 < list.length ? addDays(list[i + 1].since, -1) : addDays(todayKey, -1);
    return { dose: num(s.dose), unit: s.unit || 'mg', from: s.since, to, count: doses.filter((x) => x.day >= s.since && x.day <= to).length };
  });
  const doseHistory = list.map((s, i) => ({ from: i === 0 ? null : `${s.since}T00:00:00`, dose: num(s.dose), unit: s.unit || 'mg' }));
  return { start: keyOf(startDay), doseHistory, periods, doses, total: doses.length };
}

// PN-24: turn an old ready-to-use protocol into a pen. The doses, the dose history, the start and the curve
// stay; the ml count is not copied — the pen questions give this pen's count.
function turnIntoPenRecords(protocol, vial, a) {
  const p = { kind: a.kind, catalog: a.catalog || null, name: a.name || null, doses: a.doses || null,
    perPen: a.perPen || null, perDose: a.perDose || null, stock: Math.max(0, Number(a.stock) || 0),
    fridgeDays: a.fridgeDays != null ? a.fridgeDays : null };
  const update = { type: 'pen', pen: serialize(p), concentration: null, syringe_size: null, vial_valid_days: a.validDays || null };
  if (a.kind === 'single') return { retireVial: vial ? vial.id : null, vial: null, protocolUpdate: update };
  const per = Number(a.perPen) > 0 ? Number(a.perPen) : null;
  const v = newPenVial(protocol, per);
  const remaining = Number(a.remaining);
  if (per && Number.isInteger(remaining) && remaining >= 0 && remaining <= per) v.doses_taken = per - remaining;
  v.mixed_on = a.openedOn || null;
  return { retireVial: vial ? vial.id : null, vial: v, protocolUpdate: update };
}

// PN-8: doses left in a started pen: a whole number from 0 to the printed count.
const validRemaining = (n, perPen) => Number.isInteger(n) && n >= 0 && n <= perPen;
function startedPenVial({ perPen, remaining, openedOn }) {
  return { total_doses: perPen, doses_taken: perPen - remaining, mixed_on: openedOn || null, water_ml: null, expires_on: null };
}

module.exports = {
  PEN_PATH_ENABLED, PEN_CATALOG, catalogEntry, validDaysFor, isPen, penOf, isPrintedDose, dosesPerPen,
  takesFromPen, afterTaken, penState, changeDoseRecords, capacityAfterDoseEdit, discardRecords, newPenRecords,
  fridgeState, fridgeAlertDate, stepsToPast, turnIntoPenRecords, validRemaining, startedPenVial,
};
