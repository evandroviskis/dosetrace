// DV-067 (AD-18; parked-error sweep 2026-10-31): the curve remembers its last view among active AND ended runs
// (curveHistoryProtocols), but the Evolução tile looked only at active protocols, so a remembered ended run fell
// back to another compound on the tile. The tile reads the curve's own list.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-067: the tile hands defaultCurveLevel the curve\'s history list', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/JourneyScreen.js'), 'utf8');
  assert.match(src, /defaultCurveLevel\(curveHistoryProtocols\(getHistoryProtocols\(user\.id\)\), Date\.now\(\), undefined, savedView, curveLevelData\(user\.id\)\)/);
});
