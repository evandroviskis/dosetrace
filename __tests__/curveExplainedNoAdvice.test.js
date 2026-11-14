'use strict';
// CE-10 (docs/specs/curve-explained.md, hard rules): every curve and help text added or changed by the
// curve explained stays descriptive — never a recommendation, never "the best time" to inject or draw
// blood, never "optimize", "ideal", "avoid crashes", never a reading of the person's lab result through
// the curve. Fails if any of them, in any of the six languages, carries a banned word.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = [
  'body_card_dosing_title', 'curve_sub', 'curve_fixed', 'curve_foot', 'help_mark_label',
  'curve_card1_t', 'curve_card1_b', 'curve_card2_t', 'curve_card2_b', 'curve_card3_t', 'curve_card3_b',
  'curve_cards_skip', 'curve_cards_done', 'curve_cards_more', 'curve_cards_step',
  'ob_feat2_t', 'ob_feat2_d', 'settings_premium_feat_1', 'blood_upgrade_feat_2', 'paywall_hero_sub',
  'profile_step_sub_required', 'sex_why_body', 'sex_change_body', 'curve_empty_sub', 'blend_curve_note', 'protocols_composition_hint',
];
const BANNED = {
  all: /recomend|recommend|raccomand|empfehl|ideal|otimiz|optimi|ottimizz|crash/i,
  en: /\bshould\b|\bbest time\b|\bbest moment\b|\bsmoother\b|\bavoid\b|\bmust\b/i,
  pt: /\bdev(e|em|eria|eriam)\b|melhor hora|melhor momento|evitar quedas|\bevite\b|mais estáve(l|is)\b/i,
  es: /\bdeb(e|es|en|ería|erías)\b|mejor (hora|momento)|evitar (bajones|caídas)|\bevita\b/i,
  fr: /\bdev(ez|riez|rait)\b|\bil faut\b|meilleur moment|éviter les (chutes|baisses)|\bévitez\b/i,
  de: /\bsoll(te|test|st|en)?\b|\bmusst\b|beste[nr]? (zeit|zeitpunkt)|\bvermeide\b/i,
  it: /\bdev(i|e|ono|resti)\b|momento migliore|\bconsigli|evitare (cali|crolli)|\bevita\b/i,
};

function curveFaq(l) {
  const g = tr[l].faq_categories.find((c) => c.id === 'curve');
  const dose = tr[l].faq_categories.flatMap((c) => c.questions).find((q) => q.id === 'body_dose_in_body');
  return [...g.questions.flatMap((q) => [[`faq.${q.id}.q`, q.q], [`faq.${q.id}.a`, q.a]]), ['faq.body_dose_in_body.q', dose.q], ['faq.body_dose_in_body.a', dose.a], ['faq.curve.category', g.category]];
}

test('CE-10: no banned advice word in any curve or help text, six languages', () => {
  const hits = [];
  for (const l of LANGS) {
    const items = [...KEYS.map((k) => [k, tr[l][k]]), ...curveFaq(l)];
    for (const [k, v] of items) {
      assert.equal(typeof v, 'string', `${l}.${k} present`);
      if (BANNED.all.test(v) || BANNED[l].test(v)) hits.push(`${l}.${k}: ${v}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('CE-10: the guard itself catches the banned phrases', () => {
  assert.match('the best time to inject', BANNED.en);
  assert.match('você deve aplicar', BANNED.pt);
  assert.match('a melhor hora para colher', BANNED.pt);
  assert.match('optimize your levels', BANNED.all);
  assert.match('evitar quedas', BANNED.pt);
  assert.match('du solltest', BANNED.de);
  assert.match('la dose ideale', BANNED.all);
  assert.doesNotMatch('O exame mede um momento', BANNED.pt);
});

test('CE-10: no line reads the person\'s lab result through the curve', () => {
  for (const l of LANGS) {
    const lab = tr[l].faq_categories.find((c) => c.id === 'curve').questions.find((q) => q.id === 'curve_lab').a;
    // it says the curve does not explain the result and names who interprets it
    assert.match(lab, { en: /does not explain/, pt: /não explica/, es: /no explica/, fr: /n’explique pas/, de: /erklärt das Testergebnis nicht/, it: /non spiega/ }[l], l);
  }
});
