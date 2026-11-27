'use strict';
// Founder 2026-11-26 ("1 A", panel tab bac5b2b7): the AI food log note promised "±10–15%"
// accuracy with no source (published errors of AI estimates from a meal description are larger).
// A precision promise without evidence breaks the honesty principle, so the number goes, in all
// six languages; the note still says the numbers are AI estimates and not medical/diet advice.
// The calorie calculator's "±10–15% individual variation" (cal_disclaimer) is a different claim
// (spread of the BMR equations) and is not part of this decision.
const test = require('node:test');
const assert = require('node:assert/strict');
const translations = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('bac5b2b7: the AI food note makes no accuracy promise in any language', () => {
  for (const l of LANGS) {
    const s = translations[l].nutri_est_note;
    assert.ok(typeof s === 'string' && s.length > 0, l + ' has the note');
    assert.doesNotMatch(s, /±|\d+\s*[–-]\s*\d+\s*%|%/, l + ': ' + s);
  }
});

test('bac5b2b7: the note still says these are AI estimates, not medical or diet advice', () => {
  const want = { en: /AI estimates/, es: /IA/, pt: /IA/, fr: /IA/, de: /KI/, it: /IA/ };
  for (const l of LANGS) assert.match(translations[l].nutri_est_note, want[l], l);
});
