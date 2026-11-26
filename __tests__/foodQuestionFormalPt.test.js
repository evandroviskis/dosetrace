'use strict';
// Founder 2026-11-26: "falar beliscou alguma coisa é muito informal" — the Portuguese day question about
// snacks reads formal and natural (memory "Formal Portuguese"), no slang or diminutives.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;

test('pt nutri_q_snack: formal, no "beliscou" and no diminutives', () => {
  const q = tr.pt.nutri_q_snack;
  assert.doesNotMatch(q, /belisc|barrinha|lanchinho/i);
  assert.equal(q, 'Comeu algum lanche ao longo do dia, como uma barra, uma fruta ou um iogurte?');
});

// Founder 2026-11-26: no regionalisms in any language — the word every speaker understands.
test('es and it nutri_q_snack: no regional or diminutive wording', () => {
  assert.equal(tr.es.nutri_q_snack, '¿Comiste algo entre comidas, como una barra, una fruta o un yogur?');
  assert.equal(tr.it.nutri_q_snack, 'Qualche spuntino durante la giornata, come una barretta, della frutta o uno yogurt?');
});
