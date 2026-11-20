'use strict';
// The five feature screens open the onboarding, so each must say it is a tour of what the app does
// (founder 2026-11-20 on the Fold: "O aplicativo não está mostrando que isso aqui são as funções do
// aplicativo... Dá a impressão até que é um protocolo"): a kicker "What DoseTrace does · n of 5" on
// every one, and an intro sentence on the first only.
const test = require('node:test');
const assert = require('node:assert');
const { FEATURE_KINDS, featureKicker } = require('../lib/obFeatures');
const m = require('../i18n/translations.js');
const T = m.translations || m.default || m;

const tFor = (L) => (k) => T[L][k];

test('every feature screen has a kicker with its place, in all six languages', () => {
  for (const L of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    FEATURE_KINDS.forEach((kind, i) => {
      const k = featureKicker(tFor(L), kind);
      assert.ok(k.kicker && k.kicker.includes(String(i + 1)) && k.kicker.includes('5'), `${L} ${kind}: ${k.kicker}`);
      assert.ok(!/\{/.test(k.kicker), `${L} ${kind}: placeholder left`);
    });
  }
});

test('only the first feature screen carries the intro sentence', () => {
  for (const L of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    FEATURE_KINDS.forEach((kind, i) => {
      const k = featureKicker(tFor(L), kind);
      if (i === 0) assert.ok(k.intro && k.intro.length > 10, `${L}: intro`);
      else assert.strictEqual(k.intro, null);
    });
  }
  assert.strictEqual(featureKicker(tFor('pt'), 'syringe').kicker, 'O que esperar do DoseTrace · 1 de 5');
});
