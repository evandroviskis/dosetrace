'use strict';
// CE-5 (docs/specs/curve-explained.md; picture docs/design/curve-explained.html section 2): the first
// opening of the curve shows three cards, one at a time — Picos e vales; Acúmulo; O exame mede um
// momento — with "n de 3", dots, Pular / Voltar and Próximo / Entendi, the estimate footer on each card
// and "Saiba mais" on the last; once per person and device; the help mark reopens them.
// CE-8: the curve's Premium lock shows the same three cards to free users before the paywall button.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations: tr } = require('../i18n/translations.js');
const C = require('../lib/curveCards.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function pictureT() {
  const html = read('docs/design/curve-explained.html');
  const m = html.match(/const T = (\{[\s\S]*?\n\});/);
  return new Function(`return ${m[1]};`)(); // eslint-disable-line no-new-func
}

function memStore(init = {}) {
  const m = { ...init };
  return { m, getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = String(v); } };
}

test('CE-5: three cards, the picture\'s texts in Portuguese, all six languages filled', () => {
  const T = pictureT();
  assert.equal(C.CURVE_CARDS.length, 3);
  C.CURVE_CARDS.forEach((c, i) => {
    assert.equal(tr.pt[c.titleKey], T.cards[i][0]);
    assert.equal(tr.pt[c.bodyKey], T.cards[i][1]);
    for (const l of LANGS) assert.ok(tr[l][c.titleKey] && tr[l][c.bodyKey], `${l}.${c.titleKey}`);
  });
  assert.equal(tr.pt.curve_cards_skip, 'Pular');
  assert.equal(tr.pt.back, 'Voltar');
  assert.equal(tr.pt.next, 'Próximo');
  assert.equal(tr.pt.curve_cards_done, 'Entendi');
  assert.equal(tr.pt.curve_cards_more, 'Saiba mais');
  assert.equal(tr.pt.curve_cards_step.replace('{n}', '2').replace('{total}', '3'), '2 de 3');
  for (const l of LANGS) assert.match(tr[l].curve_cards_step, /\{n\}.*\{total\}/, l);
});

test('CE-5: the buttons per card — Pular | Próximo, Voltar | Próximo, Voltar | Entendi + Saiba mais', () => {
  assert.deepEqual(C.cardButtons(0), { secKey: 'curve_cards_skip', priKey: 'next', more: false });
  assert.deepEqual(C.cardButtons(1), { secKey: 'back', priKey: 'next', more: false });
  assert.deepEqual(C.cardButtons(2), { secKey: 'back', priKey: 'curve_cards_done', more: true });
  assert.equal(C.stepText((k) => tr.pt[k], 0), '1 de 3');
  assert.equal(C.stepText((k) => tr.en[k], 2), '3 of 3');
});

test('CE-5: shown once per person and device; another person on the same phone sees them once too', async () => {
  const store = memStore();
  assert.equal(await C.takeFirstOpen(store, 'u1'), true, 'first opening');
  assert.equal(await C.takeFirstOpen(store, 'u1'), false, 'never again for u1');
  assert.equal(await C.takeFirstOpen(store, 'u2'), true, 'u2 has its own flag');
  assert.equal(C.cardsStorageKey('u1'), 'dosetrace_curve_cards_v1:u1');
  assert.equal(await C.takeFirstOpen(store, null), false, 'no user, no cards');
  // a storage that fails never throws and never shows the cards over and over
  const broken = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } };
  assert.equal(await C.takeFirstOpen(broken, 'u1'), false);
});

test('CE-5: "Saiba mais" opens the FAQ at the curve group', () => {
  assert.deepEqual(C.learnMoreRoute(), { route: 'FAQ', params: { openGroup: 'curve' } });
});

test('CE-5: the sheet — PresenceModal, "Dose no corpo · n de 3", title, body, footer on every card, dots, two buttons, Saiba mais', () => {
  const src = read('components', 'CurveCards.js');
  assert.match(src, /import Modal from '\.\/PresenceModal';/);
  const sheet = src.slice(src.indexOf('export function CurveCardsSheet'));
  assert.match(sheet, /t\('body_card_dosing_title'\)\} · \{stepText\(t, i\)\}/);
  assert.match(sheet, /t\(card\.titleKey\)/);
  assert.match(sheet, /t\(card\.bodyKey\)/);
  assert.match(sheet, /t\('curve_foot'\)/);
  assert.match(sheet, /CURVE_CARDS\.map\(\(_, j\) => <View key=\{j\} style=\{\[s\.dot, j === i && s\.dotOn\]\} \/>\)/);
  assert.match(sheet, /t\(b\.secKey\)/);
  assert.match(sheet, /t\(b\.priKey\)/);
  assert.match(sheet, /b\.more \?/);
  assert.match(sheet, /t\('curve_cards_more'\)/);
  // a fresh opening always starts at the first card
  assert.match(sheet, /useEffect\(\(\) => \{ if \(visible\) setI\(0\); \}, \[visible\]\);/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'theme tokens only');
});

test('CE-5: the curve shows the cards on its first opening (Premium only), and the help mark reopens them', () => {
  const src = read('screens', 'SerumCurveScreen.js');
  assert.match(src, /import \{ CurveCardsSheet \} from '\.\.\/components\/CurveCards';/);
  assert.match(src, /import \{ takeFirstOpen, learnMoreRoute \} from '\.\.\/lib\/curveCards';/);
  // after the Premium check, never before it
  const focus = src.slice(src.indexOf('if (!(await hasPremium()))'), src.indexOf('return () => { isMounted = false;'));
  assert.match(focus, /takeFirstOpen\(AsyncStorage, user && user\.id\)/);
  assert.match(focus, /setCardsOpen\(true\)/);
  assert.match(src, /<CurveCardsSheet visible=\{cardsOpen\} onClose=\{\(\) => setCardsOpen\(false\)\} onLearnMore=\{openLearnMore\} \/>/);
  assert.match(src, /const openLearnMore = \(\) => \{ setCardsOpen\(false\); const r = learnMoreRoute\(\); setTimeout\(\(\) => navigation\.navigate\(r\.route, r\.params\), 300\); \};/);
});

test('CE-8: the Premium lock of the curve shows the three cards before the paywall button', () => {
  const src = read('components', 'FeaturePreviews.js');
  assert.match(src, /import \{ CurveCardsList \} from '\.\/CurveCards';/);
  const sheet = src.slice(src.indexOf('export function FeaturePreviewSheet'));
  const iCards = sheet.indexOf("{feature.key === 'serum' ? <CurveCardsList /> : null}");
  const iCta = sheet.indexOf("t('preview_unlock_cta')");
  assert.ok(iCards > 0 && iCta > iCards, 'the cards come before Unlock');
  const list = read('components', 'CurveCards.js');
  const body = list.slice(list.indexOf('export function CurveCardsList'), list.indexOf('export function CurveCardsSheet'));
  assert.match(body, /CURVE_CARDS\.map/);
  assert.match(body, /t\(c\.titleKey\)/);
  assert.match(body, /t\(c\.bodyKey\)/);
  assert.match(body, /t\('curve_foot'\)/);
});
