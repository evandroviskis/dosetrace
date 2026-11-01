// DV-207 (DL-35, one window rule; parked-error sweep 2026-10-31): "Estimate on a date" before the curve's window
// showed "—" for each compound but the Combined row still printed a computed number. Combined follows the rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-207: the Combined readout shows — before the window, like each compound', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /\{readoutT < model\.start \? '—' : levelText\(combLevel\(c, c\.members\.reduce\(/);
});
