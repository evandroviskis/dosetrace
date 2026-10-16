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

// The final Info.plist / AndroidManifest as prebuild/EAS compiles them (app.json + every plugin's
// defaults, e.g. expo-secure-store's Face ID text). Introspection only:
// it reads the config and writes nothing.
async function introspect(platform) {
  const cliPkg = require.resolve('expo/node_modules/@expo/cli/package.json', { paths: [ROOT] });
  const { getPrebuildConfigAsync } = require(require.resolve('@expo/prebuild-config', { paths: [cliPkg] }));
  const { compileModsAsync } = require(require.resolve('@expo/config-plugins', { paths: [ROOT] }));
  const { exp } = await getPrebuildConfigAsync(ROOT, { platforms: [platform] });
  return compileModsAsync(exp, { projectRoot: ROOT, introspect: true, platforms: [platform], assertMissingModProviders: false });
}
async function finalInfoPlist() {
  return (await introspect('ios')).ios.infoPlist;
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

// A-130 follow-up (Apple 5.1.1: a purpose text must match every real use; never ask for what the
// app never uses). Camera and photo library serve lab reports (BodyScreen), vaccine cards
// (VaccinesSection) and vial labels (ProtocolsScreen); the file picker serves lab and vaccine-card
// PDFs. Each term is the app's own word for it in that language (i18n/translations.js).
const USES = {
  en: { lab: /lab report|bloodwork/i, vax: /vaccine card/i, vial: /vial label/i },
  es: { lab: /análisis/i, vax: /cartilla de vacunas/i, vial: /etiqueta/i },
  pt: { lab: /exame/i, vax: /carteira de vacinação/i, vial: /rótulo/i },
  fr: { lab: /bilan/i, vax: /carnet de vaccination/i, vial: /étiquette/i },
  de: { lab: /Laborbericht/i, vax: /Impfpass/i, vial: /Etikett/i },
  it: { lab: /referto|referti/i, vax: /libretto vaccinale/i, vial: /etichett/i },
};

test('A-130: every camera, photo and file picker call is one the purpose texts cover', () => {
  const callers = (re) => ['screens', 'components', 'lib'].flatMap(function walk(dir) {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return walk(rel);
      return /\.js$/.test(e.name) && re.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')) ? [rel] : [];
    });
  }).sort();
  // A new caller means the camera / photos / files texts must be re-checked for the new use.
  assert.deepEqual(callers(/ImagePicker\.launch(Camera|ImageLibrary)Async/), ['screens/BodyScreen.js', 'screens/ProtocolsScreen.js', 'screens/components/VaccinesSection.js']);
  assert.deepEqual(callers(/DocumentPicker\.getDocumentAsync/), ['screens/BodyScreen.js', 'screens/components/VaccinesSection.js']);
  assert.deepEqual(callers(/mediaTypes:\s*\[(?![^\]]*'images'\s*\])/), [], 'images only: no video, so no microphone');
  assert.deepEqual(callers(/MediaTypeOptions\.(All|Videos)|['"]videos['"]/), [], 'no video picking anywhere');
});

test('A-130: camera and photo texts name lab reports, vaccine cards and vial labels; files text names labs and vaccine cards', () => {
  for (const lang of LANGS) {
    const ios = readLocale(lang).ios;
    for (const k of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']) {
      for (const use of ['lab', 'vax', 'vial']) assert.match(ios[k], USES[lang][use], `${lang} ${k} covers ${use}`);
    }
    for (const use of ['lab', 'vax']) assert.match(ios.NSDocumentPickerUsageDescription, USES[lang][use], `${lang} files text covers ${use}`);
  }
});

test('A-130: no microphone: iOS has no microphone text, Android blocks RECORD_AUDIO', async () => {
  const plist = await finalInfoPlist();
  assert.equal(plist.NSMicrophoneUsageDescription, undefined, 'iOS Info.plist has no microphone text');
  const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
  assert.ok(plugin, 'expo-image-picker configured in app.json');
  assert.equal(plugin[1].microphonePermission, false);
  const out = await introspect('android');
  const perms = out._internal.modResults.android.manifest.manifest['uses-permission'] || [];
  const audio = perms.filter((p) => p.$['android:name'] === 'android.permission.RECORD_AUDIO');
  assert.ok(audio.length > 0 && audio.every((p) => p.$['tools:node'] === 'remove'), 'RECORD_AUDIO only as a tools:node="remove" block');
});

// Council fix 5g (founder 2026-10-16): DoseTrace never uses Face ID or any biometrics, so the final
// Info.plist must not carry expo-secure-store's default Face ID text (Apple 5.1.1: never ask for
// what the app never uses). The plugin's faceIDPermission: false deletes the key.
test('5g: no Face ID text — the secure-store plugin is told false, and no locale carries one', async () => {
  const plugin = app.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-secure-store');
  assert.ok(Array.isArray(plugin), 'expo-secure-store configured with options');
  assert.equal(plugin[1].faceIDPermission, false);
  const plist = await finalInfoPlist();
  assert.equal(plist.NSFaceIDUsageDescription, undefined, 'the final Info.plist has no Face ID text');
  for (const lang of LANGS) assert.equal(readLocale(lang).ios.NSFaceIDUsageDescription, undefined, `${lang}: no Face ID text`);
  // Nothing in the app asks SecureStore (or anything else) for biometrics.
  for (const dir of ['lib', 'screens', 'components']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith('.js')) continue;
      assert.doesNotMatch(fs.readFileSync(path.join(ROOT, dir, f), 'utf8'), /requireAuthentication|LocalAuthentication/, `${dir}/${f}`);
    }
  }
});

// Council fix 5h: the English permission texts use the serial comma, like the rest of the English app.
test('5h: English camera and photo texts use the serial comma (app.json = locales/en.json)', () => {
  const en = readLocale('en').ios;
  assert.equal(en.NSCameraUsageDescription, 'DoseTrace needs camera access so you can snap a photo of a lab report, vaccine card, or vial label.');
  assert.equal(en.NSPhotoLibraryUsageDescription, 'DoseTrace needs photo library access to upload photos of lab reports, vaccine cards, and vial labels.');
  for (const k of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']) assert.equal(app.ios.infoPlist[k], en[k], `app.json ${k}`);
});
