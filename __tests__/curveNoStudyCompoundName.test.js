'use strict';
// Simulator 2026-11-01: the no-study warning read "quanto tempo BPC-157 · encerrado (dados de animais) fica no
// sangue" and "a linha de BPC-157 · encerrado cai a zero" — it named the curve's series label (with the ended
// marker), not the compound. The approved text (docs/design/curva-aviso-sem-estudos.html, decision 2026-11-01)
// names the compound: "BPC-157 (dados de animais)". Two selected series of the same compound name it once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry } = require('../lib/halfLives');
const { translations } = require('../i18n/translations');
const { noStudyWarning } = require('../lib/curveEvidence');
const { compoundName } = require('../lib/serumModel');

const t = (k) => translations.pt[k];
const bpcEntry = getHalfLifeEntry('BPC-157');

test('compoundName: the compound, never the series label (ended marker, blend prefix)', () => {
  assert.equal(compoundName({ compound_id: 'BPC-157', __label: 'BPC-157 · encerrado' }, (k) => k), 'BPC-157');
  assert.equal(compoundName({ compound_id: 'BPC-157', __label: 'Wolverine · BPC-157 (est.)', __blend: 'Wolverine' }, (k) => k), 'BPC-157');
  assert.equal(compoundName({ name: 'Meu peptídeo', __label: 'Meu peptídeo · encerrado' }, (k) => k), 'Meu peptídeo');
});

test('an ended series is named by its compound, without the status suffix', () => {
  const ended = { name: 'BPC-157 · encerrado', compound: 'BPC-157', entry: bpcEntry };
  assert.equal(noStudyWarning([ended], { hourMode: true, t }),
    'Não há estudos em humanos que comprovem quanto tempo BPC-157 (dados de animais) fica no sangue. Os valores desta curva são estimativas e podem não refletir o seu caso.');
});

test('two series of the same compound: named once (singular), also in the days clause', () => {
  const a = { name: 'BPC-157 · encerrado em 12 de out.', compound: 'BPC-157', entry: bpcEntry };
  const b = { name: 'BPC-157 · encerrado em 3 de set.', compound: 'BPC-157', entry: bpcEntry };
  const cyp = { name: 'Testosterona cipionato', compound: 'Testosterona cipionato', entry: getHalfLifeEntry('Testosterone Cypionate') };
  const text = noStudyWarning([a, b, cyp], { hourMode: false, t });
  assert.match(text, /^Não há estudos em humanos que comprovem quanto tempo BPC-157 \(dados de animais\) fica no sangue\./);
  assert.match(text, /A meia-vida estimada de BPC-157 é curta: neste gráfico, a linha cai a zero poucas horas depois de cada dose,/);
  assert.ok(!/encerrado/.test(text), text);
});

test('wired: each curve series carries its compound name', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /compound: compoundName\(p, t\),/);
  // The short-compound note ("Neste modelo, BPC-157 sai do sangue…") names the compound too, once.
  assert.match(src, /all\.findIndex\(\(o\) => o\.compound === ser\.compound\) === i\)/);
  assert.match(src, /t\('curve_fast_note'\)\.replace\('\{names\}', ser\.compound\)/);
});
