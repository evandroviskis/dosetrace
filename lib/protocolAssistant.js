// The AI protocol assistant's conversation, as plain data (docs/specs/ai-protocol-assistant.md,
// signed 2026-10-02). Pure CommonJS: no React, no network — the screen renders it and the
// edge function only turns the user's own words into structured values (lib/assistantSchema).
//
// The rules this file keeps (AI HARD LINE, CLAUDE.md):
//   - Every sentence on screen is app-written: messages are i18n keys + params (AP-14).
//   - Every number comes from the user (typed, tapped, or read from their label and
//     confirmed) and every calculation is the app's calculator (lib/doseMath) (AP-2).
//   - It only asks, understands and transcribes: it never suggests or questions a compound,
//     dose, water amount, syringe or schedule, never says a dose is high/low/safe (AP-3).
//     The only tap options with numbers are the user's own number divided by the count the
//     user picks ("for your numbers"), and the spacings the app's schedule can store.
//   - Asked in order, one thing at a time: compound, form, vial amount, mix (powders), dose
//     and how often, first dose (AP-5); a total is split by the user's count (AP-4, AP-22);
//     the schedule is finished with tap options and one Done creates the protocol (AP-26).
//   - Fields the user already filled in the form are never changed unless the user says so
//     (AP-10); anything it cannot map goes back to the form with the answers kept (AP-0).
const { parseDecimal, computeDraw, dosesPerVial, unitsCompatible, normalizeDoseValue, trimZeros } = require('./doseMath');
const { decimalText, inputNumber, formatDate } = require('./localeFormat');
const { matchesQuery, ALIASES } = require('./compounds');
const S = require('./syringes');
const { validateUnderstanding, normText } = require('./assistantSchema');

const DOORS = ['build', 'finish', 'dose', 'fit'];
const TITLE_KEY = { build: 'ap_title_build', finish: 'ap_title_finish', dose: 'ap_title_dose', fit: 'ap_title_fit' };
const FORM_TYPE = { powder: 'recon', ready: 'rtu', pill: 'oral' };
const DILUENT_KEY = {
  bacteriostatic_water: 'protocols_diluent_bac', sterile_water: 'protocols_diluent_sterile',
  sodium_chloride_09: 'protocols_diluent_nacl', other: 'protocols_diluent_other',
};
const COUNT_OPTIONS = { day: [1, 2, 3], week: [1, 2, 3, 4, 7], month: [1, 2, 4] };
const MAX_PER_DAY = 3; // the form schedules 1, 2 or 3 doses a day

// ── small helpers ──────────────────────────────────────────────────────────
function isoDay(now, offset) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset || 0), 12);
  const m = d.getMonth() + 1, day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}
const nowOf = (s) => new Date(s.nowMs);
const fmt4 = (n) => Number(Number(n).toPrecision(4)); // the app's split, 4 significant digits
const num = (v, l) => decimalText(trimZeros(String(v)), l);
let seq = 0;
const msg = (from, key, params, extra) => ({ id: `m${++seq}`, from, key, params: params || {}, ...(extra || {}) });

function clone(s) {
  return { ...s, draft: { ...s.draft }, filled: { ...s.filled }, messages: s.messages.slice() };
}
function app(s, key, params, extra) { s.messages.push(msg('app', key, params, extra)); }
function user(s, text, extra) { s.messages.push(msg('user', null, {}, { text: text == null ? null : String(text), ...(extra || {}) })); }

// ── the draft ──────────────────────────────────────────────────────────────
const EMPTY_DRAFT = Object.freeze({
  name: '', typed: '', compoundId: null, type: null,
  amount: null, unit: null, diluent: null, diluentOther: null, water: null, mixedOn: null, notMixed: false,
  conc: null, concUnit: null, vialMl: null, vialMlSkipped: false,
  strength: null, strengthUnit: null,
  dose: null, doseUnit: null, ambiguous: null, total: null, count: null, freq: null,
  intervalDays: null, dosesPerDay: null, startDate: null, syringeSize: 100,
});

// Which form fields count as filled by the user (AP-10). A new form arrives pre-filled
// (water 2 ml, 1 ml syringe, Today, every day): those defaults are NOT the user's answers
// unless the user touched them or walked past them (journey review A1).
// In Edit every stored field is the user's own (it came from their saved protocol): nothing
// is asked again or rewritten unless they change it here (senior review 2026-10-03, HIGH 1).
function filledFromForm(form, ctx) {
  const touched = new Set((ctx && ctx.touched) || []);
  const visited = (ctx && ctx.visitedStep) || 1;
  const ed = !!(ctx && ctx.editing);
  const str = (v) => String(v == null ? '' : v).trim();
  const f = {
    name: !!str(form.name),
    type: ed || !!str(form.name) || visited > 1 || touched.has('type'),
    amount: form.type === 'recon' && !!str(form.amount),
    water: form.type === 'recon' && (ed ? !!str(form.water) : (touched.has('water') || (!!str(form.water) && str(form.water) !== '2'))),
    diluent: form.type === 'recon' && !!str(form.diluentChoice),
    mixed: form.type === 'recon' && (ed || !!(ctx && ctx.skipVial) || visited >= 5 || touched.has('mixed')),
    conc: form.type === 'rtu' && !!str(form.concentration),
    vialMl: form.type === 'rtu' && !!str(form.vialMl),
    strength: form.type === 'oral' && !!str(form.servingStrength),
    dose: !!str(form.dose),
    schedule: ed || visited >= 4 || touched.has('schedule'),
    start: (ed && !!str(form.startDate)) || visited >= 4 || touched.has('start'),
    syringe: ed || touched.has('syringe'),
  };
  return f;
}

function draftFromForm(form, filled, ctx) {
  const d = { ...EMPTY_DRAFT };
  if (filled.name) { d.name = form.name; d.typed = form.name; d.compoundId = form.compoundId || null; }
  if (filled.type) d.type = form.type;
  if (filled.amount) { d.amount = form.amount; d.unit = form.unit || 'mg'; }
  if (filled.water) d.water = form.water;
  if (filled.diluent) { d.diluent = form.diluentChoice; d.diluentOther = form.diluentOther || null; }
  if (filled.mixed && ctx && ctx.mixedOn) d.mixedOn = ctx.mixedOn;
  if (filled.mixed && ctx && ctx.skipVial) d.mixedSkipped = true; // the user skipped the vial date
  if (filled.conc) { d.conc = form.concentration; d.concUnit = form.concentrationUnit || 'mg'; }
  if (filled.vialMl) d.vialMl = form.vialMl;
  if (filled.strength) { d.strength = form.servingStrength; d.strengthUnit = form.servingStrengthUnit || 'mg'; }
  if (filled.dose) { d.dose = form.dose; d.doseUnit = form.doseUnit || 'mg'; }
  if (filled.schedule) { d.intervalDays = form.intervalDays || 1; d.dosesPerDay = form.dosesPerDay || 1; }
  if (filled.start) d.startDate = form.startDate || null;
  d.syringeSize = form.syringeSize || 100;
  return d;
}

// ── start ──────────────────────────────────────────────────────────────────
// door: build | finish | dose | fit. form: the wizard form now (lib/protocolForm shape).
// ctx: { language, now: Date, catalog: { recon, rtu, oral: [{ key, label }] }, editing,
//        touched: [field], visitedStep, mixedOn }.
function startConversation(door, form, ctx) {
  if (!DOORS.includes(door)) throw new Error('unknown door');
  const now = (ctx && ctx.now) || new Date();
  const editing = !!(ctx && ctx.editing);
  const filled = door === 'build' ? {} : filledFromForm(form, ctx);
  const s = {
    door, editing, language: (ctx && ctx.language) || 'en', nowMs: now.getTime(),
    catalog: (ctx && ctx.catalog) || { recon: [], rtu: [], oral: [] },
    draft: door === 'build' ? { ...EMPTY_DRAFT } : draftFromForm(form, filled, ctx),
    filled, changed: {}, step: null, messages: [],
    filledConfirmed: door === 'build' || door === 'fit',
    periodConfirmed: false, fitHandled: false, compoundChoices: null, pendingLabel: null,
    outcome: null, ended: false,
  };
  if (door === 'fit' && fitNumbers(s)) return enter(s, 'fit_period'); // AP-11: explain first
  return advance(s);
}

function titleKey(s) { return TITLE_KEY[s.door]; }

// ── what is missing next (derived from the draft, so "Finish with AI" asks only gaps) ──
function scheduleKnown(d) { return d.intervalDays != null && d.dosesPerDay != null; }

function nextStep(s) {
  const d = s.draft;
  if (!s.filledConfirmed && anyFilled(s)) return 'confirm_filled';
  if (!d.name) return 'compound';
  if (!d.type) return 'form';
  if (s.compoundChoices) return 'pick_compound';
  if (d.type === 'recon') {
    if (!d.amount) return 'amount';
    if (d.notMixed) return 'not_mixed';
    if (!d.water) return d.diluent ? 'water' : 'mix';
    if (!d.mixedOn && !s.editing && !d.mixedSkipped) return 'mixed'; // Edit never creates a vial
  } else if (d.type === 'rtu') {
    if (!d.conc) return 'conc';
    if (!d.vialMl && !d.vialMlSkipped) return 'vial_ml';
  } else if (d.type === 'oral') {
    if (!d.strength) return 'strength';
  }
  if (!d.dose) {
    if (d.total) return d.count ? null : 'count';
    if (d.ambiguous) return 'period';
    return 'dose';
  }
  if (unitMismatch(d)) return 'unit_mismatch';
  if (d.type !== 'oral' && !s.fitHandled) {
    const draw = drawOf(d, s.language);
    if (draw.exceedsSyringe) return s.periodConfirmed ? 'fit_facts' : 'fit_period';
  }
  if (!scheduleKnown(d)) return d.freq ? 'spacing' : 'often';
  if (!d.startDate) return 'start';
  return 'confirm';
}

function anyFilled(s) {
  return ['name', 'amount', 'water', 'conc', 'vialMl', 'strength', 'dose'].some((k) => s.filled[k]);
}

// Enter the next missing step and ask its question (one at a time, AP-5).
function advance(s) {
  const next = nextStep(s);
  if (next == null) { // a total was split: the per-application dose is set by applyCount
    return enter(s, 'dose');
  }
  return enter(s, next);
}

function enter(s, step) {
  if (step === 'fit_facts') return enterFitFacts(s);
  if (step === 'confirm') return enterConfirm(s);
  if (step === 'fit_period' && !s.fitExplained) {
    // AP-11 / AP-22 (1): why it does not fit, with the user's own numbers, then the question.
    const f = fitNumbers(s);
    if (f) app(s, f.explainKey, f.params, { kind: 'facts' });
    s.fitExplained = true;
  }
  s.step = step;
  const q = question(s, step);
  if (q) app(s, q.key, q.params, q.kind ? { kind: q.kind } : undefined);
  return s;
}

// ── questions (app-written, AP-14) ─────────────────────────────────────────
function vialWords(s) {
  const d = s.draft, l = s.language;
  if (d.type === 'recon' && d.amount) return { amount: num(parseDecimal(d.amount, l), l), unit: d.unit || 'mg' };
  if (d.type === 'rtu' && d.conc) return { amount: num(parseDecimal(d.conc, l), l), unit: (d.concUnit || 'mg') + '/ml' };
  return null;
}

function question(s, step) {
  const d = s.draft, l = s.language;
  switch (step) {
    case 'confirm_filled': return { key: 'ap_q_filled', params: { list: filledList(s) } };
    case 'compound': return { key: 'ap_q_compound' };
    case 'form': return { key: d.name ? 'ap_q_form_named' : 'ap_q_form', params: { name: d.name } };
    case 'pick_compound': return { key: 'ap_q_pick_compound', params: { name: d.typed } };
    case 'amount': return { key: 'ap_q_amount' };
    case 'mix': return { key: 'ap_q_mix' };
    case 'water': return { key: 'ap_q_water', params: { diluent: d.diluent ? diluentWord(s) : '' } };
    case 'mixed': return { key: 'ap_q_mixed' };
    case 'not_mixed': return { key: 'ap_not_mixed', kind: 'deflect' };
    case 'conc': return { key: 'ap_q_conc' };
    case 'vial_ml': return { key: 'ap_q_vial_ml' };
    case 'strength': return { key: 'ap_q_strength' };
    case 'dose': return { key: d.type === 'oral' ? 'ap_q_dose_oral' : 'ap_q_dose' };
    case 'period': {
      const a = d.ambiguous;
      return { key: 'ap_q_period', params: { dose: a ? num(a.value, l) : '', unit: a ? a.unit : '' } };
    }
    case 'count': return { key: `ap_q_count_${d.total.period}`, params: { dose: num(d.total.value, l), unit: d.total.unit } };
    case 'often': return { key: 'ap_q_often' };
    case 'spacing': return spacingQuestion(s);
    case 'unit_mismatch': return { key: 'ap_unit_mismatch', params: { vunit: vialUnit(d), dunit: d.doseUnit } };
    case 'fit_period': return { key: 'ap_q_period_fit', params: { dose: num(parseDecimal(d.dose, l), l), unit: d.doseUnit } };
    case 'fit_facts': return null; // facts are pushed by enterFitFacts
    case 'start': return { key: 'ap_q_start' };
    case 'confirm': return null; // pushed by enterConfirm
    case 'change': return { key: 'ap_q_change' };
    case 'syringe': return { key: 'ap_q_syringe' };
    case 'review': return null;
    default: return null;
  }
}

function spacingQuestion(s) {
  const f = s.draft.freq;
  return { key: f.period === 'week' ? 'ap_q_spacing_week' : 'ap_q_spacing_month', params: { n: String(f.count) } };
}

function vialUnit(d) {
  if (d.type === 'recon') return d.unit || 'mg';
  if (d.type === 'rtu') return d.concUnit || 'mg';
  return d.strengthUnit || 'mg';
}

function unitMismatch(d) {
  if (!d.dose || !d.doseUnit) return false;
  if (d.type === 'oral') return d.strengthUnit ? !(unitsCompatible(d.strengthUnit === 'g' ? 'mg' : d.strengthUnit, d.doseUnit === 'g' ? 'mg' : d.doseUnit)) : false;
  if (d.doseUnit === 'g') return true; // grams are for pills; a vial dose is mg, mcg or IU
  return !unitsCompatible(vialUnit(d), d.doseUnit);
}

function diluentWord(s) {
  const d = s.draft;
  if (d.diluent === 'other') return d.diluentOther || '';
  return d.diluent ? { $t: DILUENT_KEY[d.diluent], $lc: s.language !== 'de' } : '';
}

// ── tap options for the current step (the UI renders them as chips) ────────
// Each option: { id, key, params } (the label is app-written) — or { id, text } for the
// user's own words (a compound they typed).
function options(s) {
  const d = s.draft, l = s.language, step = s.step;
  if (s.awaiting || s.ended) return []; // "Other": the user types it
  const handback = { id: 'handback', key: 'ap_opt_form' };
  switch (step) {
    case 'confirm_filled': return [{ id: 'yes', key: 'ap_opt_yes' }, { id: 'change', key: 'ap_opt_change' }];
    case 'label_confirm': return labelOptions();
    case 'form': return [
      { id: 'form:powder', key: 'ap_opt_powder' }, { id: 'form:ready', key: 'ap_opt_ready' }, { id: 'form:pill', key: 'ap_opt_pill' }];
    case 'pick_compound': return [
      ...s.compoundChoices.map((c) => ({ id: `pick:${c.key}`, text: c.label })),
      { id: 'pick:own', key: 'ap_opt_keep_name', params: { name: d.typed } }];
    case 'mix': return [
      { id: 'dil:bacteriostatic_water', key: 'protocols_diluent_bac' }, { id: 'dil:sterile_water', key: 'protocols_diluent_sterile' },
      { id: 'dil:sodium_chloride_09', key: 'protocols_diluent_nacl' }, { id: 'notmixed', key: 'ap_opt_not_mixed' }];
    case 'not_mixed': return [{ id: 'knownow', key: 'ap_opt_know_now' }, handback];
    case 'mixed': return [{ id: 'day:0', key: 'ap_opt_today' }, { id: 'day:-1', key: 'ap_opt_yesterday' }, { id: 'pickdate', key: 'ap_opt_pick_date' }];
    case 'vial_ml': return [{ id: 'skipml', key: 'ap_opt_dont_know' }];
    case 'period':
    case 'fit_period': return [
      { id: 'basis:each', key: d.type === 'oral' ? 'ap_opt_per_dose' : 'ap_opt_per_injection' }, { id: 'per:day', key: 'ap_opt_per_day' },
      { id: 'per:week', key: 'ap_opt_per_week' }, { id: 'per:month', key: 'ap_opt_per_month' }];
    case 'count': return [
      ...COUNT_OPTIONS[d.total.period].map((n) => ({ id: `count:${n}`, key: 'ap_opt_count', params: { n: String(n), each: splitText(s, n) } })),
      ...(d.total.period === 'day' ? [] : [{ id: 'count:other', key: 'ap_opt_other' }])];
    case 'often': return [
      { id: 'often:d1', key: 'ap_opt_every_day' }, { id: 'often:d2', key: 'ap_opt_twice_day' },
      { id: 'often:w1', key: 'ap_opt_once_week' }, { id: 'often:w2', key: 'ap_opt_twice_week' }, { id: 'often:other', key: 'ap_opt_other' }];
    case 'spacing': return [
      ...spacingOptions(d.freq).map((o) => ({ id: `int:${o.interval}`, key: o.key, params: o.params })),
      { id: 'spacing:other', key: 'ap_opt_other_spacing' }];
    case 'unit_mismatch': return [{ id: 'redo:dose', key: 'ap_opt_change_dose' }, handback];
    case 'fit_facts': {
      // The user says which syringe they use, from the whole list (AP-11; regulatory review
      // 2026-10-03 B2: never the sizes pre-filtered to the ones that "work").
      const out = [];
      if (d.type === 'rtu') out.push({ id: 'redo:syringe', key: 'ap_opt_pick_syringe' });
      out.push({ id: 'change', key: 'ap_opt_other_numbers' }, handback);
      return out;
    }
    case 'start': return [{ id: 'start:0', key: 'ap_opt_today' }, { id: 'start:1', key: 'ap_opt_tomorrow' }, { id: 'startdate', key: 'ap_opt_pick_date' }];
    case 'confirm': return [
      ...(s.editing ? [{ id: 'fill', key: 'ap_opt_fill', primary: true }] : [{ id: 'done', key: 'ap_opt_done', primary: true }]),
      { id: 'review', key: 'ap_opt_review' }, { id: 'change', key: 'ap_opt_change' }];
    case 'review': return [
      { id: 'change', key: 'ap_opt_change' }, { id: 'fill', key: 'ap_opt_fill', primary: !!s.editing },
      ...(s.editing ? [] : [{ id: 'done', key: 'ap_opt_save', primary: true }])];
    case 'change': return changeOptions(s);
    case 'syringe': return S.syringeGroups(d.type).flatMap((g) => g.sizes).map((size) => ({ id: `syr:${size}`, text: S.sizeLabel(size, l) }));
    default: return [];
  }
}

// Which steps take typed text (and a label photo) — the rest are taps only.
function inputFor(s) {
  const step = s.step;
  const text = ['compound', 'form', 'amount', 'mix', 'water', 'mixed', 'conc', 'vial_ml', 'strength', 'dose', 'period', 'fit_period', 'count', 'often', 'spacing', 'start'].includes(step);
  const photo = ['compound', 'amount', 'conc'].includes(step);
  return { text, photo };
}

function changeOptions(s) {
  const d = s.draft;
  const o = [{ id: 'redo:compound', key: 'ap_chg_compound' }, { id: 'redo:form', key: 'ap_chg_form' }];
  if (d.type === 'recon') o.push({ id: 'redo:amount', key: 'ap_chg_vial' }, { id: 'redo:mix', key: 'ap_chg_mix' }, { id: 'redo:mixed', key: 'ap_chg_mixed' });
  if (d.type === 'rtu') o.push({ id: 'redo:conc', key: 'ap_chg_vial' });
  if (d.type === 'oral') o.push({ id: 'redo:strength', key: 'ap_chg_strength' });
  o.push({ id: 'redo:dose', key: 'ap_chg_dose' }, { id: 'redo:often', key: 'ap_chg_often' }, { id: 'redo:start', key: 'ap_chg_start' });
  if (d.type && d.type !== 'oral') o.push({ id: 'redo:syringe', key: 'ap_chg_syringe' });
  return o;
}

// ── spacing (AP-26): only what the app's schedule can store, stated honestly ──
// A period of P days with N applications: the "every k days" spacings closest to P / N.
// When it is not exact, the option says how many times that really is (journey review B3/A9:
// "every 2 days" is 3 or 4 times a week, never restated as "3 times a week").
function spacingOptions(freq) {
  if (!freq) return [];
  const n = freq.count;
  const out = [];
  const add = (k) => { if (k >= 1 && !out.includes(k)) out.push(k); };
  if (freq.period === 'week') { add(Math.floor(7 / n)); add(Math.ceil(7 / n)); }
  else { if (28 % n === 0) add(28 / n); add(Math.floor(30 / n)); add(Math.ceil(30 / n)); }
  return out.sort((a, b) => a - b).map((k) => {
    const window = freq.period === 'week' ? 7 : 30;
    const lo = Math.floor(window / k), hi = Math.ceil(window / k);
    const exact = lo === hi && lo === n;
    const base = k === 1 ? 'ap_opt_int_daily' : k === 7 ? 'ap_opt_int_weekly' : 'ap_opt_int_every';
    if (exact) return { interval: k, key: base, params: { n: String(k) } };
    const rangeKey = `ap_range_${freq.period}${lo === hi ? '_one' : ''}`;
    return { interval: k, key: 'ap_opt_int_with_range', params: { base: { $t: base, n: String(k) }, range: { $t: rangeKey, lo: String(lo), hi: String(hi) } } };
  });
}

// A total split by the user's count: "120 mg each". The app divides the user's number.
function splitText(s, n) {
  const d = s.draft, l = s.language;
  return `${num(fmt4(d.total.value / n), l)} ${d.total.unit}`;
}

// ── the calculator (the app's existing code, AP-2) ─────────────────────────
function drawOf(d, language) {
  return computeDraw({
    type: d.type, amount: d.amount, water: d.water, dose: d.dose, doseUnit: d.doseUnit, unit: d.unit,
    concentration: d.conc, concentrationUnit: d.concUnit, syringeSize: d.syringeSize, language,
  });
}

// The doesn't-fit explanation with the user's numbers (AP-11).
function fitNumbers(s) {
  const d = s.draft, l = s.language;
  const draw = drawOf(d, l);
  if (!draw.rawML) return null;
  const dose = num(parseDecimal(d.dose, l), l);
  const holds = num(S.syringeMl(d.syringeSize), l);
  const ml = num(Math.round(draw.rawML * 100) / 100, l);
  if (d.type === 'recon') {
    const amt = parseDecimal(d.amount, l), water = parseDecimal(d.water, l);
    const perMl = normalizeDoseValue(String(amt / water), d.doseUnit, d.unit); // in the dose's unit
    return {
      explainKey: 'ap_fit_explain_powder',
      params: { amount: num(amt, l), unit: d.unit, water: num(water, l), perml: num(fmt4(perMl), l), dunit: d.doseUnit, dose, ml, holds },
      ml,
    };
  }
  const conc = parseDecimal(d.conc, l);
  return {
    explainKey: 'ap_fit_explain_ready',
    params: { conc: num(conc, l), unit: d.concUnit || 'mg', dose, dunit: d.doseUnit, ml, holds },
    ml,
  };
}

function enterFitFacts(s) {
  const d = s.draft;
  const f = fitNumbers(s);
  s.step = 'fit_facts';
  if (!f) return advance(s);
  // AP-11: the "why" with the user's numbers comes first when it was not shown yet (the
  // per-injection answer can come before the doesn't-fit moment).
  if (!s.fitExplained) { app(s, f.explainKey, f.params, { kind: 'facts' }); s.fitExplained = true; }
  app(s, 'ap_fit_fact_ml', { dose: f.params.dose, unit: d.doseUnit, ml: f.ml, holds: f.params.holds }, { kind: 'facts' });
  if (d.type === 'recon') app(s, 'ap_fit_fact_powder', {}, { kind: 'facts' });
  else app(s, 'ap_fit_fact_ready', {}, { kind: 'facts' });
  app(s, 'ap_fit_fact_who', {}, { kind: 'facts' });
  return s;
}

// ── the plan in the user's numbers (AP-8 restatement, AP-26 summary) ───────
function howOften(d) {
  const k = d.intervalDays, p = d.dosesPerDay || 1;
  if (k === 1 && p === 1) return { $t: 'ap_how_daily' };
  if (k === 1) return { $t: 'ap_how_x_day', n: String(p) };
  if (k === 7 && p === 1) return { $t: 'ap_how_weekly' };
  if (p > 1) return { $t: 'ap_how_x_every', n: String(p), d: String(k) };
  return { $t: 'ap_how_every', n: String(k) };
}

function startWords(s) {
  const d = s.draft, now = nowOf(s);
  if (d.startDate === isoDay(now, 0)) return { $t: 'ap_when_today' };
  if (d.startDate === isoDay(now, 1)) return { $t: 'ap_when_tomorrow' };
  return formatDate(d.startDate, s.language, 'dayMonthAuto', now);
}

function planFacts(s) {
  const d = s.draft, l = s.language;
  const dose = parseDecimal(d.dose, l);
  const facts = [];
  const k = d.intervalDays, p = d.dosesPerDay || 1;
  const window = 28 % k === 0 ? 28 : (30 % k === 0 ? 30 : null);
  if (window && dose > 0) {
    const total = fmt4(dose * p * (window / k));
    facts.push({ key: window === 28 ? 'ap_fact_total_4w' : 'ap_fact_total_30d', params: { dose: num(dose, l), unit: d.doseUnit, how: howOften(d), total: num(total, l) } });
  }
  let doses = null, vialLabel = null;
  if (d.type === 'recon') { doses = dosesPerVial({ amount: d.amount, unit: d.unit, dose: d.dose, doseUnit: d.doseUnit, language: l }); vialLabel = `${num(parseDecimal(d.amount, l), l)} ${d.unit}`; }
  if (d.type === 'rtu' && d.vialMl) {
    const amt = parseDecimal(d.conc, l) * parseDecimal(d.vialMl, l);
    doses = dosesPerVial({ amount: amt, unit: d.concUnit, dose: d.dose, doseUnit: d.doseUnit, language: l });
    vialLabel = `${num(parseDecimal(d.vialMl, l), l)} ml`;
  }
  if (doses) facts.push({ key: doses === 1 ? 'ap_fact_vial_one' : 'ap_fact_vial', params: { vial: vialLabel, n: String(doses), days: String(Math.round((doses * k) / p)) } });
  if (d.type !== 'oral') {
    const draw = drawOf(d, l);
    if (draw.rawML) {
      const r = S.drawReading(draw, d.syringeSize);
      facts.push(r.ml
        ? { key: 'ap_fact_draw_ml', params: { ml: num(r.value, l) } }
        : { key: 'ap_fact_draw', params: { units: decimalText(r.value, l), ml: num(draw.drawML, l) } });
      if (S.smallDraw(draw.drawUnits, d.syringeSize)) facts.push({ key: 'protocols_small_draw', params: { u: decimalText(draw.drawUnits, l) } });
    }
  }
  return facts;
}

function enterConfirm(s) {
  const d = s.draft, l = s.language;
  s.step = 'confirm';
  app(s, 'ap_summary', { dose: num(parseDecimal(d.dose, l), l), unit: d.doseUnit, how: howOften(d), when: startWords(s) }, { kind: 'summary' });
  for (const f of planFacts(s)) app(s, f.key, f.params, { kind: 'facts' });
  app(s, 'ap_q_right');
  return s;
}

// The review card (AP-9): every field, the calculated draw and how long the vial lasts.
function reviewRows(s) {
  const d = s.draft, l = s.language;
  const rows = [];
  const add = (key, value) => { if (value != null && value !== '') rows.push({ key, value }); };
  add('ap_row_compound', d.name);
  add('ap_row_form', { $t: d.type === 'recon' ? 'ap_opt_powder' : d.type === 'rtu' ? 'ap_opt_ready' : 'ap_opt_pill' });
  if (d.type === 'recon') {
    add('ap_row_vial', `${num(parseDecimal(d.amount, l), l)} ${d.unit}`);
    add('ap_row_mixed_with', d.diluent ? [`${num(parseDecimal(d.water, l), l)} ml`, diluentWord(s)] : `${num(parseDecimal(d.water, l), l)} ml`);
    add('ap_row_mixed_on', formatDate(d.mixedOn, l, 'dayMonthAuto', nowOf(s)));
  }
  if (d.type === 'rtu') {
    add('ap_row_strength', `${num(parseDecimal(d.conc, l), l)} ${d.concUnit}/ml`);
    if (d.vialMl) add('ap_row_vial_ml', `${num(parseDecimal(d.vialMl, l), l)} ml`);
  }
  if (d.type === 'oral') add('ap_row_per_pill', `${num(parseDecimal(d.strength, l), l)} ${d.strengthUnit}`);
  add('ap_row_each', `${num(parseDecimal(d.dose, l), l)} ${d.doseUnit}`);
  add('ap_row_how', howOften(d));
  add('ap_row_first', startWords(s));
  if (d.type !== 'oral') {
    add('ap_row_syringe', S.sizeLabel(d.syringeSize, l));
    const draw = drawOf(d, l);
    if (draw.rawML) {
      const r = S.drawReading(draw, d.syringeSize);
      add('ap_row_draw', r.ml ? `${num(r.value, l)} ml` : `${decimalText(r.value, l)} u · ${num(draw.drawML, l)} ml`);
    }
    for (const f of planFacts(s)) if (f.key === 'ap_fact_vial' || f.key === 'ap_fact_vial_one') add('ap_row_lasts', { $t: f.key === 'ap_fact_vial_one' ? 'ap_row_lasts_one' : 'ap_row_lasts_value', n: f.params.n, days: f.params.days });
  }
  return rows;
}

function filledList(s) {
  const d = s.draft, l = s.language, parts = [];
  if (s.filled.name) parts.push(d.name);
  if (s.filled.amount) parts.push({ $t: 'ap_part_vial', amount: num(parseDecimal(d.amount, l), l), unit: d.unit });
  if (s.filled.water) parts.push({ $t: 'ap_part_water', water: num(parseDecimal(d.water, l), l) });
  if (s.filled.conc) parts.push({ $t: 'ap_part_conc', conc: num(parseDecimal(d.conc, l), l), unit: d.concUnit });
  if (s.filled.vialMl) parts.push({ $t: 'ap_part_vial_ml', ml: num(parseDecimal(d.vialMl, l), l) });
  if (s.filled.strength) parts.push({ $t: 'ap_part_strength', amount: num(parseDecimal(d.strength, l), l), unit: d.strengthUnit });
  if (s.filled.dose) parts.push({ $t: 'ap_part_dose', dose: num(parseDecimal(d.dose, l), l), unit: d.doseUnit });
  if (s.filled.schedule) parts.push(howOften(d));
  return { $list: parts };
}

// ── compound resolution (AP-6): the user's name, matched to the list or kept as typed ──
function resolveCompound(s) {
  const d = s.draft;
  if (!d.type || d.compoundId || !d.typed || s.compoundOwn) return;
  const list = (s.catalog && s.catalog[d.type]) || [];
  const q = normText(d.typed);
  const exact = list.filter((c) => normText(c.label) === q || (ALIASES[c.key] || []).some((a) => normText(a) === q));
  if (exact.length === 1) { d.compoundId = exact[0].key; d.name = exact[0].label; return; }
  const partial = list.filter((c) => matchesQuery(d.typed, c.key, c.label));
  if (partial.length >= 1 && partial.length <= 4) { s.compoundChoices = partial.map((c) => ({ key: c.key, label: c.label })); return; }
  d.compoundId = null; d.name = d.typed; // the user's own name (a blend, a new compound…)
}

// ── answers ────────────────────────────────────────────────────────────────
// Tap an option (always local, never the model).
function answerOption(state, id, extra) {
  const s = clone(state);
  const d = s.draft, l = s.language;
  const opt = options(state).find((o) => o.id === id);
  if (!opt) return state;
  if (state.step === 'label_confirm') return answerLabel(state, id === 'label:yes');
  if (opt) user(s, opt.text != null ? opt.text : null, opt.text != null ? {} : { key: opt.key, params: opt.params });
  const [kind, val] = String(id).split(':');
  switch (kind) {
    case 'yes': s.filledConfirmed = true; return advance(s);
    case 'change': s.filledConfirmed = true; return enter(s, 'change');
    case 'form': d.type = FORM_TYPE[val]; s.changed.type = true; resolveCompound(s); return advance(s);
    case 'pick':
      if (val === 'own') { s.compoundOwn = true; d.compoundId = null; d.name = d.typed; }
      else { const c = s.compoundChoices.find((x) => x.key === val); if (c) { d.compoundId = c.key; d.name = c.label; } }
      s.compoundChoices = null; return advance(s);
    case 'dil': d.diluent = val; return advance(s);
    case 'notmixed': d.notMixed = true; return advance(s);
    case 'knownow': d.notMixed = false; return enter(s, 'mix');
    case 'day': d.mixedOn = isoDay(nowOf(s), Number(val)); return advance(s);
    case 'skipml': d.vialMlSkipped = true; return advance(s);
    case 'basis': // per injection (period / fit_period)
      if (d.ambiguous) { d.dose = d.ambiguous.text; d.doseUnit = d.ambiguous.unit; d.ambiguous = null; }
      s.periodConfirmed = true;
      if (state.step === 'fit_period') return enterFitFacts(s);
      return advance(s);
    case 'per': return applyPeriod(s, val);
    case 'count':
      if (val === 'other') { s.step = 'count'; s.awaiting = 'count_other'; app(s, 'ap_q_count_other'); return s; }
      return applyCount(s, Number(val));
    case 'often': {
      const map = { d1: ['day', 1], d2: ['day', 2], w1: ['week', 1], w2: ['week', 2] };
      if (val === 'other') { s.awaiting = 'often_other'; app(s, 'ap_q_often_other'); return s; }
      return applyFreq(s, map[val][0], map[val][1]);
    }
    case 'int': return applyInterval(s, Number(val));
    case 'spacing': s.awaiting = 'spacing_other'; app(s, 'ap_q_spacing_other'); return s;
    case 'start': d.startDate = isoDay(nowOf(s), Number(val)); s.changed.start = true; return advance(s);
    case 'syr': d.syringeSize = Number(val); s.fitHandled = state.step === 'fit_facts' ? true : s.fitHandled; s.changed.syringe = true; return advance(s);
    case 'redo': return redo(s, val);
    case 'review': s.step = 'review'; app(s, 'ap_review_title', {}, { kind: 'review', rows: reviewRows(s) }); return s;
    case 'done': s.outcome = { kind: 'save' }; s.ended = true; return s;
    case 'fill': s.outcome = { kind: 'fill' }; s.ended = true; return s;
    case 'handback': s.outcome = { kind: 'handback' }; s.ended = true; return s;
    default: return state;
  }
}

// A date picked on the wheel (first dose, or when the vial was mixed). `iso` = YYYY-MM-DD.
function answerDate(state, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return state;
  const s = clone(state);
  const now = nowOf(s);
  user(s, formatDate(iso, s.language, 'dayMonthAuto', now));
  if (state.step === 'mixed') {
    if (iso > isoDay(now, 0)) { app(s, 'ap_mixed_future'); return enter(s, 'mixed'); }
    if (iso < isoDay(now, -365)) { app(s, 'ap_mixed_old'); return enter(s, 'mixed'); }
    s.draft.mixedOn = iso;
  } else if (state.step === 'start') { s.draft.startDate = iso; s.changed.start = true; }
  else return state;
  return advance(s);
}

function applyPeriod(s, period) {
  const d = s.draft, l = s.language;
  // The amount the user gave is a total for that period (AP-4): the app will divide it.
  let value, unit;
  if (d.ambiguous) { value = d.ambiguous.value; unit = d.ambiguous.unit; d.ambiguous = null; }
  else { value = parseDecimal(d.dose, l); unit = d.doseUnit; }
  d.total = { value, unit, period };
  d.dose = null; d.count = null; d.freq = null; d.intervalDays = null; d.dosesPerDay = null;
  s.periodConfirmed = true;
  s.fitHandled = false; s.fitExplained = false;
  return enter(s, 'count');
}

function applyCount(s, n) {
  const d = s.draft, l = s.language;
  if (!(Number.isInteger(n) && n >= 1 && n <= 60) || !d.total) { app(s, 'ap_unclear'); return enter(s, s.step); }
  if (d.total.period === 'day' && n > MAX_PER_DAY) { app(s, 'ap_day_max'); return enter(s, 'count'); }
  d.count = n;
  const each = fmt4(d.total.value / n);
  d.dose = inputNumber(each, l); d.doseUnit = d.total.unit;
  // "For your numbers" (AP-22 step 3): the user's number ÷ the user's count, and its draw.
  const params = { total: num(d.total.value, l), unit: d.total.unit, period: { $t: `ap_period_${d.total.period}` }, n: String(n), each: num(each, l) };
  if (d.type !== 'oral') {
    const draw = drawOf(d, l);
    if (draw.rawML) {
      const r = S.drawReading(draw, d.syringeSize);
      params.draw = r.ml ? { $t: 'ap_draw_ml', ml: num(r.value, l) } : { $t: 'ap_draw_units', units: decimalText(r.value, l) };
    }
  }
  app(s, params.draw ? 'ap_split_result_draw' : 'ap_split_result', params, { kind: 'facts' });
  s.awaiting = null;
  return applyFreq(s, d.total.period, n, true);
}

// How often, as a count in a period: a day count is doses a day; a week count that
// divides 7 is exact; anything else asks which storable spacing (AP-26).
function applyFreq(s, period, n, fromSplit) {
  const d = s.draft;
  s.changed.schedule = true;
  if (period === 'day') {
    if (n > MAX_PER_DAY) { app(s, 'ap_day_max'); return enter(s, 'often'); }
    d.intervalDays = 1; d.dosesPerDay = n; d.freq = null; return advance(s);
  }
  if (period === 'week' && 7 % n === 0) { d.intervalDays = 7 / n; d.dosesPerDay = 1; d.freq = null; return advance(s); }
  d.freq = { period, count: n }; d.intervalDays = null; d.dosesPerDay = null;
  return advance(s);
}

function applyInterval(s, k) {
  const d = s.draft;
  if (!(Number.isInteger(k) && k >= 1 && k <= 365)) { app(s, 'ap_unclear'); return enter(s, s.step); }
  d.intervalDays = k; d.dosesPerDay = 1; d.freq = null; s.awaiting = null; s.changed.schedule = true;
  return advance(s);
}

// "Change something": clear that part (and what depends on it) and ask again.
function redo(s, what) {
  const d = s.draft;
  s.fitHandled = false; s.fitExplained = false;
  const clear = {
    compound: () => { d.name = ''; d.typed = ''; d.compoundId = null; s.compoundOwn = false; s.compoundChoices = null; s.changed.name = true; },
    form: () => { d.type = null; d.compoundId = null; d.name = d.typed || d.name; s.compoundOwn = false; s.changed.type = true; },
    amount: () => { d.amount = null; d.unit = null; s.changed.amount = true; },
    mix: () => { d.water = null; d.diluent = null; d.diluentOther = null; d.notMixed = false; s.changed.water = true; },
    mixed: () => { d.mixedOn = null; s.changed.mixed = true; },
    conc: () => { d.conc = null; d.concUnit = null; d.vialMl = null; d.vialMlSkipped = false; s.changed.conc = true; },
    strength: () => { d.strength = null; d.strengthUnit = null; s.changed.strength = true; },
    dose: () => { d.dose = null; d.doseUnit = null; d.total = null; d.count = null; d.ambiguous = null; s.periodConfirmed = false; s.changed.dose = true; },
    often: () => { d.intervalDays = null; d.dosesPerDay = null; d.freq = null; s.changed.schedule = true; },
    start: () => { d.startDate = null; s.changed.start = true; },
    syringe: () => null,
  };
  if (!clear[what]) return s;
  clear[what]();
  if (what === 'syringe') return enter(s, 'syringe');
  if (what === 'form') resolveCompound(s);
  return advance(s);
}

// A typed answer, after it was understood (the model through the edge function, or the
// local reader for plain numbers) — `raw` is validated HERE again (lib/assistantSchema),
// so nothing outside the schema is ever used or shown.
function answerText(state, text, raw) {
  const s = clone(state);
  const d = s.draft, l = s.language;
  const typed = String(text || '').trim();
  if (!typed) return state;
  user(s, typed);
  const step = s.awaiting ? ({ count_other: 'count', often_other: 'often', spacing_other: 'spacing' })[s.awaiting] : s.step;
  // A question about safety or "is that ok?" is advice even when a number came with it: the
  // app deflects and asks again, and takes nothing (regulatory review 2026-10-03 S5).
  const r = adviceQuestion(typed) ? { intent: 'advice' } : validateUnderstanding(step, raw, typed, l);
  if (r.intent === 'advice') { app(s, 'ap_deflect', {}, { kind: 'deflect' }); return reask(s); }
  if (r.intent === 'manual') { s.outcome = { kind: 'handback' }; s.ended = true; return s; }
  if (r.intent !== 'answer') { app(s, 'ap_unclear'); return reask(s); }

  switch (step) {
    case 'compound':
    case 'form': {
      if (r.compound && !d.name) { d.typed = r.compound; d.name = r.compound; s.changed.name = true; }
      if (r.form) { d.type = FORM_TYPE[r.form]; s.changed.type = true; }
      if (step === 'form' && !r.form) { app(s, 'ap_unclear'); return reask(s); }
      resolveCompound(s);
      return advance(s);
    }
    case 'amount':
      if (r.amount) { d.amount = inputNumber(r.amount.value, l); d.unit = r.amount.unit; s.changed.amount = true; }
      if (r.water) { d.water = inputNumber(r.water.value, l); s.changed.water = true; }
      if (r.diluent) d.diluent = r.diluent;
      if (!r.amount) { app(s, 'ap_need_unit'); return reask(s); }
      return advance(s);
    case 'mix':
    case 'water':
      if (r.not_mixed) { d.notMixed = true; return advance(s); }
      if (r.diluent) d.diluent = r.diluent;
      if (r.water) { d.water = inputNumber(r.water.value, l); s.changed.water = true; }
      return advance(s);
    case 'mixed':
      if (r.day_offset == null || r.day_offset > 0) { app(s, r.day_offset > 0 ? 'ap_mixed_future' : 'ap_unclear'); return reask(s); }
      if (r.day_offset < -365) { app(s, 'ap_mixed_old'); return reask(s); } // the form keeps month and day only
      d.mixedOn = isoDay(nowOf(s), r.day_offset); s.changed.mixed = true;
      return advance(s);
    case 'conc':
      if (!r.conc) { app(s, 'ap_need_unit'); return reask(s); }
      d.conc = inputNumber(r.conc.value, l); d.concUnit = r.conc.unit; s.changed.conc = true;
      if (r.vial_ml) d.vialMl = inputNumber(r.vial_ml.value, l);
      return advance(s);
    case 'vial_ml':
      d.vialMl = inputNumber(r.vial_ml.value, l); s.changed.vialMl = true;
      return advance(s);
    case 'strength':
      if (!r.strength) { app(s, 'ap_need_unit'); return reask(s); }
      d.strength = inputNumber(r.strength.value, l); d.strengthUnit = r.strength.unit; s.changed.strength = true;
      return advance(s);
    case 'dose': return applyDose(s, r);
    case 'period':
    case 'fit_period':
      if (r.basis === 'each') return answerOptionInner(s, 'basis:each', step);
      if (r.period) return applyPeriod(s, r.period);
      app(s, 'ap_unclear'); return reask(s);
    case 'count': s.awaiting = null; return applyCount(s, r.count);
    case 'often':
      s.awaiting = null;
      if (r.interval_days) return applyInterval(s, r.interval_days);
      if (r.period && r.count) return applyFreq(s, r.period, r.count);
      if (r.period) return applyFreq(s, r.period, 1);
      app(s, 'ap_unclear'); return reask(s);
    case 'spacing': s.awaiting = null; return applyInterval(s, r.interval_days);
    case 'start':
      d.startDate = isoDay(nowOf(s), r.day_offset); s.changed.start = true;
      return advance(s);
    default: return state;
  }
}

// "…is that ok?", "é seguro?", "¿está bien?", "c'est trop ?", "ist das zu viel?", "va bene?":
// a question mark with a judgement word in any of the 6 languages. Words, not the model.
const ADVICE_WORDS = new Set(['ok', 'okay', 'safe', 'should', 'right', 'normal', 'good', 'bad', 'enough', 'recommend', 'recommended',
  'seguro', 'segura', 'devo', 'deveria', 'demais', 'certo', 'bom', 'boa', 'ruim', 'suficiente', 'recomenda', 'recomendado', 'recomendável',
  'debo', 'debería', 'demasiado', 'bien', 'bueno', 'malo', 'recomiendas', 'recomendable',
  'sûr', 'sure', 'dois', 'devrais', 'trop', 'bon', 'mauvais', 'assez', 'recommandé',
  'sicher', 'soll', 'sollte', 'richtig', 'gut', 'schlecht', 'genug', 'empfohlen',
  'sicuro', 'sicura', 'dovrei', 'troppo', 'bene', 'giusto', 'normale', 'buono', 'cattivo', 'abbastanza', 'consigliato', 'consigli']);
const ADVICE_PHRASES = ['too much', 'too little', 'too high', 'too low', 'zu viel', 'zu wenig', 'zu hoch', 'zu niedrig', 'muito alto', 'muito baixo'];
function adviceQuestion(text) {
  const t = String(text || '').toLowerCase();
  if (!/[?¿]/.test(t)) return false;
  if (ADVICE_PHRASES.some((p) => t.includes(p))) return true;
  return t.split(/[^\p{L}]+/u).some((w) => ADVICE_WORDS.has(w));
}

function answerOptionInner(s, id, step) {
  const d = s.draft;
  if (d.ambiguous) { d.dose = d.ambiguous.text; d.doseUnit = d.ambiguous.unit; d.ambiguous = null; }
  s.periodConfirmed = true;
  if (step === 'fit_period') return enterFitFacts(s);
  return advance(s);
}

function applyDose(s, r) {
  const d = s.draft, l = s.language;
  if (!r.dose) { app(s, 'ap_need_unit'); return reask(s); }
  s.changed.dose = true; s.fitExplained = false; s.fitHandled = false;
  d.total = null; d.count = null; d.ambiguous = null; d.freq = null;
  const value = r.dose.value, unit = r.dose.unit;
  if (r.basis === 'total' && r.period) {
    d.dose = null; d.total = { value, unit, period: r.period };
    s.periodConfirmed = true;
    if (r.count) return applyCount(s, r.count);
    return enter(s, 'count');
  }
  if (r.basis === 'each' || r.interval_days || (r.period && r.count)) {
    d.dose = inputNumber(value, l); d.doseUnit = unit;
    if (r.interval_days) { d.intervalDays = r.interval_days; d.dosesPerDay = 1; s.changed.schedule = true; return advance(s); }
    if (r.period && r.count) return applyFreq(s, r.period, r.count);
    return advance(s);
  }
  // An amount with no spread: one neutral question (AP-4).
  d.ambiguous = { value, text: inputNumber(value, l), unit };
  d.dose = null;
  return enter(s, 'period');
}

function reask(s) {
  const step = s.step;
  if (s.awaiting) { app(s, ({ count_other: 'ap_q_count_other', often_other: 'ap_q_often_other', spacing_other: 'ap_q_spacing_other' })[s.awaiting]); return s; }
  if (step === 'fit_period') { const q = question(s, step); app(s, q.key, q.params); return s; }
  return enter(s, step);
}

// ── the label photo (AP-7): read with the vial-scan path, used only after "Yes" ──
function labelRead(state, v) {
  const s = clone(state);
  const l = s.language;
  const parts = [];
  const name = v && typeof v.compound_name === 'string' ? v.compound_name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (name) parts.push(name);
  const amount = Number(v && v.amount), conc = Number(v && v.concentration), vol = Number(v && v.volume_ml);
  const unitOk = (u) => ['mg', 'mcg', 'IU'].find((x) => x.toLowerCase() === String(u || '').trim().toLowerCase()) || null;
  const concUnit = (() => { const [m, den] = String((v && v.concentration_unit) || '').split('/'); return den != null && /^\s*m?l\s*$/i.test(den) ? unitOk(m) : null; })();
  const pending = { name, form: v && v.form, amount: amount > 0 && unitOk(v.amount_unit) ? { value: amount, unit: unitOk(v.amount_unit) } : null,
    conc: conc > 0 && concUnit ? { value: conc, unit: concUnit } : null, vol: vol > 0 ? vol : null };
  if (pending.amount) parts.push(`${num(pending.amount.value, l)} ${pending.amount.unit}`);
  if (pending.conc) parts.push(`${num(pending.conc.value, l)} ${pending.conc.unit}/ml`);
  if (pending.vol) parts.push(`${num(pending.vol, l)} ml`);
  if (!parts.length) { app(s, 'ap_label_none'); return reask(s); }
  user(s, null, { key: 'ap_label_photo' });
  s.pendingLabel = pending;
  s.step = 'label_confirm';
  s.labelReturn = state.step;
  app(s, 'ap_label_read', { what: parts.join(' · ') });
  return s;
}

function labelOptions() { return [{ id: 'label:yes', key: 'ap_opt_yes' }, { id: 'label:no', key: 'ap_opt_no_change' }]; }

function answerLabel(state, yes) {
  const s = clone(state);
  const d = s.draft, l = s.language, p = s.pendingLabel;
  user(s, null, { key: yes ? 'ap_opt_yes' : 'ap_opt_no_change' });
  s.pendingLabel = null;
  if (!yes || !p) return enter(s, s.labelReturn || 'compound');
  if (!d.name && p.name) { d.typed = p.name; d.name = p.name; }
  if (!d.type) d.type = p.form === 'solution' ? 'rtu' : p.form === 'powder' ? 'recon' : d.type;
  if (d.type === 'recon' && p.amount && !d.amount) { d.amount = inputNumber(p.amount.value, l); d.unit = p.amount.unit; }
  if (d.type === 'rtu') {
    if (p.conc && !d.conc) { d.conc = inputNumber(p.conc.value, l); d.concUnit = p.conc.unit; }
    if (p.vol && !d.vialMl) d.vialMl = inputNumber(p.vol, l);
  }
  resolveCompound(s);
  return advance(s);
}

// A problem the screen reports (no connection, quota, scan failed): app-written, kept in
// the conversation; the user can always continue in the form (AP-16, AP-18).
function notice(state, key, params) {
  const s = clone(state);
  app(s, key, params, { kind: 'error' });
  return s;
}

// ── the result: the wizard form the conversation describes (AP-17) ─────────
// Only the user's answers are written; fields the user filled in the form stay unless the
// user changed them here (AP-10). Returns { form, mixedOn } for the screen.
function formFromConversation(state, base) {
  const d = state.draft, l = state.language, f = { ...base };
  const take = (k) => !state.filled[k] || state.changed[k] || (k === 'name' && state.changed.type);
  if (d.name && take('name')) { f.name = d.name; f.compoundId = d.compoundId || null; }
  if (d.type && (take('type') || !state.filled.type)) f.type = d.type;
  if (d.type === 'recon') {
    if (d.amount && take('amount')) { f.amount = d.amount; f.unit = d.unit || 'mg'; }
    if (d.water && take('water')) f.water = d.water;
    if (d.diluent) { f.diluentChoice = d.diluent; f.diluentOther = d.diluent === 'other' ? (d.diluentOther || '') : ''; }
  }
  if (d.type === 'rtu') {
    if (d.conc && take('conc')) { f.concentration = d.conc; f.concentrationUnit = d.concUnit || 'mg'; }
    if (d.vialMl && take('vialMl')) f.vialMl = d.vialMl;
  }
  if (d.type === 'oral' && d.strength && take('strength')) { f.servingStrength = d.strength; f.servingStrengthUnit = d.strengthUnit || 'mg'; }
  if (d.dose && take('dose')) { f.dose = d.dose; f.doseUnit = d.doseUnit || 'mg'; }
  if (d.type && d.type !== 'oral') f.syringeSize = S.allowedSyringe(d.type, d.syringeSize);
  if (scheduleKnown(d) && take('schedule')) {
    f.intervalDays = d.intervalDays; f.dosesPerDay = d.intervalDays > 2 ? 1 : d.dosesPerDay;
    const preset = [1, 2, 3, 4, 5, 6, 7, 10, 14].includes(d.intervalDays);
    f.customIntervalOpen = d.intervalDays !== 1; f.customIntervalText = d.intervalDays !== 1 ? String(d.intervalDays) : '';
    if (preset && d.intervalDays === 1) f.customIntervalOpen = false;
    const times = (base.reminderTimes || []).slice(0, f.dosesPerDay);
    const defaults = [times[0] || '09:00', '14:00', '21:00'];
    while (times.length < f.dosesPerDay) times.push(defaults[times.length] || '12:00');
    f.reminderTimes = times;
  }
  if (d.startDate && take('start')) f.startDate = d.startDate;
  // What this conversation wrote (so the form counts only those as set by hand, AP-10).
  const set = {
    name: !!(d.name && take('name')), type: !!(d.type && take('type')),
    amount: !!(d.type === 'recon' && d.amount && take('amount')), water: !!(d.type === 'recon' && d.water && take('water')),
    mixed: !!(d.type === 'recon' && d.mixedOn && take('mixed')), dose: !!(d.dose && take('dose')),
    schedule: !!(scheduleKnown(d) && take('schedule')), start: !!(d.startDate && take('start')),
    syringe: !!state.changed.syringe,
  };
  return { form: f, mixedOn: set.mixed ? d.mixedOn : null, notMixed: !!d.notMixed, set };
}

// Whether a typed answer needs the model, or is a plain number the app can read itself.
// Plain answers ("7 ml", "20 mg", "3") never leave the phone.
const UNIT_RE = '(mg|mcg|µg|ug|iu|ui|ie|g|ml)';
function localUnderstand(step, text, language) {
  const t = String(text || '').trim();
  const m = new RegExp(`^(\\d{1,7}(?:[.,\\s\\u00a0]\\d{1,6}){0,3})\\s*${UNIT_RE}?\\.?$`, 'i').exec(t);
  const awaitingInt = /^\d{1,3}$/.test(t);
  const unit = m && m[2] ? ({ 'µg': 'mcg', ug: 'mcg', ui: 'IU', iu: 'IU', ie: 'IU' })[m[2].toLowerCase()] || m[2].toLowerCase() : null;
  const IU = unit === 'iu' ? 'IU' : unit;
  const q = (u) => ({ text: m[1], unit: u });
  switch (step) {
    case 'amount': case 'conc':
      if (m && IU && IU !== 'ml' && IU !== 'g') return { intent: 'answer', [step === 'amount' ? 'amount' : 'conc']: q(IU) };
      return null;
    case 'strength': case 'dose':
      if (m && IU && IU !== 'ml') return { intent: 'answer', [step === 'strength' ? 'strength' : 'dose']: q(IU) };
      return null;
    case 'mix': case 'water':
      if (m && (!IU || IU === 'ml')) return { intent: 'answer', water: { text: m[1] } };
      return null;
    case 'vial_ml':
      if (m && (!IU || IU === 'ml')) return { intent: 'answer', vial_ml: { text: m[1] } };
      return null;
    case 'count': return awaitingInt ? { intent: 'answer', count: Number(t) } : null;
    case 'spacing': return awaitingInt ? { intent: 'answer', interval_days: Number(t) } : null;
    default: return null;
  }
}

// The step a typed answer belongs to (the "Other" follow-ups reuse their step's schema).
function textStep(s) {
  return s.awaiting ? ({ count_other: 'count', often_other: 'often', spacing_other: 'spacing' })[s.awaiting] : s.step;
}

// Back to the form (AP-0, AP-16): the step where the first thing still missing is asked.
function stepForHandback(f) {
  const has = (v) => String(v == null ? '' : v).trim().length > 0;
  if (!has(f.name)) return 1;
  if (f.type === 'recon' && (!has(f.amount) || !has(f.dose))) return 3;
  if (f.type === 'rtu' && (!has(f.dose) || !has(f.concentration))) return 3;
  if (f.type === 'oral' && (!has(f.dose) || !has(f.servingStrength))) return 3;
  return 4;
}

module.exports = {
  DOORS, stepForHandback, startConversation, titleKey, options, inputFor, answerOption, answerText, answerDate, labelRead, labelOptions, answerLabel,
  notice, formFromConversation, localUnderstand, textStep, nextStep, spacingOptions, reviewRows, planFacts, fitNumbers, adviceQuestion,
  filledFromForm, isoDay, EMPTY_DRAFT,
};
