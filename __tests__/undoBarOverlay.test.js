'use strict';
// S-02 acceptance (founder 2026-09-28): the Today Undo bar must be visible wherever
// the user is scrolled. It used to render inside the ScrollView after every section
// (TodayScreen.js ~1541), so with several protocols it sat below the fold and expired
// unseen. Guard: it renders OUTSIDE the ScrollView as a fixed overlay, and its action
// color comes from a theme token (no hardcoded hex, both themes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

function findUndoBarAncestors() {
  const hits = [];
  (function walk(node, ancestors) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXElement') {
      const style = node.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'style');
      const expr = style && style.value && style.value.expression;
      if (expr && expr.type === 'MemberExpression' && expr.property.name === 'undoBar') hits.push(ancestors.slice());
      ancestors = ancestors.concat(node.openingElement.name.name || '');
    }
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

test('S-02: the Undo bar renders outside the ScrollView as a fixed overlay', () => {
  const hits = findUndoBarAncestors();
  assert.equal(hits.length, 1, 'exactly one undo bar');
  assert.ok(!hits[0].includes('ScrollView'), 'undo bar must not be inside the ScrollView');
  assert.match(styleBody('undoBar'), /position:\s*'absolute'/, 'undo bar is pinned (position absolute)');
  assert.match(styleBody('undoBar'), /bottom:/, 'undo bar is pinned to the bottom, above the tab bar');
});

test('S-02: the Undo action color is a theme token, not a hardcoded hex', () => {
  const body = styleBody('undoBarAction');
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}/, 'no hardcoded hex');
  assert.match(body, /color:\s*c\.\w+/, 'color from a theme token');
});
