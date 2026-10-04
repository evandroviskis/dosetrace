'use strict';
// Pre-build pass 2026-10-03, m9: the language picker's sub-labels stayed English ("Spanish",
// "Portuguese") in every app language. Each row keeps the language's own name as its main label
// and shows, under it, that language's name in the CURRENT app language (lang_name_* ×6); the
// sub-line is left out where it would only repeat the main label (the app's own language).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const CODES = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('every language name exists in every app language, and each language names itself natively', () => {
  const native = { en: 'English', es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano' };
  for (const app of CODES) for (const c of CODES) assert.ok(tr[app][`lang_name_${c}`], `${app}: lang_name_${c}`);
  for (const c of CODES) assert.equal(tr[c][`lang_name_${c}`], native[c]);
  assert.equal(tr.pt.lang_name_es, 'Espanhol');
  assert.equal(tr.de.lang_name_pt, 'Portugiesisch');
});

test('the picker shows the translated name, not the English name, and skips a repeat', () => {
  const s = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');
  const picker = s.slice(s.indexOf('{LANGUAGES.map((lang, idx) => ('), s.indexOf('<View style={{ height: 40 }} />', s.indexOf('{LANGUAGES.map((lang, idx) => (')));
  assert.doesNotMatch(picker, /\{lang\.name\}/);
  assert.match(picker, /t\(`lang_name_\$\{lang\.code\}`\)/);
  assert.match(picker, /!== lang\.native/);
});
