'use strict';
// A-133 (4) — store capture 2026-10-16: the food chat entry cards and the "Noted" echo joined
// qty + unit + food word for word: fr "1 verre moyen smoothie" (French needs "de"), de
// "1 Shake Proteinshake" (the unit repeats the food). itemLabel is now language-aware:
//   - a measure joins the food with the language's "of": fr/es/pt "de" (fr d’ before a vowel
//     or a mute h), it "di", en/de nothing ("150 g rice", "150 g Reis");
//   - a unit the food name already holds (as a word, or the end of a compound such as
//     Proteinshake) or a generic count word is dropped: "1 × Proteinshake".
const test = require('node:test');
const assert = require('node:assert/strict');
const { itemLabel } = require('../lib/nutrition');

test('A-133: French joins a measure with de / d’', () => {
  assert.equal(itemLabel({ food: 'smoothie', qty: 1, unit: 'verre moyen' }, 'fr'), '1 verre moyen de smoothie');
  assert.equal(itemLabel({ food: 'riz', qty: 150, unit: 'g' }, 'fr'), '150 g de riz');
  assert.equal(itemLabel({ food: 'eau', qty: 1, unit: 'verre' }, 'fr'), '1 verre d’eau');
  assert.equal(itemLabel({ food: 'huile d’olive', qty: 1, unit: 'c. à soupe' }, 'fr'), '1 c. à soupe d’huile d’olive');
  assert.equal(itemLabel({ food: 'Isopure', qty: 1, unit: 'dose' }, 'fr'), '1 dose d’Isopure');
  assert.equal(itemLabel({ food: 'haricots verts', qty: 200, unit: 'g' }, 'fr'), '200 g de haricots verts', 'h aspiré: no elision');
  assert.equal(itemLabel({ food: 'yaourt', qty: 1, unit: 'pot' }, 'fr'), '1 pot de yaourt');
  assert.equal(itemLabel({ food: 'BUILT Puff', qty: 2, unit: 'barres' }, 'fr'), '2 × BUILT Puff', 'a count stays N ×');
});

test('A-133: Spanish and Portuguese join a measure with de', () => {
  assert.equal(itemLabel({ food: 'arroz', qty: 150, unit: 'g' }, 'es'), '150 g de arroz');
  assert.equal(itemLabel({ food: 'smoothie', qty: 1, unit: 'vaso mediano' }, 'es'), '1 vaso mediano de smoothie');
  assert.equal(itemLabel({ food: 'aveia', qty: 0.5, unit: 'xícara' }, 'pt'), '0,5 xícara de aveia');
  assert.equal(itemLabel({ food: 'peito de frango grelhado', qty: 180, unit: 'g' }, 'pt'), '180 g de peito de frango grelhado');
  assert.equal(itemLabel({ food: 'ovos', qty: 3, unit: 'unidades' }, 'pt'), '3 × ovos');
});

test('A-133: Italian joins a measure with di', () => {
  assert.equal(itemLabel({ food: 'riso', qty: 150, unit: 'g' }, 'it'), '150 g di riso');
  assert.equal(itemLabel({ food: 'latte', qty: 1, unit: 'tazza' }, 'it'), '1 tazza di latte');
});

test('A-133: English and German add nothing between measure and food', () => {
  assert.equal(itemLabel({ food: 'rice', qty: 150, unit: 'g' }, 'en'), '150 g rice');
  assert.equal(itemLabel({ food: 'Reis', qty: 150, unit: 'g' }, 'de'), '150 g Reis');
  assert.equal(itemLabel({ food: 'Haferflocken', qty: 0.5, unit: 'Tasse' }, 'de'), '0,5 Tasse Haferflocken');
});

test('A-133: a unit the food already names is dropped (de 1 Shake Proteinshake)', () => {
  assert.equal(itemLabel({ food: 'Proteinshake', qty: 1, unit: 'Shake' }, 'de'), '1 × Proteinshake');
  assert.equal(itemLabel({ food: 'protein shake', qty: 1, unit: 'shake' }, 'en'), '1 × protein shake');
  assert.equal(itemLabel({ food: 'batido de proteína', qty: 1, unit: 'batido' }, 'es'), '1 × batido de proteína');
  assert.equal(itemLabel({ food: 'Whey genérico', qty: 1, unit: 'batido' }, 'es'), '1 batido de Whey genérico');
  assert.equal(itemLabel({ food: 'Orangensaft', qty: 1, unit: 'Glas' }, 'de'), '1 Glas Orangensaft');
  assert.equal(itemLabel({ food: 'potato salad', qty: 1, unit: 'pot' }, 'en'), '1 pot potato salad', 'a unit inside another word is not the food');
});
