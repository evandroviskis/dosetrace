'use strict';
// Three defects found on the simulator in the My Protocols rebuild (2026-10-02):
// 1. Edit -> Cancel: the sheet flashed "New protocol / Name your compound" while it slid
//    away, because closing reset the form (editingId -> null) before the sheet was gone.
// 2. Wizard step 4 read "7:20PM": iOS formats the time with a narrow no-break space
//    (U+202F), so AM/PM nearly touched the number. It reads "7:20 PM".
// 3. The protocol page's vial line read "Mixed on Sep 27"; the approved design (and
//    Today's vial line) says "Mixed Sep 27".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCREEN = fs.readFileSync(path.join(ROOT, 'screens', 'ProtocolsScreen.js'), 'utf8');
const fnBody = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a >= 0, `function ${name}`);
  let depth = 0, i = src.indexOf(') {', a) + 2; // the body, past any destructured params
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};

test('1: closing the wizard does not reset the form while the sheet is still on screen', () => {
  const close = fnBody(SCREEN, 'closeWizard');
  assert.match(close, /setShowModal\(false\)/);
  assert.doesNotMatch(close, /resetForm\(\)/, 'closeWizard must not reset the form before the sheet is hidden');
  assert.doesNotMatch(close, /setEditingId\(/, 'closeWizard must not clear editingId before the sheet is hidden');
  // No close path resets the form in the same tick as hiding the sheet.
  assert.doesNotMatch(SCREEN, /setShowModal\(false\);\s*resetForm\(\)/, 'every close goes through closeWizard');
  // The reset runs once the sheet is fully gone (iOS onDismiss / the fallback timer / Android).
  assert.match(SCREEN, /if \(!showModal && !wizardPresented && resetOnHiddenRef\.current\) \{\s*resetOnHiddenRef\.current = false;\s*resetForm\(\);/);
  assert.match(SCREEN, /\}, \[showModal, wizardPresented\]\);/);
  // Discard (a new protocol with input) closes through the same path.
  assert.match(fnBody(SCREEN, 'cancelWizard'), /kind: 'danger', onPress: closeWizard/);
});

test('2: a time never has a narrow space before AM/PM ("7:20 PM")', () => {
  const { formatTime } = require('../lib/timeFormat');
  const orig = Date.prototype.toLocaleTimeString;
  try {
    // What iOS 17+ returns: "7:20 PM".
    Date.prototype.toLocaleTimeString = function () { return '7:20 PM'; };
    assert.equal(formatTime('19:20', 'en', '12h'), '7:20 PM');
    Date.prototype.toLocaleTimeString = function () { return '7:20 PM'; };
    assert.equal(formatTime('19:20', 'en', '12h'), '7:20 PM');
  } finally {
    Date.prototype.toLocaleTimeString = orig;
  }
  assert.match(SCREEN, /function formatTimeAMPM\(time24\) \{\s*return formatTime\(time24, language, timeFormat\);/);
});

test('3: the protocol page vial line says "Mixed Sep 27", the same words as Today', () => {
  const block = fnBody(SCREEN, 'ProtocolVialBlock');
  // The date in the app language, the same formatter as Today (founder 2026-10-02: "Mixed Sep 27",
  // "Misturado 27 de set.").
  assert.match(block, /`\$\{t\('today_vial_mixed'\)\} \$\{formatDate\(d, language, 'dayMonth'\)\}`/);
  assert.doesNotMatch(block, /vials_mix_date/);
  const src = fs.readFileSync(path.join(ROOT, 'i18n', 'translations.js'), 'utf8')
    .replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  const { translations } = mod.exports;
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[lang].today_vial_mixed, `today_vial_mixed in ${lang}`);
    assert.doesNotMatch(translations[lang].today_vial_mixed, /\s(on|el|em|le|am|il)$/i, `${lang} has no trailing "on"`);
  }
  assert.equal(translations.en.today_vial_mixed, 'Mixed');
});
