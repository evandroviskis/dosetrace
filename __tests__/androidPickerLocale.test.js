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

// S25 device check 2026-11-07 (Android 17, phone en-US, app pt): with only the process locale changed,
// the dialog header read "Sáb., 7 de nov." but the month title, the weekday letters and CANCEL / OK
// stayed English (framework resources). Android 13+ has the official per-app language
// (LocaleManager.applicationLocales): every resource follows it, and MainActivity already handles
// locale changes itself (configChanges locale|layoutDirection), so nothing restarts.
test('S25 pickers: Android 13+ uses the per-app language; the same language as the phone clears it (the phone\'s own regional format)', () => {
  const m = read(KT);
  assert.match(m, /Function\("setAppLocale"\) \{ tag: String\? ->/);
  assert.match(m, /LocaleManager::class\.java/);
  assert.match(m, /applicationLocales = target/);
  assert.match(m, /val same = want == null \|\| want\.language == sys\.language/, 'en app on an en-GB phone, pt app on a pt-PT phone: untouched');
  assert.match(m, /LocaleList\.getEmptyLocaleList\(\)/);
  assert.match(m, /Resources\.getSystem\(\)\.configuration\.locales\.get\(0\)/, 'the real phone locale, never the app one');
  assert.match(m, /Handler\(Looper\.getMainLooper\(\)\)\.post/);
  const manifest = read('plugins/withFoldConfigChanges.js');
  assert.match(manifest, /'locale', 'layoutDirection'/, 'a language change never recreates the activity');
});

test('S25 pickers: below Android 13 the process locale and resources follow, again after a configuration change; a phone never changed is never touched', () => {
  const m = read(KT);
  assert.match(m, /Locale\.setDefault\(locale\)/);
  assert.match(m, /cfg\.setLocale\(locale\)/);
  assert.match(m, /if \(same && !legacyApplied\) return@post/);
  assert.match(m, /override fun onConfigurationChanged\(newConfig: Configuration\) \{[^}]*DisplayMetricsHolder\.initDisplayMetrics\(ctx\)[^}]*appLocaleTag\?\.let/);
});

test('S25 pickers: the JS wrapper is a no-op where the function is missing (older binary, iPhone)', () => {
  const j = read('modules/dt-exact-alarm/index.js');
  assert.match(j, /export function setAppLocale\(tag\) \{\s*if \(!Native \|\| !Native\.setAppLocale\) return false;/);
});

test('S25 pickers: the app language drives it with the tags the app formats dates with', () => {
  const ctx = read('i18n/LanguageContext.js');
  assert.match(ctx, /useEffect\(\(\) => \{ if \(ready\) setAppLocale\(LOCALES\[language\] \|\| 'en-US'\); \}, \[language, ready\]\);/);
  const { LOCALES } = require('../lib/timeFormat');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(LOCALES[l], l);
});

// S25 device check 2026-11-07 (Android 17, app pt): with the per-app language the date dialog was all
// Portuguese, but the time dialog still said "CANCEL" (the framework time dialog's own button). Every
// Android picker gets the app's own "Cancelar" / "OK" (works on any binary, even before the per-app
// language ships). And the protocol's time picker forced the 12-hour clock (AM/PM) for everyone; it
// follows the app's time format like the Dose log's.
test('S25 pickers: every system date / time picker carries the app\'s own Cancel / OK', () => {
  const { pickerButtons } = require('../lib/timeFormat');
  const T = require('../i18n/translations.js').translations;
  const pt = pickerButtons((k) => T.pt[k]);
  assert.deepEqual(pt, { positiveButton: { label: 'OK' }, negativeButton: { label: 'Cancelar' } });
  assert.equal(pickerButtons((k) => T.es[k]).positiveButton.label, 'Aceptar');
  for (const f of ['screens/ProtocolsScreen.js', 'screens/components/ProtocolParts.js', 'screens/components/DoseEditSheet.js']) {
    // A-155: the Android dialogs are drawn through ProtocolParts SystemPicker, a pass-through
    // (<DateTimePicker {...props} />) that gets the buttons from each caller.
    const src = read(f).replace('<DateTimePicker {...props} />', '');
    const n = (src.match(/<(DateTimePicker|SystemPicker)\b/g) || []).length;
    const withButtons = (src.match(/<(DateTimePicker|SystemPicker)\b[^>]*?\{\.\.\.pickerButtons\(t\)\}/gs) || []).length;
    assert.equal(withButtons, n, f);
  }
});

test('S25 pickers: the protocol\'s time picker follows the app\'s time format (never a forced 12-hour clock)', () => {
  const { pickerIs24Hour } = require('../lib/timeFormat');
  assert.equal(pickerIs24Hour('auto', 'pt'), true);
  assert.equal(pickerIs24Hour('auto', 'en'), false);
  assert.equal(pickerIs24Hour('12h', 'pt'), false);
  assert.equal(pickerIs24Hour('24h', 'en'), true);
  const src = read('screens/ProtocolsScreen.js');
  assert.doesNotMatch(src, /is24Hour=\{false\}/);
  assert.match(src, /is24Hour=\{pickerIs24Hour\(timeFormat, language\)\}/);
  assert.match(read('screens/components/DoseEditSheet.js'), /is24Hour=\{pickerIs24Hour\(timeFormat, language\)\}/);
});

// S25 2026-11-07 (pt): the Dose log's "Alterar horário" sheet read "Vitamina D3 · 2000 IU" — the stored
// unit shown raw. Display only goes through unitText (A-134: UI / IE); the saved unit stays 'IU'.
test('S25: the dose edit sheet writes the international unit in the app language (UI), never the stored IU', () => {
  const { unitText } = require('../lib/localeFormat');
  assert.equal(unitText('IU', 'pt'), 'UI');
  const src = read('screens/components/DoseEditSheet.js');
  assert.match(src, /const unitShown = unitText\(unit, language\);/);
  assert.match(src, /\\u00A0\$\{unitShown\}/);
  assert.match(src, /\{unit \? <Text style=\{s\.unit\}>\{unitShown\}<\/Text> : null\}/);
  assert.match(src, /onSave\('dose', \{ amount: r\.amount, unit: unitForDoseEdit\(log\) \}\)/, 'the saved unit is untouched');
});
