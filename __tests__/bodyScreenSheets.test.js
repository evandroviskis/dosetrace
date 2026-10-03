'use strict';
// My Body sheets (Graduated redesign, 2026-10-01).
//
// Bug found while redesigning the Lab test journal: the Dose accumulation preview
// sheet (free plan) is opened from the My Body HUB, but its <Modal> was rendered
// only inside the Labs branch (section !== null). On the hub the tap did nothing;
// the sheet then popped up later when the user opened the Lab test journal.
// The sheet must be rendered whatever section is showing.
//
// Also guards the marker chart honesty line (DESIGN.md §7/§9): the user's own
// values only, drawn in the data color, never a range band or a good/bad color.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every node with its ancestor chain.
function walk(node, ancestors, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  const next = ancestors.concat([node]);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, next, visit));
    else if (v && typeof v.type === 'string') walk(v, next, visit);
  }
}

function mentions(node, name) {
  let hit = false;
  walk(node, [], (n) => { if (n.type === 'Identifier' && n.name === name) hit = true; });
  return hit;
}

// A sheet: a Modal, or since the My Body redesign (docs/specs/my-body.md, 2026-10-03) the
// bottom sheet (BottomSheet, visible=) and the shared preview sheet (FeaturePreviewSheet,
// featureKey=), both Modals inside.
const SHEETS = ['Modal', 'BottomSheet', 'FeaturePreviewSheet'];
function modalByVisible(src, stateName) {
  const found = [];
  walk(ast(src), [], (n, anc) => {
    if (n.type !== 'JSXElement' || !SHEETS.includes(n.openingElement.name.name)) return;
    const vis = n.openingElement.attributes.find((a) => a.name && (a.name.name === 'visible' || a.name.name === 'featureKey'));
    if (vis && vis.value && vis.value.expression && mentions(vis.value.expression, stateName)) found.push({ n, anc });
  });
  return found;
}

test('the Dose accumulation preview sheet renders on the hub too (not only inside the Labs branch)', () => {
  const found = modalByVisible(read('screens', 'BodyScreen.js'), 'showSerumPreview');
  assert.equal(found.length, 1, 'exactly one serum preview Modal');
  const gatedBySection = found[0].anc.some((a) =>
    (a.type === 'ConditionalExpression' || a.type === 'LogicalExpression') && mentions(a.type === 'ConditionalExpression' ? a.test : a.left, 'section'));
  assert.equal(gatedBySection, false, 'the serum preview Modal must not sit inside a section-conditional branch');
});

test('the export and edit-value sheets are rendered whatever section is showing', () => {
  const src = read('screens', 'BodyScreen.js');
  for (const name of ['exportModalOpen', 'mEdit']) {
    const found = modalByVisible(src, name);
    assert.equal(found.length, 1, name);
    const gated = found[0].anc.some((a) =>
      (a.type === 'ConditionalExpression' || a.type === 'LogicalExpression') && mentions(a.type === 'ConditionalExpression' ? a.test : a.left, 'section'));
    assert.equal(gated, false, name);
  }
});

test('marker chart: the user\'s own values in the data color — no range band, no good/bad colors', () => {
  const src = read('screens', 'components', 'MarkerChart.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(code, /colors\.data/);
  assert.doesNotMatch(code, /colors\.(risk|ok|attention|danger|success|warning)\b/);
  assert.doesNotMatch(code, /\b(refLow|refHigh|ref_low|ref_high|reference|normalRange|range)\b/i);
  assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'theme tokens only');
});
