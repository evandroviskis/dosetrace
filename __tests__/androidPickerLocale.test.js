'use strict';
// S25 walkthrough 2026-11-07 (app in Portuguese, phone in English): the Android date and time pickers
// spoke English ("November", "OK", "Cancel"). @react-native-community/datetimepicker has no locale on
// Android: its dialogs follow the process locale. Fix: the app language becomes the process locale
// through our own native module (no new dependency), and is applied again after every configuration
// change (fold/unfold, rotation), which resets it to the phone's. A binary without the function does
// nothing (an EAS Update over an older build keeps today's behaviour).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const KT = 'modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt';

test('S25 pickers: the native module sets the process locale and the resources, on the main thread; null gives back the phone\'s own', () => {
  const m = read(KT);
  assert.match(m, /Function\("setAppLocale"\) \{ tag: String\? ->/);
  assert.match(m, /Locale\.setDefault\(locale\)/);
  assert.match(m, /cfg\.setLocale\(locale\)/);
  assert.match(m, /Resources\.getSystem\(\)\.configuration\.locales\.get\(0\)/, 'null = the phone locale');
  assert.match(m, /Handler\(Looper\.getMainLooper\(\)\)\.post/, 'never off the main thread, and after the activity took the new configuration');
});

test('S25 pickers: a configuration change (fold, rotation) applies the app language again', () => {
  const m = read(KT);
  assert.match(m, /override fun onConfigurationChanged\(newConfig: Configuration\) \{[^}]*DisplayMetricsHolder\.initDisplayMetrics\(ctx\)[^}]*appLocaleTag\?\.let/);
});

test('S25 pickers: the JS wrapper is a no-op where the function is missing, and never touches a phone it never changed', () => {
  const j = read('modules/dt-exact-alarm/index.js');
  assert.match(j, /export function setAppLocale\(tag\) \{\s*if \(!Native \|\| !Native\.setAppLocale\) return false;\s*if \(tag == null && !appLocaleSet\) return false;/);
});

// Review 2026-11-07: an en-GB / pt-PT / es-MX phone already had pickers in its own regional format;
// forcing en-US / pt-BR / es-ES would break exactly the people who never had the bug.
test('S25 pickers: only an app language different from the phone\'s changes the locale; the same language keeps the phone\'s regional format', () => {
  const { pickerLocaleTag } = require('../lib/appLanguage');
  assert.equal(pickerLocaleTag('pt', 'en'), 'pt-BR');
  assert.equal(pickerLocaleTag('en', 'pt'), 'en-US');
  assert.equal(pickerLocaleTag('pt', 'pt'), null, 'pt-PT phone, pt app: its own format');
  assert.equal(pickerLocaleTag('en', 'en'), null, 'en-GB phone: its own format');
  assert.equal(pickerLocaleTag('de', null), 'de-DE', 'phone language unknown');
  const ctx = read('i18n/LanguageContext.js');
  assert.match(ctx, /useEffect\(\(\) => \{ if \(ready\) setAppLocale\(pickerLocaleTag\(language, phoneLanguage\.current\)\); \}, \[language, ready\]\);/);
  assert.match(ctx, /phoneLanguage\.current = deviceLanguage\(Localization\);/, 'read once, before any change of the locale');
});
