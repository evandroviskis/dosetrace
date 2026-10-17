'use strict';
// A-141 (2) — Fold session 2026-10-17 (build 50): after a follow-up answer the food chat read
// "6 un de 6 un ravioli com molho de tomate" (pt) and "1 × bol pâtes au poulet sauce tomate" (fr).
// Cause: the follow-up text sends the item as "6 un ravioli com molho" and the model wrote the
// whole phrase back into "food" (qty, unit and all), with qty 6, unit "un"; itemLabel then put
// qty + unit in front again. "un" (and und / uds / Stk / pz / unité...) was not a known count
// word, so it was printed as a measure ("6 un de"). In French the model folded the unit into the
// name ("bol pâtes", no "de") and the unit-is-the-food rule (A-133) made it a count.
// Fix (client, every stored row too): itemLabel drops a food prefix that repeats the item's own
// qty (with its unit or a count word) or its unit, and reads every generic count word as no unit
// ("6 × ravioli…", FL-8's count form). Server (repo only): FOLLOWUP_SYSTEM says the food field
// never repeats the qty or the unit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { itemLabel } = require('../lib/nutrition');

test('A-141 (2): pt follow-up name that repeats qty + unit — "6 × ravioli com molho de tomate"', () => {
  assert.equal(itemLabel({ food: '6 un ravioli com molho de tomate', qty: 6, unit: 'un' }, 'pt'), '6 × ravioli com molho de tomate');
  assert.equal(itemLabel({ food: 'ravioli com molho de tomate', qty: 6, unit: 'un' }, 'pt'), '6 × ravioli com molho de tomate', 'un is a count word');
  assert.equal(itemLabel({ food: '6 unidades de ravioli', qty: 6, unit: 'unidades' }, 'pt'), '6 × ravioli');
  assert.equal(itemLabel({ food: '6x ravioli', qty: 6, unit: '' }, 'pt'), '6 × ravioli');
  assert.equal(itemLabel({ food: '6 × ravioli', qty: 6, unit: 'un' }, 'pt'), '6 × ravioli');
});

test('A-141 (2): fr name that folds the unit in — "1 bol de pâtes au poulet sauce tomate"', () => {
  assert.equal(itemLabel({ food: 'bol pâtes au poulet sauce tomate', qty: 1, unit: 'bol' }, 'fr'), '1 bol de pâtes au poulet sauce tomate');
  assert.equal(itemLabel({ food: '1 bol de pâtes au poulet', qty: 1, unit: 'bol' }, 'fr'), '1 bol de pâtes au poulet');
  assert.equal(itemLabel({ food: 'tasse de café', qty: 1, unit: 'tasse' }, 'fr'), '1 tasse de café');
  assert.equal(itemLabel({ food: '0,5 xícara de arroz', qty: 0.5, unit: 'xícara' }, 'pt'), '0,5 xícara de arroz', 'comma decimal qty');
  assert.equal(itemLabel({ food: '150 g Reis', qty: 150, unit: 'g' }, 'de'), '150 g Reis');
  assert.equal(itemLabel({ food: 'Schüssel Nudeln mit Hähnchen', qty: 1, unit: 'Schüssel' }, 'de'), '1 Schüssel Nudeln mit Hähnchen');
});

test('A-141 (2): every generic count word reads as no unit (N × food), in all 6 languages', () => {
  const words = ['un', 'un.', 'unit', 'units', 'unidade', 'unidades', 'und', 'und.', 'uds', 'ud', 'unid', 'unidad', 'pcs', 'pc', 'piece', 'pieces',
    'pièce', 'pièces', 'unité', 'unités', 'Stück', 'Stk.', 'St.', 'pezzo', 'pezzi', 'pz', 'unità'];
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const u of words) {
      assert.equal(itemLabel({ food: 'ravioli', qty: 6, unit: u }, lang), '6 × ravioli', `${lang} "${u}"`);
    }
  }
});

test('A-141 (2): names that only look alike are kept (no over-stripping)', () => {
  assert.equal(itemLabel({ food: 'batido de proteína', qty: 1, unit: 'batido' }, 'es'), '1 × batido de proteína', 'A-133: the unit is the food');
  assert.equal(itemLabel({ food: 'Proteinshake', qty: 1, unit: 'Shake' }, 'de'), '1 × Proteinshake');
  assert.equal(itemLabel({ food: '7 grain bread', qty: 2, unit: 'slices' }, 'en'), '2 slices 7 grain bread', 'a number in the name that is not the qty');
  assert.equal(itemLabel({ food: 'BUILT Puff', qty: 2, unit: 'bars' }, 'en'), '2 × BUILT Puff');
  assert.equal(itemLabel({ food: 'unagi', qty: 1, unit: 'un' }, 'en'), '1 × unagi', 'a word starting with the unit letters stays');
  assert.equal(itemLabel({ food: 'eggs', qty: 3, unit: 'egg' }, 'en'), '3 × eggs');
});

test('A-141 (2) server: FOLLOWUP_SYSTEM says the food field never repeats the qty or the unit', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');
  const m = server.match(/const FOLLOWUP_SYSTEM = `([\s\S]*?)`;/);
  assert.ok(m, 'FOLLOWUP_SYSTEM found');
  assert.match(m[1], /"food" is the name only/);
  assert.match(m[1], /never (repeat|repeats|includes?) the (quantity|qty) or the unit/i);
});
