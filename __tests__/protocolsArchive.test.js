'use strict';
// Founder 2026-10-27 ("B aprovado", picture docs/design/protocols-archive-and-almost-all.html section 1):
// Ended and Recently deleted read as an archive, not as one more protocol — an ARQUIVO label with a hairline,
// both in ONE sunk block (well + line border, no raised white) 40 pt below the active protocols, names in ink2,
// a hollow color ring; with no active protocol the archive sits at the foot of the screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the label ×6, natural in each language', () => {
  const WANT = { en: 'Archive', es: 'Archivo', pt: 'Arquivo', fr: 'Archives', de: 'Archiv', it: 'Archivio' };
  for (const [l, v] of Object.entries(WANT)) assert.equal(translations[l].protocols_archive, v, l);
});

test('one archive zone holds Ended and Recently deleted, on the phone and in the book layout', () => {
  const src = read('screens/ProtocolsScreen.js');
  const zone = src.slice(src.indexOf('const archiveZone ='), src.indexOf('const bar = T.bar(trashSel)'));
  assert.ok(zone.length > 0, 'archiveZone exists');
  assert.match(zone, /accessibilityRole="header">\{t\('protocols_archive'\)\}/); // council delta 3: a header for screen readers
  assert.match(zone, /s\.archiveBlock/);
  assert.match(zone, /\{endedSection\}/);
  assert.match(zone, /\{deletedSection\}/);
  // the two sections are never rendered on their own any more
  const rest = src.replace(zone, '');
  assert.doesNotMatch(rest, /\{endedSection\}|&& endedSection\}/);
  assert.doesNotMatch(rest, /\{deletedSection\}|&& deletedSection\}/);
  assert.equal((src.match(/archiveZone\}/g) || []).length >= 2, true, 'phone list and book left page');
  // muted folds (no raised card of their own)
  const ended = src.slice(src.indexOf('const endedSection ='), src.indexOf('const deletedIds ='));
  const deleted = src.slice(src.indexOf('const deletedSection ='), src.indexOf('const archiveZone ='));
  assert.match(ended, /<CollapsibleSection[\s\S]*?muted/);
  assert.match(deleted, /<CollapsibleSection[\s\S]*?muted/);
});

test('styles: 40 pt apart, sunk block (well + line), ink2 names, hollow ring, foot of the screen when empty', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /archive: \{[^}]*marginTop: 40/);
  assert.match(src, /archiveBlock: \{[^}]*backgroundColor: c\.well[^}]*borderWidth: 1[^}]*borderColor: c\.line/);
  assert.match(src, /archiveLabel: \{[^}]*color: c\.ink3/);
  assert.match(src, /delName: \{[^}]*color: c\.ink2/);
  assert.match(src, /delRing: \{[^}]*borderWidth: 2[^}]*backgroundColor: 'transparent'/);
  assert.match(src, /protocols\.length === 0 && !loading && <View style=\{s\.archivePush\} \/>/);
  assert.match(src, /archivePush: \{ flexGrow: 1/);
  const C = read('components/CollapsibleSection.js');
  assert.match(C, /muted/);
  assert.match(C, /muted && s\.titleMuted/);
  assert.match(C, /titleMuted: \{ color: c\.ink2 \}/);
  assert.doesNotMatch(C, /#[0-9a-fA-F]{3,6}\b|'white'|'black'/);
});
