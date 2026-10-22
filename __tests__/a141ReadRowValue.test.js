'use strict';
// A-141 (1) — Fold session 2026-10-17 (build 50): on a protocol's page the read row
// "Tamanho do frasco (unidades) — opcional" showed its value "60" broken as "6 / 0".
// Cause: in RowsBlock (screens/ProtocolsScreen.js) both the label (rwKey) and the value
// (rwVal) had flexShrink: 1. Yoga shrinks each side by its share of the overflow, in
// proportion to its natural width, and does not keep a text at its longest word, so a
// label longer than the row (renamed in A-115 option A) took a few points from the short
// value too, and "60" no longer fit on one line.
// Fix: the value never shrinks below its own width (flexShrink: 0) and is capped at a
// share of the row (maxWidth %), where a long value (reminder times, goals) wraps at its
// spaces; the label takes the rest and wraps at its spaces.
//
// Checked for every label RowsBlock shows (schedule + dose rows, every protocol type)
// in all 6 languages, with the longest realistic value of each row, at the narrowest
// supported phone (375 pt: scroll padding 16 + row padding 16 each side).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
const ROW_W = 375 - 2 * 16 - 2 * 16;
const SIZE = 17;

function styleOf(name) {
  const m = src.match(new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name} exists`);
  return m[1];
}
const num = (body, prop, dflt) => {
  const m = body.match(new RegExp(`(^|[^A-Za-z])${prop}: (-?[\\d.]+)`));
  return m ? Number(m[2]) : dflt;
};
const pct = (body, prop) => {
  const m = body.match(new RegExp(`(^|[^A-Za-z])${prop}: '([\\d.]+)%'`));
  return m ? Number(m[2]) / 100 : null;
};

// Coarse SF Pro estimate (generous to the text, as in a134HeaderFit); mono = 0.6 em.
function textWidth(s, mono) {
  if (mono) return [...String(s)].length * 0.6 * SIZE;
  let em = 0;
  for (const ch of String(s)) {
    if (ch === ' ' || ch === ' ') em += 0.26;
    else if (/[.,:;'’!|ijlI()]/.test(ch)) em += 0.28;
    else if (/[tf]/.test(ch)) em += 0.33;
    else if (/[r]/.test(ch)) em += 0.37;
    else if (/[s]/.test(ch)) em += 0.47;
    else if (/[mwMW—–]/.test(ch)) em += 0.84;
    else if (/[A-ZÀ-Ý]/.test(ch)) em += 0.66;
    else em += 0.55;
  }
  return em * SIZE * 1.04;
}
// Words a line may break between: ordinary spaces only (NBSP glues value + unit).
const longestWord = (s, mono) => Math.max(...String(s).split(/ +/).map(w => textWidth(w, mono)));

// Yoga's row: natural widths, overflow shared by flexShrink × basis, then max-width clamps.
function layoutRow(labelW, valueW) {
  const row = styleOf('rw');
  const gap = num(row, 'gap', 0);
  const key = styleOf('rwKey');
  const val = styleOf('rwVal');
  const kS = num(key, 'flexShrink', 0);
  const vS = num(val, 'flexShrink', 0);
  const vMax = pct(val, 'maxWidth');
  let v = valueW;
  if (vMax != null) v = Math.min(v, vMax * ROW_W);
  let k = labelW;
  const avail = ROW_W - gap;
  const over = k + v - avail;
  if (over > 0) {
    const kw = kS * k;
    const vw = vS * v;
    const tot = kw + vw;
    if (tot > 0) { k -= over * kw / tot; v -= over * vw / tot; }
  }
  return { label: k, value: v };
}

// Longest realistic value per row (NBSP between number and unit, as ProtocolDetail writes it).
const N = ' ';
const ROWS = [
  ['protocols_frequency', 'Every 3.5 days', false],
  ['protocols_reminder', `08:00  ·  20:00`, true],
  ['protocols_total_doses_schedule', '120', true],
  ['protocols_compound_amount', `10${N}mg`, true],
  ['protocols_diluent_amount', `2${N}ml`, true],
  // A-166 (founder 2026-10-22): the computed powder concentration ends in "*", and the dose row
  // is now "Dose you entered" — the longest label is German "Von dir eingegebene Dosis".
  ['protocols_concentration', `33,33${N}mg/ml*`, true],
  ['protocols_desired_dose', `250${N}mcg`, true],
  ['protocols_desired_dose', `1000${N}mcg`, true],
  ['protocols_dose_per_injection', `0,25${N}mg`, true],
  ['protocols_vial_size', `10${N}ml`, true],
  ['protocols_dose_amount', `1000${N}UI`, true],
  ['protocols_form', 'Cápsula', false],
  ['protocols_serving_strength', `2000${N}UI`, true],
  ['protocols_serving_units', '2', true],
  ['protocols_container_units', '60', true],
  ['protocols_container_units', '120', true],
];

test('A-141 (1): the "60" of "Tamanho do frasco (unidades) — opcional" stays on one line (pt, Fold capture)', () => {
  const label = tr.pt.protocols_container_units;
  const r = layoutRow(textWidth(label, false), textWidth('60', true));
  assert.ok(r.value >= textWidth('60', true) - 0.01, `value column ${r.value.toFixed(1)} pt < "60" ${textWidth('60', true).toFixed(1)} pt: it breaks`);
});

test('A-141 (1): the value of a read row never shrinks; it is capped at a share of the row', () => {
  const val = styleOf('rwVal');
  assert.equal(num(val, 'flexShrink', 0), 0, 'rwVal: flexShrink 0');
  const cap = pct(val, 'maxWidth');
  assert.ok(cap != null && cap >= 0.5 && cap <= 0.7, 'rwVal: maxWidth between 50% and 70% of the row');
  assert.equal(num(styleOf('rwKey'), 'flexShrink', 0), 1, 'rwKey: the label takes the rest and wraps');
});

test('A-141 (1): every read row ×6 — the value never breaks inside a word, the label wraps only at spaces', () => {
  for (const lang of LANGS) {
    for (const [key, value, mono] of ROWS) {
      const label = tr[lang][key];
      assert.ok(label, `${lang} ${key} exists`);
      const r = layoutRow(textWidth(label, false), textWidth(value, mono));
      assert.ok(r.value >= longestWord(value, mono) - 0.01,
        `${lang} ${key}: value "${value}" column ${r.value.toFixed(1)} pt < its word ${longestWord(value, mono).toFixed(1)} pt`);
      assert.ok(r.label >= longestWord(label, false) - 0.01,
        `${lang} ${key}: label column ${r.label.toFixed(1)} pt < its longest word ${longestWord(label, false).toFixed(1)} pt`);
    }
  }
});

test('A-141 (1): a long value (several reminder times, goals) wraps at its spaces inside its share', () => {
  const times = '06:00  ·  12:00  ·  18:00  ·  23:00';
  const r = layoutRow(textWidth(tr.de.protocols_reminder, false), textWidth(times, true));
  assert.ok(r.value < textWidth(times, true), 'capped, so it wraps');
  assert.ok(r.value >= longestWord(times, true), 'each time stays whole');
  assert.ok(r.label >= longestWord(tr.de.protocols_reminder, false), 'the label keeps its word');
});
