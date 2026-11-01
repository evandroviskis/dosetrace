'use strict';
// Founder 2026-11-01 (option A of docs/design/curva-aviso-sem-estudos.html): every compound keeps its curve;
// each one marked "Estimado — sem dados humanos" is named in a line under the chart that says no study in
// humans proves how long it stays in the blood and where the estimate comes from. In a chart in DAYS with a
// longer compound beside it, the line also says why the short one falls to zero within hours.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry, HALF_LIVES } = require('../lib/halfLives');
const { translations } = require('../i18n/translations');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('every "estimated" entry says where its estimate comes from', () => {
  const bad = Object.entries(HALF_LIVES).filter(([, e]) => e.tier === 'estimated' && !['animal', 'analog', 'none', 'thin'].includes(e.basis));
  assert.deepEqual(bad.map(([n]) => n), []);
  assert.equal(getHalfLifeEntry('BPC-157').basis, 'animal');
  assert.equal(getHalfLifeEntry('TB-500').basis, 'analog');
  assert.equal(getHalfLifeEntry('GHK-Cu').basis, 'animal');
  assert.equal(getHalfLifeEntry('KPV').basis, 'none');
  for (const [, e] of Object.entries(HALF_LIVES)) if (e.tier !== 'estimated') assert.equal(e.basis, undefined);
});

test('BPC-157 and PDA stay instant: the 3-minute rise of He 2022 changes the peak by ~7% and would break the sample budget (2026-11-01)', () => {
  for (const n of ['BPC-157', 'Pentadeca Arginate']) {
    const e = getHalfLifeEntry(n);
    assert.equal(e.tmaxHours, undefined, n);
    assert.match(e.source, /peak at 3 min/, n);
  }
});

test('the warning: names, basis, plural, and the days clause only in a mixed chart in days', () => {
  const { noStudyWarning } = require('../lib/curveEvidence');
  const t = (k) => translations.pt[k];
  const bpc = { name: 'BPC-157', entry: getHalfLifeEntry('BPC-157') };
  const tb = { name: 'TB-500', entry: getHalfLifeEntry('TB-500') };
  const cyp = { name: 'Testosterona cipionato', entry: getHalfLifeEntry('Testosterone Cypionate') };
  assert.equal(noStudyWarning([cyp], { hourMode: false, t }), null, 'a studied compound alone: no warning');
  assert.equal(noStudyWarning([bpc], { hourMode: true, t }),
    'Não há estudos em humanos que comprovem quanto tempo BPC-157 (dados de animais) fica no sangue. Os valores desta curva são estimativas e podem não refletir o seu caso.');
  const mixed = noStudyWarning([bpc, tb, cyp], { hourMode: false, t });
  assert.match(mixed, /^Não há estudos em humanos que comprovem quanto tempo BPC-157 \(dados de animais\) e TB-500 \(dados de um composto parecido\) ficam no sangue\./);
  assert.match(mixed, /Por isso, neste gráfico, as linhas de BPC-157 e TB-500 caem a zero poucas horas depois de cada dose, enquanto as dos outros compostos caem ao longo de dias ou semanas\./);
  assert.ok(!/Testosterona/.test(mixed.split('Por isso')[0]), 'the studied compound is not named as unstudied');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['curve_nostudy_one', 'curve_nostudy_many', 'curve_nostudy_days_one', 'curve_nostudy_days_many', 'curve_basis_animal', 'curve_basis_analog', 'curve_basis_none', 'curve_basis_thin']) assert.ok(translations[l][k], `${l} ${k}`);
  }
});

test('wired under the chart, attention colour with the warning triangle', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /const noStudy = model && model\.max > 0 \? noStudyWarning\(model\.series, \{ hourMode, t \}\) : null;/);
  assert.match(src, /<FeatureIcon name="warning" size=\{16\} color=\{colors\.attention\} \/>/);
  assert.ok(src.indexOf('{noStudy ? (') < src.indexOf('<View style={s.legendKeys}>'), 'between the axis and the legend keys');
});

// Founder 2026-11-01 ("a meia-vida de 15 min"): BPC-157 uses the only precise measurement, rats IV 15.2 min
// (He 2022); Pentadeca Arginate, whose value is borrowed from BPC-157 (same sequence), follows.
test('BPC-157 and PDA: half-life 15 min (0.25 h), sourced', () => {
  for (const n of ['BPC-157', 'Pentadeca Arginate']) {
    const e = getHalfLifeEntry(n);
    assert.equal(e.hours, 0.25, n);
    assert.match(e.source, /15(\.2)? min/, n);
  }
});
