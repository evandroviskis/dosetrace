'use strict';
// Simulator 2026-11-01: with only BPC-157 selected and no dose in the window ("Nenhuma dose registrada ainda")
// the chart is empty (model.max = 0) and the no-study warning was missing — it was gated on model.max > 0.
// The decision (2026-11-01, docs/design/curva-aviso-sem-estudos.html): the warning shows whenever such a
// compound is on the curve. The days clause keeps its own rule (lib/curveEvidence).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry } = require('../lib/halfLives');
const { translations } = require('../i18n/translations');
const { noStudyWarning } = require('../lib/curveEvidence');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');

test('the warning depends on the selection, not on a drawn level', () => {
  assert.match(src, /const noStudy = model \? noStudyWarning\(model\.series, \{ hourMode, t \}\) : null;/);
  assert.ok(!/const noStudy = model && model\.max > 0/.test(src), 'no model.max gate');
});

test('rendered outside every model.max > 0 branch (between the axis and the legend keys)', () => {
  const at = src.indexOf('{noStudy ? (');
  const before = src.slice(src.lastIndexOf('</Animated.View>', at), at);
  assert.ok(!/model\.max > 0/.test(before), 'nothing between the axis and the warning gates it');
});

test('a selected unstudied compound with no dose in the window still yields the line', () => {
  const t = (k) => translations.pt[k];
  // The series as the screen builds it with no dose in the window: flat zero points.
  const bpc = { name: 'BPC-157', compound: 'BPC-157', entry: getHalfLifeEntry('BPC-157'), points: [0, 0, 0], nowLevel: 0 };
  assert.match(noStudyWarning([bpc], { hourMode: false, t }), /^Não há estudos em humanos que comprovem quanto tempo BPC-157 \(dados de animais\) fica no sangue\./);
});
