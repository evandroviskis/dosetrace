'use strict';
// Review 2026-10-02 (maintenance, item 6): one source for each language's decimal mark,
// thousands separator and smallest grouped number — lib/localeFormat numberSymbols — and
// every UI-thread copy (the preview grouping, the animated numbers) derives from it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { numberSymbols, formatInt, formatNumber } = require('../lib/localeFormat');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('numberSymbols per language', () => {
  assert.deepEqual(numberSymbols('en'), { decimal: '.', group: ',', minGrouped: 1000 });
  assert.deepEqual(numberSymbols('pt'), { decimal: ',', group: '.', minGrouped: 1000 });
  assert.deepEqual(numberSymbols('de'), { decimal: ',', group: '.', minGrouped: 1000 });
  assert.deepEqual(numberSymbols('fr'), { decimal: ',', group: ' ', minGrouped: 1000 });
  assert.deepEqual(numberSymbols('es'), { decimal: ',', group: '.', minGrouped: 10000 });
  assert.deepEqual(numberSymbols('it'), { decimal: ',', group: '.', minGrouped: 10000 });
  assert.deepEqual(numberSymbols('xx'), numberSymbols('en'));
});

test('the formatters use the same symbols', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const { decimal, group, minGrouped } = numberSymbols(l);
    assert.equal(formatNumber(1.5, l), `1${decimal}5`, l);
    assert.equal(formatInt(minGrouped, l), `${String(minGrouped).slice(0, -3)}${group}000`, l);
    assert.equal(formatInt(minGrouped - 1, l), String(minGrouped - 1), l);
  }
});

test('no hand-written decimal or grouping copies are left: previews and animated numbers derive from numberSymbols', () => {
  for (const f of [['components', 'AccumulationHero.js'], ['screens', 'SerumCurveScreen.js'], ['components', 'FeatureExplainers.js'], ['components', 'previewFx.js']]) {
    const src = read(...f);
    assert.doesNotMatch(src, /language === 'en' \? '\.' : ','/, f.join('/'));
    assert.match(src, /numberSymbols/, f.join('/'));
  }
  const fx = read('components', 'previewFx.js');
  assert.doesNotMatch(fx, /sep: '\\u00A0'|sep: '\.', min: 10000/, 'numGroup has no table of its own');
});
