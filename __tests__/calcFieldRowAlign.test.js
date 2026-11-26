// Fold 2026-11-26 (cover screen, pt): in "Registrar o peso de hoje" and in "Seus números" the
// label "Gordura corporal (%) · opcional" wraps to two lines while the label next to it takes one,
// so the two boxes of the same row sat at different heights. Paired fields must keep their boxes
// on one line: each half stretches to the row's height and pushes its box to the bottom.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'CalculatorSection.js'), 'utf8');

test('paired fields: the boxes of one row line up when a label wraps', () => {
  const half = src.match(/fldHalf:\s*\{([^}]*)\}/);
  assert.ok(half, 'fldHalf style exists');
  assert.match(half[1], /justifyContent:\s*'space-between'/, 'each half pushes its box to the bottom');
  const row = src.match(/fieldRow:\s*\{([^}]*)\}/);
  assert.ok(row, 'fieldRow style exists');
  assert.doesNotMatch(row[1], /alignItems:\s*'(flex-start|center)'/, 'the row stretches both halves to the same height');
});
