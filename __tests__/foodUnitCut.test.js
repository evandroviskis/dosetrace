'use strict';
// A-133 (5) — store capture 2026-10-16 (iOS sim): answering the pt size chip "Pequena (300 ml)"
// for açaí showed "1 porção pequena ( de Açaí". Cause: the server caps the unit at 16 characters
// (shortText(unit, 16)), so "porção pequena (300 ml)" was stored as "porção pequena (", and
// itemLabel then joined " de Açaí" after the dangling parenthesis. Fix on the client, so ANY
// stored unit reads cleanly: a unit cut inside "(" / "[" drops the open fragment, and trailing
// punctuation goes. Server (repo only, not deployed): the unit cap is 24 and the same clean-up runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { itemLabel, cleanUnit } = require('../lib/nutrition');

test('A-133: a unit cut mid-parenthesis renders without the fragment', () => {
  assert.equal(itemLabel({ food: 'açaí', qty: 1, unit: 'porção pequena (' }, 'pt'), '1 porção pequena de açaí');
  assert.equal(itemLabel({ food: 'açaí', qty: 1, unit: 'porção pequena (300' }, 'pt'), '1 porção pequena de açaí');
  assert.equal(itemLabel({ food: 'açaí', qty: 1, unit: 'porção pequena (300 m' }, 'pt'), '1 porção pequena de açaí');
  assert.equal(itemLabel({ food: 'smoothie', qty: 1, unit: 'verre moyen [' }, 'fr'), '1 verre moyen de smoothie');
  assert.equal(itemLabel({ food: 'açaí bowl', qty: 1, unit: 'small (' }, 'en'), '1 small açaí bowl');
});

test('A-133: a whole parenthesis is kept', () => {
  assert.equal(itemLabel({ food: 'açaí', qty: 1, unit: 'porção pequena (300 ml)' }, 'pt'), '1 porção pequena (300 ml) de açaí');
  assert.equal(itemLabel({ food: 'aceite de oliva', qty: 1, unit: 'cucharada (15 ml)' }, 'es'), '1 cucharada (15 ml) de aceite de oliva');
});

test('A-133: trailing punctuation goes; a unit that was only a fragment reads as a count', () => {
  assert.equal(cleanUnit('copo grande,'), 'copo grande');
  assert.equal(cleanUnit('taza -'), 'taza');
  assert.equal(cleanUnit('c. à soupe'), 'c. à soupe', 'inner dots stay');
  assert.equal(cleanUnit('('), '');
  assert.equal(cleanUnit(null), '');
  assert.equal(itemLabel({ food: 'açaí', qty: 1, unit: '(' }, 'pt'), '1 × açaí');
});

// Server (supabase/functions/parse-food/index.ts, live v12): the unit cap is raised so a size
// with its millilitres fits, and a unit still cut inside a parenthesis drops the fragment.
const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');

test('A-133 server: the unit cap fits "porção pequena (300 ml)" and is used everywhere', () => {
  const m = server.match(/const UNIT_MAX = (\d+);/);
  assert.ok(m, 'UNIT_MAX constant');
  assert.ok(Number(m[1]) >= 'porção pequena (300 ml)'.length, 'cap fits the size with its ml');
  assert.doesNotMatch(server, /shortText\([^)]*unit, 16\)/, 'no unit is cut at 16 anymore');
  // A-151 wraps it in unitCase (German unit nouns capitalised); shortUnit still does the cut.
  assert.match(server, /unit: (?:unitCase\()?shortUnit\(it\.unit\)/, 'cleanItem uses shortUnit');
});

test('A-133 server: shortUnit drops a dangling "(" fragment (same rule as the app)', () => {
  const line = server.split('\n').find((l) => l.startsWith('const dropDangling = '));
  assert.ok(line, 'dropDangling one-liner');
  const js = line.replace(/^const dropDangling = /, '').replace(/: string/g, '').replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  const dropDangling = new Function('return ' + js)();
  assert.equal(dropDangling('porção pequena ('), 'porção pequena');
  assert.equal(dropDangling('porção pequena (300'), 'porção pequena');
  assert.equal(dropDangling('porção pequena (300 ml)'), 'porção pequena (300 ml)');
  assert.equal(dropDangling('copo grande,'), 'copo grande');
});
