'use strict';
// Founder 2026-10-02: Today's food card line wrapped in Portuguese, leaving "seguidos" alone
// on the second line. Today's line (the day of the check + the 7-day run) uses a short run,
// nutri_hero_run_today — Portuguese "Seus números reais · dia {d} de 21 · {n} de 7 seguidos" —
// and every language fits one line of the card on an iPhone 17 Pro Max (440 pt: card text
// width 440 - 2 x 16 margin - 2 x 18 padding = 372 pt; 15 pt system font). Journey shows the
// run alone and keeps the full words (nutri_hero_run).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const HERO = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'FoodLogHero.js'), 'utf8');

const WANT = {
  en: '{n} of 7 days in a row',
  es: '{n} de 7 seguidos',
  pt: '{n} de 7 seguidos',
  fr: "{n} sur 7 d'affilée",
  de: '{n}/7 in Folge',
  it: '{n} di 7 di fila',
};
// The whole line at its longest (day 20 of 21, 6 of 7), measured with the 15 pt system font
// (SF Pro, NSFont systemFont 15 regular).
const MEASURED = {
  'Reality check · day 20 of 21 · 6 of 7 days in a row': 331.8,
  'Tus cifras reales · día 20 de 21 · 6 de 7 seguidos': 328.1,
  'Seus números reais · dia 20 de 21 · 6 de 7 seguidos': 350.9,
  "Vos vrais chiffres · jour 20 sur 21 · 6 sur 7 d'affilée": 341.8,
  'Deine echten Zahlen · Tag 20 von 21 · 6/7 in Folge': 340.1,
  'I tuoi numeri reali · giorno 20 di 21 · 6 di 7 di fila': 322.2,
};
const CARD_TEXT_W = 372 - 6; // a little room for tabular digits

test('the short run of Today\'s line in all six languages (Portuguese as the founder wrote it)', () => {
  for (const [l, s] of Object.entries(WANT)) assert.equal(tr[l].nutri_hero_run_today, s, l);
  assert.equal(tr.pt.nutri_hero_day + ' · ' + tr.pt.nutri_hero_run_today, 'Seus números reais · dia {n} de {total} · {n} de 7 seguidos');
});

test('Today\'s line fits one line of the card in every language', () => {
  for (const l of Object.keys(WANT)) {
    const line = tr[l].nutri_hero_day.replace('{n}', '20').replace('{total}', '21') + ' · ' + tr[l].nutri_hero_run_today.replace('{n}', '6');
    const w = MEASURED[line];
    assert.ok(w != null, `${l}: "${line}" has a measured width`);
    assert.ok(w <= CARD_TEXT_W, `${l}: ${w} pt is over ${CARD_TEXT_W}`);
  }
});

test('Today uses the short run; Journey keeps the full one', () => {
  assert.match(HERO, /t\(variant === 'today' \? 'nutri_hero_run_today' : 'nutri_hero_run'\)\.replace\('\{n\}'/);
  assert.equal(tr.pt.nutri_hero_run, '{n} de 7 dias seguidos', 'Journey shows the run alone, with its words');
});
