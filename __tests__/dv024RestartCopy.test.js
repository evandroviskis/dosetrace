// DV-024 (AD-09; parked-error sweep 2026-10-31): the Restart question that offers "keep using the same vial /
// bottle" said the new run starts "with zero doses taken" — but the same container keeps its count (AD-09). The
// sentence before the choice no longer promises zero (×6, es/fr/de/it wording to approve).
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations');

test('DV-024: the choice sentence promises no zero count', () => {
  const banned = /zero|cero|zéro|null genommen/i;
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(translations[l].protocols_restart_body, banned, l);
  assert.equal(translations.pt.protocols_restart_body, 'Um novo ciclo começa hoje; o ciclo anterior fica no histórico. Vai usar um frasco novo ou continuar com o mesmo?'); // 2026-10-31 review: names the container (the buttons say frasco)
});
