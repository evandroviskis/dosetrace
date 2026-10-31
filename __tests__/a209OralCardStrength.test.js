// A-209 (Android pass 2026-10-31, Fold folded, pt): the oral protocol card read "30 mg · 30 mg ·
// Diariamente" — the strength per serving and the dose side by side with nothing telling them
// apart. The strength now says what it is ("30 mg por porção"), in the term the protocol form uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');

test('A-209: the oral strength on the protocol card names itself, in the form\'s own term, ×6', () => {
  const want = { en: 'per serving', es: 'por porción', pt: 'por porção', fr: 'par portion', de: 'pro Portion', it: 'per porzione' };
  for (const [l, w] of Object.entries(want)) assert.equal(translations[l].protocols_serving_noun, w, l);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /return `\$\{decimalText\(p\.serving_strength, language\)\}\\u00A0\$\{unitText\(p\.serving_strength_unit \|\| 'mg', language\)\} \$\{t\('protocols_serving_noun'\)\}`;/);
});
