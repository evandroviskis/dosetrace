// AI protocol assistant: the strict schema the model's answer must pass, on the CLIENT
// (docs/specs/ai-protocol-assistant.md AP-2, AP-3, AP-6, AP-14). The server
// (supabase/functions/protocol-assistant/schema.ts) applies the same rules first; this is
// the second, independent check, so a bad or compromised server answer is dropped here
// too (__tests__/assistantSchema.test.js keeps the two in step).
//
// What the model may return is DATA only, never a sentence for the screen:
//   - which of a few fixed values the user's words mean (form, diluent, basis, period);
//   - small whole numbers that words can say ("three times a week", "every 10 days",
//     "3 weeks ago");
//   - for every quantity (vial amount, strength, water, ml, dose): the user's number AS
//     THEY TYPED IT ("2,5"), which must appear in the user's own text as a whole number
//     token. The app reads it with parseDecimal in the app language and does the math.
//     A number the user did not type is dropped (AP-2: every number comes from the user).
//   - the compound name only as the user's own words: it must appear in what they typed.
// Anything outside this is dropped, never shown. Pure CommonJS (node --test).
const { parseDecimal } = require('./doseMath');

const INTENTS = ['answer', 'advice', 'unclear', 'manual'];
const FORMS = ['powder', 'ready', 'pill'];
const DILUENTS = ['bacteriostatic_water', 'sterile_water', 'sodium_chloride_09', 'other'];
const BASES = ['each', 'total'];
const PERIODS = ['day', 'week', 'month'];
const MASS_UNITS = ['mg', 'mcg', 'IU'];
const ORAL_UNITS = ['mg', 'mcg', 'IU', 'g'];

// The fields each question may fill. The model is told the same list; extra fields are
// dropped. (A user may answer more than was asked: "BPC-157, a powder", "5 mg mixed with
// 2 ml", "2.5 mg once a week".)
const STEP_FIELDS = {
  compound: ['compound', 'form'],
  form: ['form'],
  amount: ['amount', 'water', 'diluent'],
  mix: ['diluent', 'water', 'not_mixed'],
  water: ['water'],
  mixed: ['day_offset'],
  conc: ['conc', 'vial_ml'],
  vial_ml: ['vial_ml'],
  strength: ['strength'],
  dose: ['dose', 'basis', 'period', 'count', 'interval_days'],
  period: ['basis', 'period'],
  fit_period: ['basis', 'period'],
  count: ['count'],
  often: ['period', 'count', 'interval_days'],
  spacing: ['interval_days'],
  start: ['day_offset'],
};
const STEPS = Object.keys(STEP_FIELDS);
const MAX_TEXT = 300;

const LIMITS = {
  count: [1, 60],
  interval_days: [1, 365],
  day_offset: [-730, 365],
};

// The model's number token must be a plain number as typed: digits with at most a
// comma/dot decimal or grouping ("2.5", "2,5", "1.000", "5,000", "1 000").
const NUM_TOKEN = /^\d{1,7}(?:[.,\s ]\d{1,6}){0,3}$/;
// Other spellings of the same unit (UI / IE = IU in pt, es, fr, it / de; µg = mcg).
const UNIT_ALIASES = { ui: 'iu', ie: 'iu', 'µg': 'mcg', ug: 'mcg' };

function normText(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

// Is `token` one whole number written in `text` (not a piece of a longer number)?
function tokenInText(token, text) {
  const t = String(token).trim();
  if (!t || !NUM_TOKEN.test(t) || !/[1-9]/.test(t)) return false;
  const src = String(text);
  let from = 0;
  for (;;) {
    const i = src.indexOf(t, from);
    if (i < 0) return false;
    const before = i > 0 ? src[i - 1] : '';
    const after = src[i + t.length] || '';
    // Not glued to more digits on either side ("5" is not in "15" or "1.5" or "5.25").
    // ".5" and ",5" are one number: a dot or comma right before the token belongs to it (LOW 8).
    const beforeOk = !/[0-9.,]/.test(before);
    const afterOk = !/[0-9]/.test(after) && !(/[.,]/.test(after) && /[0-9]/.test(src[i + t.length + 1] || ''));
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}

// The unit must be written by the user too (regulatory review 2026-10-03, B4): "250" alone is
// never "250 mg". Each unit's spellings in the 6 languages; letters may not touch the short
// forms ("g" inside "mg" is not grams).
const UNIT_WORDS = {
  mg: /(?<![a-zµ])mg(?![a-z])|mill?igram/i,
  mcg: /(?<![a-z])(mcg|µg|ug)(?![a-z])|micro-?gram|mikrogramm/i,
  IU: /(?<![a-z])(iu|ui|ie)(?![a-z])|international unit|unidades? internaciona|unités? internationale|internationale einheit|unità internazional/i,
  g: /(?<![a-zµ])(g|gr|grams?|gramas?|gramos?|grammes?|gramm|grammi)(?![a-z])/i,
};
const unitInText = (unit, text) => !!(UNIT_WORDS[unit] && UNIT_WORDS[unit].test(text));

function quantity(v, text, units, language) {
  if (!v || typeof v !== 'object') return null;
  const tok = typeof v.text === 'string' ? v.text.trim() : '';
  if (!tokenInText(tok, text)) return null;
  const n = parseDecimal(tok, language);
  if (!(Number.isFinite(n) && n > 0 && n <= 1e6)) return null;
  if (units) {
    const raw = String(v.unit == null ? '' : v.unit).trim().toLowerCase();
    const spelled = UNIT_ALIASES[raw] || raw;
    const u = units.find((x) => x.toLowerCase() === spelled.toLowerCase());
    if (!u || !unitInText(u, text)) return null;
    return { text: tok, unit: u, value: n };
  }
  return { text: tok, value: n };
}

function intIn(v, [lo, hi]) {
  return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

// The compound as the user's own words: 2-60 characters that appear (ignoring case,
// spaces and punctuation) in what they typed. Never a name the user did not write.
function compoundName(v, text) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f<>{}\[\]\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60) return null;
  const n = normText(s);
  if (n.length < 2) return null;
  return spanOf(n, text); // the user's own characters, never the model's string (LOW 9)
}

// The part of the user's text whose letters and digits are `n` (plus a trailing "+", as in
// "NAD+"), or null when it is not there.
function spanOf(n, text) {
  const src = String(text || '');
  const chars = [], map = [];
  for (let i = 0; i < src.length; i++) {
    const base = src[i].toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    for (const ch of base) if (/[a-z0-9]/.test(ch)) { chars.push(ch); map.push(i); }
  }
  const k = chars.join('').indexOf(n);
  if (k < 0) return null;
  let end = map[k + n.length - 1] + 1;
  while (src[end] === '+') end++;
  return src.slice(map[k], end).trim();
}

const pick = (v, list) => (typeof v === 'string' && list.includes(v) ? v : null);

const EMPTY = Object.freeze({
  intent: 'unclear', compound: null, form: null, amount: null, conc: null, vial_ml: null,
  strength: null, diluent: null, water: null, not_mixed: false, dose: null, basis: null,
  period: null, count: null, interval_days: null, day_offset: null,
});

// Validate one model answer for one question. Returns the canonical object (EMPTY's
// keys). Any field not allowed for the step, of the wrong type, out of range, or with a
// number that is not in the user's text, is dropped. An "answer" with nothing usable left
// becomes "unclear".
function validateUnderstanding(step, raw, userText, language) {
  const out = { ...EMPTY };
  if (!STEPS.includes(step) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const text = String(userText || '').slice(0, MAX_TEXT);
  const intent = pick(raw.intent, INTENTS) || 'unclear';
  if (intent !== 'answer') return { ...out, intent };
  const allowed = STEP_FIELDS[step];
  const has = (f) => allowed.includes(f);
  if (has('compound')) out.compound = compoundName(raw.compound, text);
  if (has('form')) out.form = pick(raw.form, FORMS);
  if (has('amount')) out.amount = quantity(raw.amount, text, MASS_UNITS, language);
  if (has('conc')) out.conc = quantity(raw.conc, text, MASS_UNITS, language);
  if (has('vial_ml')) out.vial_ml = quantity(raw.vial_ml, text, null, language);
  if (has('strength')) out.strength = quantity(raw.strength, text, ORAL_UNITS, language);
  if (has('diluent')) out.diluent = pick(raw.diluent, DILUENTS);
  if (has('water')) out.water = quantity(raw.water, text, null, language);
  if (has('not_mixed')) out.not_mixed = raw.not_mixed === true;
  if (has('dose')) out.dose = quantity(raw.dose, text, ORAL_UNITS, language);
  if (has('basis')) out.basis = pick(raw.basis, BASES);
  if (has('period')) out.period = pick(raw.period, PERIODS);
  if (has('count')) out.count = intIn(raw.count, LIMITS.count);
  if (has('interval_days')) out.interval_days = intIn(raw.interval_days, LIMITS.interval_days);
  if (has('day_offset')) out.day_offset = intIn(raw.day_offset, LIMITS.day_offset);
  const usable = Object.keys(EMPTY).some((k) => k !== 'intent' && (k === 'not_mixed' ? out.not_mixed : out[k] != null));
  out.intent = usable ? 'answer' : 'unclear';
  return out;
}

module.exports = {
  INTENTS, FORMS, DILUENTS, BASES, PERIODS, MASS_UNITS, ORAL_UNITS, STEP_FIELDS, STEPS, LIMITS, MAX_TEXT, EMPTY,
  validateUnderstanding, tokenInText, compoundName, normText,
};
