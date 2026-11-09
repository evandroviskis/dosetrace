'use strict';
// Ended protocol page (founder 2026-11-08 01:36 "Abre a página do protocolo com a opção de retomar";
// picture docs/design/ended-protocol-page.html approved 22:28 "Pode construir o protocolo encerrado
// como no desenho"). (2) The whole Ended row opens the protocol's page (with a chevron); Retomar and
// the trash stay. (3) The page top: a card "Ended {date}", what stopped, and Retomar; then the syringe
// calculator (no edit link) and the schedule as it was. (4) Dose collapsed, note read-only, Delete
// protocol (to Recently deleted, like the list's trash). Hidden: the vial, Add reminder, End protocol,
// every edit link and the header's Edit. (5) Retomar = the same question as the list; afterwards the
// new active run's page opens.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, read } = require('./helpers/extractFn');
const { translations } = (() => {
  const src = read('i18n/translations.js').replace(/^export const /gm, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { translations };`)();
})();

const PROT = read('screens/ProtocolsScreen.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const DETAIL = sliceBlock(PROT, 'export function ProtocolDetail(');
function branch(src, from, to) { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); }

test('ended page strings x6, natural, one term per concept (Registro de doses, frasco)', () => {
  for (const l of LANGS) {
    for (const k of ['protocols_ended_page_body', 'protocols_ended_page_body_oral']) {
      assert.ok(typeof translations[l][k] === 'string' && translations[l][k].trim(), `${l}.${k}`);
      assert.doesNotMatch(translations[l][k], /\{/, `${l}.${k} has no placeholder`);
    }
    // the screen's own name for the Dose log, never another word for it
    assert.ok(translations[l].protocols_ended_page_body.includes(translations[l].log_title), `${l} names the Dose log as the app does`);
    assert.ok(translations[l].protocols_ended_page_body_oral.includes(translations[l].log_title), `${l} oral names the Dose log`);
  }
  assert.equal(translations.pt.protocols_ended_page_body, 'Sem lembretes e sem frasco. As doses continuam no Registro de doses e nos relatórios.');
  assert.equal(translations.pt.protocols_ended_page_body_oral, 'Sem lembretes. As doses continuam no Registro de doses e nos relatórios.');
});

test('(2) the whole Ended row opens the page, with a chevron; Retomar and the trash stay', () => {
  const sec = branch(PROT, 'const endedSection = ', ') : null;');
  assert.match(sec, /onPress=\{\(\) => openProtocolById\(p\.id\)\}/);
  assert.match(sec, /<RowChevron /, 'the row ends in a chevron');
  assert.match(sec, /onPress=\{\(\) => askRestart\(p\)\}/, 'Retomar unchanged');
  assert.match(sec, /onPress=\{\(\) => deleteEndedProtocol\(p\)\}/, 'trash unchanged');
});

test('the open protocol may be an Ended one (phone and book), never a deleted one', () => {
  assert.match(PROT, /const shownProtocol = \(id\) => protocols\.find\(p => p\.id === id\) \|\| endedProtocols\.find\(p => p\.id === id\) \|\| null;/);
  assert.match(PROT, /const openProtocol = showList && openId != null \? shownProtocol\(openId\) : null;/);
  assert.match(PROT, /const bookProtocol = book && bookOpenId != null \? shownProtocol\(bookOpenId\) : null;/);
  assert.match(PROT, /bookProtocolId\(bookSel\.sel, defaultSelection\('Protocols', \{ protocolIds: listOrderIds \}\), listOrderIds, endedProtocols\.map\(p => p\.id\)\)/);
});

test('book: a chosen Ended protocol stays on the right page; the default is never an Ended one', () => {
  const src = sliceBlock(PROT, 'function bookProtocolId(');
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${src}\nreturn bookProtocolId;`)();
  assert.equal(fn(9, null, [1, 2], [9]), 9, 'chosen Ended stays');
  assert.equal(fn(9, null, [1, 2]), 1, 'without the Ended ids: as before');
  assert.equal(fn(null, null, [], [9]), null, 'no active protocol: the right page is empty, not an Ended one');
  assert.equal(fn(null, 2, [1, 2], [9]), 2);
});

test('(3) the page top: the ended card with the date, what stopped and Retomar, above the calculator', () => {
  assert.match(DETAIL, /const ended = isEnded\(p\);/);
  const card = DETAIL.indexOf('{ended ? (');
  assert.ok(card > 0 && card < DETAIL.indexOf('<ProtocolDrawHero'), 'card above the syringe calculator');
  const block = DETAIL.slice(card, DETAIL.indexOf('<ProtocolDrawHero'));
  assert.match(block, /t\('protocols_ended_on'\)\.replace\('\{date\}', formatDate\(new Date\(p\.ended_at \|\| p\.updated_at\), language, 'dayMonth'\)/);
  assert.match(block, /t\(p\.type === 'oral' \? 'protocols_ended_page_body_oral' : 'protocols_ended_page_body'\)/);
  assert.match(block, /onPress=\{\(\) => onRestart\(p\)\}/);
  assert.match(block, /t\('protocols_restart'\)/);
  assert.match(block, /s\.btnPrimary/);
});

test('(3)(4) what an Ended page hides: vial, Add reminder, End, the dose-details link, refill, the note editor', () => {
  assert.match(DETAIL, /const vialShown = !ended && blocks\.vialBlock/);
  assert.match(DETAIL, /\{!ended \? \(\s*<TouchableOpacity style=\{s\.obtn2\} onPress=\{\(\) => openEdit\(p, 4\)\}/);
  assert.match(DETAIL, /onDoseDetails=\{ended \? null : \(\) => openEdit\(p, 3\)\}/);
  assert.match(DETAIL, /onRefill=\{ended \? null : onRefill\}/);
  assert.match(DETAIL, /const endShown = !!onEndProtocol && p\.active === 1 && !p\.deleted_at;/, 'End only on an active protocol (unchanged)');
  // the note: a read-only text, never a TextInput, and no note at all when none was saved
  const note = DETAIL.slice(DETAIL.indexOf('{ended ? (p.note ?'), DETAIL.indexOf('<NoteFrame'));
  assert.match(note, /<Text style=\{s\.noteRead\}>\{p\.note\}<\/Text>/);
  assert.doesNotMatch(note, /TextInput/);
  assert.match(DETAIL, /\) : \(\s*<NoteFrame /, 'the editable note only when not ended');
  // the calculator's foot link shows only with an edit to open
  const hero = sliceBlock(PROT, 'function ProtocolDrawHero(');
  assert.match(hero, /\{onDoseDetails \? \(\s*<TouchableOpacity style=\{s\.hobjFoot\} onPress=\{onDoseDetails\}/);
});

test('(4) Delete protocol stays and passes the row (an Ended one is not in the active list)', () => {
  assert.match(DETAIL, /onPress=\{\(\) => deleteProtocol\(p\.id, p\)\}/);
});

test('header Edit is hidden on an Ended page (phone and book)', () => {
  assert.match(PROT, /\{!isEnded\(openProtocol\) \? \(\s*<TouchableOpacity style=\{s\.addBtn\} onPress=\{\(\) => openEdit\(openProtocol\)\}/);
  assert.match(PROT, /\{!isEnded\(bookProtocol\) \? \(\s*<TouchableOpacity style=\{s\.addBtn\} onPress=\{\(\) => \{ claimBookProtocol\(bookProtocol\.id\); openEdit\(bookProtocol\); \}\}/);
});

test('(5) Retomar from the page asks the same question, then opens the new active run', () => {
  const rd = branch(PROT, 'const renderDetail = (', '/>');
  assert.match(rd, /onRestart=\{\(q\) => askRestart\(q, \{ openAfter: true \}\)\}/);
  const ask = sliceBlock(PROT, 'async function askRestart(');
  assert.match(ask, /restartProtocol\(p\.id, \{\}, openAfter\)/);
  assert.match(ask, /restartProtocol\(p\.id, \{ sameContainer: true \}, openAfter\)/);
  const rs = sliceBlock(PROT, 'async function restartProtocol(');
  assert.match(rs, /await fetchProtocols\(\);\s*if \(openAfter && newId != null\) openProtocolById\(newId\);/);
});
