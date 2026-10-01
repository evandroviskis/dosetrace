'use strict';
// A-63 (registry): on the Dose log the filter chips (All / Taken / Skipped / Missed)
// rendered stretched into tall columns. Cause: they sat in a horizontal ScrollView
// between the fixed header and the SectionList; a ScrollView grows (flexGrow 1) and
// shares the free height with the list, and its row children stretch to that height.
// Guard: the pills are a plain wrapping row (prototype .pills), never inside a
// horizontal ScrollView, and the row cannot grow. Also: the streak explanation sits at
// the top of the Dose log (today-build-handoff.md item 15).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const FILE = process.env.DOSE_LOG_FILE || path.join(__dirname, '..', 'screens', 'LogScreen.js');
const src = fs.readFileSync(FILE, 'utf8');
const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every JSX element that maps over `filters`, with the chain of its JSX ancestors.
function filterMaps() {
  const hits = [];
  (function walk(node, ancestors) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.object.type === 'Identifier' && node.callee.object.name === 'filters'
      && node.callee.property.name === 'map') hits.push(ancestors.slice());
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

function styleBody(name) {
  const m = src.match(new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name} not found`);
  return m[1];
}

test('A-63: the Dose log filter pills are not inside a horizontal ScrollView', () => {
  const maps = filterMaps();
  assert.ok(maps.length >= 1, 'the filter pills render from filters.map');
  for (const chain of maps) {
    for (const el of chain) {
      const name = el.name.name;
      const horizontal = el.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'horizontal');
      assert.ok(!(name === 'ScrollView' && horizontal), 'filters.map sits inside <ScrollView horizontal>');
    }
  }
});

test('A-63: the pills row wraps and cannot grow into the list\'s height', () => {
  const body = styleBody('pills');
  assert.match(body, /flexDirection: 'row'/);
  assert.match(body, /flexWrap: 'wrap'/);
  assert.doesNotMatch(body, /flex(Grow)?: [1-9]/);
  assert.doesNotMatch(styleBody('pill'), /flex(Grow)?: [1-9]|height: '100%'/);
});

test('item 15: the streak explanation is shown on the Dose log', () => {
  assert.match(src, /t\('today_streak_explainer'\)/);
});
