'use strict';
// A-115 FR-3, founder 2026-10-16 "1 sim, A, C" (picture docs/design/a115-notice-contrast.html,
// docs/decisions.md "Fold no-vial notice: 1 sim, A, C"):
//  (1) the no-vial / no-bottle notice on Today's right page follows the app's type scale — title
//      17/600 ink, body 15/20 ink2, button 15/600, radius 18, padding 14 — and gets a 1 pt c.line
//      border in both themes (background stays c.well; tokens only, no raw colors);
//  (A) the oral notice button says what is missing ("+ Adicionar tamanho do frasco") and the Edit
//      field reads "Tamanho do frasco (unidades) — opcional": the same noun in the notice title, body,
//      button and field, in all 6 languages; the button opens Edit at the dose step, scrolls to that
//      field and focuses it (keyboard up), through the existing editStep link + a focus target;
//  (C) the left card keeps its underlined link (unchanged).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { editStepLinkAction, takeEditFocus, EDIT_FOCUS_FIELDS } = require('../lib/editStepLink');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const TODAY = read('screens/TodayScreen.js');
const PROT = read('screens/ProtocolsScreen.js');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const styleLine = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{([^\\n]*)\\},\\n`));
  assert.ok(m, `style ${name}`);
  return m[1];
};
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|'white'|'black'|"white"|"black"|rgba?\(/;

test('A-115 "1 sim": the notice container is radius 18, padding 14, a 1 pt c.line border on c.well', () => {
  const box = styleLine(TODAY, 'noVial');
  assert.match(box, /\bpadding: 14\b/);
  assert.match(box, /\bborderRadius: 18\b/);
  assert.match(box, /\bborderWidth: 1\b/);
  assert.match(box, /\bborderColor: c\.line\b/);
  assert.match(box, /\bbackgroundColor: c\.well\b/, 'the background token stays as it was');
  assert.match(box, /\bgap: 6\b/, 'the picture spacing (.nt-new gap 6)');
  assert.ok(!/\bpadding: 16\b|borderRadius: 22/.test(box), 'the old 16 / 22 are gone');
});

test('A-115 "1 sim": title 17/600 ink, body 15 on 20 ink2, button text 15/600 on act', () => {
  const title = styleLine(TODAY, 'noVialTitle');
  assert.match(title, /\bfontSize: 17\b/);
  assert.match(title, /\blineHeight: 22\b/, 'picture .nt-new .ntt line-height 22');
  assert.match(title, /fontWeight: '600'/);
  assert.match(title, /\bcolor: c\.ink\b/);
  const body = styleLine(TODAY, 'noVialBody');
  assert.match(body, /\bfontSize: 15\b/);
  assert.match(body, /\blineHeight: 20\b/);
  assert.match(body, /\bcolor: c\.ink2\b/);
  const btn = styleLine(TODAY, 'noVialBtn');
  assert.match(btn, /\bmarginTop: 6\b/);
  assert.match(btn, /\bminHeight: 36\b/);
  assert.match(btn, /\bborderRadius: 18\b/);
  assert.match(btn, /\bbackgroundColor: c\.act\b/);
  const btnText = styleLine(TODAY, 'noVialBtnText');
  assert.match(btnText, /\bfontSize: 15\b/);
  assert.match(btnText, /fontWeight: '600'/);
  assert.match(btnText, /\bcolor: c\.onAct\b/);
});

test('A-115 "1 sim": the notice styles use theme tokens only (no raw colors), in both themes', () => {
  for (const n of ['noVial', 'noVialTitle', 'noVialBody', 'noVialBtn', 'noVialBtnText']) {
    const line = styleLine(TODAY, n);
    assert.ok(!RAW_COLOR.test(line), `${n} has a raw color: ${line}`);
    for (const m of line.matchAll(/(?:color|Color): ([^,}]+)/g)) assert.match(m[1].trim(), /^c\.[a-zA-Z0-9]+$/, `${n}: ${m[0]}`);
  }
  const theme = read('lib/theme.js');
  for (const tok of ['well', 'line', 'ink', 'ink2', 'act', 'onAct']) {
    const hits = theme.match(new RegExp(`\\b${tok}: ['"]#`, 'g')) || [];
    assert.ok(hits.length >= 2, `lib/theme.js defines ${tok} in the light AND the dark palette`);
  }
});

// (A) one noun per language across the notice title, body, button and the Edit field (+ its hint).
const ONE_TERM = {
  en: { noun: /bottle/i, add: '+ Add bottle size', field: 'Bottle size (units) — optional', old: /container/i },
  pt: { noun: /frasco/i, add: '+ Adicionar tamanho do frasco', field: 'Tamanho do frasco (unidades) — opcional', old: /embalagem/i },
  es: { noun: /envase/i, add: '+ Añadir tamaño del envase', field: 'Tamaño del envase en unidades (opcional)', old: /recipiente|frasco/i },
  fr: { noun: /flacon/i, add: '+ Ajouter la contenance du flacon', field: 'Contenance du flacon (unités) — facultatif', old: /contenant/i },
  de: { noun: /Packung/, add: '+ Packungsgröße angeben', field: 'Packungsgröße (Einheiten) – optional', old: /Behälter|Flasche/i },
  it: { noun: /confezione/i, add: '+ Aggiungi dimensione della confezione', field: 'Dimensione della confezione (unità) — facoltativa', old: /contenitore|flacone/i },
};

test('A-115 "A": the oral button and the Edit field say the same thing, written natively x6', () => {
  for (const [l, want] of Object.entries(ONE_TERM)) {
    assert.equal(T[l].today_add_bottle, want.add, `${l} today_add_bottle`);
    assert.equal(T[l].protocols_container_units, want.field, `${l} protocols_container_units`);
  }
  assert.equal(T.pt.today_add_bottle, '+ Adicionar tamanho do frasco', 'founder pick A, word for word');
  assert.equal(T.pt.protocols_container_units, 'Tamanho do frasco (unidades) — opcional', 'founder pick A, word for word');
  // French keeps "vous" and the app's own "— facultatif" label style; Spanish its "(opcional)" style.
  assert.match(T.fr.today_nobottle_body, /\bvous\b/);
  assert.match(T.es.protocols_container_units, /\(opcional\)$/);
});

test('A-115 "A": one term per concept — the same noun in the notice title, body, button, field and hint x6', () => {
  const keys = ['today_nobottle_title', 'today_nobottle_body', 'today_add_bottle', 'protocols_container_units', 'protocols_container_units_hint'];
  for (const [l, want] of Object.entries(ONE_TERM)) {
    for (const k of keys) {
      assert.match(T[l][k], want.noun, `${l} ${k} names the bottle "${want.noun.source}": ${T[l][k]}`);
      assert.ok(!want.old.test(T[l][k]), `${l} ${k} still uses another word: ${T[l][k]}`);
    }
  }
});

test('A-115 "A": the editStep link carries a focus target (pure rule)', () => {
  assert.deepEqual(EDIT_FOCUS_FIELDS, ['container']);
  const P = [{ id: 7, type: 'oral', name: 'Magnesium' }, { id: 9, type: 'recon', name: 'MOTS-c' }];
  const open = editStepLinkAction({ step: 3, id: 7, protocols: P, loaded: false, focus: 'container' });
  assert.equal(open.action, 'open');
  assert.equal(open.protocol.id, 7);
  assert.equal(open.focus, 'container', 'the oral protocol: focus the bottle size field');
  assert.equal(editStepLinkAction({ step: 3, id: 7, protocols: P, loaded: false }).focus, null, 'no focus asked: none');
  assert.equal(editStepLinkAction({ step: 3, id: 7, protocols: P, loaded: false, focus: 'nope' }).focus, null, 'an unknown field is dropped');
  assert.equal(editStepLinkAction({ step: 3, id: 9, protocols: P, loaded: false, focus: 'container' }).focus, null, 'not oral: the field does not exist there');
  for (const r of [
    editStepLinkAction({ step: 3, id: 42, protocols: P, loaded: true, focus: 'container' }),
    editStepLinkAction({ step: 3, id: 42, protocols: P, loaded: false, focus: 'container' }),
    editStepLinkAction({ step: null, id: 7, protocols: P, loaded: true, focus: 'container' }),
  ]) assert.equal(r.focus, null, `${r.action}: nothing to focus`);
});

test('A-115 "A": the pending focus is used once, only by the field it names on the protocol it was opened for', () => {
  const pending = { field: 'container', id: 7 };
  assert.equal(takeEditFocus(pending, 'container', 7), true);
  assert.equal(takeEditFocus(pending, 'container', '7'), true, 'ids compare as text');
  assert.equal(takeEditFocus(pending, 'container', 8), false, 'another protocol\'s sheet');
  assert.equal(takeEditFocus(pending, 'container', null), false, 'a new protocol (no editing id)');
  assert.equal(takeEditFocus(pending, 'dose', 7), false, 'another field');
  assert.equal(takeEditFocus(null, 'container', 7), false, 'nothing pending');
});

test('A-115 "A": Today sends the focus target; My Protocols passes it to Edit, clears it, scrolls to the field and focuses it', () => {
  const right = between(TODAY, 'function renderRightPage()', '\n  }\n');
  assert.match(right, /navigation\.navigate\('Protocols', \{ openProtocolId: p\.id, editStep: 3, focusField: 'container' \}\)/);
  // The link effect: the decision gets the focus param and hands it to openEdit; both params are cleared.
  const i = PROT.indexOf('const decision = editStepLinkAction(');
  const block = PROT.slice(i, PROT.indexOf('}, [route.params?.editStep', i));
  assert.match(block, /focus: route\.params\?\.focusField/);
  assert.match(block, /navigation\.setParams\(\{ editStep: undefined, focusField: undefined \}\)/);
  assert.match(block, /if \(decision\.action === 'open'\) openEdit\(decision\.protocol, step, decision\.focus\);/);
  // openEdit remembers the target for THIS protocol (every other openEdit call clears it).
  const oe = between(PROT, 'function openEdit(p, goToStep, focusField) {', '\n  }\n');
  assert.match(oe, /pendingFocusRef\.current = focusField \? \{ field: focusField, id: p\.id \} : null;/);
  // The bottle size field: measured inside the form's scroll view, scrolled to, then focused.
  // (build 54: the ref is merged with the Android keyboard hook's, modalKeyboard.test.js)
  assert.match(PROT, /<ScrollView \{\.\.\.editorKb\.scrollProps\} ref=\{editorScrollRef\} style=\{s\.modalBody\}/);
  assert.match(PROT, /const editorScrollRef = useCallback\(\(n\) => \{ modalScrollRef\.current = n;/);
  const fld = between(PROT, "<Fld s={s} label={t('protocols_container_units')}", '</Fld>');
  assert.match(fld, /onLayout=\{focusContainerField\}/);
  assert.match(fld, /<WInput ref=\{containerInputRef\}/);
  const fn = between(PROT, 'function focusContainerField(e) {', '\n  }\n');
  assert.match(fn, /takeEditFocus\(pendingFocusRef\.current, 'container', editingId\)/);
  assert.match(fn, /modalScrollRef\.current\.scrollTo\(/);
  assert.match(fn, /containerInputRef\.current\.focus\(\)/);
  assert.match(fn, /Keyboard\.addListener\('keyboardDidShow'/, 'scrolled again once the keyboard is up, so it never covers the field');
  // Fld hands onLayout to its view; WInput forwards its ref to the TextInput.
  assert.match(between(PROT, 'function Fld(', '\n}\n'), /<View style=\{s\.fld\} onLayout=\{onLayout\}>/);
  assert.match(PROT, /const WInput = forwardRef\(function WInput\(\{ s, c, style, onFocus, onBlur, \.\.\.props \}, ref\) \{/);
  assert.match(between(PROT, 'const WInput = forwardRef(', '\n});\n'), /<TextInput\s+ref=\{ref\}/);
});

test('A-115 "C": the left card keeps its underlined + Add vial link (unchanged)', () => {
  assert.match(styleLine(TODAY, 'addVialText'), /textDecorationLine: 'underline', textDecorationColor: c\.tick/);
  assert.match(TODAY, /<Text style=\{s\.addVialText\}>\{t\('today_add_vial'\)\}<\/Text>/);
});
