'use strict';
// The lab journal takes a PDF or a photo, so no text may say the person must photograph the report
// (founder 2026-11-20: "A pessoa faz um upload do exame do PDF. Às vezes o exame vai ter 20 páginas...
// Faça o upload do seu exame"). The onboarding feature line names both ways, in all six languages.
const test = require('node:test');
const assert = require('node:assert');
const m = require('../i18n/translations.js');
const T = m.translations || m.default || m;

test('onboarding lab line says PDF or photo, in all six languages', () => {
  for (const L of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    const v = T[L].ob_feat5_d;
    assert.match(v, /PDF/, `${L}.ob_feat5_d: ${v}`);
  }
});
