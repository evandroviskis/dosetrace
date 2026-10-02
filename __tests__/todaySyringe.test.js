'use strict';
// Today redesign part 6 (founder 2026-10-02: "A, dias coloridos, confirmo os ícones"): the
// syringe is the approved prototype drawing, docs/design/prototype.html syr(cap, v):
// viewBox 330 x 46, needle (ink3) and hub on the LEFT, barrel x 34..290 (256 wide in the
// viewBox = 228 pt on the 290 pt Today draw box), the dose in data, ticks every 2 units
// (long every 10, onData at 0.75 inside the dose), a Geist Mono 9 number every 10 from 0,
// a 6-wide ink stopper at the dose, an ink2 rod from the stopper and an 8 x 24 ink thumb
// rest. Over capacity (prototype syrOver) the FULL syringe is drawn with the fill in risk
// red instead of being hidden (Today, the dose page, the protocol and the wizard).
// "Draw to" stays small and black (V6): not part of this drawing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

test('part 6: lib/syringeGeometry.js gives the prototype syr() geometry', () => {
  assert.ok(exists('lib', 'syringeGeometry.js'), 'lib/syringeGeometry.js not built yet');
  const { syringeParts, SYR_VIEW } = require('../lib/syringeGeometry');
  assert.deepEqual(SYR_VIEW, { w: 330, h: 46 });
  const g = syringeParts(100, 50);
  assert.equal(g.over, false);
  assert.deepEqual(g.needle, { x1: 1, y1: 19, x2: 22, y2: 19, width: 1.4 });
  assert.equal(g.hub, 'M22 15h8l4 2v4l-4 2h-8z');
  assert.deepEqual(g.barrel, { x: 34, y: 8, w: 256, h: 22, rx: 5, stroke: 1.2 });
  assert.deepEqual(g.fill, { x: 35, y: 9, w: 127, h: 20, rx: 4 });
  // ticks every 2 units, 2..98; long every 10; inside the dose: onData at 0.75
  assert.equal(g.ticks.length, 49);
  const t10 = g.ticks.find((k) => k.u === 10);
  assert.deepEqual(t10, { u: 10, x: 59.6, y1: 9, y2: 18, long: true, inFill: true, width: 1.2 });
  const t52 = g.ticks.find((k) => k.u === 52);
  assert.deepEqual(t52, { u: 52, x: 167.1, y1: 9, y2: 13, long: false, inFill: false, width: 0.8 });
  // a number every 10 units, from 0
  assert.deepEqual(g.labels.map((l) => l.text), ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
  assert.equal(g.labels[0].x, 34);
  assert.equal(g.labels[10].x, 290);
  assert.equal(g.labels[0].y, 43);
  assert.deepEqual(g.stopper, { x: 161, y: 7, w: 6, h: 24, rx: 2 });
  assert.deepEqual(g.rod, { x: 167, y: 17, w: 151, h: 4, rx: 1 });
  assert.deepEqual(g.thumb, { x: 318, y: 7, w: 8, h: 24, rx: 3 });
});

test('part 6: an empty or small dose still draws the stopper; never a negative fill', () => {
  const { syringeParts } = require('../lib/syringeGeometry');
  const g = syringeParts(30, 0);
  assert.equal(g.fill.w, 0);
  assert.equal(g.stopper.x, 33);
  assert.deepEqual(g.labels.map((l) => l.text), ['0', '10', '20', '30']);
  assert.equal(g.ticks.length, 14, '2..28 every 2');
});

test('part 6: over capacity (prototype syrOver) draws the full syringe with the fill in risk', () => {
  const { syringeParts } = require('../lib/syringeGeometry');
  const g = syringeParts(50, 80);
  assert.equal(g.over, true);
  assert.equal(g.fill.w, 255, 'full barrel');
  assert.equal(g.stopper.x, 289, 'stopper at the end of the scale');
  assert.equal(g.fillTone, 'risk');
  assert.equal(syringeParts(50, 40).fillTone, 'data');
});

test('part 6: SyringeScale draws the geometry in the 330 x 46 viewBox from theme tokens, Geist Mono 9 numbers', () => {
  const src = read('screens', 'components', 'SyringeScale.js');
  assert.match(src, /from '\.\.\/\.\.\/lib\/syringeGeometry'/);
  assert.match(src, /viewBox=\{`0 0 \$\{SYR_VIEW\.w\} \$\{SYR_VIEW\.h\}`\}/);
  assert.match(src, /fontFamily=\{MONO\['400'\]\}/);
  assert.match(src, /fontSize=\{9\}/);
  assert.match(src, /c\.ink3/); // needle + hub + numbers
  assert.match(src, /c\.ink2/); // rod
  assert.match(src, /c\.risk/); // over capacity
  assert.match(src, /strokeOpacity=\{k\.inFill \? 0\.75 : 1\}/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex');
  assert.doesNotMatch(src, /'(white|black)'/);
  // the old drawing is gone (a 2.5 pt line from the barrel end, 1-unit ticks for small syringes)
  assert.doesNotMatch(src, /strokeWidth=\{2\.5\}/);
  assert.doesNotMatch(src, /max <= 30 \? 1 : 2/);
});

test('part 6: over capacity the syringe is drawn (not hidden) on Today, the dose page, the protocol and the wizard', () => {
  const today = read('screens', 'TodayScreen.js');
  const page = read('screens', 'components', 'DosePage.js');
  const proto = read('screens', 'ProtocolsScreen.js');
  for (const [name, src] of [['Today', today], ['DosePage', page]]) {
    assert.doesNotMatch(src, /draw\.exceedsSyringe \? \(/, `${name} still swaps the syringe for the warning`);
    assert.match(src, /<SyringeScale units=\{Number\(draw\.drawUnits\)\}/, name);
  }
  assert.doesNotMatch(proto, /\{over \? \(\s*<Text style=\{s\.drawWarn\}/, 'protocol hero still hides the syringe when over');
  assert.doesNotMatch(proto, /\{!overCap && liveW > 0 && \(/, 'wizard still hides the syringe when over');
});
