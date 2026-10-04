'use strict';
// Pre-build pass 2026-10-03, m2: on the protocol page the syringe size "1 ml · 100 u" wrapped
// and left the "u" alone on its own line. A number and its unit are joined by a no-break space
// (U+00A0), so the label can only break after the " · ".
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/syringes');
const NB = ' ';

test('number and unit never split: 1 ml · 100 u', () => {
  assert.equal(S.sizeLabelNoBreak(100, 'en'), `1${NB}ml${NB}· 100${NB}u`);
  assert.equal(S.sizeLabelNoBreak(30, 'pt'), `0,3${NB}ml${NB}· 30${NB}u`);
  assert.equal(S.sizeLabelNoBreak(300, 'en'), `3${NB}ml`);
});

test('the only place the label can break is after the dot', () => {
  for (const sz of [30, 50, 100]) {
    const parts = S.sizeLabelNoBreak(sz, 'en').split(' ');
    assert.equal(parts.length, 2, `${sz}: one breakable space`);
    assert.match(parts[1], /^\d+ u$/);
  }
});

test('the protocol page readings (volume, dose, syringe) keep each number with its unit', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /sizeLabelNoBreak as syringeSizeLabel/);
  assert.match(src, /\$\{decimalText\(trimZeros\(draw\.drawML\), language\)\}\\u00A0ml/);
  assert.match(src, /\$\{decimalText\(p\.dose, language\)\}\\u00A0\$\{p\.dose_unit\}/);
});
