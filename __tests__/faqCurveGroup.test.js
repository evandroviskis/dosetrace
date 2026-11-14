'use strict';
// CE-6 / CE-7 (docs/specs/curve-explained.md; founder 2026-11-13: "Saiba mais" lives in the FAQ): the
// ten questions of the picture (O que é a curva de Bateman? … Fontes) are one FAQ group, every FAQ
// question has a stable id, FAQ deep links resolve by id (old { ci, qi } callers keep working), "Saiba
// mais" opens the FAQ at the group, and app search finds each question in every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations: tr } = require('../i18n/translations.js');
const F = require('../lib/faqLinks.js');
const TX = require('../lib/appSearchText.js');
const { textAction } = require('../lib/appSearchNav.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const IDS = ['curve_bateman', 'curve_how', 'curve_half_life', 'curve_what_for', 'curve_half_life_shape', 'curve_lab', 'curve_estimate', 'curve_missing', 'curve_history', 'curve_sources'];

function pictureT() {
  const html = read('docs/design/curve-explained.html');
  const m = html.match(/const T = (\{[\s\S]*?\n\});/);
  return new Function(`return ${m[1]};`)(); // eslint-disable-line no-new-func
}
const tFor = (l) => (k) => (k in tr[l] ? tr[l][k] : k);

test('CE-6: the curve group holds the picture\'s ten questions, in order, word for word in Portuguese', () => {
  const T = pictureT();
  const g = tr.pt.faq_categories.find((c) => c.id === 'curve');
  assert.ok(g, 'a group with id curve');
  assert.equal(g.category, tr.pt.body_card_dosing_title);
  assert.deepEqual(g.questions.map((q) => q.id), IDS);
  g.questions.forEach((q, i) => {
    assert.equal(q.q, T.qs[i][0]);
    assert.equal(q.a, T.qs[i][1].replace(/<[^>]+>/g, ''));
  });
});

test('CE-6: every FAQ question and group has an id, unique, and the same ids in the same places in all six languages', () => {
  const shape = (l) => tr[l].faq_categories.map((c) => `${c.id}:${c.questions.map((q) => q.id).join(',')}`).join('|');
  const ids = tr.en.faq_categories.flatMap((c) => c.questions.map((q) => q.id));
  assert.ok(ids.every((id) => typeof id === 'string' && /^[a-z_]+$/.test(id)), ids.join(' '));
  assert.equal(new Set(ids).size, ids.length, 'unique');
  assert.equal(new Set(tr.en.faq_categories.map((c) => c.id)).size, tr.en.faq_categories.length);
  for (const l of LANGS) {
    assert.equal(shape(l), shape('en'), l);
    const g = tr[l].faq_categories.find((c) => c.id === 'curve');
    assert.equal(g.category, tr[l].body_card_dosing_title, l);
    for (const q of g.questions) assert.ok(q.q && q.a && q.a.length > 20, `${l}.${q.id}`);
    // citations stay as published
    assert.match(g.questions[9].a, /^Bateman H\. Proc Cambridge Philos Soc 1910;15:423–427 · Teorell T\./, l);
    assert.match(g.questions[0].a, /Harry Bateman/, l);
  }
});

test('CE-6: deep links resolve by id; old { ci, qi } callers keep working; unknown targets open nothing', () => {
  const cats = tr.pt.faq_categories;
  const gi = cats.findIndex((c) => c.id === 'curve');
  assert.deepEqual(F.faqTarget(cats, { id: 'curve_lab' }), { ci: gi, qi: 5, id: 'curve_lab' });
  // the id wins over a stale position
  assert.deepEqual(F.faqTarget(cats, { id: 'curve_lab', ci: 0, qi: 0 }), { ci: gi, qi: 5, id: 'curve_lab' });
  assert.deepEqual(F.faqTarget(cats, { ci: 2, qi: 1 }), { ci: 2, qi: 1, id: cats[2].questions[1].id });
  assert.equal(F.faqTarget(cats, { id: 'nope' }), null);
  assert.equal(F.faqTarget(cats, { ci: 99, qi: 0 }), null);
  assert.equal(F.faqTarget(cats, null), null);
  assert.equal(F.faqGroupIndex(cats, 'curve'), gi);
  assert.equal(F.faqGroupIndex(cats, 'nope'), -1);
});

test('CE-6: the FAQ screen opens by id, scrolls to a group, and shows the group\'s Bateman line and footer', () => {
  const src = read('screens', 'FAQScreen.js');
  assert.match(src, /import \{ faqTarget, faqGroupIndex \} from '\.\.\/lib\/faqLinks';/);
  assert.match(src, /faqTarget\(faqData, route\.params\.openQuestion\)/);
  assert.match(src, /faqGroupIndex\(faqData, route\.params\.openGroup\)/);
  assert.match(src, /const GROUP_LINES = \{ curve: \{ sub: 'curve_sub', note: 'curve_foot' \} \};/);
  // questions arrive closed when the screen opens at a group
  assert.match(src, /useState\(hitKey\)/);
});

test('CE-7: app search opens a FAQ hit by its id', () => {
  const t = tFor('pt');
  const hit = TX.makeTextSearch(TX.buildTextIndex(t, 'ios'))('curva de Bateman')[0];
  assert.equal(hit.unit.open.id, 'curve_bateman');
  const a = textAction(hit, 'curva de Bateman');
  assert.equal(a.route, 'FAQ');
  assert.equal(a.params.openQuestion.id, 'curve_bateman');
});

test('CE-7: app search finds each of the ten questions in every language', () => {
  // words a person would type, per language; each must reach the question with that id in the top 3
  const Q = {
    en: { curve_bateman: 'bateman curve', curve_how: 'superposition', curve_half_life: 'what is a half-life', curve_what_for: 'what is it for history', curve_half_life_shape: 'half-life change the curve', curve_lab: 'blood test draw', curve_estimate: 'why is it an estimate', curve_missing: 'ceiling', curve_history: 'pharmacokinetics teorell', curve_sources: 'sources gibaldi' },
    pt: { curve_bateman: 'curva de bateman', curve_how: 'superposição', curve_half_life: 'o que é meia-vida', curve_what_for: 'para que serve', curve_half_life_shape: 'meia-vida muda a curva', curve_lab: 'exame de sangue coleta', curve_estimate: 'por que é uma estimativa', curve_missing: 'teto', curve_history: 'farmacocinética teorell', curve_sources: 'fontes gibaldi' },
    es: { curve_bateman: 'curva de bateman', curve_how: 'superposición', curve_half_life: 'qué es la vida media', curve_what_for: 'para qué sirve', curve_half_life_shape: 'vida media cambia la curva', curve_lab: 'análisis de sangre extracción', curve_estimate: 'por qué es una estimación', curve_missing: 'techo', curve_history: 'farmacocinética teorell', curve_sources: 'fuentes gibaldi' },
    fr: { curve_bateman: 'courbe de bateman', curve_how: 'superposition', curve_half_life: 'demi-vie', curve_what_for: 'à quoi ça sert', curve_half_life_shape: 'demi-vie change la courbe', curve_lab: 'prise de sang prélèvement', curve_estimate: 'pourquoi est-ce une estimation', curve_missing: 'plafond', curve_history: 'pharmacocinétique teorell', curve_sources: 'sources gibaldi' },
    de: { curve_bateman: 'bateman-kurve', curve_how: 'superpositionsprinzip', curve_half_life: 'was ist die halbwertszeit', curve_what_for: 'wofür ist das gut', curve_half_life_shape: 'halbwertszeit verändert die kurve', curve_lab: 'bluttest blutabnahme', curve_estimate: 'warum ist das eine schätzung', curve_missing: 'obergrenze', curve_history: 'pharmakokinetik teorell', curve_sources: 'quellen gibaldi' },
    it: { curve_bateman: 'curva di bateman', curve_how: 'sovrapposizione', curve_half_life: 'emivita', curve_what_for: 'a cosa serve', curve_half_life_shape: 'emivita cambia la curva', curve_lab: 'esame del sangue prelievo', curve_estimate: 'perché è una stima', curve_missing: 'tetto', curve_history: 'farmacocinetica teorell', curve_sources: 'fonti gibaldi' },
  };
  const miss = [];
  for (const l of LANGS) {
    const search = TX.makeTextSearch(TX.buildTextIndex(tFor(l), 'ios'));
    for (const id of IDS) {
      const top = search(Q[l][id]).slice(0, 3).map((h) => h.unit.open && h.unit.open.id);
      if (!top.includes(id)) miss.push(`${l} "${Q[l][id]}" → ${top.join(',')} (want ${id})`);
    }
    // the meia-vida / half-life words of CE-7 reach the curve group
    const hl = { en: 'half-life', pt: 'meia-vida', es: 'vida media', fr: 'demi-vie', de: 'halbwertszeit', it: 'emivita' }[l];
    assert.ok(search(hl).some((h) => h.unit.open && String(h.unit.open.id).startsWith('curve_')), `${l}: ${hl}`);
    assert.ok(search('bateman').some((h) => h.unit.open && h.unit.open.id === 'curve_bateman'), `${l}: bateman`);
  }
  assert.deepEqual(miss, []);
});
