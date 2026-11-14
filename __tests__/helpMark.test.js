'use strict';
// CE-4 (docs/specs/curve-explained.md): one shared help mark, components/HelpMark.js — the existing
// "help" glyph of the vector set, theme token ink2, a 44 pt touch area, a button with a label for the
// screen reader. The curve's title row uses it; the app's other help glyphs (the "?" beside the dose
// label in Protocols, the FAQ row in Settings) are drawn by it and still open what they opened.
// SexAtBirthWhy draws no help glyph (a text link with a chevron, and the info glyph in its note), so
// nothing there moves.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { translations: tr } = require('../i18n/translations.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('CE-4: HelpMark draws the help glyph in ink2 inside a 44 pt button with a label', () => {
  const src = read('components', 'HelpMark.js');
  assert.match(src, /<FeatureIcon name="help"/);
  assert.match(src, /colors\.ink2/);
  assert.match(src, /HELP_MARK_TOUCH = 44/);
  assert.match(src, /width: HELP_MARK_TOUCH, height: HELP_MARK_TOUCH/);
  assert.match(src, /accessibilityRole="button"/);
  assert.match(src, /accessibilityLabel=\{label \|\| t\('help_mark_label'\)\}/);
  // theme tokens only: no raw colour in the component
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  for (const l of LANGS) assert.ok(tr[l].help_mark_label && tr[l].help_mark_label.length < 12, l);
});

test('CE-4: the curve title row ends with the help mark, which reopens the three cards', () => {
  const src = read('screens', 'SerumCurveScreen.js');
  assert.match(src, /import HelpMark from '\.\.\/components\/HelpMark';/);
  assert.match(src, /<HelpMark onPress=\{\(\) => setCardsOpen\(true\)\} \/>/);
  const row = src.slice(src.indexOf('<View style={s.titleRow}>'), src.indexOf('</View>', src.indexOf('<View style={s.titleRow}>')));
  assert.ok(row.indexOf("t('body_card_dosing_title')") < row.indexOf('<HelpMark'), 'the mark comes after the name');
});

test('CE-4: the Protocols "?" beside the dose label is the shared help mark and still opens the explainer', () => {
  const src = read('screens', 'ProtocolsScreen.js');
  assert.match(src, /import HelpMark from '\.\.\/components\/HelpMark';/);
  assert.match(src, /<HelpMark onPress=\{\(\) => setExplainerOpen\(true\)\} label=\{t\('fx_title'\)\}/);
  assert.doesNotMatch(src, /<Text style=\{s\.qText\}>\?<\/Text>/, 'no hand-drawn "?" circle left');
  assert.doesNotMatch(src, /qBtn:|qText:/);
});

test('CE-4: the Settings FAQ row draws its glyph with the help mark and still opens the FAQ', () => {
  const src = read('screens', 'SettingsScreen.js');
  assert.match(src, /import HelpMark from '\.\.\/components\/HelpMark';/);
  const i = src.indexOf("onPress={() => navigation.navigate('FAQ')}");
  const row = src.slice(i, src.indexOf('</TouchableOpacity>', i));
  assert.match(row, /<HelpMark size=\{28\} color=\{colors\.text\} \/>/);
  assert.doesNotMatch(row, /<FeatureIcon name="help"/);
});

test('CE-4: no other screen draws the help glyph or a "?" circle by hand', () => {
  const dirs = ['screens', 'screens/components', 'components'];
  const offenders = [];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      if (!f.endsWith('.js') || f === 'HelpMark.js') continue;
      const src = read(d, f);
      if (/<FeatureIcon name="help"/.test(src) || />\?<\/Text>/.test(src)) offenders.push(`${d}/${f}`);
    }
  }
  assert.deepEqual(offenders, []);
});
