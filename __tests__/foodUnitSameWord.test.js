'use strict';
// How-to recording 2026-11-26 (video 4): when the AI's unit is the food itself in another form, the
// receipt joined them as a measure. S25 Italian "3 uova, …" → "3 uovo di uova"; iPhone French
// "3 oeufs, …" → "3 œuf d'oeufs" (also in the Recent meals chip). Italian singular/plural change the
// last vowel (uovo/uova), and French writes œ or oe. Both now count as the same word → "3 × uova".
const test = require('node:test');
const assert = require('node:assert/strict');
const { itemLabel } = require('../lib/nutrition');

test('Italian: unit "uovo" of food "uova" is a count', () => {
  assert.equal(itemLabel({ food: 'uova', qty: 3, unit: 'uovo' }, 'it'), '3 × uova');
});

test('French: unit "œuf" of food "oeufs" (ligature written two ways) is a count', () => {
  assert.equal(itemLabel({ food: 'oeufs', qty: 3, unit: 'œuf' }, 'fr'), '3 × oeufs');
  assert.equal(itemLabel({ food: 'œufs', qty: 3, unit: 'oeuf' }, 'fr'), '3 × œufs');
});

test('other Romance singular/plural pairs count too', () => {
  assert.equal(itemLabel({ food: 'mele', qty: 2, unit: 'mela' }, 'it'), '2 × mele');
  assert.equal(itemLabel({ food: 'huevos', qty: 3, unit: 'huevo' }, 'es'), '3 × huevos');
});

test('a real measure still joins with "of"', () => {
  assert.equal(itemLabel({ food: 'latte', qty: 250, unit: 'ml' }, 'it'), '250 ml di latte');
  assert.equal(itemLabel({ food: 'pane tostato', qty: 2, unit: 'fette' }, 'it'), '2 fette di pane tostato');
  assert.equal(itemLabel({ food: 'potato salad', qty: 1, unit: 'pot' }, 'en'), '1 pot potato salad');
  assert.equal(itemLabel({ food: 'yogurt bianco', qty: 1, unit: 'vasetto' }, 'it'), '1 vasetto di yogurt bianco');
});
