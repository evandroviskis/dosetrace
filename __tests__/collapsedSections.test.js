'use strict';
// Founder 2026-10-27 (picture docs/design/recently-deleted-collapsed.html approved; app-wide rule): a
// secondary section arrives CLOSED on every visit — one line (title + summary + fold arrow), a tap opens it,
// another closes it; screen readers hear expanded / collapsed. One component for every place.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the component: closed on mount, toggles, tells screen readers, theme tokens only', () => {
  const src = read('components/CollapsibleSection.js');
  assert.match(src, /useState\(false\)/, 'closed on every visit (never remembered)');
  assert.match(src, /accessibilityState=\{\{ expanded: shown \}\}/);
  assert.match(src, /<FoldChevron open=\{shown\}/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b|'white'|'black'/);
});

test('Recently deleted uses it, with "N protocolos" ×6 (singular too); Select only when open', () => {
  const src = read('screens/ProtocolsScreen.js');
  const block = src.slice(src.indexOf('const deletedSection ='), src.indexOf('const bar = T.bar(trashSel)'));
  assert.match(block, /<CollapsibleSection/);
  assert.match(block, /pluralKey\('protocols_count_n', deletedProtocols\.length, language\)/);
  const WANT = { en: ['{n} protocols', '{n} protocol'], es: ['{n} protocolos', '{n} protocolo'], pt: ['{n} protocolos', '{n} protocolo'], fr: ['{n} protocoles', '{n} protocole'], de: ['{n} Protokolle', '{n} Protokoll'], it: ['{n} protocolli', '{n} protocollo'] };
  for (const [l, [many, one]] of Object.entries(WANT)) {
    assert.equal(translations[l].protocols_count_n, many, l);
    assert.equal(translations[l].protocols_count_n_one, one, l);
  }
});

test('Ended (Encerrados) uses it too, with the same count line', () => {
  const src = read('screens/ProtocolsScreen.js');
  const block = src.slice(src.indexOf('const endedSection ='), src.indexOf('const deletedIds ='));
  assert.match(block, /<CollapsibleSection/);
  assert.match(block, /title=\{t\('protocols_ended_title'\)\}/);
  assert.match(block, /pluralKey\('protocols_count_n', endedProtocols\.length, language\)/);
});

// Founder 2026-10-27: "encontre mais partes do aplicativo que precisem fazer essa opção de colapsar, não
// precisa me mostrar desenho". Each place arrives closed with a short summary; disclaimers stay visible.
test('the other places: protocol dose details and an empty note, the curve date estimate and model notes, the measurements history, lab tips, empty labels, marker readings', () => {
  const P = read('screens/ProtocolsScreen.js');
  assert.match(P, /<CollapsibleSection style=\{s\.blkNext\} title=\{t\('protocols_step_dose'\)\}/);
  assert.match(P, /<NoteFrame saved=\{!!p\.note\}/);
  const C = read('screens/SerumCurveScreen.js');
  assert.doesNotMatch(C, /<CollapsibleSection title=\{t\('curve_readout_title'\)\}/, 'council 2026-10-27: the date estimate stays open');
  assert.match(C, /<CollapsibleSection title=\{t\('curve_model_title'\)\}/);
  assert.doesNotMatch(C, /'▴' : '▾'/, 'the source toggle draws the fold arrow, never a text glyph');
  assert.match(C, /<Text style=\{s\.disclaimer\}>\{t\('curve_disclaimer'\)\}<\/Text>/, 'the disclaimer stays open');
  const K = read('screens/components/CalculatorSection.js');
  assert.match(K, /foldRow\('rcLog', t\('cal_rc_log_title'\)/);
  assert.match(K, /useState\(false\); \/\/ founder 2026-10-27: the history arrives closed/);
  const B = read('screens/BodyScreen.js');
  assert.match(B, /<CollapsibleSection title=\{t\('blood_what_we_read'\)\}>/);
  assert.match(B, /<TagsFrame hasTags=/);
  assert.match(B, /<CollapsibleSection title=\{t\('blood_readings_title'\)\}/);
  for (const k of ['protocols_notes_empty', 'curve_readout_pick', 'curve_model_title', 'cal_rc_log_n', 'cal_rc_log_n_one', 'blood_tags_none', 'blood_readings_title']) {
    for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
  }
  assert.equal(translations.pt.protocols_notes_empty, 'Nenhuma nota');
  assert.equal(translations.pt.cal_rc_log_n, '{n} medições');
});

test('council: the fold arrow matches the app\'s other folds (ink3)', () => {
  assert.match(read('components/CollapsibleSection.js'), /<FoldChevron open=\{shown\} color=\{colors\.ink3\} \/>/);
});

// Council 2026-10-27 (senior): a section never hides work in progress — open while a selection or an unsaved
// note exists (forceOpen); the header control is a sibling of the toggle (VoiceOver reaches it).
test('council: forceOpen keeps a section open for work in progress; the header control is outside the toggle', () => {
  const src = read('components/CollapsibleSection.js');
  assert.match(src, /const shown = open \|\| !!forceOpen;/);
  assert.match(src, /<\/TouchableOpacity>\s*\{shown && headerExtra \? <View style=\{s\.extra\}>\{headerExtra\}<\/View> : null\}/);
  const P = read('screens/ProtocolsScreen.js');
  assert.match(P, /forceOpen=\{!!trashSel\}/);
  assert.match(P, /<NoteFrame saved=\{!!p\.note\} dirty=\{noteDirty\}/);
});
