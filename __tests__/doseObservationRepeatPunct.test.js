'use strict';
// S25 2026-11-26: "…já sai com “Em jejum” e “Antes do treino. Sem dor no local.”. Você pode…" — the note's own
// full stop plus the sentence's full stop after the closing quote. The note is reproduced as written; only the
// sentence's extra stop goes when the quoted text already ends with . ! ? or …, in every language's quotes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { repeatBody } = require('../lib/doseObservation');
const { translations } = require('../i18n/translations');
const tFor = (l) => (k) => translations[l][k];

test('no double stop after a quoted note that ends with its own punctuation (6 languages)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const t = tFor(l);
    const close = t('dose_obs_quote').split('{x}')[1];
    const s = repeatBody({ repeat_dose_context: 'fasted', repeat_dose_note: 'Antes do treino. Sem dor no local.' }, 'BPC-157', t);
    assert.ok(s.includes('Sem dor no local.' + close), `${l}: the note stays as written`);
    assert.ok(!s.includes('local.' + close + '.'), `${l}: no extra stop: ${s}`);
    const plain = repeatBody({ repeat_dose_context: null, repeat_dose_note: 'Antes do treino' }, 'BPC-157', t);
    assert.ok(plain.includes('Antes do treino' + close), `${l}: a note without punctuation keeps the sentence as before`);
  }
});
