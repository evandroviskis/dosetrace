'use strict';
// A-190, council 2026-10-27 (senior engineer): the protocol sheet mounts useChosenInView once for the
// whole screen, so its vial-expiry row can come and go while the hook lives on. Edit a protocol with
// expiry Oct, close, open New protocol (expiry null), close, Edit one with expiry Nov: the Nov row
// opened at Jan — the change of the chosen month while no row was on screen ended the opening, and a
// row coming back never re-armed it. Rule: a row that mounts opens again (placed on its measures);
// a change of the chosen month with no row on screen changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');

// The real hook with a tiny React stand-in that keeps refs, memos and effect deps across renders.
function loadHook() {
  const slots = [];
  let i = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
  const react = {
    useRef: (v) => { const k = i++; if (!slots[k]) slots[k] = { current: v }; return slots[k]; },
    useMemo: (fn, deps) => { const k = i++; if (!slots[k] || !same(slots[k].deps, deps)) slots[k] = { v: fn(), deps }; return slots[k].v; },
    useEffect: (fn, deps) => { const k = i++; if (!slots[k] || !same(slots[k].deps, deps)) { slots[k] = { deps }; fn(); } },
  };
  const file = path.join(ROOT, 'components', 'useChosenInView.js');
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => (id === 'react' ? react : Module.prototype.require.call(m, id));
  m._compile(code, file);
  const hook = m.exports.default;
  return (chosen) => { i = 0; return hook(chosen); };
}

// A ScrollView stand-in that records where it was sent.
function row() { const r = { calls: [] }; r.scrollTo = (o) => r.calls.push(o.x); return r; }
// Mount a row and measure 12 pills of 60 dp, 8 apart, in a 300 dp viewport.
function mount(h, r) {
  h.rowProps.ref(r);
  h.rowProps.onLayout({ nativeEvent: { layout: { width: 300 } } });
  for (let k = 0; k < 12; k++) h.itemLayout(k)({ nativeEvent: { layout: { x: k * 68, width: 60 } } });
}

test('A-190 hook: a row opens on the chosen month', () => {
  const render = loadHook();
  const h = render(9);
  const r = row();
  mount(h, r);
  assert.equal(r.calls.at(-1), 8 * 68 + 30, 'Oct second, Sep half shown');
});

test('A-190 hook (council): Oct → closed → New protocol (null) → closed → Nov opens on Nov', () => {
  const render = loadHook();
  let h = render(9);
  const first = row();
  mount(h, first);
  h.rowProps.ref(null); // the sheet closes
  h = render(null); // New protocol: no expiry chosen, row not on screen
  h = render(10); // Edit a protocol with expiry Nov, before its row mounts
  const second = row();
  mount(h, second);
  assert.equal(second.calls.at(-1), 9 * 68 + 30, 'Nov second, Oct half shown — never left at Jan');
});

test('A-190 hook: after opening, a tap on a month already showing does not move the row', () => {
  const render = loadHook();
  let h = render(2);
  const r = row();
  mount(h, r);
  const before = r.calls.length;
  h = render(3); // Apr tapped, fully visible at offset (Feb's middle)
  assert.equal(r.calls.length, before, 'no scroll');
});
