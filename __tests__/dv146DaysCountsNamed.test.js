'use strict';
// DV-146 (DL-30, AD-79 item 3; founder go 2026-11-01, picture docs/design/rodada1-hoje-registro.html #dv146):
// Progress (and the Fold's two-page view) showed three "days" numbers side by side that looked like they
// contradicted each other, though all three are right: the days in a row the result used, the current run
// of logging, and the days with any food (in a row or not). Each count now says what it counts. The numbers
// do not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { translations: T } = require('../i18n/translations');
const { pluralKey } = require('../lib/plural');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const fill = (s, vars) => Object.entries(vars).reduce((x, [k, v]) => x.split(`{${k}}`).join(String(v)), s);

test('pt: each count says what it counts (the approved wording)', () => {
  assert.equal(T.pt.nutri_run_summary, 'Usados no resultado: {d} dias seguidos · ≈ {avg} kcal/dia');
  assert.equal(T.pt.cal_rc_sofar_run, 'Sequência atual: {d} dias seguidos · ~{kcal} kcal/dia');
  assert.equal(T.pt.cal_rc_sofar_run_one, 'Sequência atual: {d} dia · ~{kcal} kcal/dia');
  assert.equal(T.pt.nutri_hero_run_ready_journey, 'Resultado com {d} dias seguidos');
  assert.match(T.pt.nutri_free_ending_note, /com comida registrada em \{logged\} dias \(seguidos ou não\)\./);
  assert.match(T.pt.nutri_grace_note_premium, /com comida registrada em \{logged\} dias \(seguidos ou não\) —/);
  // The picture's numbers.
  assert.equal(fill(T.pt.nutri_run_summary, { d: 9, avg: '2.150' }), 'Usados no resultado: 9 dias seguidos · ≈ 2.150 kcal/dia');
  assert.equal(fill(T.pt[pluralKey('cal_rc_sofar_run', 3, 'pt')], { d: 3, kcal: '2.000' }), 'Sequência atual: 3 dias seguidos · ~2.000 kcal/dia');
});

test('all 6 languages: the same placeholders, and the "any food" count is marked as in a row or not', () => {
  const MARK = { en: '(in a row or not)', es: '(seguidos o no)', pt: '(seguidos ou não)', fr: "(d'affilée ou non)", de: '(am Stück oder nicht)', it: '(di fila o no)' };
  const ph = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const l of LANGS) {
    for (const k of ['nutri_run_summary', 'cal_rc_sofar_run', 'cal_rc_sofar_run_one', 'nutri_hero_run_ready_journey', 'nutri_free_ending_note', 'nutri_grace_note_premium']) {
      assert.ok(T[l][k], `${l}.${k}`);
      assert.equal(ph(T[l][k]), ph(T.en[k]), `${l}.${k} placeholders`);
    }
    assert.ok(T[l].nutri_free_ending_note.includes(`{logged}`) && T[l].nutri_free_ending_note.includes(MARK[l]), `${l} free ending note`);
    assert.ok(T[l].nutri_grace_note_premium.includes(MARK[l]), `${l} grace note`);
    // Every count of days in a row says so.
    assert.ok(/kcal/.test(T[l].nutri_run_summary), `${l} summary names kcal`);
  }
  assert.equal(T.en.nutri_run_summary, 'Used in the result: {d} days in a row · ≈ {avg} kcal/day');
  assert.equal(T.en.cal_rc_sofar_run, 'Current streak: {d} days in a row · ~{kcal} kcal/day');
  assert.equal(T.en.nutri_hero_run_ready_journey, 'Result from {d} days in a row');
});

test('the Journey food card names the run the result used; Today keeps its short one-line text', () => {
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /variant === 'journey' \? 'nutri_hero_run_ready_journey' : 'nutri_hero_run_ready'/);
  // Numbers unchanged: the same run, the same average.
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /t\('nutri_run_summary'\)\.replace\('\{avg\}', fmtInt\(foodRun\.avgKcal\)\)\.replace\('\{d\}', String\(foodRun\.days\)\)/);
  assert.match(calc, /t\(pluralKey\('cal_rc_sofar_run', soFar\.run\.days, language\)\)/);
});
