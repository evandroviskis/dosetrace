'use strict';
// Founder 2026-10-02: once the food log has its 7 days in a row, Today's food card line
// ("Reality check · day 20 of 21 · intake ready (21 days in a row)") still wrapped in every
// language, English included. The run-complete part (nutri_hero_run_ready) is now short and
// the whole line fits one line of the card on an iPhone 17 Pro Max (card text width
// 440 - 2 x 16 margin - 2 x 18 padding = 372 pt; 15 pt system font), longest case: day 20 of
// 21 and a 21-day run. Journey shows the same short text alone.
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
  en: 'intake ready ({d} days)',
  es: '{d} días completos',
  pt: '{d} dias completos',
  fr: '{d} jours complets',
  de: '{d} volle Tage',
  it: '{d} giorni completi',
};
// The whole line at its longest, measured with the 15 pt system font (SF Pro, NSFont
// systemFont 15 regular).
const MEASURED = {
  'Reality check · day 20 of 21 · intake ready (21 days)': 349.5,
  'Tus cifras reales · día 20 de 21 · 21 días completos': 342.5,
  'Seus números reais · dia 20 de 21 · 21 dias completos': 365.3,
  'Vos vrais chiffres · jour 20 sur 21 · 21 jours complets': 355.5,
  'Deine echten Zahlen · Tag 20 von 21 · 21 volle Tage': 348.6,
  'I tuoi numeri reali · giorno 20 di 21 · 21 giorni completi': 364.7,
};
const CARD_TEXT_W = 372 - 6; // a little room for tabular digits

test('the run-complete text is short in all six languages', () => {
  for (const [l, s] of Object.entries(WANT)) assert.equal(tr[l].nutri_hero_run_ready, s, l);
});

test("Today's run-complete line fits one line of the card in every language", () => {
  for (const l of Object.keys(WANT)) {
    const line = tr[l].nutri_hero_day.replace('{n}', '20').replace('{total}', '21') + ' · ' + tr[l].nutri_hero_run_ready.replace('{d}', '21');
    const w = MEASURED[line];
    assert.ok(w != null, `${l}: "${line}" has a measured width`);
    assert.ok(w <= CARD_TEXT_W, `${l}: ${w} pt is over ${CARD_TEXT_W}`);
  }
});

test('the card still builds the run-complete text from nutri_hero_run_ready', () => {
  assert.match(HERO, /run\.ok \? t\('nutri_hero_run_ready'\)\.replace\('\{d\}', String\(run\.days\)\)/);
});
