'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// translations.js is authored as ESM (`export const ...`) for Metro. Load it here
// without a bundler by stripping the `export` keyword and evaluating the body as
// CommonJS — the file has no imports, so this is safe and self-contained.
function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const transformed = src.replace(/export\s+const/g, 'const') +
    '\nmodule.exports = { translations, LANGUAGES };';
  const mod = { exports: {} };
  new Function('module', 'exports', transformed)(mod, mod.exports);
  return mod.exports;
}

const { translations, LANGUAGES } = loadTranslations();
const langs = Object.keys(translations);
const BASE = 'en';
const placeholders = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');

test('all 6 launch languages are present', () => {
  assert.deepEqual(langs.sort(), ['de', 'en', 'es', 'fr', 'it', 'pt']);
  // LANGUAGES metadata list matches the translations map
  assert.deepEqual(LANGUAGES.map((l) => l.code).sort(), langs.sort());
});

test('every language has the exact same key set as English (no missing/extra)', () => {
  const baseKeys = Object.keys(translations[BASE]).sort();
  for (const l of langs) {
    if (l === BASE) continue;
    const keys = Object.keys(translations[l]).sort();
    const missing = baseKeys.filter((k) => !(k in translations[l]));
    const extra = keys.filter((k) => !(k in translations[BASE]));
    assert.equal(missing.length, 0, `[${l}] missing keys: ${missing.slice(0, 20).join(', ')}`);
    assert.equal(extra.length, 0, `[${l}] extra keys: ${extra.slice(0, 20).join(', ')}`);
  }
});

test('no empty or null translation values', () => {
  for (const l of langs) {
    const empties = Object.entries(translations[l])
      .filter(([, v]) => v === '' || v == null)
      .map(([k]) => k);
    assert.equal(empties.length, 0, `[${l}] empty values: ${empties.slice(0, 20).join(', ')}`);
  }
});

test('interpolation placeholders match English for every key', () => {
  const baseKeys = Object.keys(translations[BASE]);
  const problems = [];
  for (const key of baseKeys) {
    const enP = placeholders(translations[BASE][key]);
    if (!enP) continue;
    for (const l of langs) {
      if (l === BASE || translations[l][key] === undefined) continue;
      if (placeholders(translations[l][key]) !== enP) problems.push(`${l}:${key}`);
    }
  }
  assert.equal(problems.length, 0, `placeholder mismatches: ${problems.slice(0, 20).join(', ')}`);
});
