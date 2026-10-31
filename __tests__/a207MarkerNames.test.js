// A-207 (founder 2026-10-31, "Pode executar agora"): a Portuguese report read by the AI came back as
// "Hemoglobin", "Ferritin", "Total Cholesterol" — the scan stores English names on purpose (one chart
// per test across labs and countries). The app shows them in its own language; the stored name never
// changes, so charts, favorites and sync are untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { markerLabel, markerToSave, MARKER_NAMES } = require('../lib/markerNames');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-207: stored English names show in the app language; English and unknown names stay as stored', () => {
  assert.equal(markerLabel('Hemoglobin', 'pt'), 'Hemoglobina');
  assert.equal(markerLabel('Total Cholesterol', 'pt'), 'Colesterol total');
  assert.equal(markerLabel('Cholesterol, Total', 'pt'), 'Colesterol total', 'word order and punctuation merged');
  assert.equal(markerLabel('Vitamin D (25-hydroxy)', 'de'), 'Vitamin D (25-Hydroxy)');
  assert.equal(markerLabel('Ferritin', 'en'), 'Ferritin');
  assert.equal(markerLabel('Anti-HIV 1+2', 'pt'), 'Anti-HIV 1+2');
  assert.equal(markerLabel('Hemoglobina', 'pt'), 'Hemoglobina', 'a name the person typed stays');
});

test('A-207: every name has its 5 translations, none empty', () => {
  for (const row of MARKER_NAMES) {
    assert.equal(row.length, 6, row[0]);
    for (const n of row) assert.ok(String(n).trim().length > 0, row[0]);
  }
});

test('A-207: a name left as shown keeps the stored one; a typed name is saved as typed', () => {
  assert.equal(markerToSave('Hemoglobina', 'Hemoglobin', 'pt'), 'Hemoglobin');
  assert.equal(markerToSave('Hemoglobina glicada', 'Hemoglobin', 'pt'), 'Hemoglobina glicada');
  assert.equal(markerToSave('LH', null, 'pt'), 'LH');
});

test('A-207: the lab screens and the export show the label; search finds both names; Save keeps the stored name', () => {
  const src = read('screens/BodyScreen.js');
  assert.match(src, /<Text style=\{\[s\.body, s\.grow\]\}>\{markerLabel\(m\.marker, language\)\}<\/Text>/);
  assert.match(src, /<Text style=\{s\.head\}>\{markerLabel\(mk\.marker, language\)\}<\/Text>/);
  assert.equal((src.match(/\{markerLabel\(markerDetail\.marker, language\)\}/g) || []).length, 2);
  assert.match(src, /setMName\(markerLabel\(obj\.marker \|\| '', language\)\);/);
  assert.match(src, /updateBiomarker\(mEdit\.id, \{ marker: markerToSave\(mName, mEdit\.marker, language\),/);
  assert.match(src, /markerLabel\(m\.marker, language\)\.toLowerCase\(\)\.includes\(q\)/);
  // S25 2026-10-31: "Excluir este valor?" said "Ferritin de 29 de outubro…" in Portuguese.
  assert.match(src, /deleteValueCopy\(t, markerLabel\(mEdit\.marker, language\),/);
  const exp = read('lib/exportRecords.js');
  assert.match(exp, /display: opts && opts\.language \? markerLabel\(latest\.marker, opts\.language\) : latest\.marker/);
});
