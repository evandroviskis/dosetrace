'use strict';
// Founder 2026-10-04 (Fold 7, 1.3.0 test build): the tab icons sat behind the device's own bottom bar
// (Samsung taskbar; on other Androids the navigation bar). The bar now sits above whatever the system
// reserves. Since 2026-11-01 both platforms draw the glass bar (A-206): the iPhone's home indicator is
// that inset too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const src = fs.readFileSync(path.join(__dirname, '../lib/tabBarStyle.js'), 'utf8');
const { code } = babel.transformSync(src, { presets: [], plugins: ['@babel/plugin-transform-modules-commonjs'], babelrc: false, configFile: false });
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require);
const { glassBarRoom } = m.exports;

test('the bar sits above the system inset (taskbar, navigation bar, home indicator), the capsule room unchanged', () => {
  for (const inset of [0, 16, 34, 48, 72]) {
    const r = glassBarRoom(inset);
    assert.equal(r.inset, inset);
    assert.equal(r.total, r.topGap + r.barHeight + r.bottomGap + inset, `inset ${inset}`);
    assert.equal(r.barHeight, 64, 'the same capsule');
  }
});

test('every caller passes the bottom inset', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'components/GlassTabBar.js'), 'utf8'), /glassBarRoom\(insets\.bottom\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'components/UpdateNotice.js'), 'utf8'), /tabBarSpace\(insets\.bottom\)/);
});
