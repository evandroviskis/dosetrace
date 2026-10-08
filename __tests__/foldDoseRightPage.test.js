'use strict';
// A-115 (founder 2026-10-07, picture docs/design/a115-fold-dose-right-page.html approved — "o seu
// desenho foi aprovado, pode construir"): on the unfolded Fold the right page ADDS to the left, never
// repeats. A tapped dose on Today opens that protocol's page (everything My Protocols shows, with the
// app's own syringe); with no mixed vial it explains why and offers "+ Add vial". Skip / Mark taken
// stay on the left card only; "Delete protocol" is not offered there. Supersedes BK-3's dose page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { read } = require('./helpers/extractFn');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const TODAY = read('screens/TodayScreen.js');
const PROT = read('screens/ProtocolsScreen.js');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const right = between(TODAY, 'function renderRightPage()', '\n  }\n');

test('A-115: a tapped dose opens the protocol page on the right (the same ProtocolDetail as My Protocols)', () => {
  assert.match(PROT, /export function ProtocolDetail\(/);
  assert.match(TODAY, /import \{ ProtocolDetail, noteDraftKey \} from '\.\/ProtocolsScreen';/);
  assert.match(right, /<ProtocolDetail/);
  assert.match(right, /deleteProtocol=\{null\}/, 'no Delete next to the doses');
  assert.match(PROT, /\{deleteProtocol \? \(/, 'ProtocolDetail hides Delete when none is given');
  assert.match(right, /navigation\.navigate\('Protocols', \{ openProtocolId: p\.id \}\)/, 'Edit and the sheets open in My Protocols');
  assert.match(right, /<LogScreen embedded/, 'nothing tapped: the Dose log, as before');
});

test('A-115: the right page never repeats the card — no Mark taken, Skip or Undo there', () => {
  for (const id of ['handleTake', 'skipDose', 'takePending', 'skipPending', 'undoFromPage', 'DosePage']) assert.ok(!right.includes(id), `renderRightPage mentions ${id}`);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'screens', 'components', 'DosePage.js')), 'the old dose page is gone (rebuild = replace)');
});

test('A-115: the syringe is the app\'s standard SyringeScale (ProtocolDrawHero)', () => {
  const hero = between(PROT, 'function ProtocolDrawHero(', '\nfunction ');
  assert.match(hero, /<SyringeScale /);
  assert.match(between(PROT, 'export function ProtocolDetail(', '\n}\n'), /<ProtocolDrawHero /);
});

test('A-115: no mixed vial — the right page explains why and offers + Add vial (Today\'s own vial prompt)', () => {
  assert.match(right, /p\.type === 'recon' && !vial/);
  assert.match(right, /today_novial_title/);
  assert.match(right, /today_novial_body/);
  assert.match(right, /showVialPromptFor\(p\)/);
  assert.match(right, /t\('today_add_vial'\)/);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['today_novial_title', 'today_novial_body']) assert.ok(T[l][k], `${l} ${k}`);
  assert.equal(T.pt.today_novial_title, 'Nenhum frasco reconstituído agora');
});

test('A-115: a note typed on the right page saves like My Protocols (same draft key, same write)', () => {
  assert.match(right, /draft=\{getDraft\(noteDraftKey\(p\.id\)\)\}/);
  assert.match(TODAY, /updateProtocol\(id, \{ note: trimmed \? trimmed : null \}\)/);
});
