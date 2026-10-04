'use strict';
// Redesign (Graduated), Settings part 2 — the sub-screens and sheets: language picker,
// legal reader, FAQ, edit profile, country, recently deleted. Guards the founder rules
// that slipped before: no emoji in the UI (the language picker showed flag emoji), theme
// tokens only so both themes resolve (the picker once rendered white-on-white in light),
// and the legal texts keep every word in all 6 languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const { translations, LANGUAGES } = require('../i18n/translations.js');
const { legalBlocks, isLegalHeading } = require('../lib/legalBlocks');

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
// Raw colors that only work in one theme. 'transparent' is not a color choice.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|'(white|black)'|rgba?\(/;

test('language picker: a language CODE tile (EN, ES, PT, FR, DE, IT), never the flag emoji', () => {
  const src = read('screens', 'SettingsScreen.js');
  assert.doesNotMatch(src, /lang\.flag/, 'the flag emoji is not rendered');
  assert.doesNotMatch(src, /langFlag/, 'the old flag style is gone (rebuild = replace)');
  assert.match(src, /<Text style=\{s\.langCodeText\}>\{lang\.code\.toUpperCase\(\)\}<\/Text>/);
  assert.deepEqual(LANGUAGES.map((l) => l.code.toUpperCase()), ['EN', 'ES', 'PT', 'FR', 'DE', 'IT']);
  // The picker rows draw from theme tokens (both themes resolve), not a fixed light fill.
  const g = src.slice(src.indexOf('const settingsGraduated = (c) => ({'));
  assert.match(g, /langCode: \{[^}]*backgroundColor: c\.well/);
  assert.match(g, /langCodeText: \{[^}]*color: c\.ink\b/);
  assert.match(g, /langNative: \{[^}]*color: c\.ink\b/);
  assert.match(g, /modal: \{[^}]*backgroundColor: c\.raised/);
});

test('sub-screens and sheets: no emoji and no hardcoded colors (theme tokens only)', () => {
  const settings = read('screens', 'SettingsScreen.js');
  const graduated = settings.slice(settings.indexOf('const settingsGraduated = (c) => ({'));
  const files = {
    'components/LegalModal.js': read('components', 'LegalModal.js'),
    'screens/FAQScreen.js': read('screens', 'FAQScreen.js'),
    'SettingsScreen settingsGraduated': graduated,
  };
  for (const [name, src] of Object.entries(files)) {
    assert.doesNotMatch(src, EMOJI, `${name}: emoji`);
    assert.doesNotMatch(src, COLOR_LITERAL, `${name}: color literal`);
    assert.doesNotMatch(src, /letterSpacing: (0\.[1-9]|[1-9])/, `${name}: letter-spaced label`);
    assert.doesNotMatch(src, /textTransform: 'uppercase'/, `${name}: uppercase label`);
    assert.doesNotMatch(src, /fontWeight: '(800|900)'/, `${name}: weight above 700`);
    assert.doesNotMatch(src, /shadow(Soft|Card)/, `${name}: shadow`);
    assert.doesNotMatch(src, /\bc\.(accent|accentSoft|accentSoftText|card2|textFaint)\b/, `${name}: retired token`);
  }
  // The JSX of the sub-screens (outside the style blocks) also uses tokens only.
  const jsx = settings.slice(settings.indexOf('{/* LANGUAGE PICKER MODAL */}'), settings.indexOf('const makeStyles'));
  assert.doesNotMatch(jsx, COLOR_LITERAL);
  assert.doesNotMatch(jsx, /colors\.(accent|accentSoft|textFaint|text|danger)\b/);
});

test('legal reader: every line of every legal text is kept, in order, in all 6 languages', () => {
  const expectHeadings = { settings_privacy_body: 9, settings_terms_body: 9, settings_disclaimer_body: 1 };
  for (const [key, n] of Object.entries(expectHeadings)) {
    for (const lang of Object.keys(translations)) {
      const body = translations[lang][key];
      assert.ok(body, `${lang}.${key}`);
      const blocks = legalBlocks(body);
      const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
      assert.deepEqual(blocks.map((b) => b.text), lines, `${lang}.${key}: words untouched`);
      assert.equal(blocks.filter((b) => b.heading).length, n, `${lang}.${key}: headings`);
      assert.equal(blocks[0].heading, true, `${lang}.${key}: opens on its title`);
    }
  }
  assert.equal(isLegalHeading('Last updated: April 2026'), false);
  assert.equal(isLegalHeading('2026'), false, 'a line with no letters is a paragraph');
  assert.equal(isLegalHeading('DATEN, DIE WIR ERFASSEN'), true);
  assert.equal(legalBlocks('').length, 0);
});

test('Gate B: sign-out and delete account keep their confirmations (two for delete)', () => {
  const src = read('screens', 'SettingsScreen.js');
  const so = src.slice(src.indexOf('async function handleSignOut()'), src.indexOf('function handleDeleteAccount()'));
  assert.match(so, /t\('settings_signout_confirm_local'\)/);
  assert.match(so, /signOutIntended\(\)/); // the one deliberate sign-out (lib/accountActions) marks it intended (A-46)
  const del = src.slice(src.indexOf('function handleDeleteAccount()'), src.indexOf('async function executeAccountDeletion()'));
  assert.match(del, /t\('settings_delete_permanent_msg'\)/);
  assert.match(del, /t\('settings_delete_final_msg'\)/);
  assert.match(del, /executeAccountDeletion\(\)/);
});
