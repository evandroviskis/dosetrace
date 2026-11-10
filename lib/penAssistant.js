'use strict';
// CP-1 pen path inside the AI protocol assistant (docs/specs/pen-path.md PN-1…PN-11, picture
// docs/design/pen-path.html screens 1-3 and 6). Pure CommonJS, called by lib/protocolAssistant for
// draft.type === 'pen'. Every sentence is an i18n key (AP-14); every number is the person's own or a
// label fact from lib/penPath shown as a suggestion; only the doses printed on the pen are offered;
// nothing is computed from mg (never total ÷ dose, never clicks).
//
// Order (the approved picture): which pen → (device) → printed dose → doses per pen when the label
// prints none → validity after opening → this pen started? → doses left → opened when → closed pens →
// [the general schedule] → already using it? → dose steps (founder P1) → [time, confirm].
const P = require('./penPath');
const { parseDecimal, trimZeros } = require('./doseMath');
const { decimalText, formatDate, inputNumber } = require('./localeFormat');
const { localISO } = require('./localDate');

const num = (v, l) => decimalText(trimZeros(String(v)), l);
const penOfDraft = (d) => d.pen || null;
const doseNum = (d, l) => parseDecimal(d.dose, l);

function catalogOptions() {
  return [...P.PEN_CATALOG.map((e) => ({ id: `pen:pick:${e.id}`, text: e.name })), { id: 'pen:pick:other', key: 'ap_pen_opt_other' }];
}

// Copy a list entry (or a device of it) into the draft's pen.
function penFromEntry(entry, region) {
  return {
    catalog: entry.id, name: entry.name, compound: entry.compound || null, kind: entry.kind,
    doses: entry.doses ? entry.doses.slice() : null, perPen: entry.perPen || null,
    perDose: entry.perDose ? { ...entry.perDose } : null,
    validDays: P.validDaysFor(entry, region), fridgeDays: entry.fridgeDays != null ? entry.fridgeDays : null, noFridge: !!entry.noFridge,
  };
}

// The pen in use counts doses only when its count is known (a "Não sei" leaves it without a count).
function perPenFor(pen, dose) {
  if (!pen) return null;
  if (pen.kind === 'single') return 1;
  if (pen.kind === 'fixed') return pen.perPen || null;
  return P.dosesPerPen(pen, dose);
}

// The pen part still missing BEFORE the general schedule (null = done).
function penEarlyStep(s) {
  const d = s.draft, pen = penOfDraft(d), l = s.language;
  if (!pen && !d.penOther) return 'pen_pick';
  if (pen && pen.devicesOf) return 'pen_device';
  if (d.penOther && !pen) return 'pen_kind';
  if (!d.dose) return pen.catalog ? 'pen_dose' : 'dose';
  if (pen.kind !== 'single' && !pen.catalog && pen.kind === 'fixed' && !pen.perPen && !d.penPerUnknown) return 'pen_count';
  if (pen.kind === 'dial' && perPenFor(pen, doseNum(d, l)) == null && !d.penPerUnknown) return 'pen_per';
  if (pen.kind !== 'single' && !d.penValidOk) return 'pen_valid';
  if (pen.kind !== 'single' && d.penStarted == null) return 'pen_started';
  if (d.penStarted && perPenFor(pen, doseNum(d, l)) && d.penRemaining == null) return 'pen_remaining';
  if (d.penStarted && d.penOpened === undefined) return 'pen_opened';
  if (d.penStock == null) return 'pen_stock';
  return null;
}

// The pen part between the schedule and the first-dose question (founder P1: the dose steps).
function penLateStep(s) {
  const d = s.draft;
  if (d.penUsing == null) { if (d.penStarted) d.penUsing = true; else return 'pen_using'; }
  if (!d.penUsing) return null;
  if (!d.steps.length) return 'pen_since';
  if (!d.stepsDone) return d.stepPending ? 'pen_before_since' : 'pen_before';
  return null;
}

function stepsResult(s) {
  const d = s.draft;
  const list = d.steps.map((x) => ({ dose: x.dose, unit: d.doseUnit || 'mg', since: x.since }));
  const today = localISO(new Date(s.nowMs));
  return P.stepsToPast(list, { interval_days: d.intervalDays || 1, doses_per_day: d.intervalDays > 2 ? 1 : (d.dosesPerDay || 1), anchor: list.length ? list[list.length - 1].since : today }, today);
}

function question(s, step) {
  const d = s.draft, l = s.language, pen = penOfDraft(d);
  const dose = d.dose ? num(doseNum(d, l), l) : '';
  const unit = d.doseUnit || 'mg';
  switch (step) {
    case 'pen_pick': return { key: 'ap_pen_q_pick' };
    case 'pen_device': return { key: 'ap_pen_q_device', params: { name: pen.name } };
    case 'pen_kind': return { key: 'ap_pen_q_kind' };
    case 'pen_dose': return { key: pen.kind === 'dial' ? 'ap_pen_q_dose_dial' : 'ap_pen_q_dose' };
    case 'pen_count': return { key: 'ap_pen_q_count', params: { dose, unit } };
    case 'pen_per': return { key: 'ap_pen_q_per', params: { dose, unit } };
    case 'pen_valid':
      if (s.awaiting === 'pen_valid_days' || !pen.validDays) return { key: 'ap_pen_q_valid_days' };
      return { key: perPenFor(pen, doseNum(d, l)) ? 'ap_pen_valid_label' : 'ap_pen_valid_label_nocount', params: { n: String(perPenFor(pen, doseNum(d, l)) || ''), dose, unit, days: String(pen.validDays) } };
    case 'pen_started': return { key: 'ap_pen_q_started' };
    case 'pen_remaining': return { key: 'ap_pen_q_remaining' };
    case 'pen_opened': return { key: 'ap_pen_q_opened' };
    case 'pen_stock': return { key: pen.kind === 'single' ? 'ap_pen_q_stock_single' : 'ap_pen_q_stock' };
    case 'pen_using': return { key: 'ap_pen_q_using', params: { name: pen ? pen.name : d.name } };
    case 'pen_since': return { key: 'ap_pen_q_since', params: { dose, unit } };
    case 'pen_before': {
      const last = d.steps[0];
      return { key: 'ap_pen_q_before', params: { dose: num(last.dose, l), unit } };
    }
    case 'pen_before_since': return { key: 'ap_pen_q_before_since', params: { dose: num(d.stepPending, l), unit } };
    default: return null;
  }
}

function options(s, step) {
  const d = s.draft, l = s.language, pen = penOfDraft(d);
  const ints = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: `pen:int:${from + i}`, text: String(from + i) }));
  switch (step) {
    case 'pen_pick': return catalogOptions();
    case 'pen_device': return pen.devicesOf.map((x) => ({ id: `pen:device:${x.id}`, key: `ap_pen_device_${x.id}` }));
    case 'pen_kind': return [{ id: 'pen:kind:single', key: 'ap_pen_kind_single' }, { id: 'pen:kind:fixed', key: 'ap_pen_kind_fixed' }, { id: 'pen:kind:dial', key: 'ap_pen_kind_dial' }];
    case 'pen_dose': return (pen.doses || []).map((x) => ({ id: `pen:dose:${x}`, text: `${num(x, l)}\u00a0mg` }));
    case 'pen_per': return [{ id: 'pen:dontknow', key: 'ap_pen_opt_dont_know' }];
    case 'pen_count': return [];
    case 'pen_valid':
      if (s.awaiting === 'pen_valid_days' || !pen.validDays) return [{ id: 'pen:novalid', key: 'ap_pen_opt_dont_know' }];
      return [{ id: 'pen:validok', key: 'ap_pen_opt_right' }, { id: 'pen:validchange', key: 'ap_pen_opt_change_days' }];
    case 'pen_started': return [{ id: 'pen:started:no', key: 'ap_pen_opt_not_yet' }, { id: 'pen:started:yes', key: 'ap_pen_opt_started' }];
    case 'pen_remaining': { const n = perPenFor(pen, doseNum(d, l)); return n ? ints(1, Math.max(1, n - 1)) : []; }
    case 'pen_opened': return [{ id: 'pen:opened:unknown', key: 'ap_pen_opt_dont_remember' }];
    case 'pen_stock': return ints(0, 4);
    case 'pen_using': return [{ id: 'pen:using:yes', key: 'ap_opt_yes' }, { id: 'pen:using:no', key: 'ap_pen_opt_first_time' }];
    case 'pen_before': {
      const cur = d.steps[0] ? d.steps[0].dose : null;
      const other = (pen && pen.doses ? pen.doses : []).filter((x) => cur == null || x < cur);
      return [...other.map((x) => ({ id: `pen:before:${x}`, text: `${num(x, l)}\u00a0mg` })), { id: 'pen:before:no', key: 'ap_opt_no' }, { id: 'pen:before:unknown', key: 'ap_pen_opt_dont_remember' }];
    }
    default: return [];
  }
}

// A tap. → true when it changed the draft (the caller advances).
function answerOption(s, rest) {
  const d = s.draft, l = s.language;
  const [what, val] = rest;
  switch (what) {
    case 'pick': {
      if (val === 'other') { d.penOther = true; return true; }
      const e = P.PEN_CATALOG.find((x) => x.id === val);
      if (!e) return false;
      if (e.devices) { d.pen = { name: e.name, compound: e.compound, devicesOf: e.devices.map((x) => ({ id: x.id })) }; }
      else d.pen = penFromEntry(e, s.region);
      if (e.compound && !d.compoundId && !s.compoundOwn) d.compoundId = e.compound;
      if (!d.name) { d.name = e.name; d.typed = e.name; }
      return true;
    }
    case 'device': { const e = P.catalogEntry(val); if (!e) return false; d.pen = penFromEntry(e, s.region); return true; }
    case 'kind': d.pen = { catalog: null, name: d.name || null, kind: val, doses: null, perPen: null, perDose: null, validDays: null, fridgeDays: null }; return true;
    case 'dose': { if (!P.isPrintedDose(d.pen, Number(val))) return false; d.dose = inputNumber(Number(val), l); d.doseUnit = 'mg'; return true; }
    case 'dontknow': d.penPerUnknown = true; return true;
    case 'validok': d.penValidOk = true; return true;
    case 'validchange': s.awaiting = 'pen_valid_days'; return 'ask';
    case 'novalid': d.pen = { ...d.pen, validDays: null }; d.penValidOk = true; s.awaiting = null; return true;
    case 'started': d.penStarted = val === 'yes'; if (!d.penStarted) { d.penRemaining = null; d.penOpened = null; } return true;
    case 'opened': d.penOpened = 'unknown'; return true;
    case 'int': {
      const n = Number(val);
      if (s.step === 'pen_remaining') d.penRemaining = n;
      else if (s.step === 'pen_stock') d.penStock = n;
      else return false;
      return true;
    }
    case 'using': d.penUsing = val === 'yes'; return true;
    case 'before':
      if (val === 'no' || val === 'unknown') { d.stepsDone = true; d.stepsUnknown = val === 'unknown'; return true; }
      d.stepPending = Number(val); return true;
    default: return false;
  }
}

// A typed whole number for the pen's number questions (the phone reads it: never the model).
function answerNumber(s, step, n) {
  const d = s.draft, pen = d.pen;
  if (!Number.isInteger(n) || n < 0) return false;
  switch (step) {
    case 'pen_count': if (n < 1) return false; d.pen = { ...pen, perPen: n }; return true;
    case 'pen_per': if (n < 1) return false; d.pen = { ...pen, perDose: { ...(pen.perDose || {}), [String(parseDecimal(d.dose, s.language))]: n } }; return true;
    case 'pen_valid': if (n < 1 || n > 365) return false; d.pen = { ...pen, validDays: n }; d.penValidOk = true; s.awaiting = null; return true;
    case 'pen_remaining': { const max = perPenFor(pen, parseDecimal(d.dose, s.language)); if (max != null && n > max) return false; d.penRemaining = n; return true; }
    case 'pen_stock': if (n > 99) return false; d.penStock = n; return true;
    default: return false;
  }
}

// A date (wheel or a typed day read as a day offset). Never in the future.
function answerDate(s, step, iso) {
  const d = s.draft;
  const today = localISO(new Date(s.nowMs));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) || iso > today) return false;
  if (step === 'pen_opened') { d.penOpened = iso; return true; }
  if (step === 'pen_since') { d.steps = [{ dose: parseDecimal(d.dose, s.language), since: iso }]; return true; }
  if (step === 'pen_before_since') {
    const later = d.steps[0];
    if (!later || iso >= later.since) return false;
    d.steps = [{ dose: d.stepPending, since: iso }, ...d.steps]; d.stepPending = null; return true;
  }
  return false;
}

const DATE_STEPS = ['pen_opened', 'pen_since', 'pen_before_since'];
const NUMBER_STEPS = ['pen_count', 'pen_per', 'pen_valid', 'pen_remaining', 'pen_stock'];
const PEN_STEPS = ['pen_pick', 'pen_device', 'pen_kind', 'pen_dose', ...NUMBER_STEPS, 'pen_started', ...DATE_STEPS, 'pen_using', 'pen_before'];

// The review card rows of a pen (PN-11).
function reviewRows(s, add) {
  const d = s.draft, l = s.language, pen = d.pen || {};
  const dose = parseDecimal(d.dose, l);
  const per = perPenFor(pen, dose);
  add('ap_row_pen', pen.kind === 'single' ? { $t: 'ap_pen_row_single', name: pen.name || d.name } : per ? { $t: 'ap_pen_row_doses', name: pen.name || d.name, n: String(per) } : pen.name || d.name);
  add('ap_row_each', `${num(dose, l)}\u00a0${d.doseUnit || 'mg'}`);
  if (pen.kind !== 'single') {
    if (d.penStarted && d.penRemaining != null) add('ap_pen_row_left', { $t: d.penRemaining === 1 ? 'ap_pen_row_left_one' : 'ap_pen_row_left_value', n: String(d.penRemaining) });
    if (d.penStarted && d.penOpened && d.penOpened !== 'unknown') {
      const until = pen.validDays ? localISO(new Date(new Date(d.penOpened + 'T12:00:00').getTime() + pen.validDays * 86400000)) : null;
      add('ap_pen_row_opened', until ? { $t: 'ap_pen_row_opened_until', on: formatDate(d.penOpened, l, 'dayMonthAuto', new Date(s.nowMs)), until: formatDate(until, l, 'dayMonthAuto', new Date(s.nowMs)) } : formatDate(d.penOpened, l, 'dayMonthAuto', new Date(s.nowMs)));
    }
  }
  if (d.penStock != null) add(pen.kind === 'single' ? 'ap_pen_row_pens' : 'ap_pen_row_closed', String(d.penStock));
}
function stepRows(s, add) {
  const d = s.draft, l = s.language;
  if (!d.penUsing || !d.steps.length) return;
  const r = stepsResult(s);
  const now = new Date(s.nowMs);
  for (const p of r.periods) add({ $raw: `${num(p.dose, l)}\u00a0${p.unit}` }, { $t: 'ap_pen_row_step', from: formatDate(p.from, l, 'dayMonthAuto', now), to: formatDate(p.to, l, 'dayMonthAuto', now), n: String(p.count) });
  add('ap_pen_row_before_today', String(r.total));
}

// What the conversation hands to the form for a pen (the screen saves the protocol and the pen in use).
function formPatch(s) {
  const d = s.draft, l = s.language, pen = d.pen || {};
  const dose = parseDecimal(d.dose, l);
  const per = perPenFor(pen, dose);
  const data = {
    kind: pen.kind, catalog: pen.catalog || null, name: pen.name || null, doses: pen.doses || null,
    perPen: pen.kind === 'fixed' ? pen.perPen || null : null,
    perDose: pen.kind === 'dial' ? (pen.perDose || {}) : null,
    stock: d.penStock || 0, fridgeDays: pen.fridgeDays != null ? pen.fridgeDays : null, noFridge: !!pen.noFridge,
  };
  const patch = { type: 'pen', pen: JSON.stringify(data), vialValidDays: pen.kind === 'single' ? null : (pen.validDays || null) };
  if (pen.kind !== 'single') {
    patch.penVial = d.penStarted && per != null && d.penRemaining != null
      ? P.startedPenVial({ perPen: per, remaining: d.penRemaining, openedOn: d.penOpened && d.penOpened !== 'unknown' ? d.penOpened : null })
      : { total_doses: per, doses_taken: 0, mixed_on: null, water_ml: null, expires_on: null };
  }
  if (d.penUsing && d.steps.length) {
    const r = stepsResult(s);
    patch.startDate = r.start;
    if (r.doseHistory.length > 1) patch.doseHistory = JSON.stringify(r.doseHistory);
  }
  return patch;
}

module.exports = { PEN_STEPS, DATE_STEPS, NUMBER_STEPS, penEarlyStep, penLateStep, question, options, answerOption, answerNumber, answerDate, reviewRows, stepRows, formPatch, perPenFor, stepsResult };
