// A-133 (1) — store capture 2026-10-16: a protein shake answered with the brand chip
// ("Whey genérico" / "Whey Protein Pulver") lost its carbs AND protein (0 g). Cause: the
// follow-up result REPLACED the stored item ({ ...corrected }), so any macro the model left
// out (null after the server's numOrNull) or wrote as 0 wiped a known value; itemTotals then
// summed it as 0. The server also only showed the model the old kcal, never the macros.
//
// Rule (lib/nutrition applyFollowup): the answer's numbers replace the item's numbers, except
//   - a missing or non-numeric number never replaces a known one: the stored value stays,
//     scaled by the new/old kcal ratio when the kcal changed (same food, new amount/brand);
//   - a 0 replaces a known non-zero value only when the answer is a real re-estimate: its
//     four numbers are all given and the macros explain its kcal (4/4/9 kcal per g, within
//     30% or 20 kcal). "Coke Zero" (0/0/0/0) or whey with 0 carbs pass; 120 kcal with
//     0 protein and 0 carbs does not.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { applyFollowup } = require('../lib/nutrition');

const shake = { food: 'Proteinshake', qty: 1, unit: 'Shake', kcal: 180, protein_g: 25, carb_g: 8, fat_g: 3, confidence: 'low', category: 'drink', days_ago: null, asked: true, ask: { kind: 'brand', options: ['Whey Protein Pulver'] } };

test('A-133: a follow-up result with the macros left out keeps the stored macros (never 0)', () => {
  // What the server returns when the model gives only kcal: numOrNull → null.
  const corrected = { food: 'Whey Protein Pulver', qty: 1, unit: 'Shake', days_ago: null, kcal: 180, protein_g: null, carb_g: null, fat_g: null, confidence: 'med', category: 'drink' };
  const r = applyFollowup([shake], 0, corrected);
  assert.equal(r.items[0].food, 'Whey Protein Pulver');
  assert.equal(r.items[0].protein_g, 25, 'protein kept');
  assert.equal(r.items[0].carb_g, 8, 'carbs kept');
  assert.equal(r.items[0].fat_g, 3, 'fat kept');
  assert.deepEqual(r.totals, { kcal: 180, protein_g: 25, carb_g: 8, fat_g: 3 });
});

test('A-133: zeros that do not explain the kcal are not a re-estimate (protein + carbs were wiped)', () => {
  const corrected = { food: 'Whey genérico', qty: 1, unit: 'batido', days_ago: null, kcal: 180, protein_g: 0, carb_g: 0, fat_g: 3, confidence: 'med', category: 'drink' };
  const r = applyFollowup([shake], 0, corrected);
  assert.equal(r.items[0].protein_g, 25);
  assert.equal(r.items[0].carb_g, 8);
  assert.equal(r.items[0].fat_g, 3);
  assert.equal(r.totals.protein_g, 25);
  assert.equal(r.totals.carb_g, 8);
});

test('A-133: a missing macro follows a changed kcal (same food, new amount or brand)', () => {
  const corrected = { food: 'Proteinshake', qty: 2, unit: 'Shake', kcal: 360, protein_g: null, carb_g: undefined, fat_g: 'n/a', confidence: 'med', category: 'drink' };
  const r = applyFollowup([shake], 0, corrected);
  assert.equal(r.items[0].kcal, 360);
  assert.equal(r.items[0].protein_g, 50);
  assert.equal(r.items[0].carb_g, 16);
  assert.equal(r.items[0].fat_g, 6);
});

test('A-133: a missing kcal keeps the stored kcal', () => {
  const corrected = { food: 'Whey Protein Pulver', qty: 1, unit: 'Shake', kcal: null, protein_g: 24, carb_g: 3, fat_g: 2, confidence: 'med', category: 'drink' };
  const r = applyFollowup([shake], 0, corrected);
  assert.equal(r.items[0].kcal, 180);
  assert.equal(r.items[0].protein_g, 24, 'a given number is still taken');
});

test('A-133: a real re-estimate still updates every number, zeros included', () => {
  // Isopure zero carb: the macros explain the kcal (25*4 + 0*4 + 1*9 = 109 ≈ 110).
  const iso = applyFollowup([shake], 0, { food: 'Isopure', qty: 1, unit: 'scoop', kcal: 110, protein_g: 25, carb_g: 0, fat_g: 1, confidence: 'high', category: 'drink' });
  assert.deepEqual(iso.totals, { kcal: 110, protein_g: 25, carb_g: 0, fat_g: 1 });
  // "It was a Coke Zero": every number 0 is a real answer.
  const soda = { food: 'soda', qty: 1, unit: 'can', kcal: 140, protein_g: 0, carb_g: 39, fat_g: 0, confidence: 'low', category: 'drink' };
  const zero = applyFollowup([soda], 0, { food: 'Coke Zero', qty: 1, unit: 'can', kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, confidence: 'high', category: 'drink' });
  assert.deepEqual(zero.totals, { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
  // A 0 where the stored value was already 0 is always fine.
  const black = applyFollowup([{ food: 'coffee', qty: 1, unit: 'cup', kcal: 5, protein_g: 0, carb_g: 0, fat_g: 0 }], 0, { food: 'espresso', qty: 1, unit: 'cup', kcal: 2, protein_g: 0, carb_g: 0, fat_g: 0 });
  assert.deepEqual(black.totals, { kcal: 2, protein_g: 0, carb_g: 0, fat_g: 0 });
});

test('A-133: the other items and the entry totals are untouched by the merge', () => {
  const eggs = { food: 'eggs', qty: 2, unit: 'egg', kcal: 140, protein_g: 12, carb_g: 1, fat_g: 10 };
  const r = applyFollowup([eggs, shake], 1, { food: 'Whey Protein Pulver', qty: 1, unit: 'Shake', kcal: 180, protein_g: null, carb_g: null, fat_g: null });
  assert.deepEqual(r.items[0], eggs);
  assert.deepEqual(r.totals, { kcal: 320, protein_g: 37, carb_g: 9, fat_g: 13 });
});

// Server (supabase/functions/parse-food/index.ts, live v11): the follow-up text showed the
// model only the old kcal, so it had no macros to correct from. It now passes the item's
// stored protein/carbs/fat and asks for all four numbers, re-estimated for the corrected item.
const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');

test('A-133 server: the follow-up text gives the model the stored macros, not only the kcal', () => {
  const line = server.split('\n').find((l) => l.includes('Item logged:'));
  assert.ok(line, 'follow-up text line');
  for (const k of ['protein_g', 'carb_g', 'fat_g']) assert.ok(line.includes(`it.${k}`), `the line carries ${k}`);
});

test('A-133 server: FOLLOWUP_SYSTEM asks for all four numbers and never a 0 for a nutrient the food has', () => {
  const m = server.match(/const FOLLOWUP_SYSTEM = `([\s\S]*?)`;/);
  assert.ok(m);
  assert.match(m[1], /ALWAYS return all four numbers/);
  assert.match(m[1], /never 0 for a nutrient the food contains/i);
});
