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
