'use strict';
// Founder 2026-10-02: a single dose's status reads in the singular ("Tomada", not "Tomadas") —
// on each Dose log row and in the dose sheet. The counts above the list keep the plural.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');

test('singular status words for one dose, in 6 languages', () => {
  // Founder 2026-10-02: "Dose complete, Dose skipped and Dose missed" instead of "Taken / Tomada".
  const want = {
    en: ['Dose complete', 'Dose skipped', 'Dose missed'], es: ['Dosis completada', 'Dosis omitida', 'Dosis perdida'],
    pt: ['Dose concluída', 'Dose pulada', 'Dose perdida'], fr: ['Dose effectuée', 'Dose sautée', 'Dose manquée'],
    de: ['Dosis erledigt', 'Dosis übersprungen', 'Dosis verpasst'], it: ['Dose completata', 'Dose saltata', 'Dose mancata'],
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
