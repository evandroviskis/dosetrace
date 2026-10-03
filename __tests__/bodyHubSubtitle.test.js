'use strict';
// Founder 2026-10-02: the My Body subtitle said "Your records & body insights". "Insights"
// implies the app interprets the user's data (the AI hard line: DoseTrace only surfaces the
// user's own records). It now says "Your records, all in one place." in natural wording in
// every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();

test('My Body subtitle: your records in one place, no insights', () => {
  assert.equal(tr.en.body_hub_subtitle, 'Your records, all in one place.');
  const want = {
    es: 'Todos tus registros en un solo lugar.',
    pt: 'Todos os seus registros em um só lugar.',
    fr: 'Toutes vos données au même endroit.',
    de: 'Alle deine Einträge an einem Ort.',
    it: 'Tutti i tuoi dati in un unico posto.',
  };
  for (const [l, v] of Object.entries(want)) assert.equal(tr[l].body_hub_subtitle, v, l);
  for (const l of Object.keys(tr)) assert.doesNotMatch(tr[l].body_hub_subtitle, /insight|información corporal|Körperwerte|forma/i, l);
});
