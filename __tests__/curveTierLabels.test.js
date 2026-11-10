// Council 2026-11-09 (regulatory): the evidence badge on the curve qualifies the HALF-LIFE number, never
// the compound — "Clinical data" alone reads as proof that a compound works. Every language names the
// half-life in the clinical and studied badges.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations');

const HALF = { en: /^Half-life:/, es: /^Vida media:/, pt: /^Meia-vida:/, fr: /^Demi-vie ?:/, de: /^Halbwertszeit:/, it: /^Emivita:/ };

test('the curve evidence badges name the half-life (never a bare "Clinical data")', () => {
  for (const [lang, re] of Object.entries(HALF)) {
    const t = translations[lang];
    assert.match(t.curve_tier_clinical, re, `${lang} clinical`);
    assert.match(t.curve_tier_studied, re, `${lang} studied`);
  }
});
