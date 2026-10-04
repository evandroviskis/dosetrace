'use strict';
// Founder 2026-10-04 (Fold 7, 1.3.0 test build): the tab icons sat behind the device's own bottom bar
// (Samsung taskbar; on other Androids the navigation bar). The tab bar had a fixed height and bottom
// padding and ignored the system inset. It now sits above whatever the system reserves; iPhone keeps
// the approved look (84 high, 22 bottom padding over the home indicator).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const src = fs.readFileSync(path.join(__dirname, '../lib/tabBarStyle.js'), 'utf8');
const { code } = babel.transformSync(src.replace("import { StyleSheet, Platform } from 'react-native';", "const StyleSheet = { hairlineWidth: 0.5 }; const Platform = { OS: 'ios' };"), { presets: [], plugins: ['@babel/plugin-transform-modules-commonjs'], babelrc: false, configFile: false });
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require);
const { tabBarStyle } = m.exports;
const colors = { line: '#ccc', ground: '#000' };

test('iPhone keeps the approved bar', () => {
  const s = tabBarStyle(colors, 34, 'ios');
  assert.equal(s.height, 84);
  assert.equal(s.paddingBottom, 22);
});

test('Android: the bar sits above the system inset (taskbar / navigation bar)', () => {
  for (const inset of [0, 16, 48, 72]) {
    const s = tabBarStyle(colors, inset, 'android');
    assert.ok(s.paddingBottom >= inset, `inset ${inset}: padding ${s.paddingBottom}`);
    assert.equal(s.height - s.paddingBottom, 62, 'the same room for icons and labels');
  }
  assert.equal(tabBarStyle(colors, 0, 'android').paddingBottom, 22, 'no inset: unchanged look');
});

test('every caller passes the bottom inset', () => {
  for (const f of ['App.js', 'screens/ProtocolsScreen.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const call of s.match(/tabBarStyle\(colors[^)]*\)/g) || []) assert.match(call, /tabBarStyle\(colors, insets\.bottom\)/, `${f}: ${call}`);
  }
});
