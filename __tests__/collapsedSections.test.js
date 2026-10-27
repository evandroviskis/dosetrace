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
  assert.match(src, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(src, /<FoldChevron open=\{open\}/);
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
