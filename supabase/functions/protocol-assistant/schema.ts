// AI protocol assistant: the strict schema for the model's answer, on the SERVER
// (docs/specs/ai-protocol-assistant.md AP-2, AP-3, AP-6, AP-14). Pure — no Deno imports — so
// it also runs under plain node --test (__tests__/assistantSchemaParity.test.js checks it
// against the app's own copy, lib/assistantSchema.js, which validates again on the phone).
//
// The model returns DATA only, never a sentence for the screen. Every quantity must be the
// user's own number token, found in the user's own text; the compound must be the user's own
// words; everything else is a fixed value or a bounded whole number. Anything else is dropped.

export const INTENTS = ['answer', 'advice', 'unclear', 'manual'];
export const FORMS = ['powder', 'ready', 'pill'];
export const DILUENTS = ['bacteriostatic_water', 'sterile_water', 'sodium_chloride_09', 'other'];
export const BASES = ['each', 'total'];
export const PERIODS = ['day', 'week', 'month'];
export const MASS_UNITS = ['mg', 'mcg', 'IU'];
export const ORAL_UNITS = ['mg', 'mcg', 'IU', 'g'];
export const MAX_TEXT = 300;

export const STEP_FIELDS: Record<string, string[]> = {
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
export const STEPS = Object.keys(STEP_FIELDS);

const LIMITS: Record<string, [number, number]> = { count: [1, 60], interval_days: [1, 365], day_offset: [-730, 365] };
const NUM_TOKEN = /^\d{1,7}(?:[.,\s ]\d{1,6}){0,3}$/;
// Other spellings of the same unit (UI / IE = IU in pt, es, fr, it / de; µg = mcg).
const UNIT_ALIASES: Record<string, string> = { ui: 'iu', ie: 'iu', 'µg': 'mcg', ug: 'mcg' };

export function normText(s: unknown): string {
  return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

export function tokenInText(token: unknown, text: string): boolean {
  const t = String(token ?? '').trim();
  if (!t || !NUM_TOKEN.test(t) || !/[1-9]/.test(t)) return false;
  let from = 0;
  for (;;) {
    const i = text.indexOf(t, from);
    if (i < 0) return false;
    const before = i > 0 ? text[i - 1] : '';
    const after = text[i + t.length] || '';
    const beforeOk = !/[0-9]/.test(before) && !(/[.,]/.test(before) && /[0-9]/.test(text[i - 2] || ''));
    const afterOk = !/[0-9]/.test(after) && !(/[.,]/.test(after) && /[0-9]/.test(text[i + t.length + 1] || ''));
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}

function quantity(v: any, text: string, units: string[] | null) {
  if (!v || typeof v !== 'object') return null;
  const tok = typeof v.text === 'string' ? v.text.trim() : '';
  if (!tokenInText(tok, text)) return null;
  if (units) {
    const raw = String(v.unit == null ? '' : v.unit).trim().toLowerCase();
    const spelled = UNIT_ALIASES[raw] || raw;
    const u = units.find((x) => x.toLowerCase() === spelled.toLowerCase());
    if (!u) return null;
    return { text: tok, unit: u };
  }
  return { text: tok };
}

const intIn = (v: unknown, [lo, hi]: [number, number]) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? v as number : null);
const pick = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : null);

export function compoundName(v: unknown, text: string): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f<>{}\[\]\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60) return null;
  const n = normText(s);
  if (n.length < 2) return null;
  return normText(text).includes(n) ? s : null;
}

export const EMPTY = Object.freeze({
  intent: 'unclear', compound: null, form: null, amount: null, conc: null, vial_ml: null,
  strength: null, diluent: null, water: null, not_mixed: false, dose: null, basis: null,
  period: null, count: null, interval_days: null, day_offset: null,
});

export function validateUnderstanding(step: string, raw: any, userText: string): Record<string, any> {
  const out: Record<string, any> = { ...EMPTY };
  if (!STEPS.includes(step) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const text = String(userText || '').slice(0, MAX_TEXT);
  const intent = pick(raw.intent, INTENTS) || 'unclear';
  if (intent !== 'answer') return { ...out, intent };
  const allowed = STEP_FIELDS[step];
  const has = (f: string) => allowed.includes(f);
  if (has('compound')) out.compound = compoundName(raw.compound, text);
  if (has('form')) out.form = pick(raw.form, FORMS);
  if (has('amount')) out.amount = quantity(raw.amount, text, MASS_UNITS);
  if (has('conc')) out.conc = quantity(raw.conc, text, MASS_UNITS);
  if (has('vial_ml')) out.vial_ml = quantity(raw.vial_ml, text, null);
  if (has('strength')) out.strength = quantity(raw.strength, text, ORAL_UNITS);
  if (has('diluent')) out.diluent = pick(raw.diluent, DILUENTS);
  if (has('water')) out.water = quantity(raw.water, text, null);
  if (has('not_mixed')) out.not_mixed = raw.not_mixed === true;
  if (has('dose')) out.dose = quantity(raw.dose, text, ORAL_UNITS);
  if (has('basis')) out.basis = pick(raw.basis, BASES);
  if (has('period')) out.period = pick(raw.period, PERIODS);
  if (has('count')) out.count = intIn(raw.count, LIMITS.count);
  if (has('interval_days')) out.interval_days = intIn(raw.interval_days, LIMITS.interval_days);
  if (has('day_offset')) out.day_offset = intIn(raw.day_offset, LIMITS.day_offset);
  const usable = Object.keys(EMPTY).some((k) => k !== 'intent' && (k === 'not_mixed' ? out.not_mixed : out[k] != null));
  out.intent = usable ? 'answer' : 'unclear';
  return out;
}

// The JSON schema the model is constrained to (structured outputs, output_config.format).
// Every field is required and nullable, objects are closed; the app-side checks above still
// run on whatever comes back.
const qty = (withUnit: boolean) => ({
  anyOf: [
    { type: 'null' },
    withUnit
      ? { type: 'object', properties: { text: { type: 'string' }, unit: { type: 'string' } }, required: ['text', 'unit'], additionalProperties: false }
      : { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
  ],
});
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] });

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    compound: nullable({ type: 'string' }),
    form: nullable({ type: 'string', enum: FORMS }),
    amount: qty(true),
    conc: qty(true),
    vial_ml: qty(false),
    strength: qty(true),
    diluent: nullable({ type: 'string', enum: DILUENTS }),
    water: qty(false),
    not_mixed: { type: 'boolean' },
    dose: qty(true),
    basis: nullable({ type: 'string', enum: BASES }),
    period: nullable({ type: 'string', enum: PERIODS }),
    count: nullable({ type: 'integer' }),
    interval_days: nullable({ type: 'integer' }),
    day_offset: nullable({ type: 'integer' }),
  },
  required: ['intent', 'compound', 'form', 'amount', 'conc', 'vial_ml', 'strength', 'diluent', 'water', 'not_mixed', 'dose', 'basis', 'period', 'count', 'interval_days', 'day_offset'],
  additionalProperties: false,
};
