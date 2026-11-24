'use strict';
// Copper this cycle (founder 2026-11-11 P11 (a); picture docs/design/ghk-cu-cobre-ciclo.html approved 2026-11-24;
// checklist docs/specs/ghk-cu-copper.md). Pure arithmetic on the person's own record — it never says whether an
// amount is much or little, never sets or suggests one. CommonJS, no React Native imports (node --test).
//
// - Which protocols: GHK-Cu ('pure') and the blends GLOW and KLOW ('blend'); never another one.
// - The cycle: the Taken rows of THIS protocol row (Retomar makes a new row, lib/protocolEnd restartAsNew;
//   Continuar keeps the row) from the start date's local day; Skipped / Missed, deleted rows and the declared
//   past (lib/declared) never count. Each dose with its own recorded amount (dose_amount / dose_unit; an
//   older row without one: the dose in force then, lib/doseStamp), converted to mg.
// - The form on the label (protocols.copper_form: complex · acetate · bis; null = Não sei): the copper part is
//   Cu ÷ the form's molar mass; "Não sei" gives the range between the lowest and the highest form.
// - A blend counts only with protocols.ghk_cu_mg (the GHK-Cu of the vial, ≤ the vial total): each dose ×
//   (ghk ÷ total). Unknown → no copper, the ask. The common recipe (lib/compounds) is never used here.
const { parseDecimal, trimZeros } = require('./doseMath');
const { stampForTaken } = require('./doseStamp');
const { isDeclared } = require('./declared');
const { formatNumber, formatDate } = require('./localeFormat');

// Standard atomic weights (IUPAC, conventional values) — the picture's "pesos refeitos com os pesos atômicos padrão".
const AW = { C: 12.011, H: 1.008, Cu: 63.546, N: 14.007, O: 15.999 };
const COPPER_MW = AW.Cu;
// Sources (picture): NCATS / GSRS (GHK 340,38 g/mol; prezatide copper acetate 862,39 g/mol); Cayman Chemical
// item 28259 "GHK-Cu (acetate)" C14H22CuN6O4 • C2H4O2; complex C14H22CuN6O4 401,91 g/mol.
const FORMS = {
  complex: { formula: 'C14H22CuN6O4', atoms: { C: 14, H: 22, Cu: 1, N: 6, O: 4 } },
  acetate: { formula: 'C14H22CuN6O4·C2H4O2', atoms: { C: 16, H: 26, Cu: 1, N: 6, O: 6 } },
  bis: { formula: 'C32H54CuN12O12', atoms: { C: 32, H: 54, Cu: 1, N: 12, O: 12 } },
};
const FORM_IDS = ['complex', 'acetate', 'bis'];

function formMolarMass(form) {
  const f = FORMS[form];
  if (!f) return null;
  return Object.keys(f.atoms).reduce((s, el) => s + AW[el] * f.atoms[el], 0);
}
function copperFraction(form) {
  const mw = formMolarMass(form);
  return mw ? COPPER_MW / mw : null;
}
const FRACTIONS = FORM_IDS.map(copperFraction);
const LOW = Math.min(...FRACTIONS);
const HIGH = Math.max(...FRACTIONS);
const LOW_FORM = FORM_IDS[FRACTIONS.indexOf(LOW)];
const HIGH_FORM = FORM_IDS[FRACTIONS.indexOf(HIGH)];

const PURE_IDS = new Set(['lyo_ghk_cu']);
const BLEND_IDS = new Set(['lyo_glow', 'lyo_klow']);
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function copperKind(p) {
  if (!p) return null;
  if (p.compound_id) {
    if (PURE_IDS.has(p.compound_id)) return 'pure';
    if (BLEND_IDS.has(p.compound_id)) return 'blend';
    return null;
  }
  const n = squash(p.name);
  if (n === 'ghkcu') return 'pure';
  if (n === 'glow' || n === 'klow') return 'blend';
  return null;
}

const MASS_MG = { mcg: 0.001, 'µg': 0.001, ug: 0.001, mg: 1, g: 1000 };
const toMg = (amount, unit) => {
  const n = parseDecimal(amount);
  const f = MASS_MG[String(unit || 'mg').trim().toLowerCase()];
  return Number.isFinite(n) && n >= 0 && f ? n * f : null;
};

// Local midnight of a 'YYYY-MM-DD' day (the start date is the person's calendar day).
function dayStartMs(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}
const atMs = (l) => Date.parse(l.slot_at || l.logged_at);

// The counted doses of this cycle: [{ id, mg }].
function cycleDoses(p, logs) {
  const from = dayStartMs(p && p.start_date);
  const out = [];
  for (const l of logs || []) {
    if (!l || l.outcome !== 'Taken' || l.sync_status === 'deleted') continue;
    if (l.protocol_id != null && p.id != null && l.protocol_id !== p.id) continue;
    if (isDeclared(l, p.created_at)) continue;
    const at = atMs(l);
    if (from != null && Number.isFinite(at) && at < from) continue;
    let mg = null;
    if (l.dose_amount != null && String(l.dose_amount).trim() !== '') mg = toMg(l.dose_amount, l.dose_unit || p.dose_unit);
    else {
      const st = stampForTaken(p, at);
      mg = st ? toMg(st.dose_amount, st.dose_unit) : null;
    }
    if (mg != null) out.push({ id: l.id, mg });
  }
  return out;
}

// The model of the section, or null when the protocol has none (another compound, a dose that is not a mass).
function copperCycle(p, logs) {
  const kind = copperKind(p);
  if (!kind) return null;
  if (toMg(1, p.dose_unit) == null) return null;
  const doses = cycleDoses(p, logs);
  const dosesMg = doses.reduce((s, d) => s + d.mg, 0);
  const form = FORM_IDS.includes(p.copper_form) ? p.copper_form : null;
  let ghkMg = dosesMg;
  let totalMg = null;
  let vialGhkMg = null;
  let needsGhk = false;
  let canAsk = true;
  if (kind === 'blend') {
    totalMg = p.amount != null && String(p.amount).trim() !== '' ? toMg(p.amount, p.unit) : null;
    if (!(totalMg > 0)) { totalMg = null; canAsk = false; }
    const g = p.ghk_cu_mg == null ? null : parseDecimal(p.ghk_cu_mg);
    if (totalMg != null && Number.isFinite(g) && g > 0 && g <= totalMg + 1e-9) vialGhkMg = g;
    if (vialGhkMg == null) { needsGhk = true; ghkMg = null; } else ghkMg = dosesMg * (vialGhkMg / totalMg);
  }
  const copper = ghkMg == null ? null
    : form ? { low: ghkMg * copperFraction(form), high: ghkMg * copperFraction(form) } : { low: ghkMg * LOW, high: ghkMg * HIGH };
  return { kind, start: p.start_date || null, count: doses.length, dosesMg, totalMg, vialGhkMg, ghkMg, form, copper, needsGhk, canAsk };
}

// The GHK-Cu of the vial as typed: { mg } or { error: 'invalid' | 'over' }.
function parseGhkAmount(text, language, totalMg) {
  const n = parseDecimal(String(text == null ? '' : text).trim(), language);
  if (!Number.isFinite(n) || !(n > 0)) return { error: 'invalid' };
  if (totalMg != null && n > totalMg + 1e-9) return { error: 'over' };
  return { mg: n };
}

// ── Texts ─────────────────────────────────────────────────────────────────────────────────────
// A mass in mg: whole and up to 2 decimals from 0,01 up ("36", "5,69"); smaller, 3 significant digits.
function mgDigits(v) {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const r = Number(v.toPrecision(12));
  if (r >= 0.01) return trimZeros(r.toFixed(2));
  return trimZeros(r.toFixed(Math.min(20, 2 - Math.floor(Math.log10(r)))));
}
const mgText = (v, language) => formatNumber(mgDigits(v), language, { grouping: false });
// A small mass under 1 mg keeps 3 significant digits ("0,316"), so a single dose never reads 0.
const shownMg = (v, language) => {
  if (Number.isFinite(v) && v > 0 && v < 1) return formatNumber(trimZeros(Number(v.toPrecision(3)).toFixed(Math.min(20, 2 - Math.floor(Math.log10(v))))), language, { grouping: false });
  return mgText(v, language);
};
const fill = (s, vars) => Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(vars[k]), String(s || ''));
const NB = ' ';
const pctText = (f, t, language) => fill(t('copper_pct'), { n: formatNumber((f * 100).toFixed(1), language, { grouping: false }) });
const oneDec = (v, language) => formatNumber(v.toFixed(1), language, { grouping: false });
const twoDec = (v, language) => formatNumber(v.toFixed(2), language, { grouping: false });
const isOne = (n, language) => (language === 'fr' ? Math.abs(n) < 2 : n === 1);

const TEXT_KEYS = [
  'copper_title', 'copper_title_ended', 'copper_cycle_start', 'copper_doses_done', 'copper_ghk_in_doses', 'copper_blend_in_doses',
  'copper_form_row', 'copper_ghk_in_vial', 'copper_elemental', 'copper_form_unknown', 'copper_form_complex', 'copper_form_acetate',
  'copper_form_bis', 'copper_ghk_of', 'copper_range', 'copper_doses', 'copper_doses_one', 'copper_needs_ghk',
  'copper_ask', 'copper_ask_button', 'copper_ask_note', 'copper_how', 'copper_why_base', 'copper_why_range', 'copper_why_restart',
  'copper_why_complex', 'copper_why_acetate', 'copper_why_bis', 'copper_why_blend', 'copper_closing', 'copper_note_range',
  'copper_note_one', 'copper_note_blend', 'copper_pct', 'copper_form_hint', 'copper_form_unknown_sub', 'copper_form_complex_sub',
  'copper_form_acetate_sub', 'copper_form_bis_sub', 'copper_ghk_title', 'copper_ghk_body', 'copper_ghk_unit', 'copper_ghk_hint',
  'copper_ghk_over', 'copper_ghk_invalid',
];

const formLabel = (form, t) => t(form ? `copper_form_${form}` : 'copper_form_unknown');

// The four choices of "Forma no rótulo": [{ id (null = Não sei), label, sub }].
function formOptions(t, language) {
  return [
    { id: null, label: t('copper_form_unknown'), sub: fill(t('copper_form_unknown_sub'), { low: pctText(LOW, t, language), high: pctText(HIGH, t, language) }) },
    ...FORM_IDS.map((f) => ({ id: f, label: t(`copper_form_${f}`), sub: fill(t(`copper_form_${f}_sub`), { pct: pctText(copperFraction(f), t, language) }) })),
  ];
}

// What the section shows: { title, summary, rows: [{ label, value, mono, mark, note, muted, tap }], why, closing, ask }.
// opts: { t, language, ended, name } — name: the blend as the page names it ("KLOW").
function copperView(m, p, { t, language, ended = false, name } = {}) {
  if (!m) return null;
  const copperVal = (sep) => {
    if (!m.copper) return null;
    if (m.copper.high <= 0) return `${mgText(0, language)}${sep}mg`;
    if (m.form) return `${shownMg(m.copper.low, language)}${sep}mg`;
    return fill(t('copper_range'), { low: shownMg(m.copper.low, language), high: shownMg(m.copper.high, language) }).replace(/ mg$/, `${sep}mg`);
  };
  const dosesText = fill(t(isOne(m.count, language) ? 'copper_doses_one' : 'copper_doses'), { n: String(m.count) });
  const summary = m.needsGhk ? t('copper_needs_ghk') : `${copperVal(' ')} · ${dosesText}`;
  const startDate = m.start ? formatDate(new Date(dayStartMs(m.start)), language, 'dayMonth') : '—';
  const rows = [
    { label: t('copper_cycle_start'), value: startDate },
    { label: t('copper_doses_done'), value: String(m.count), mono: true },
  ];
  const blendName = name || (p && p.name) || '';
  const ghkOf = m.vialGhkMg != null ? fill(t('copper_ghk_of'), { ghk: mgText(m.vialGhkMg, language), total: mgText(m.totalMg, language) }) : null;
  if (m.kind === 'pure') rows.push({ label: t('copper_ghk_in_doses'), value: `${mgText(m.dosesMg, language)}${NB}mg`, mono: true });
  else {
    rows.push({ label: fill(t('copper_blend_in_doses'), { name: blendName }), value: `${mgText(m.dosesMg, language)}${NB}mg`, mono: true });
    if (!m.needsGhk) {
      rows.push({ label: t('copper_ghk_in_vial'), value: ghkOf, tap: 'ghk' });
      rows.push({ label: t('copper_ghk_in_doses'), value: `${mgText(m.ghkMg, language)}${NB}mg`, mono: true, mark: true,
        note: fill(t('copper_note_blend'), { doses: mgText(m.dosesMg, language), ghk: mgText(m.vialGhkMg, language), total: mgText(m.totalMg, language), mg: mgText(m.ghkMg, language) }) });
    }
  }
  let why = null;
  let ask = null;
  if (m.needsGhk) {
    ask = m.canAsk ? { line: t('copper_ask'), button: t('copper_ask_button'), note: t('copper_ask_note') } : { line: t('copper_ask'), button: null, note: t('copper_ask_note') };
  } else {
    rows.push({ label: t('copper_form_row'), value: formLabel(m.form, t), tap: 'form', muted: !m.form });
    const g = mgText(m.ghkMg, language);
    const note = m.form
      ? fill(t('copper_note_one'), { mg: g, pct: pctText(copperFraction(m.form), t, language), cu: shownMg(m.copper.low, language) })
      : fill(t('copper_note_range'), { low: shownMg(m.copper.low, language), high: shownMg(m.copper.high, language), mg: g, lowPct: pctText(LOW, t, language), highPct: pctText(HIGH, t, language) });
    rows.push({ label: t('copper_elemental'), value: copperVal(NB), mono: true, mark: true, note });
    const parts = [t('copper_why_base')];
    if (m.kind === 'blend') parts.push(fill(t('copper_why_blend'), { part: ghkOf }));
    parts.push(m.form
      ? fill(t(`copper_why_${m.form}`), { mw: oneDec(formMolarMass(m.form), language), cu: twoDec(COPPER_MW, language), pct: pctText(copperFraction(m.form), t, language) })
      : fill(t('copper_why_range'), { complex: pctText(copperFraction('complex'), t, language), acetate: pctText(copperFraction('acetate'), t, language), bis: pctText(copperFraction('bis'), t, language) }));
    parts.push(t('copper_why_restart'));
    why = parts.join(' ');
  }
  return { title: t(ended ? 'copper_title_ended' : 'copper_title'), summary, rows, why, closing: t('copper_closing'), ask };
}

module.exports = {
  COPPER_MW, FORMS, FORM_IDS, LOW_FORM, HIGH_FORM, TEXT_KEYS, formMolarMass, copperFraction, copperKind, cycleDoses, copperCycle,
  parseGhkAmount, mgText, formOptions, copperView,
};
