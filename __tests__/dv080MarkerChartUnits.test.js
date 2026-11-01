'use strict';
// DV-080 (DL-43; founder 2026-11-01, option A of docs/design/rodada2-conta-exames.html #dv080): one
// marker read in two units (650 ng/dL, 22,5 nmol/L, 700 ng/dL) is never joined in one line — one
// small chart per unit, titled with its unit, and every point sits at its DATE on one time axis
// shared by the charts (Jan–Mar no longer takes the same room as Mar–Oct). No unit conversion, ever.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const M = require('../lib/markerChart');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const P = (date, value, unit) => ({ date, value, unit });
const testo = [P('2026-01-10', 650, 'ng/dL'), P('2026-03-10', 22.5, 'nmol/L'), P('2026-10-19', 700, 'ng/dL')];

test('DV-080: two units → two series, never one line; values untouched (no conversion)', () => {
  const s = M.unitSeries(testo, 'ng/dL');
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.unit), ['ng/dL', 'nmol/L'], 'the latest reading\'s unit first, as drawn');
  assert.deepEqual(s[0].points.map((p) => p.value), [650, 700]);
  assert.deepEqual(s[1].points.map((p) => p.value), [22.5], 'a unit with one reading keeps its one point');
  // One unit → one series, as before.
  assert.equal(M.unitSeries([P('2026-01-10', 650, 'ng/dL'), P('2026-10-19', 700, 'ng/dL')], 'ng/dL').length, 1);
  // The same unit typed with other spacing or case is the same unit (never a conversion).
  assert.equal(M.unitSeries([P('2026-01-10', 5, 'mg/dL'), P('2026-02-10', 6, 'mg/dl '), P('2026-03-10', 7, 'mg / dL')], 'mg/dL').length, 1);
  // A reading with no unit is its own series, never merged into a unit.
  assert.equal(M.unitSeries([P('2026-01-10', 5, 'mg/dL'), P('2026-02-10', 6, '')], 'mg/dL').length, 2);
});

test('DV-080: x is proportional to the dates, on one axis shared by every unit', () => {
  const { from, to } = M.dateDomain(testo);
  const L = 8, R = 182;
  const x = (d) => M.dateX(d, from, to, L, R);
  assert.equal(x('2026-01-10'), L);
  assert.equal(x('2026-10-19'), R);
  // 10 Mar is 59 of the 282 days: the picture's 44,4 — not the middle (95), where an index puts it.
  assert.ok(Math.abs(x('2026-03-10') - (L + (59 / 282) * (R - L))) < 1e-9);
  assert.ok(Math.abs(x('2026-03-10') - 44.404) < 0.01);
  // Two readings 1 month apart then 7 months apart: the gaps follow the calendar.
  const a = x('2026-01-10'), b = x('2026-02-10'), c = x('2026-09-10');
  assert.ok((c - b) > 6 * (b - a));
  // Every reading on one date: the middle.
  assert.equal(M.dateX('2026-05-01', 'x', 'x', L, R), (L + R) / 2);
  const one = M.dateDomain([P('2026-05-01', 1, 'u'), P('2026-05-01', 2, 'v')]);
  assert.equal(M.dateX('2026-05-01', one.from, one.to, L, R), (L + R) / 2);
});

test('DV-080: labels thin by distance and the newest is always labelled', () => {
  // 0, 10, 20, 100, 200 px: the newest (200) and 100 labelled; 20 kept (80 px from 100); 10 and 0 too close to 20.
  assert.deepEqual([...M.labelledIndexes([0, 10, 20, 100, 200], 56)].sort((p, q) => p - q), [2, 3, 4]);
  assert.deepEqual([...M.labelledIndexes([50], 56)], [0]);
  assert.deepEqual([...M.labelledIndexes([0, 60, 120], 56)].sort(), [0, 1, 2]);
});

test('DV-080: MarkerChart draws one chart per unit, titled with its unit (mono, ink3), by date', () => {
  const src = read('screens/components/MarkerChart.js');
  parse(src, { sourceType: 'module', plugins: ['jsx'] });
  assert.match(src, /unitSeries\(/);
  assert.match(src, /dateX\(/);
  assert.doesNotMatch(src, /i \/ \(n - 1\)/, 'no x by index');
  assert.match(src, /fontFamily: MONO\['500'\]/);
  assert.match(src, /colors\.ink3/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'theme tokens only');
  // Each point's own unit is spoken (never the latest reading's unit for every point).
  assert.match(src, /p\.unit/);
});
