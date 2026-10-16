'use strict';
// Council fix 4 (founder 2026-10-16, App Store guideline 2.3.10): the iOS app must not name Google
// Play / Android in its UI, and the Android app must not send users to the App Store / Apple. The FAQ
// "Can I cancel anytime?" and the Terms' Premium section named both stores. They now carry a token
// ({store_cancel} / {store_manage}) that lib/storeText.js fills with the running platform's own path:
// on iOS only the Apple path, on Android only the Google Play path. The privacy policy is left as is
// (it lists processors and "iPhone and Android", like the website).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fillStoreText } = require('../lib/storeText');

const ROOT = path.join(__dirname, '..');
function load() {
  const src = fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (l) => (k) => tr[l][k];
const faqText = (l, os) => tr[l].faq_categories
  .flatMap((c) => [c.category, ...c.questions.flatMap((q) => [q.q, fillStoreText(q.a, tFor(l), os)])]).join('\n');
const termsText = (l, os) => fillStoreText(tr[l].settings_terms_body, tFor(l), os);
const APPLE = /App Store|Apple ID|Apple-ID|ID de Apple|ID Apple|Identifiant Apple|Apple Account|Cuenta de Apple|Conta Apple|compte Apple|Account Apple|iPhone/;
const GOOGLE = /Google Play|Android/;
const cancelIdx = tr.en.faq_categories.flatMap((c) => c.questions).findIndex((q) => /cancel anytime/i.test(q.q));

test('council fix 4: on iOS the FAQ and the Terms name only Apple (no Google Play, no Android), in 6 languages', () => {
  for (const l of LANGS) {
    assert.doesNotMatch(faqText(l, 'ios'), GOOGLE, `${l} FAQ (iOS)`);
    assert.doesNotMatch(termsText(l, 'ios'), GOOGLE, `${l} Terms (iOS)`);
    const a = fillStoreText(tr[l].faq_categories.flatMap((c) => c.questions)[cancelIdx].a, tFor(l), 'ios');
    assert.match(a, /→/, `${l}: the iOS cancel answer gives the path`);
    assert.match(termsText(l, 'ios'), APPLE, `${l}: the iOS Terms say where to manage it`);
  }
});

test('council fix 4: on Android the FAQ and the Terms name only Google Play (no App Store, no Apple account)', () => {
  for (const l of LANGS) {
    assert.doesNotMatch(faqText(l, 'android'), APPLE, `${l} FAQ (Android)`);
    assert.doesNotMatch(termsText(l, 'android'), APPLE, `${l} Terms (Android)`);
    const a = fillStoreText(tr[l].faq_categories.flatMap((c) => c.questions)[cancelIdx].a, tFor(l), 'android');
    assert.match(a, /Google Play/, `${l}: the Android cancel answer`);
    assert.match(termsText(l, 'android'), /Google Play/, `${l}: the Android Terms`);
  }
});

test('council fix 4: no token is ever left in the rendered text; unknown platforms read as iOS', () => {
  for (const l of LANGS) for (const os of ['ios', 'android', 'web']) {
    assert.doesNotMatch(faqText(l, os), /\{store_/, `${l} ${os} FAQ`);
    assert.doesNotMatch(termsText(l, os), /\{store_/, `${l} ${os} Terms`);
  }
  assert.equal(termsText('en', 'web'), termsText('en', 'ios'));
  assert.equal(fillStoreText(undefined, tFor('en'), 'ios'), undefined, 'a missing text passes through');
});

test('council fix 4: every screen that shows the Terms or the FAQ fills the store text for Platform.OS', () => {
  for (const f of ['screens/SettingsScreen.js', 'screens/OnboardingFlowScreen.js', 'screens/AuthScreen.js']) {
    const src = read(f);
    assert.match(src, /import \{ fillStoreText \} from '\.\.\/lib\/storeText';/, f);
    assert.match(src, /content=\{fillStoreText\(t\('settings_terms_body'\), t, Platform\.OS\)\}/, f);
    assert.doesNotMatch(src, /content=\{t\('settings_terms_body'\)\}/, `${f}: no raw Terms`);
  }
  const pay = read('screens/PaywallScreen.js');
  assert.match(pay, /content=\{fillStoreText\(t\(terms\.bodyKey\), t, Platform\.OS\)\}/);
  const faq = read('screens/FAQScreen.js');
  assert.match(faq, /\{fillStoreText\(item\.a, t, Platform\.OS\)\}/);
});
