// A-206 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md GB-1…GB-8): the floating glass tab bar.
// Android draws it (components/GlassTabBar); iPhone uses Apple's own bar (native build).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
// lib/tabBarStyle imports react-native: load it as tabBarInsets.test.js does.
const tbSrc = fs.readFileSync(path.join(__dirname, '../lib/tabBarStyle.js'), 'utf8');
const { code } = babel.transformSync(tbSrc.replace("import { StyleSheet, Platform } from 'react-native';", "const StyleSheet = { hairlineWidth: 0.5 }; const Platform = { OS: 'ios' };"), { presets: [], plugins: ['@babel/plugin-transform-modules-commonjs'], babelrc: false, configFile: false });
const mod = { exports: {} }; new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const T = mod.exports;
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('GB-1 / GB-3: on Android the bar takes its own room above the system bar, so no screen ends behind it', () => {
  const room = T.glassBarRoom(48);
  assert.equal(room.barHeight, 64);
  assert.ok(room.total >= 64 + 48 + 8, 'capsule + the system bar + a gap');
  assert.equal(T.glassBarRoom(0).bottomGap, 8, 'never touching the screen edge');
  // The bar sits in the layout (not over the content): its wrapper is not absolute.
  const bar = read('components/GlassTabBar.js');
  assert.doesNotMatch(bar, /position: 'absolute', left: 12/);
  assert.match(bar, /glassBarRoom\(insets\.bottom\)/);
});

test('GB-2: the lens slides with a spring and a short stretch; active = ink, the others ink3', () => {
  const bar = read('components/GlassTabBar.js');
  assert.match(bar, /withSpring\(PAD \+ state\.index \* tabW/);
  assert.match(bar, /withSequence\(withTiming\(1\.18/);
  assert.match(bar, /const color = focused \? c\.ink : c\.ink3;/);
});

test('GB-4: MainTabs and the opening skeleton (BootTabs) draw the same bar', () => {
  const app = read('App.js');
  const uses = app.match(/tabBar=\{GLASS_TAB_BAR\}/g) || [];
  assert.equal(uses.length, 2, 'MainTabs + BootTabs');
  assert.match(app, /const GLASS_TAB_BAR = Platform\.OS === 'android' \? \(props\) => <GlassTabBar \{\.\.\.props\} \/> : undefined;/);
});

test('GB-5: a screen that hides the bar still hides it; the update notice sits above the bar the platform draws', () => {
  const bar = read('components/GlassTabBar.js');
  assert.match(bar, /focusedOptions\.tabBarStyle && StyleSheet\.flatten\(focusedOptions\.tabBarStyle\)\?\.display === 'none'\) return null;/);
  assert.match(read('components/UpdateNotice.js'), /tabBarSpace\(c, insets\.bottom\) \+ 18/);
  assert.equal(T.tabBarSpace({}, 30, 'android'), T.glassBarRoom(30).total);
  assert.equal(T.tabBarSpace({ line: '#000', ground: '#fff' }, 30, 'ios'), T.tabBarStyle({ line: '#000', ground: '#fff' }, 30, 'ios').height);
});

test('GB-6: glass tokens in both palettes; each tab is announced as a tab with its state', () => {
  const theme = read('lib/theme.js');
  for (const k of ['glassFill', 'glassEdge', 'glassLens', 'glassShade']) {
    assert.equal((theme.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 2, k);
  }
  const bar = read('components/GlassTabBar.js');
  assert.match(bar, /accessibilityRole="tab" accessibilityState=\{\{ selected: focused \}\}/);
  assert.doesNotMatch(bar, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/, 'colours come from the theme only');
});
