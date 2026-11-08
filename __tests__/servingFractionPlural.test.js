'use strict';
// S25 2026-11-07 (pt): a divisible tablet read "½ comprimidos" (en "½ tablets"), and the nearest-options
// line offered "0 comprimidos = 0 mg". The serving word used the count rule (singular only for 1;
// French 0 and 1), which puts every fraction in the plural; and computeServings bracketed a target
// below one step with a low option of 0 units.
// Fix: lib/plural servingPluralKey — each language's rule for an amount: "½" reads "half a…" (singular
// in all 6); Portuguese and French keep the singular below 2 ("1½ comprimido", "1½ comprimé", "1,5
// medida"); English, Spanish, German and Italian use the plural for 1½ and for any decimal ("1½
// tablets", "0.5 tablets left"). computeServings never offers 0 units: the low option is null.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { servingPluralKey, pluralKey } = require('../lib/plural');
const { computeServings, servingText } = require('../lib/oralMath');

const word = (n, l, opts) => tr[l][servingPluralKey('oral_unit_tablet', n, l, opts)];

test('serving plural: ½ tablet is singular in all 6 languages', () => {
  const half = { en: 'tablet', es: 'comprimido', pt: 'comprimido', fr: 'comprimé', de: 'Tablette', it: 'compressa' };
  for (const [l, w] of Object.entries(half)) {
    assert.equal(word(0.5, l), w, l);
    assert.equal(`${servingText(0.5, l)} ${word(0.5, l)}`, `½ ${w}`, l);
  }
});

test('serving plural: 1½ follows each language (pt / fr singular below 2; en es de it plural)', () => {
  const oneHalf = { en: 'tablets', es: 'comprimidos', pt: 'comprimido', fr: 'comprimé', de: 'Tabletten', it: 'compresse' };
  for (const [l, w] of Object.entries(oneHalf)) {
    assert.equal(word(1.5, l), w, l);
    assert.equal(servingText(1.5, l), '1½');
  }
});

test('serving plural: whole counts keep the count rule (1 singular; 2 plural; French 0 singular)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.equal(servingPluralKey('oral_unit_tablet', 1, l), 'oral_unit_tablet_one', l);
    assert.equal(servingPluralKey('oral_unit_tablet', 2, l), 'oral_unit_tablet', l);
    assert.equal(servingPluralKey('oral_unit_tablet', 3, l), pluralKey('oral_unit_tablet', 3, l), l);
    assert.equal(servingPluralKey('oral_unit_tablet', 2.5, l), 'oral_unit_tablet', `${l} 2½`);
  }
  assert.equal(servingPluralKey('oral_unit_tablet', 0, 'fr'), 'oral_unit_tablet_one');
  assert.equal(servingPluralKey('oral_unit_tablet', 0, 'pt'), 'oral_unit_tablet');
});

test('serving plural: a decimal printed as a decimal (not the ½ sign) follows the decimal rule', () => {
  // "Left: 0,5" — a decimal, not "½".
  assert.equal(word(0.5, 'en', { glyph: false }), 'tablets');
  assert.equal(word(0.5, 'es', { glyph: false }), 'comprimidos');
  assert.equal(word(0.5, 'de', { glyph: false }), 'Tabletten');
  assert.equal(word(0.5, 'it', { glyph: false }), 'compresse');
  assert.equal(word(0.5, 'pt', { glyph: false }), 'comprimido');
  assert.equal(word(1.25, 'fr', { glyph: false }), 'comprimé');
  // A non-half amount is printed as a decimal by servingText, so it is never read as "½".
  assert.equal(servingText(0.75, 'pt'), '0,75');
  assert.equal(word(0.75, 'en'), 'tablets');
  assert.equal(word(0.75, 'pt'), 'comprimido');
});

test('nearest options: never "0 tablets = 0 mg"', () => {
  // 200 mg from a scored 1000 mg tablet: below one half → only ½ is offered.
  const r = computeServings({ targetDose: 200, doseUnit: 'mg', servingStrength: 1000, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Tablet', divisible: true });
  assert.equal(r.isAchievable, false);
  assert.equal(r.nearest.lowUnits, null);
  assert.equal(r.nearest.lowDose, null);
  assert.equal(r.nearest.highUnits, 0.5);
  assert.equal(r.nearest.highDose, 500);
  // Not divisible: 800 mg from a 1600 mg capsule → only 1 capsule.
  const c = computeServings({ targetDose: 800, doseUnit: 'mg', servingStrength: 1600, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Capsule' });
  assert.deepEqual(c.nearest, { lowUnits: null, lowDose: null, highUnits: 1, highDose: 1600 });
  // Above one step both options stay.
  const b = computeServings({ targetDose: 800, doseUnit: 'mg', servingStrength: 1000, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Tablet', divisible: true });
  assert.deepEqual(b.nearest, { lowUnits: 0.5, lowDose: 500, highUnits: 1, highDose: 1000 });
});

test('nearest options: the protocol page and the wizard print only the options that exist, with the amount word', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.equal((src.match(/const unitWord = \(n\) => t\(servingPluralKey\(r\.unitKey, n, language\)\);/g) || []).length, 2, 'the page and the wizard');
  assert.equal((src.match(/r\.nearest\.lowUnits != null \?/g) || []).length, 2, 'the low option only when it exists');
  assert.doesNotMatch(src, /function fmtServing/, 'one formatter, lib/oralMath servingText');
});
