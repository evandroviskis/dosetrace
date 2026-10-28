'use strict';
// DV-237 (found again on the iPhone simulator, Gate S 2026-10-28): a Premium account with an empty
// lab journal was told "You get 3 free scans a month". AD-69: Premium strings never carry a scan
// number. The empty card keeps the free text for a free account and uses a Premium sentence without
// a number otherwise (also while Premium is not known yet, so a paying user never sees the limit).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8');
const valuesOf = (key) => [...src.matchAll(new RegExp(`\\n\\s+${key}: (['"])(.*)\\1,`, 'g'))].map((m) => m[2]);
const body = fs.readFileSync(path.join(__dirname, '..', 'screens', 'BodyScreen.js'), 'utf8');

test('DV-237: blood_empty_sub_premium exists in 6 languages, carries no number and no "free"', () => {
  const v = valuesOf('blood_empty_sub_premium');
  assert.equal(v.length, 6);
  for (const s of v) {
    assert.doesNotMatch(s, /\d/, s);
    assert.doesNotMatch(s, /free|gratis|grátis|gratuit|kostenlos|gratuite/i, s);
  }
  assert.equal(new Set(v).size, 6, 'each language its own sentence');
});

test('DV-237: the empty lab card shows the free sentence only to a known free account', () => {
  assert.match(body, /t\(premium === false \? 'blood_empty_sub' : 'blood_empty_sub_premium'\)/);
  assert.doesNotMatch(body, /\{t\('blood_empty_sub'\)\}/);
});
