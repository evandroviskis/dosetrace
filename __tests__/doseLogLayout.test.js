'use strict';
// A-63 (registry): on the Dose log the filter chips (All / Taken / Skipped / Missed)
// rendered stretched into tall columns. Cause: they sat in a horizontal ScrollView
// between the fixed header and the SectionList; a ScrollView grows (flexGrow 1) and
// shares the free height with the list, and its row children stretch to that height.
// Guard: the filter is never inside a horizontal ScrollView, and it cannot grow. Since
// founder 2026-10-02 (Q2 = B) the filter is the shared SegmentedBar (items={filters}).
// Also: the streak explanation sits at the top of the Dose log (today-build-handoff.md
// item 15).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const FILE = process.env.DOSE_LOG_FILE || path.join(__dirname, '..', 'screens', 'LogScreen.js');
const src = fs.readFileSync(FILE, 'utf8');
const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every JSX element that renders `filters` (a filters.map or items={filters}), with the
// chain of its JSX ancestors.
function filterMaps() {
  const hits = [];
  (function walk(node, ancestors) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.object.type === 'Identifier' && node.callee.object.name === 'filters'
      && node.callee.property.name === 'map') hits.push(ancestors.slice());
    if (node.type === 'JSXAttribute' && node.name.name === 'items' && node.value
      && node.value.type === 'JSXExpressionContainer' && node.value.expression.type === 'Identifier'
      && node.value.expression.name === 'filters') hits.push(ancestors.slice());
    if (node.type === 'JSXElement') ancestors = ancestors.concat([node.openingElement]);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, ancestors));
      else if (v && typeof v.type === 'string') walk(v, ancestors);
    }
  })(ast.program, []);
  return hits;
}

test('A-63: the Dose log filter is not inside a horizontal ScrollView', () => {
  const maps = filterMaps();
  assert.ok(maps.length >= 1, 'the filter renders from filters');
  for (const chain of maps) {
    for (const el of chain) {
      const name = el.name.name;
      const horizontal = el.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'horizontal');
      assert.ok(!(name === 'ScrollView' && horizontal), 'filters.map sits inside <ScrollView horizontal>');
    }
  }
});

test('A-63: the filter bar cannot grow into the list\'s height', () => {
  assert.match(src, /<SegmentedBar\b[^>]*items=\{filters\}/);
  const bar = fs.readFileSync(path.join(__dirname, '..', 'components', 'SegmentedBar.js'), 'utf8');
  const track = bar.match(/\n\s*track: \{([^}]*)\}/);
  assert.ok(track, 'SegmentedBar track style');
  assert.match(track[1], /flexDirection: 'row'/);
  assert.doesNotMatch(track[1], /flex(Grow)?: [1-9]|height: '100%'/);
  assert.doesNotMatch(bar, /<ScrollView/);
});

test('item 15: the streak explanation is shown on the Dose log', () => {
  assert.match(src, /t\('today_streak_explainer'\)/);
});
