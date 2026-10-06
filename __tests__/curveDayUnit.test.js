'use strict';
// 2026-10-06 (store prints, French): the dose-accumulation screen wrote days with an English "d"
// in every language ("Derniers 3d", "+14d", "Demi-vie 8 d"). French writes "j" (jours), German
// "T" (Tage), Italian "gg" (giorni; a lone "g" reads as grams). The letter now comes from unit_day_short in each language.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');
const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');

test('unit_day_short is the native short day unit in each language', () => {
  const want = { en: 'd', es: 'd', pt: 'd', fr: 'j', de: 'T', it: 'gg' };
  for (const [l, v] of Object.entries(want)) assert.equal(T[l].unit_day_short, v, l);
});

test('the curve screen never hard-codes an English day letter', () => {
  assert.doesNotMatch(src, /\}d`/, 'template literal ending in }d');
  assert.doesNotMatch(src, /\{(pastDays|futureDays)\}d\b/, 'JSX {n}d');
  assert.doesNotMatch(src, /unit: 'd'/);
  assert.doesNotMatch(src, /inDays \? 'd'/);
  assert.match(src, /unit_day_short/);
});
