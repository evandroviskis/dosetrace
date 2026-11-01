// DV-070 (parked-error sweep 2026-10-31): the curve showed the raw key "substance_boldenone" (missing in all 6
// languages). Every substance named in lib/halfLives now has its name in every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const { HALF_LIVES } = require('../lib/halfLives');
const { translations } = require('../i18n/translations');

test('DV-070: every halfLives substance has a name in all 6 languages', () => {
  const subs = new Set(Object.values(HALF_LIVES).map((e) => e && e.substance).filter(Boolean));
  assert.ok(subs.has('boldenone'));
  for (const s of subs) for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(translations[l][`substance_${s}`], `${l}.substance_${s}`);
});
