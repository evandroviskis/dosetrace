'use strict';
// Pre-build pass 2026-10-03, m11 (shot z_seg_dark): in dark theme the chosen segment (raised
// #282B30) was barely lighter than the track (well #1D2024), 1.15:1, so the choice was hard to
// see. Two theme tokens for the chosen segment: segOn / segOnLine. Light keeps its approved look
// (raised + line, unchanged); dark gets a lighter fill and ring. Every SegmentedBar in the app is
// the one shared component, so the change reaches all of them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function palettes() {
  const src = fs.readFileSync(path.join(__dirname, '../lib/theme.js'), 'utf8');
  const grab = (name) => {
    const i = src.indexOf(`export const ${name} = {`);
    const body = src.slice(i, src.indexOf('\n};', i));
    const o = {};
    for (const m of body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) if (!(m[1] in o)) o[m[1]] = m[2];
    return o;
  };
  return { LIGHT: grab('LIGHT'), DARK: grab('DARK') };
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('light keeps the approved chosen segment (raised fill, line ring)', () => {
  const { LIGHT } = palettes();
  assert.equal(LIGHT.segOn, LIGHT.raised);
  assert.equal(LIGHT.segOnLine, LIGHT.line);
});

test('dark: the chosen segment stands out from the track (and from the ground track on a well)', () => {
  const { DARK } = palettes();
  assert.ok(ratio(DARK.raised, DARK.well) < 1.2, 'the old fill was the problem');
  assert.ok(ratio(DARK.segOn, DARK.well) >= 1.9, `segOn vs well ${ratio(DARK.segOn, DARK.well).toFixed(2)}`);
  assert.ok(ratio(DARK.segOn, DARK.ground) >= 2.2, `segOn vs ground ${ratio(DARK.segOn, DARK.ground).toFixed(2)}`);
  assert.ok(ratio(DARK.segOnLine, DARK.well) > ratio(DARK.line, DARK.well), 'the ring is lighter too');
});

test('the chosen label stays readable on the new fill in both themes', () => {
  const { LIGHT, DARK } = palettes();
  assert.ok(ratio(DARK.ink, DARK.segOn) >= 4.5);
  assert.ok(ratio(LIGHT.ink, LIGHT.segOn) >= 4.5);
});

test('the shared SegmentedBar draws the chosen segment from the tokens', () => {
  const src = fs.readFileSync(path.join(__dirname, '../components/SegmentedBar.js'), 'utf8');
  assert.match(src, /itemOn: \{ backgroundColor: c\.segOn, borderColor: c\.segOnLine \}/);
});
