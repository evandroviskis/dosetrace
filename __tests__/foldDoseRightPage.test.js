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

// FR-3 (picture a115 "sem frasco" + docs/decisions.md 2026-10-07 night item 5: "no syringe, no supply"):
// a lyophilized protocol with no mixed vial shows the notice under its name and tags, and NO syringe and
// NO vial block (the app does not know the concentration, so neither can be drawn). Tablets / capsules
// without a bottle get the bottle wording. My Protocols' own page is unchanged (it never passes withoutVial).
test('A-115 FR-3: which notice the right page shows (pure rule)', () => {
  const { supplyNotice } = require('../lib/supplyNotice');
  const recon = { type: 'recon', amount: '10', unit: 'mg', water: '2', dose: '8', dose_unit: 'mg' };
  assert.equal(supplyNotice(recon, null), 'vial', 'lyophilized, no mixed vial');
  assert.equal(supplyNotice(recon, undefined), 'vial');
  assert.equal(supplyNotice(recon, { id: 3, protocol_id: 1, total_doses: 7 }), null, 'a mixed vial: no notice');
  assert.equal(supplyNotice({ type: 'rtu', concentration: '200' }, null), null, 'ready-to-use: the protocol knows its concentration');
  const oral = { type: 'oral', dose: '500', dose_unit: 'mg', serving_strength: 250 };
  assert.equal(supplyNotice({ ...oral, container_units: null }, null), 'bottle', 'tablets with no bottle');
  assert.equal(supplyNotice({ ...oral, container_units: 0 }, null), 'bottle');
  assert.equal(supplyNotice({ ...oral, container_units: '' }, null), 'bottle');
  assert.equal(supplyNotice({ ...oral, container_units: 60 }, null), null, 'a bottle of 60: no notice');
  assert.equal(supplyNotice({ ...oral, container_units: '60' }, null), null);
  assert.equal(supplyNotice(null, null), null);
});

test('A-115 FR-3: lyophilized with no vial draws no syringe and no vial block (pure rule)', () => {
  const { detailBlocks } = require('../lib/supplyNotice');
  assert.deepEqual(detailBlocks({ type: 'recon' }, true), { draw: false, vialBlock: false }, 'no syringe, no supply');
  assert.deepEqual(detailBlocks({ type: 'recon' }, false), { draw: true, vialBlock: true }, 'a mixed vial (or My Protocols): as before');
  assert.deepEqual(detailBlocks({ type: 'recon' }), { draw: true, vialBlock: true });
  assert.deepEqual(detailBlocks({ type: 'rtu' }, false), { draw: true, vialBlock: true });
  assert.deepEqual(detailBlocks({ type: 'oral' }, false), { draw: false, vialBlock: false }, 'tablets: the serving block, not a syringe');
});

test('A-115 FR-3: ProtocolDetail follows the rule; the right page passes withoutVial, My Protocols does not', () => {
  const det = between(PROT, 'export function ProtocolDetail(', '\n}\n');
  assert.match(det, /export function ProtocolDetail\(\{[^}]*\bwithoutVial\b[^}]*\bnotice\b[^}]*\}\)/, 'withoutVial and notice props');
  assert.match(det, /const blocks = detailBlocks\(p, withoutVial\);/);
  assert.match(det, /\{blocks\.draw && <ProtocolDrawHero /, 'the syringe only when the rule allows it');
  assert.match(det, /const vialShown = blocks\.vialBlock && /, 'the vial block only when the rule allows it');
  assert.ok(!/isInjectable && <ProtocolDrawHero/.test(det), 'no unconditional syringe left');
  // The notice sits under the name and tags (picture a115), before the syringe / serving blocks.
  const iTags = det.indexOf('</View>\n      </View>\n');
  const iNotice = det.indexOf('{notice || null}');
  assert.ok(iNotice > 0 && iNotice > iTags && iNotice < det.indexOf('<ProtocolDrawHero'), 'notice under the title, above the syringe');
  assert.match(PROT, /import \{ detailBlocks \} from '\.\.\/lib\/supplyNotice';/);
  // My Protocols' own page keeps its behaviour.
  const mine = between(PROT, 'const renderDetail = (p, inBook) => (', '\n  );\n');
  assert.ok(!/withoutVial|notice=/.test(mine), 'My Protocols passes neither withoutVial nor a notice');
  // Today's right page.
  assert.match(TODAY, /import \{ supplyNotice \} from '\.\.\/lib\/supplyNotice';/);
  assert.match(right, /const sn = supplyNotice\(p, vial\);/);
  assert.match(right, /withoutVial=\{sn === 'vial'\}/);
  assert.match(right, /notice=\{noticeEl\}/);
  assert.ok(!/p\.type === 'recon' && !vial/.test(right), 'the rule lives in lib/supplyNotice.js only');
});

test('A-115 FR-3: the vial notice offers + Add vial (Today\'s own prompt); the bottle notice opens the dose step in My Protocols', () => {
  assert.match(right, /sn === 'vial'/);
  assert.match(right, /t\('today_novial_title'\)/);
  assert.match(right, /t\('today_novial_body'\)/);
  assert.match(right, /showVialPromptFor\(p\)/);
  assert.match(right, /t\('today_add_vial'\)/);
  assert.match(right, /t\('today_nobottle_title'\)/);
  assert.match(right, /t\('today_nobottle_body'\)/);
  assert.match(right, /t\('today_add_bottle'\)/);
  assert.match(right, /navigation\.navigate\('Protocols', \{ openProtocolId: p\.id, editStep: 3, focusField: 'container' \}\)/, 'the bottle size lives on the dose step (A-115 "A": and the sheet lands on it)');
  // My Protocols opens the edit sheet at that step once the protocol is loaded, then clears the param.
  assert.match(PROT, /route\.params\?\.editStep/);
  assert.match(PROT, /openEdit\(decision\.protocol, step, decision\.focus\)/); // council fix 2: __tests__/editStepLink.test.js
  assert.match(PROT, /navigation\.setParams\(\{ editStep: undefined, focusField: undefined \}\)/);
});

test('A-115 FR-3: both notices in 6 languages, natural, never the English left in', () => {
  const keys = ['today_novial_title', 'today_novial_body', 'today_add_vial', 'today_nobottle_title', 'today_nobottle_body', 'today_add_bottle'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(T[l][k], `${l} ${k}`);
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.notEqual(T[l][k], T.en[k], `${l} ${k} is translated`);
  assert.equal(T.pt.today_novial_title, 'Nenhum frasco reconstituído agora');
  assert.equal(T.en.today_nobottle_title, 'No bottle added yet');
  assert.equal(T.pt.today_nobottle_title, 'Nenhum frasco informado');
  // The bottle wording never mentions a syringe (tablets and capsules have none).
  for (const l of ['en', 'pt']) assert.ok(!/syringe|seringa/i.test(T[l].today_nobottle_body), l);
});

test('A-115: a note typed on the right page saves like My Protocols (same draft key, same write)', () => {
  assert.match(right, /draft=\{getDraft\(noteDraftKey\(p\.id\)\)\}/);
  assert.match(TODAY, /updateProtocol\(id, \{ note: trimmed \? trimmed : null \}\)/);
});

// Council 2026-10-16 (picture a115-notice-contrast): Today's right page had no side margin —
// pageScroll set only paddingBottom, so the protocol page touched the gutter and the screen edge,
// while its own header (pageHead) and My Protocols' right page use 16.
test('A-115: the dose right page keeps the 16 pt side margin of its header and of My Protocols', () => {
  const fs = require('fs');
  const path = require('path');
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  const m = today.match(/\n  pageScroll: \{([^}]*)\}/);
  assert.ok(m, 'pageScroll style found');
  assert.match(m[1], /paddingHorizontal: 16/);
  assert.match(m[1], /paddingBottom: 32/);
  assert.match(today, /\n  pageHead: \{[^}]*paddingHorizontal: 16/);
});
