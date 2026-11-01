'use strict';
// Simulator 2026-11-01 (DV-080 chart, A-203 signs): PSA total with two readings on the SAME date ("< 0,01" and
// "0,04", both 16 Oct) drew a vertical line on one x, and the lower point ("< 0,01") had no label — it could not
// be read. Now: a marker whose readings of every unit fall on fewer than 2 distinct dates draws no chart (the
// "add another test" line and the readings list show instead; a unit with one date beside a unit that has a
// time chart keeps its approved one-date small chart, with no line); points sharing a date are each labelled,
// their labels offset so they never collide; a signed value is labelled exactly as the readings list writes
// its number (A-203 NN-1/NN-3: "< 0,01", "> 2000").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const M = require('../lib/markerChart');
const L = require('../lib/labValue');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const P = (date, value, unit, qualifier = null) => ({ date, value, unit, qualifier });
const psa = [P('2026-10-16', 0.01, 'ng/mL', '<'), P('2026-10-16', 0.04, 'ng/mL')];

test('distinct dates: readings on one day count once', () => {
  assert.equal(M.distinctDates(psa), 1);
  assert.equal(M.distinctDates([...psa, P('2026-09-01', 0.03, 'ng/mL')]), 2);
  assert.equal(M.distinctDates([]), 0);
});

test('no time chart when every unit has fewer than 2 distinct dates', () => {
  assert.equal(M.hasTimeChart(psa, 'ng/mL'), false, 'two readings, one date: no chart');
  assert.equal(M.hasTimeChart([P('2026-01-10', 650, 'ng/dL'), P('2026-03-10', 22.5, 'nmol/L')], 'ng/dL'), false, 'one date per unit');
  assert.equal(M.hasTimeChart([P('2026-09-01', 0.03, 'ng/mL'), ...psa], 'ng/mL'), true);
  // DV-080 option A: a one-date unit beside a unit with a time chart keeps its small chart, with no line.
  const mixed = [P('2026-01-10', 650, 'ng/dL'), P('2026-03-10', 22.5, 'nmol/L'), P('2026-03-10', 23, 'nmol/L'), P('2026-10-19', 700, 'ng/dL')];
  assert.equal(M.hasTimeChart(mixed, 'ng/dL'), true);
  const series = M.unitSeries(mixed, 'ng/dL');
  assert.deepEqual(series.map((s) => M.distinctDates(s.points) >= 2), [true, false]);
});

test('points sharing a date: each one labelled, one above and one below, the date once', () => {
  const plan = M.labelPlan([{ x: 100, y: 80 }, { x: 100, y: 50 }], 56);
  assert.equal(plan[1].value, 'above', 'the upper point (smaller y) above');
  assert.equal(plan[0].value, 'below', 'the lower point below');
  assert.equal(plan.filter((p) => p.date).length, 1, 'one date under the shared x');
  // Three on one date: the middle one beside its point.
  const three = M.labelPlan([{ x: 40, y: 30 }, { x: 40, y: 60 }, { x: 40, y: 90 }], 56);
  assert.deepEqual(three.map((p) => p.value), ['above', 'right', 'below']);
});

test('label positions never collide for points sharing a date', () => {
  const top = M.labelPos({ x: 100, y: 50 }, 'above');
  const bottom = M.labelPos({ x: 100, y: 58 }, 'below');
  assert.ok(bottom.y - top.y >= 12, `11 pt labels need 12 px: ${top.y} / ${bottom.y}`);
  assert.equal(top.anchor, 'middle');
  const side = M.labelPos({ x: 100, y: 60 }, 'right');
  assert.equal(side.anchor, 'start');
  assert.ok(side.x > 100 + 4.5, 'clear of the point');
});

test('thinning works on dates: a same-date group is labelled or not as a whole; the newest always', () => {
  const plan = M.labelPlan([{ x: 0, y: 40 }, { x: 0, y: 70 }, { x: 10, y: 50 }, { x: 200, y: 60 }], 56);
  assert.deepEqual(plan.map((p) => p.value), [null, null, 'above', 'above']);
  assert.deepEqual(plan.map((p) => p.date), [false, false, true, true]);
});

test('a signed value is labelled with its sign, exactly as the readings list writes the number', () => {
  const pts = L.chartPoints(psa);
  for (const lang of ['pt', 'en', 'de']) {
    const chart = L.labNumberText(pts[0], lang);
    assert.ok(L.labValueText({ ...psa[0] }, lang).startsWith(chart), `${lang}: ${chart}`);
  }
  assert.equal(L.labNumberText(pts[0], 'pt').replace(/ /g, ' '), '< 0,01');
  assert.equal(L.labNumberText(L.chartPoints([P('2026-10-16', 2000, 'pg/mL', '>')])[0], 'pt').replace(/ /g, ' '), '> 2000');
});

test('MarkerChart: a line only for a unit with 2+ dates, every label placed by labelPlan, the sign kept', () => {
  const src = read('screens/components/MarkerChart.js');
  parse(src, { sourceType: 'module', plugins: ['jsx'] });
  assert.match(src, /line: distinctDates\(s\.points\) >= 2/);
  assert.match(src, /\{c\.line && \(\s*<Polyline/);
  assert.match(src, /labelPlan\(xy\.map/);
  assert.match(src, /labelPos\(p, c\.plan\[i\]\.value\)/);
  assert.match(src, /qualifier: p\.qualifier/);
  assert.match(src, /\{labNumberText\(p, language\)\}/);
  assert.doesNotMatch(src, /labelledIndexes\(/, 'the old thinning by single points is gone');
});

test('marker page: no chart (and no Premium tile) without a time chart; the "add another test" line instead', () => {
  const body = read('screens/BodyScreen.js');
  const detail = body.slice(body.indexOf('function renderMarkerDetail('), body.indexOf('function renderScanUsage('));
  assert.match(detail, /const chartable = hasTimeChart\(chartPoints\(markerDetail\.points\), markerDetail\.unit\);/);
  assert.match(detail, /chartable && premium === true \? \(\s*<MarkerChart /);
  assert.match(detail, /chartable && premium === false \? \(/);
  assert.match(detail, /!chartable && chartCount >= 1 \? \(\s*<Text style=\{s\.sec\}>\{t\('blood_need_more'\)\}/);
});
