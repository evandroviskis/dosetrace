'use strict';
// Your numbers' Metric / Imperial switch (S25 2026-11-07: 180 cm → Imperial → Metric read 180,1 and
// was saved). A switch changes only what a field SHOWS, never the value: each field keeps the exact
// text the user typed and the unit it was typed in (the memo). While the field still shows the
// memo's conversion, the math and the save use that source at full precision; switching back to the
// source unit shows the typed text exactly. A field the user edits starts over from the new text.
// The save keeps the payload's shape (weight / height / waist in `unit`, read by lib/progressTile and
// lib/progressCard): a field shown as a conversion is stored as the exact conversion, with the typed
// source under typedAs, so a restart in the other unit switches back exactly too.
// kind: 'weight' (kg ↔ lb) | 'length' (cm ↔ in). Pure — node --test (__tests__/unitSwitchRoundTrip).
const { lbToKg, kgToLb, inToCm, cmToIn } = require('./energyCalc');
const { parseMeasure, canonicalDecimal, savedFieldText } = require('./doseMath');
const { inputNumber } = require('./localeFormat');

function convert(n, kind, from, to) {
  if (from === to) return n;
  if (kind === 'weight') return to === 'imperial' ? kgToLb(n) : lbToKg(n);
  return to === 'imperial' ? cmToIn(n) : inToCm(n);
}
const read = (text, language) => {
  if (text == null || String(text).trim() === '') return null;
  const n = parseMeasure(text, language);
  return Number.isFinite(n) ? n : null;
};
// A converted value as its field shows it: one decimal, the language's decimal sign, never grouped.
const shownText = (n, language) => inputNumber(Math.round(n * 10) / 10, language);

// Where a field's text comes from: the memo while the field still shows the memo's conversion.
function sourceOf(text, unit, memo) {
  return memo && memo.shown === text ? { unit: memo.unit, text: memo.text } : { unit, text };
}

// The field after a switch from → to: { text, memo }.
function switchUnitField(text, kind, from, to, memo, language) {
  const src = sourceOf(text, from, memo);
  if (src.unit === to) return { text: src.text, memo: null };
  const n = read(src.text, language);
  if (n == null) return { text, memo: null };
  const shown = shownText(convert(n, kind, src.unit, to), language);
  return { text: shown, memo: { unit: src.unit, text: src.text, shown } };
}

// The value in `inUnit` (default the shown unit), full precision; null when empty.
function fieldValue(text, kind, unit, memo, language, inUnit = unit) {
  const src = sourceOf(text, unit, memo);
  const n = read(src.text, language);
  return n == null ? null : convert(n, kind, src.unit, inUnit);
}

// kg or cm, for the math.
function fieldMetric(text, kind, unit, memo, language) {
  return fieldValue(text, kind, unit, memo, language, 'metric');
}

// What the save stores for the field, in `unit`: { value, typedAs }.
function fieldSave(text, kind, unit, memo, language) {
  const src = sourceOf(text, unit, memo);
  if (src.unit === unit) return { value: canonicalDecimal(text, language, parseMeasure), typedAs: null };
  const v = fieldValue(text, kind, unit, memo, language);
  return { value: String(v), typedAs: { unit: src.unit, text: canonicalDecimal(src.text, language, parseMeasure) } };
}

// A saved field (value in `unit`, with its typedAs entry) → { text, memo } for the screen. The typed
// source is used only while the stored value is still its exact conversion.
function fieldLoad(savedValue, typedAs, kind, unit, language) {
  const plain = { text: savedValue == null ? '' : savedFieldText(savedValue, language), memo: null };
  if (!typedAs || typeof typedAs !== 'object' || !typedAs.unit || typedAs.unit === unit || typedAs.text == null) return plain;
  const n = parseMeasure(typedAs.text);
  const stored = parseMeasure(savedValue);
  if (!Number.isFinite(n) || !Number.isFinite(stored)) return plain;
  const conv = convert(n, kind, typedAs.unit, unit);
  if (Math.abs(conv - stored) > 1e-6) return plain;
  const shown = shownText(conv, language);
  return { text: shown, memo: { unit: typedAs.unit, text: savedFieldText(typedAs.text, language), shown } };
}

// A value known in kg / cm (a saved weigh-in) shown in `unit`: { text, memo }. In imperial the field
// shows the one-decimal conversion and keeps the exact metric source, so reading it back gives the
// weigh-in itself (review 2026-11-07: the reality-check start weight IS that day's weigh-in, A-212).
function fieldFromMetric(n, kind, unit, language) {
  const text = inputNumber(n, language);
  if (unit !== 'imperial') return { text, memo: null };
  const shown = shownText(convert(n, kind, 'metric', 'imperial'), language);
  return { text: shown, memo: { unit: 'metric', text, shown } };
}

module.exports = { switchUnitField, fieldValue, fieldMetric, fieldSave, fieldLoad, fieldFromMetric };
