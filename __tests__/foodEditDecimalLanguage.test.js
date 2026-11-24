// Bug found 2026-11-24 (fiber-edit picture review): "Corrigir registro" read the typed numbers
// with parseDecimal(v) WITHOUT the app language, against the CLAUDE.md number rule. In pt a
// typed "1.250" kcal must be 1250 and "1,5" g must be 1.5; in en "1,200" stays 1200.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { editedItems } = require('../lib/nutrition');

const orig = [{ food: 'Arroz', kcal: 200, carb_g: 40, protein_g: 4 }];
const edit = (v, lang) => editedItems(orig, [{ __orig: 0, food: 'Arroz', kcal: v.kcal, carb_g: v.carb_g ?? 40, protein_g: v.protein_g ?? 4 }], lang)[0];

test('pt: a dot with 3-digit groups is thousands, a comma is the decimal', () => {
  assert.strictEqual(edit({ kcal: '1.250' }, 'pt').kcal, 1250);
  assert.strictEqual(edit({ kcal: '200', protein_g: '1,5' }, 'pt').protein_g, 1.5);
});

test('en: comma-grouped thousands stay thousands', () => {
  assert.strictEqual(edit({ kcal: '1,200' }, 'en').kcal, 1200);
});

test('the edit screen passes the app language', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/components/FoodEntryEditor.js'), 'utf8');
  assert.match(src, /editedItems\(orig, items, language\)/);
});
