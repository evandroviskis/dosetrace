'use strict';
// Finds "sibling modal stacking": a popup (Modal, DoseTrace sheet…) that is OPENED from inside
// another popup's content but is rendered OUTSIDE it, as its sibling. iOS cannot present a
// second view controller from the screen while the first is still up ("Attempt to present …
// which is already presenting"): the second one never shows and its stuck state can block
// later popups (pre-build pass M1, Settings → Edit profile → Country).
//
// A popup is a JSX element whose visibility comes from one state variable:
//   <Modal visible={x}>, <AnySheet visible={x}>, <DTSheet config={x}>, <DTActionSheet config={x}>.
// It is opened by calling that variable's setter (setX(...)) with anything but false/null.
// The finding: popup B's setter is called inside popup A's JSX, and B is not inside A.
const { parse } = require('@babel/parser');

const OPEN_PROPS = ['visible', 'config'];

function popupState(el) {
  for (const attr of el.openingElement.attributes || []) {
    if (attr.type !== 'JSXAttribute' || !OPEN_PROPS.includes(attr.name && attr.name.name)) continue;
    const v = attr.value;
    if (v && v.type === 'JSXExpressionContainer') {
      const e = v.expression;
      if (e.type === 'Identifier') return e.name;
      // visible={!!x} / visible={x != null}
      if (e.type === 'UnaryExpression' && e.argument.type === 'UnaryExpression' && e.argument.argument.type === 'Identifier') return e.argument.argument.name;
      if (e.type === 'BinaryExpression' && e.left.type === 'Identifier') return e.left.name;
    }
  }
  return null;
}

function walk(node, fn, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  const next = parents.concat(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, fn, next));
    else if (v && typeof v.type === 'string') walk(v, fn, next);
  }
}

const isClosing = (arg) => !arg
  || (arg.type === 'BooleanLiteral' && arg.value === false)
  || arg.type === 'NullLiteral'
  || (arg.type === 'Identifier' && arg.name === 'undefined');

function siblingStacking(src) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const popups = []; // { el, state, setter }
  walk(ast, (n) => {
    if (n.type !== 'JSXElement') return;
    const st = popupState(n);
    if (st) popups.push({ el: n, state: st, setter: 'set' + st[0].toUpperCase() + st.slice(1) });
  });
  // One level of indirection: a local function (function f() {} / const f = () => {}) that
  // opens a popup counts as opening it wherever it is called or passed (onPress={f}).
  const opens = (node) => {
    const out = new Set();
    walk(node, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && !isClosing(n.arguments[0])) out.add(n.callee.name);
    });
    return out;
  };
  const fnOpens = new Map();
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) fnOpens.set(n.id.name, opens(n.body));
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /FunctionExpression$/.test(n.init.type)) fnOpens.set(n.id.name, opens(n.init.body));
  });
  const findings = [];
  for (const a of popups) {
    const opened = opens(a.el);
    walk(a.el, (n) => {
      if (n.type === 'Identifier' && fnOpens.has(n.name)) fnOpens.get(n.name).forEach((x) => opened.add(x));
    });
    for (const b of popups) {
      if (b === a || !opened.has(b.setter)) continue;
      let inside = false;
      walk(a.el, (n) => { if (n === b.el) inside = true; });
      if (!inside) findings.push(`${b.state} is opened from inside ${a.state} but rendered beside it (line ${b.el.loc.start.line})`);
    }
  }
  return findings;
}

module.exports = { siblingStacking };
