'use strict';
// One term per concept (CLAUDE.md translation rule). Found 2026-11-18 while merging the plan bars: German said
// "Protein" on the Progress card and "Eiweiß" in the food log, so the plan card showed both words.
// "Protein" is the app's term (11 strings, the calculator) and the usual word in German fitness apps.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;

test('German uses one word for protein: Protein, never Eiweiß', () => {
  const bad = Object.entries(tr.de).filter(([, v]) => typeof v === 'string' && /Eiweiß/.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
  assert.match(tr.de.pa_protein, /Protein/);
  assert.match(tr.de.nutri_protein, /Protein/);
});
