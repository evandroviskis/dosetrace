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
    de: ['Dosis erledigt', 'Dosis ausgelassen', 'Dosis verpasst'], it: ['Dose completata', 'Dose saltata', 'Dose mancata'],
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

// Founder 2026-10-02 ("troca os outros também"): the counts and the filter bar of the Dose log
// and Today's Taken fold / take button / dose-page state also stop saying "Taken".
test('no "Taken" wording left in the counts, the filter and Today (6 languages)', () => {
  const counts = { en: 'Complete', es: 'Completadas', pt: 'Concluídas', fr: 'Effectuées', de: 'Erledigt', it: 'Completate' };
  const today = { en: 'Complete', es: 'Completado', pt: 'Concluído', fr: 'Effectué', de: 'Erledigt', it: 'Completato' };
  for (const l of Object.keys(counts)) {
    assert.equal(translations[l].log_taken, counts[l], l);
    assert.equal(translations[l].today_taken, today[l], l);
  }
});

test('Today counts say complete, not taken (6 languages)', () => {
  const doses = { en: '{x} of {y} complete', es: '{x} de {y} completadas', pt: '{x} de {y} concluídas', fr: '{x} sur {y} effectuées', de: '{x} von {y} erledigt', it: '{x} di {y} completate' };
  const partial = { en: 'complete today', es: 'completadas hoy', pt: 'concluídas hoje', fr: "effectuées aujourd'hui", de: 'heute erledigt', it: 'completate oggi' };
  for (const l of Object.keys(doses)) {
    assert.equal(translations[l].today_doses_taken, doses[l], l);
    assert.equal(translations[l].today_taken_partial, partial[l], l);
  }
});
