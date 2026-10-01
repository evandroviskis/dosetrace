'use strict';
// S-11 / RL-1: the app calls the live "parse-food" function (v9 code), not the test copy
// "parse-food-next". The deployed v9 answer is a superset of the old one (refusal, items,
// totals, clarify, days_ago + ask), so the store 1.2.4 app keeps working against it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('S-11: FOOD_FN is parse-food', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'nutritionClient.js'), 'utf8');
  assert.match(src, /export const FOOD_FN = 'parse-food';/);
});

test('S-11: the v9 parse-food still returns every field the 1.2.4 app reads (refusal, items, totals, clarify, days_ago)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');
  assert.match(src, /refusal: false, items, totals, clarify: null, ask, days_ago:/);
  assert.match(src, /refusal: true, items: \[\], totals: null, clarify: null, ask: null, days_ago: null/);
});
