// DV-105 (AD-11 · DL-91; parked-error sweep 2026-10-31): a tap on Evolução's Dose accumulation tile logged no
// event (My Body's same tile logs viewed + preview), so the curve's use from Evolução went unmeasured. Same
// events now, from both tiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-105: the Evolução curve tile logs the same events as My Body', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/JourneyScreen.js'), 'utf8');
  const tile = src.slice(src.indexOf("icon=\"curve_loose\""), src.indexOf("icon=\"curve_loose\"") + 900);
  assert.match(tile, /Analytics\.viewed\('serum_curve'\);/);
  assert.match(tile, /if \(premium === false\) Analytics\.previewSheetViewed\('serum_curve'\);/);
});
