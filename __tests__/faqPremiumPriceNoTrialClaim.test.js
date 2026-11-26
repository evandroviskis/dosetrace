'use strict';
// Found 2026-11-26 (agency's app specialist, checked here): the FAQ "How much does Premium cost?" promised
// "either plan with a 7-day free trial" and named only Monthly and Annual. The trial is only on the
// annual since 2026-11-19 and leaves the stores on the offer publication day; a 3-month plan exists.
// Like the protocol-limit sheet (DV-126), the answer never claims a trial: the upgrade screen shows
// the prices, trial and offer that apply to the person.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;

for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
  test(`premium_price (${lang}) claims no trial and names no fixed plan list`, () => {
    const cats = tr[lang].faq_categories;
    const q = cats.flatMap((c) => c.questions).find((x) => x.id === 'premium_price');
    assert.ok(q, 'question exists');
    assert.doesNotMatch(q.a, /7/, 'no "7-day" trial promise');
    assert.doesNotMatch(q.a, /monthly and annual|mensal e anual|mensual y anual|mensuelle et annuelle|monatlich und jährlich|mensile e annuale/i);
  });
}
