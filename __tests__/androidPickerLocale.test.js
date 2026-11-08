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

test('S25 pickers: the native module sets the process locale and the resources to the app language', () => {
  const m = read(KT);
  assert.match(m, /Function\("setAppLocale"\) \{ tag: String ->/);
  assert.match(m, /Locale\.setDefault\(locale\)/);
  assert.match(m, /cfg\.setLocale\(locale\)/);
});

test('S25 pickers: a configuration change (fold, rotation) applies the app language again', () => {
  const m = read(KT);
  assert.match(m, /override fun onConfigurationChanged\(newConfig: Configuration\) \{[^}]*DisplayMetricsHolder\.initDisplayMetrics\(ctx\)[^}]*appLocaleTag\?\.let/);
});

test('S25 pickers: the JS wrapper is a no-op where the function is missing (older binary, iPhone)', () => {
  const j = read('modules/dt-exact-alarm/index.js');
  assert.match(j, /export function setAppLocale\(tag\) \{\s*if \(!Native \|\| !Native\.setAppLocale\) return false;/);
});

test('S25 pickers: the app language drives the Android locale, with the same tags the app formats dates with', () => {
  const ctx = read('i18n/LanguageContext.js');
  assert.match(ctx, /useEffect\(\(\) => \{ if \(ready\) setAppLocale\(LOCALES\[language\] \|\| 'en-US'\); \}, \[language, ready\]\);/);
  const { LOCALES } = require('../lib/timeFormat');
  assert.equal(LOCALES.pt, 'pt-BR');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(LOCALES[l], l);
});
