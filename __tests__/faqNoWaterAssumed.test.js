'use strict';
// Founder 2026-11-20: "Por que a gente está deduzindo que a pessoa usou água? A pessoa vai usar um diluente"
// — no text assumes water; the liquid in the vial is always the diluent. Found 2026-11-26 still broken in two
// FAQ answers (calculator, vial life) in all six languages; the vial-life answer also claimed ~30 days of
// stability, which depends on the compound and the diluent (the app uses the validity the person sets).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const WATER = /bacteriostatic|bacteriost[aá]tic|bactériostatique|bakteriostatisch|batteriostatic/i;
const DILUENT = { en: /diluent/i, pt: /diluente/i, es: /diluyente/i, fr: /diluant/i, de: /Lösungsmittel/, it: /diluente/i };
for (const l of Object.keys(DILUENT)) {
  test(`FAQ (${l}): recon answers name the diluent, never assume bacteriostatic water`, () => {
    const qs = tr[l].faq_categories.flatMap((c) => c.questions);
    for (const id of ['recon_calculator', 'recon_vial_life']) {
      const a = qs.find((q) => q.id === id).a;
      assert.doesNotMatch(a, WATER, `${id} assumes water`);
      assert.match(a, DILUENT[l], `${id} names the diluent`);
    }
  });
}
