'use strict';
// Founder 2026-10-02: a single dose's status reads in the singular ("Tomada", not "Tomadas") —
// on each Dose log row and in the dose sheet. The counts above the list keep the plural.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');

test('singular status words for one dose, in 6 languages', () => {
  const want = {
    en: ['Taken', 'Skipped', 'Missed'], es: ['Tomada', 'Omitida', 'Perdida'], pt: ['Tomada', 'Pulada', 'Perdida'],
    fr: ['Prise', 'Passée', 'Manquée'], de: ['Eingenommen', 'Übersprungen', 'Verpasst'], it: ['Assunta', 'Saltata', 'Mancata'],
  };
  for (const [l, [a, b, c]] of Object.entries(want)) {
    assert.equal(translations[l].log_status_taken, a, l);
    assert.equal(translations[l].log_status_skipped, b, l);
    assert.equal(translations[l].log_status_missed, c, l);
  }
});

test('rows and the dose sheet use the singular words; the counts keep the plural', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'LogScreen.js'), 'utf8');
  assert.match(src, /function statusWord\(outcome\)/);
  assert.match(src, /\{statusWord\(log\.outcome\)\}/);
  assert.match(src, /\{statusWord\(shownSheet\.outcome\)\}/);
  assert.match(src, /<Text style=\{s\.trioCap\}>\{outcomeLabel\(c\.key\)\}<\/Text>/);
});
