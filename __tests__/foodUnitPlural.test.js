'use strict';
// Bug found on the Fold 2026-11-26 (pt): "3 fatia de bacon", "2 fatia de torrada" — the model writes the
// unit in the singular and the label never matched it to the quantity. Display only: the stored row
// keeps what the model wrote. A unit the app does not know is left as written.
const test = require('node:test');
const assert = require('node:assert/strict');
const { itemLabel } = require('../lib/nutrition');

test('pt: the unit agrees with a quantity above 1', () => {
  assert.equal(itemLabel({ food: 'bacon', qty: 3, unit: 'fatia' }, 'pt'), '3 fatias de bacon');
  assert.equal(itemLabel({ food: 'torrada', qty: 2, unit: 'fatia' }, 'pt'), '2 fatias de torrada');
  assert.equal(itemLabel({ food: 'azeite', qty: 2, unit: 'colher de sopa' }, 'pt'), '2 colheres de sopa de azeite');
  assert.equal(itemLabel({ food: 'iogurte grego', qty: 2, unit: 'pote' }, 'pt'), '2 potes de iogurte grego');
  assert.equal(itemLabel({ food: 'bacon', qty: 1, unit: 'fatia' }, 'pt'), '1 fatia de bacon');
  assert.equal(itemLabel({ food: 'arroz', qty: 1.5, unit: 'xícara' }, 'pt'), '1,5 xícaras de arroz');
});

test('the other five languages', () => {
  assert.equal(itemLabel({ food: 'bacon', qty: 3, unit: 'slice' }, 'en'), '3 slices bacon');
  assert.equal(itemLabel({ food: 'pan', qty: 2, unit: 'rebanada' }, 'es'), '2 rebanadas de pan');
  assert.equal(itemLabel({ food: 'pain', qty: 2, unit: 'tranche' }, 'fr'), '2 tranches de pain');
  assert.equal(itemLabel({ food: 'pain', qty: 1.5, unit: 'tranche' }, 'fr'), '1,5 tranche de pain');
  assert.equal(itemLabel({ food: 'pane', qty: 2, unit: 'fetta' }, 'it'), '2 fette di pane');
  assert.equal(itemLabel({ food: 'Brot', qty: 2, unit: 'Scheibe' }, 'de'), '2 Scheiben Brot');
});

test('measures, plurals already written and unknown units stay as written', () => {
  assert.equal(itemLabel({ food: 'arroz', qty: 150, unit: 'g' }, 'pt'), '150 g de arroz');
  assert.equal(itemLabel({ food: 'bacon', qty: 3, unit: 'fatias' }, 'pt'), '3 fatias de bacon');
  assert.equal(itemLabel({ food: 'whey', qty: 2, unit: 'scoop' }, 'pt'), '2 scoops de whey');
  assert.equal(itemLabel({ food: 'bolo', qty: 2, unit: 'naco' }, 'pt'), '2 naco de bolo');
});
