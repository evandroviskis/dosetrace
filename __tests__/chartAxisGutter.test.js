'use strict';
// S25 2026-11-07 (pt): the weigh-ins chart's Y axis read "32,4" for 82,4 — the label was cut at the
// left. ProgressChart had a fixed 26-unit side gutter (labels end-anchored 4 units before the plot,
// so 22 units of room) and "82,4" in Geist Mono 11 is 4 × 0.6 × 11 = 26.4 units wide. Fix
// (lib/chartAxisGutter): each side's gutter fits its widest axis label — measured on screen
// (components/useColumnWidth, the app's measured-width column) and, until the first layout, the
// monospaced advance — never narrower than the prototype's 26.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { axisGutter, labelWidthEstimate, MIN_GUTTER, LABEL_GAP, EDGE } = require('../lib/chartAxisGutter');

test('axis gutter: the old fixed room (22 units) was narrower than "82,4"', () => {
  assert.ok(labelWidthEstimate('82,4', 11) > 26 - LABEL_GAP, 'the bug: 26.4 > 22');
});

test('axis gutter: fits the widest label, plus the gap to the plot and the edge', () => {
  const g = axisGutter(['82,4', '79,6'], { fontSize: 11 });
  assert.ok(g - LABEL_GAP - EDGE >= labelWidthEstimate('82,4', 11), `gutter ${g} fits 82,4`);
  const lb = axisGutter(['181,6', '176,4'], { fontSize: 11 });
  assert.ok(lb - LABEL_GAP - EDGE >= labelWidthEstimate('181,6', 11), 'pounds: 181,6 fits');
  assert.ok(lb > g, 'a wider label widens the gutter');
  assert.equal(axisGutter(['1.234,5'], { fontSize: 11 }), Math.ceil(labelWidthEstimate('1.234,5', 11) + LABEL_GAP + EDGE));
});

test('axis gutter: never narrower than the prototype, also with no labels', () => {
  assert.equal(axisGutter(['82', '80'], { fontSize: 11 }), MIN_GUTTER);
  assert.equal(axisGutter([], { fontSize: 11 }), MIN_GUTTER);
  assert.equal(axisGutter([null, ''], { fontSize: 11 }), MIN_GUTTER);
  assert.equal(MIN_GUTTER, 26);
});

test('axis gutter: a measured width wins over the estimate (the font on screen decides)', () => {
  assert.equal(axisGutter(['82,4'], { fontSize: 11, measured: 30 }), Math.ceil(30 + LABEL_GAP + EDGE));
  assert.equal(axisGutter(['82,4'], { fontSize: 11, measured: 24 }), Math.ceil(24 + LABEL_GAP + EDGE));
  // No layout yet (0 / null): the estimate.
  assert.equal(axisGutter(['82,4'], { fontSize: 11, measured: 0 }), axisGutter(['82,4'], { fontSize: 11 }));
  assert.equal(axisGutter(['82,4'], { fontSize: 11, measured: null }), axisGutter(['82,4'], { fontSize: 11 }));
});

test('axis gutter: the chart uses it on both sides and measures its labels', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/components/ProgressChart.js'), 'utf8');
  assert.doesNotMatch(src, /L = 26, R = W - 26/, 'no fixed gutter');
  assert.match(src, /axisGutter\(/);
  assert.match(src, /useColumnWidth\(/);
  assert.match(src, /onLayout=\{onLeftLayout\}/);
  assert.match(src, /onLayout=\{onRightLayout\}/);
  assert.match(src, /allowFontScaling=\{false\}/, 'measured at the SVG font size');
});
