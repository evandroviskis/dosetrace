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
  assert.equal(getHalfLifeEntry('KPV').basis, 'none');
  // Pharmacometrician council 2026-11-01: the basis names where the DRAWN value comes from.
  // Boldenone Undecylenate / Stanozolol injectable draw textbook values that ignore their horse data; GHK-Cu has
  // no t½ in any species → no measurement. γ-Endorphin's data is des-Tyr-γ-endorphin (another peptide) and
  // Pentadeca Arginate borrows BPC-157's value → a similar compound.
  for (const n of ['Boldenone Undecylenate', 'Stanozolol injectable', 'GHK-Cu']) assert.equal(getHalfLifeEntry(n).basis, 'none', n);
  for (const n of ['γ-Endorphin', 'Pentadeca Arginate']) assert.equal(getHalfLifeEntry(n).basis, 'analog', n);
  for (const [, e] of Object.entries(HALF_LIVES)) if (e.tier !== 'estimated') assert.equal(e.basis, undefined);
});

// Founder 2026-11-01 (option A): BPC-157 and PDA rise to a peak 3 min after the injection (He 2022, rats IM).
// Pharmacometrician council 2026-11-01: the entry that kept them instant said the rise changes the peak by
// "~7%" — computed at the old t½ 0.5 h; at 0.25 h the instant peak overstates it by ~13 % (2^(−0.05/0.25)).
test('BPC-157 and PDA rise to a peak 3 minutes after the injection (He 2022), the instant peak was ~13 % high', () => {
  for (const n of ['BPC-157', 'Pentadeca Arginate']) {
    const e = getHalfLifeEntry(n);
    assert.equal(e.tmaxHours, 0.05, n);
    assert.equal(e.tmaxRange, null, n);
    assert.match(e.source, /peak at 3 min/, n);
  }
  const decisions = read('docs/decisions.md');
  assert.match(decisions, /not ~7% but ~13%/, 'the ledger corrects the ~7% figure');
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
  // Pharmacometrician council 2026-11-01: the fast drop comes from the short estimated half-life, not from the missing
  // study — the days sentence names that cause and never opens with a 'that is why' after the no-study sentence.
  assert.match(mixed, /As meias-vidas estimadas de BPC-157 e TB-500 são curtas: neste gráfico, as linhas caem a zero poucas horas depois de cada dose, enquanto as dos outros compostos caem ao longo de dias ou semanas\.$/);
  assert.ok(!/Testosterona/.test(mixed.split('As meias-vidas')[0]), 'the studied compound is not named as unstudied');
  assert.equal(translations.pt.curve_nostudy_days_one, 'A meia-vida estimada de {names} é curta: neste gráfico, a linha cai a zero poucas horas depois de cada dose, enquanto as dos outros compostos caem ao longo de dias ou semanas.');
  const CAUSE = { en: /^The estimated half-li(fe|ves) of \{names\} (is|are) short: /, es: /^La(s)? vida(s)? media(s)? estimada(s)? de \{names\} (es|son) corta(s)?: /, pt: /^As? mei(a|as)-vidas? estimadas? de \{names\} (é|são) curtas?: /, fr: /^L(a|es) demi-vies? estimées? de \{names\} (est|sont) courtes? : /, de: /^Die geschätzten? Halbwertszeit(en)? von \{names\} (ist|sind) kurz: /, it: /^L(’emivita stimata|e emivite stimate) di \{names\} (è breve|sono brevi): / };
  for (const l of Object.keys(CAUSE)) for (const k of ['curve_nostudy_days_one', 'curve_nostudy_days_many']) {
    assert.match(translations[l][k], CAUSE[l], `${l} ${k}`);
    assert.doesNotMatch(translations[l][k], /That is why|Por eso|Por isso|C’est pourquoi|Deshalb|Per questo/, `${l} ${k}`);
  }
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['curve_nostudy_one', 'curve_nostudy_many', 'curve_nostudy_days_one', 'curve_nostudy_days_many', 'curve_basis_animal', 'curve_basis_analog', 'curve_basis_none', 'curve_basis_thin']) assert.ok(translations[l][k], `${l} ${k}`);
  }
});

test('wired under the chart, attention colour with the warning triangle', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /const noStudy = model \? noStudyWarning\(model\.series, \{ hourMode, t \}\) : null;/);
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
