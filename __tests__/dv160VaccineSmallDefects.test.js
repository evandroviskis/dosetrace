// DV-160 (parked-error sweep 2026-10-31) — five small My Body defects, one check each:
// (1) a vaccine PDF over the limit is refused before it is read; (2) a next dose before the date given is refused;
// (3) closing the untouched Next due wheel writes nothing; (4) a vaccine scan with no signed-in user says so (it
// said "0 imported"); (5) the lab read errors name the report, not "PDF", since a photo goes the same way (×6;
// pt formal "Não foi possível").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/VaccinesSection.js'), 'utf8');
const { translations } = require('../i18n/translations');

test('DV-160 (1): size before read', () => {
  const fn = src.slice(src.indexOf('async function pickPdfAndExtract() {'), src.indexOf('async function pickPdfAndExtract() {') + 800);
  assert.ok(fn.indexOf('file.size > MAX_FILE_BYTES') > 0 && fn.indexOf('file.size > MAX_FILE_BYTES') < fn.indexOf('readAsStringAsync'));
});
test('DV-160 (2): next due before the date given is refused', () => {
  assert.match(src, /if \(nextDue && dateGiven && nextDue < dateGiven\) \{ showToast\(t\('vax_due_before_given'\)\); return; \}/);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(translations[l].vax_due_before_given, l);
});
test('DV-160 (3): the untouched wheel writes nothing', () => {
  assert.doesNotMatch(src, /if \(!nextDue\) setNextDue\(today\)/);
});
test('DV-160 (4): no user → the sign-in error', () => {
  assert.match(src, /if \(saved == null\) \{ notice\(scanErrorSheet\('signin', t\)\); return; \}/);
});
test('DV-160 (5): the lab read errors never say PDF', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(translations[l].blood_error_extract_sub, /PDF/, l);
    assert.doesNotMatch(translations[l].blood_error_read, /PDF/, l);
  }
  assert.match(translations.pt.blood_error_read, /^Não foi possível/);
});
