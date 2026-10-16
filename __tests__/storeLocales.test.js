'use strict';
// A-130 (founder 2026-10-15): App Store and Play listed DoseTrace as English only although the
// app is in 6 languages. CFBundleLocalizations alone ships no xx.lproj folder in the binary, and
// the App Store derives the language list from those folders; the iOS permission prompts were
// English for everyone. Fix: expo.locales -> one locale file per language. Expo's prebuild writes
// ios/<app>/Supporting/<lang>.lproj/InfoPlist.strings (keys under "ios") and Android
// res/values-b+<lang>/strings.xml (keys under "android").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;

// The final Info.plist as prebuild/EAS compiles it (app.json + every plugin's defaults, e.g.
// expo-image-picker's microphone text, expo-secure-store's Face ID text). Introspection only:
// it reads the config and writes nothing.
async function finalInfoPlist() {
  const cliPkg = require.resolve('expo/node_modules/@expo/cli/package.json', { paths: [ROOT] });
  const { getPrebuildConfigAsync } = require(require.resolve('@expo/prebuild-config', { paths: [cliPkg] }));
  const { compileModsAsync } = require(require.resolve('@expo/config-plugins', { paths: [ROOT] }));
  const { exp } = await getPrebuildConfigAsync(ROOT, { platforms: ['ios'] });
  const out = await compileModsAsync(exp, { projectRoot: ROOT, introspect: true, platforms: ['ios'], assertMissingModProviders: false });
  return out.ios.infoPlist;
}
const userFacingKeys = (plist) => Object.keys(plist).filter((k) => /UsageDescription$/.test(k)).sort();
const readLocale = (lang) => JSON.parse(fs.readFileSync(path.join(ROOT, app.locales[lang]), 'utf8'));

test('A-130: app.json declares expo.locales for exactly the 6 app languages, matching CFBundleLocalizations', () => {
  assert.ok(app.locales && typeof app.locales === 'object', 'expo.locales missing');
  assert.deepEqual(Object.keys(app.locales).sort(), [...LANGS].sort());
  assert.deepEqual([...app.ios.infoPlist.CFBundleLocalizations].sort(), [...LANGS].sort());
  const { LANGUAGES } = (() => {
    const src = fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8');
    return { LANGUAGES: [...src.slice(0, src.indexOf('];')).matchAll(/code: '([a-z]{2})'/g)].map((m) => m[1]) };
  })();
  assert.deepEqual([...LANGUAGES].sort(), [...LANGS].sort(), 'same languages as the in-app picker');
  for (const lang of LANGS) {
    assert.equal(typeof app.locales[lang], 'string', `${lang}: path to a JSON file`);
    assert.ok(fs.existsSync(path.join(ROOT, app.locales[lang])), `${lang}: ${app.locales[lang]} exists`);
  }
});

test('A-130: every locale names the app DoseTrace on iOS (CFBundleDisplayName) and Android (app_name)', () => {
  for (const lang of LANGS) {
    const loc = readLocale(lang);
    assert.deepEqual(Object.keys(loc).sort(), ['android', 'ios'], `${lang}: only platform blocks (root keys would leak into both platforms)`);
    assert.equal(loc.ios.CFBundleDisplayName, 'DoseTrace', `${lang} iOS name`);
    assert.equal(loc.android.app_name, 'DoseTrace', `${lang} Android name`);
    assert.deepEqual(Object.keys(loc.android), ['app_name'], `${lang}: Android gets the name only`);
  }
});

test('A-130: every user-facing permission text in the final Info.plist is translated in every locale', async () => {
  const plist = await finalInfoPlist();
  const keys = userFacingKeys(plist);
  for (const k of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSDocumentPickerUsageDescription']) {
    assert.ok(keys.includes(k), `${k} expected in the final Info.plist`);
  }
  const en = readLocale('en').ios;
  for (const k of keys) {
    // English locale = the Info.plist text, with the build variable written out (InfoPlist.strings
    // does not expand $(PRODUCT_NAME)).
    assert.equal(en[k], String(plist[k]).replace(/\$\(PRODUCT_NAME\)/g, 'DoseTrace'), `en ${k} matches Info.plist`);
  }
  for (const lang of LANGS) {
    const ios = readLocale(lang).ios;
    assert.deepEqual(Object.keys(ios).filter((k) => /UsageDescription$/.test(k)).sort(), keys, `${lang}: exactly the Info.plist permission keys`);
    for (const k of Object.keys(ios)) {
      const v = ios[k];
      assert.equal(typeof v, 'string', `${lang} ${k}`);
      assert.ok(v.trim().length > 0, `${lang} ${k} non-empty`);
      // Expo writes key = "value"; without escaping, so a double quote, backslash or newline breaks the file.
      assert.ok(!/["\\\n]/.test(v), `${lang} ${k}: no double quote, backslash or newline`);
      assert.ok(!v.includes('$('), `${lang} ${k}: no build variable (not expanded in .strings)`);
      if (lang !== 'en' && k !== 'CFBundleDisplayName') assert.notEqual(v, en[k], `${lang} ${k} is translated`);
      if (/UsageDescription$/.test(k)) assert.ok(v.includes('DoseTrace'), `${lang} ${k} names the app`);
    }
  }
});
