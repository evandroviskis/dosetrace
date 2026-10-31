'use strict';
// A-203 option C (founder 2026-10-31; checklist docs/specs/a203-non-numeric-lab-results.md): a lab
// result that is not an exact number keeps what the report wrote.
//   - a sign before the number ("> 2.000", "< 0,01", "inferior a 0,01", "até 5") → qualifier
//     ('<', '>', '≤', '≥') + the number in value;
//   - a result in words ("Não reagente", "Negativo", "1+", "1/40") → value_text, value null.
// One reader (typed text and the scan JSON) and one writer (every on-screen and exported value), so
// nothing reads .value directly for display. Never a judgement: no high, low or normal anywhere
// (AI hard line) — only what the report printed. Pure CommonJS (node --test); Metro imports it fine.
const { parseDecimal, parseMeasure } = require('./doseMath');
const { decimalText, inputNumber } = require('./localeFormat');

const QUALIFIERS = ['<', '>', '≤', '≥'];
const NBSP = ' ';

// '<=' / '=<' are '≤', '>=' / '=>' are '≥'; anything that is not a sign is no qualifier.
function normalizeQualifier(q) {
  if (typeof q !== 'string') return null;
  const s = q.trim();
  if (QUALIFIERS.includes(s)) return s;
  if (s === '<=' || s === '=<') return '≤';
  if (s === '>=' || s === '=>') return '≥';
  return null;
}

// The words a report prints before a number, in the six app languages, written WITHOUT accents,
// lower case (the text is folded the same way before matching). Longest phrases first.
const SIGN_WORDS = [
  // ≤ "up to", "at most"
  ['≤', ['no more than', 'up to', 'at most', 'ate', 'hasta', "jusqu'a", 'jusqu a', 'bis zu', 'bis', 'fino a', 'al massimo', 'no maximo', 'como maximo', 'au plus', 'hochstens']],
  // ≥ "at least"
  ['≥', ['at least', 'pelo menos', 'no minimo', 'al menos', 'como minimo', 'au moins', 'mindestens', 'almeno', 'come minimo']],
  ['<', [
    'less than', 'lower than', 'below', 'under',
    'inferior a', 'menor do que', 'menor que', 'menor de', 'menos de', 'abaixo de', 'por debajo de',
    'inferieure a', 'inferieur a', 'moins de',
    'kleiner als', 'weniger als', 'niedriger als', 'unterhalb', 'unter',
    'inferiore a', 'minore di', 'meno di',
  ]],
  ['>', [
    'greater than', 'more than', 'higher than', 'above', 'over',
    'superior a', 'maior do que', 'maior que', 'mais de', 'acima de', 'mayor que', 'mayor de', 'mas de', 'por encima de',
    'superieure a', 'superieur a', 'plus de',
    'grosser als', 'mehr als', 'hoher als', 'oberhalb', 'uber',
    'superiore a', 'maggiore di', 'piu di',
  ]],
];
const SYMBOLS = [['<=', '≤'], ['=<', '≤'], ['>=', '≥'], ['=>', '≥'], ['≤', '≤'], ['≥', '≥'], ['<', '<'], ['>', '>']];

// Lower case, accents and ß folded, curly apostrophes straight, spaces collapsed.
function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[’`´]/g, "'").replace(/[\s  ]+/g, ' ').trim();
}

// Only digits with their separators (and a leading minus/plus) — "2000", "0,5", "1.250,5", "2 480".
// parseFloat alone would read "2 cruzes" as 2 and "1/40" as 1.
function numberOnly(text, parse) {
  const s = String(text).replace(/[\s  ]+/g, ' ').trim();
  if (!/^[+-]?[\d.,][\d., ]*$/.test(s) || !/\d/.test(s)) return NaN;
  const n = parse(s);
  return Number.isFinite(n) ? n : NaN;
}

// A sign at the start (a symbol or the words before a number) → { qualifier, rest } | null.
function splitSign(text) {
  const s = String(text).trim();
  for (const [sym, q] of SYMBOLS) {
    if (s.startsWith(sym)) return { qualifier: q, rest: s.slice(sym.length).trim() };
  }
  const f = fold(s);
  for (const [q, words] of SIGN_WORDS) {
    for (const w of words) {
      // The words, then a space (or ':'), then the number: "inferior a 0,01", "unter: 0,1".
      if (f.startsWith(w) && /^[\s:]/.test(f.slice(w.length))) return { qualifier: q, rest: f.slice(w.length).replace(/^[\s:]+/, '') };
    }
  }
  return null;
}

// Typed or printed text → { value, qualifier, value_text } | null (empty).
// The number is read in the app language with parseMeasure, the body/lab-number rule (the Edit value
// window: in English "1,025" stays a decimal); `parse` may replace it.
function parseLabInput(text, language, parse) {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;
  const read = parse || ((x) => parseMeasure(x, language));
  const n = numberOnly(s, read);
  if (Number.isFinite(n)) return { value: n, qualifier: null, value_text: null };
  const sign = splitSign(s);
  if (sign) {
    const m = numberOnly(sign.rest, read);
    if (Number.isFinite(m)) return { value: m, qualifier: sign.qualifier, value_text: null };
  }
  // Not a number after removing a leading sign: the report's (or the person's) words, as written.
  return { value: null, qualifier: null, value_text: s.replace(/\s+/g, ' ') };
}

// One marker of the extract-bloodwork JSON → { value, qualifier, value_text } | null.
// Accepts "qualifier" + a number, a value string with its sign ("> 2.000"), "value_text" with no
// number, or (older prompt) a value string in words. A number always wins over words. A plain number
// string keeps the reading service's own rule (A-26: "1,234" = 1234, "5,5" = 5.5 — unchanged); the
// number after a sign is read in the app language (parseMeasure, the lab-number rule).
function scanResult(m, language) {
  if (!m || typeof m !== 'object') return null;
  const q = normalizeQualifier(m.qualifier);
  if (typeof m.value === 'number') {
    return Number.isFinite(m.value) ? { value: m.value, qualifier: q, value_text: null } : null;
  }
  if (typeof m.value === 'string' && m.value.trim()) {
    const plainN = numberOnly(m.value, (x) => parseDecimal(x));
    if (Number.isFinite(plainN)) return { value: plainN, qualifier: q, value_text: null };
    const r = parseLabInput(m.value, language);
    if (r && Number.isFinite(r.value)) return { ...r, qualifier: r.qualifier || q };
    // A value string in words: the words the model put in value_text win (they are its transcription).
    const words = typeof m.value_text === 'string' && m.value_text.trim() ? m.value_text.trim() : r.value_text;
    return { value: null, qualifier: null, value_text: words };
  }
  if (typeof m.value_text === 'string' && m.value_text.trim()) {
    return { value: null, qualifier: null, value_text: m.value_text.trim().replace(/\s+/g, ' ') };
  }
  return null;
}

const hasNumber = (row) => !!row && row.value != null && row.value !== '' && Number.isFinite(Number(row.value));
const isWordResult = (row) => !!row && !hasNumber(row) && typeof row.value_text === 'string' && row.value_text.trim() !== '';

// The result without its unit: "> 2000" (the sign held to its number), "2,35", "Não reagente".
function labNumberText(row, language, sep = NBSP) {
  if (!row) return '';
  if (hasNumber(row)) {
    const q = normalizeQualifier(row.qualifier);
    const n = decimalText(Number(row.value), language);
    return q ? `${q}${sep}${n}` : n;
  }
  return isWordResult(row) ? row.value_text.trim() : '';
}

// The result with its unit, as every list shows it: "> 2000 pg/mL"; words with no unit unless given.
function labValueText(row, language) {
  const v = labNumberText(row, language);
  const unit = row && typeof row.unit === 'string' ? row.unit.trim() : '';
  return unit ? `${v}${NBSP}${unit}` : v;
}

// The Edit value field's prefill: "> 2000", "< 0,5", "5,2" (the app's decimal), or the words.
function labInputText(row, language) {
  if (!row) return '';
  if (hasNumber(row)) {
    const q = normalizeQualifier(row.qualifier);
    const n = inputNumber(Number(row.value), language);
    return q ? `${q} ${n}` : n;
  }
  return isWordResult(row) ? row.value_text.trim() : '';
}

// Export (CSV and PDF): the stored number as before (machine-readable, dot decimal), with its sign;
// the words as written.
function labExportValue(row) {
  if (!row) return '';
  if (hasNumber(row)) {
    const q = normalizeQualifier(row.qualifier);
    return q ? `${q} ${row.value}` : row.value;
  }
  return isWordResult(row) ? row.value_text.trim() : '';
}

// The readings a chart can draw: only those with a number (a word result is never a point).
function chartPoints(points) {
  return (Array.isArray(points) ? points : []).filter(hasNumber).map((p) => ({ ...p, value: Number(p.value) }));
}

module.exports = {
  QUALIFIERS, normalizeQualifier, parseLabInput, scanResult, hasNumber, isWordResult,
  labNumberText, labValueText, labInputText, labExportValue, chartPoints,
};
