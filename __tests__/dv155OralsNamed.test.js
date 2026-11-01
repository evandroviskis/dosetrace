// DV-155 (AD-20; parked-error sweep 2026-10-31): oral protocols were dropped before the "not charted" reasons, so
// the curve never said why they were missing. They are named in their own "Sem curva" line (×6, es/fr/de/it
// wording to approve).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitCurveProtocols } = require('../lib/serumModel');

test('DV-155: orals are listed as not charted', () => {
  const r = splitCurveProtocols([{ id: 1, type: 'oral', name: 'Zinco', dose: 50, dose_unit: 'mg' }], (k) => k);
  assert.deepEqual(r.oral, ['Zinco']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /if \(notCharted\.oral && notCharted\.oral\.length\) out\.push\(t\('curve_not_charted_oral'\)\.replace\('\{names\}', notCharted\.oral\.join\(', '\)\)\);/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.match(translations[l].curve_not_charted_oral, /\{names\}/, l);
});
