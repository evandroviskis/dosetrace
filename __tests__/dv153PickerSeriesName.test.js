// DV-153 (DL-33; parked-error sweep 2026-10-31): the curve picker named a blend component by the component
// alone ("BPC-157"), so two blends with BPC-157 gave identical rows. The picker uses the series name the
// chart uses (lib/serumModel seriesName), which already carries the "· ended" marker for ended protocols.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitCurveProtocols, seriesName } = require('../lib/serumModel');

test('DV-153: two blends with BPC-157 give distinct picker names', () => {
  const t = (k) => k;
  const r = splitCurveProtocols([
    { id: 1, type: 'recon', compound_id: 'lyo_wolverine', dose: 10, dose_unit: 'mg' },
    { id: 2, type: 'recon', compound_id: 'lyo_glow', dose: 10, dose_unit: 'mg' },
  ], t);
  const bpc = r.active.filter((p) => p.compound_id === 'lyo_bpc_157').map((p) => seriesName(p, t));
  assert.equal(bpc.length, 2);
  assert.notEqual(bpc[0], bpc[1]);
  assert.equal(seriesName({ compound_id: 'testosterone_cypionate' }, t), 'testosterone_cypionate');
  assert.equal(seriesName({ name: 'Custom' }, t), 'Custom');
});

test('DV-153: the picker and the chart read the same name, with no second ended marker', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /<Text style=\{s\.optionName\} numberOfLines=\{1\}>\{seriesName\(p, t\)\}<\/Text>/);
  assert.match(src, /name: seriesName\(p, t\),/);
  // The ended marker is set once, in lib/serumModel curveLabels (same-named rows carry their dates).
  assert.match(src, /const protocols = curveLabels\(split\.active, \{ t, language \}\);/);
});
