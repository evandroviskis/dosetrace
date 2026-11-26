'use strict';
// Founder 2026-11-26: "falar beliscou alguma coisa é muito informal" — the Portuguese food chat reads formal
// and natural (memory "Formal Portuguese"), no slang or diminutives; and no regionalisms in any language.
// The same day the day question after each entry (the snack question included) was replaced by the goodbye
// (docs/specs/food-log-recent-receipt.md FR-12): its strings are gone, and the new food chat strings keep
// the same rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NEW = ['nutri_input_placeholder', 'nutri_recent_label', 'nutri_recent_info', 'nutri_recent_title', 'nutri_recent_body', 'nutri_recent_hint',
  'nutri_recent_logged', 'nutri_receipt_logged', 'nutri_bye', 'nutri_bye_free', 'nutri_bye_next_breakfast', 'nutri_bye_next_lunch',
  'nutri_bye_next_dinner', 'nutri_bye_next_any'];

test('FR-12: the day question strings (snack question included) are gone in all 6 languages', () => {
  for (const l of LANGS) {
    for (const k of Object.keys(tr[l])) assert.doesNotMatch(k, /^nutri_q_/, `${l}.${k}`);
    assert.equal(tr[l].nutri_day_done_btn, undefined, `${l}: no "That's all for today" in the follow-up (FR-11)`);
  }
});

test('pt food chat: formal, no "beliscou", no diminutives, no "a gente" / "dá para"', () => {
  for (const k of NEW) {
    const v = tr.pt[k];
    assert.ok(v, k);
    assert.doesNotMatch(v, /belisc|barrinha|lanchinho|a gente|dá para|tá\b/i, k);
  }
  assert.equal(tr.pt.nutri_recent_label, 'Refeições recentes · toque para registrar de novo');
  assert.equal(tr.pt.nutri_bye, 'Pronto, anotado.');
  assert.equal(tr.pt.nutri_bye_next_dinner.replace('{time}', '19:30'), 'Até daqui a pouco: às 19:30 eu pergunto do jantar.');
  assert.equal(tr.pt.nutri_bye_free, 'Se comer mais alguma coisa, é só me contar.');
  assert.equal(tr.pt.nutri_input_placeholder, 'O que você comeu?');
});

test('es and it food chat: no regional or diminutive wording', () => {
  for (const k of NEW) {
    assert.doesNotMatch(tr.es[k], /picote|botana|merienda|-ito\b|ito\b/i, `es.${k}`);
    assert.doesNotMatch(tr.it[k], /merendina|spuntin[oi]ino|-ino\b/i, `it.${k}`);
  }
});

test('the new food chat strings exist, with their placeholders, in all 6 languages; fr says vous, de says du', () => {
  for (const l of LANGS) {
    for (const k of NEW) assert.ok(typeof tr[l][k] === 'string' && tr[l][k].trim(), `${l}.${k}`);
    for (const k of ['nutri_bye_next_breakfast', 'nutri_bye_next_lunch', 'nutri_bye_next_dinner', 'nutri_bye_next_any', 'nutri_receipt_logged']) assert.ok(tr[l][k].includes('{time}'), `${l}.${k}`);
    assert.ok(tr[l].nutri_recent_logged.includes('{meal}'), l);
    // The "i" sheet: what the row is, no typing / no waiting for the AI, same numbers, order by the time of day.
    assert.equal(tr[l].nutri_recent_body.split('\n\n').length, 3, l);
  }
  assert.match(tr.fr.nutri_recent_body, /\bvous\b/);
  assert.doesNotMatch(tr.fr.nutri_recent_body, /\btu\b|\bton\b|\btes\b/);
  assert.match(tr.de.nutri_recent_body, /\bdu\b/);
  assert.doesNotMatch(tr.de.nutri_recent_body, /\bSie\b/);
});
