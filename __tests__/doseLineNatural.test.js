// Found on the iPhone 2026-10-31 (parked-error sweep): a ready-to-use / reconstituted protocol's card and page
// read "100 mg dose" in Portuguese — the English word order with a suffix noun ("100 mg dosis", "100 mg Dosis"
// in es/de). Each language now says it its own way through one template: "Dose de 100 mg".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');

test('the dose line is a whole phrase per language, never a suffix noun', () => {
  const want = { en: '100 mg dose', es: 'Dosis de 100 mg', pt: 'Dose de 100 mg', fr: 'Dose de 100 mg', de: '100 mg pro Dosis', it: 'Dose da 100 mg' };
  for (const [lang, s] of Object.entries(want)) assert.equal(translations[lang].protocols_dose_line.replace('{amount}', '100 mg'), s, lang);
  const ps = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.doesNotMatch(ps, /protocols_dose_noun/);
  assert.equal(ps.split("t('protocols_dose_line').replace('{amount}'").length - 1, 2);
});
