'use strict';
// Settings must LOOK like the approved prototype (founder 2026-10-02, after seeing the
// prototype / new version / app side by side): "as setas ... no protótipo é mais clara, é mais
// nítida ... para colocar essa seta do tamanho do protótipo, os campos têm que ser maiores" and
// the Appearance control as one segmented bar ("como se fosse um slider") instead of 3 pills.
// docs/design/prototype.html: CHEV (9x15, stroke 2, tick), .setchev .chev (16x10), setRow()
// (fic 28 pt icon, no box, ink), .list padding 0 16 (rows and dividers inset), .setstack +
// .segw.fill (label row, then a full-width well bar; the chosen part raised, 700),
// fic() stroke 72/1024 (Q14 = A), sentence case "Usage analytics" / "Download my data".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const SET = read('screens', 'SettingsScreen.js');
const { translations } = require('../i18n/translations.js');

test('row arrows are the drawn prototype chevron, never the "›" glyph', () => {
  assert.ok(!SET.includes('›'), 'SettingsScreen still types a › glyph');
  const chev = read('components', 'RowChevron.js');
  assert.match(chev, /width=\{9\}/);
  assert.match(chev, /height=\{15\}/);
  assert.match(chev, /M2 2l6 6-6 6/);
  assert.match(chev, /strokeWidth=\{2\}/);
  assert.match(SET, /<RowChevron/);
});

test('group arrow is 16 x 10 inside the 36 pt round well', () => {
  assert.match(SET, /<Svg width=\{16\} height=\{10\}/);
  assert.match(SET, /setChev: \{ width: 36, height: 36, borderRadius: 18/);
});

test('row icons are 28 pt with no box', () => {
  assert.ok(!/FeatureIcon name="[a-z_]+" size=\{20\}/.test(SET), 'a 20 pt row icon is left');
  assert.ok(!SET.includes('rowIconBox'), 'the icon box is still used');
  assert.match(SET, /FeatureIcon name="palette" size=\{28\}/);
});

test('rows and dividers are inset inside the card (prototype .list padding 0 16)', () => {
  const row = SET.match(/\n  row: \{[^\n]*\}/)[0];
  assert.match(row, /marginHorizontal: 16/);
  assert.match(row, /paddingHorizontal: 0/);
  assert.match(row, /borderBottomWidth: 1\b/);
  const head = SET.match(/\n  setHead: \{[^\n]*\}/)[0];
  assert.match(head, /marginHorizontal: 16/);
});

test('Appearance and Time format are one segmented bar under their label', () => {
  assert.ok(!SET.includes('themePill'), 'the old pills are still there');
  const body = SET.slice(SET.indexOf('function renderAccountBody'), SET.indexOf('const GROUP_BODIES'));
  assert.equal((body.match(/style=\{s\.seg\}/g) || []).length, 2);
  assert.match(SET, /segItemOn: \{ backgroundColor: c\.raised/);
  assert.match(SET, /segTextOn: \{ color: c\.ink, fontWeight: '700' \}/);
});

test('feature icons draw at the prototype stroke 72/1024 (Q14 = A)', () => {
  const fi = read('components', 'FeatureIcon.js');
  assert.match(fi, /stroke-width="72"/);
});

test('sentence case for the two Settings rows, in every language', () => {
  const want = {
    en: ['Usage analytics', 'Download my data'],
    es: ['Analíticas de uso', 'Descargar mis datos'],
    pt: ['Análises de uso', 'Baixar meus dados'],
    fr: ["Analyses d'utilisation", 'Télécharger mes données'],
    de: ['Nutzungsanalysen', 'Meine Daten herunterladen'],
    it: ['Analisi di utilizzo', 'Scarica i miei dati'],
  };
  for (const [lang, [a, d]] of Object.entries(want)) {
    assert.equal(translations[lang].settings_analytics, a, lang);
    assert.equal(translations[lang].settings_export_title, d, lang);
  }
});
