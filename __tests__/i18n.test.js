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

// Guards against the "dialog shows a raw key like settings_delete_protocol_title"
// bug: every static t('key') used in the app must exist in the English map (and
// therefore, via the parity test above, in all 6 languages). Keys ending in "_"
// are concatenation prefixes (e.g. t('profile_goal_' + value)) whose expansions
// are checked separately — real keys never end in "_", so we skip those.
test('every static t() key used in code exists in translations', () => {
  const SRC_DIRS = ['../screens', '../lib'];
  const SRC_FILES = ['../App.js'];
  const files = [];
  for (const d of SRC_DIRS) {
    const dir = path.join(__dirname, d);
    for (const rel of fs.readdirSync(dir, { recursive: true })) {
      if (String(rel).endsWith('.js')) files.push(path.join(dir, String(rel)));
    }
  }
  for (const f of SRC_FILES) files.push(path.join(__dirname, f));

  // Match a real t(...) call: `t` must not be part of a longer identifier
  // (so logEvent('x'), format('x') etc. don't match).
  const re = /(?<![A-Za-z0-9_])t\((['"`])([A-Za-z0-9_]+)\1/g;
  const used = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) used.add(m[2]);
  }

  const enKeys = translations[BASE];
  const missing = [...used]
    .filter((k) => !k.endsWith('_')) // skip concat prefixes
    .filter((k) => !(k in enKeys))
    .sort();
  assert.equal(
    missing.length, 0,
    `t() keys used in code but missing from translations (would render raw): ${missing.join(', ')}`
  );
});
