'use strict';
// Pre-build pass 2026-10-03 (round 2): Progress opened from Today's reality-check alert (or a
// notification) said "‹ Journey" while Back returned to Today. The back row names the tab it
// actually returns to — the tab under Progress in the navigation stack — and Journey stays the
// default when nothing is known.
const test = require('node:test');
const assert = require('node:assert/strict');
const { backTabKey } = require('../lib/navBack');
const { read } = require('./helpers/extractFn');

const stack = (tab) => ({ index: 1, routes: [{ name: 'MainTabs', state: { index: 0, routes: [{ name: tab }] } }, { name: 'Progress' }] });

test('the back label is the tab Progress returns to', () => {
  assert.equal(backTabKey(stack('Today')), 'tab_today');
  assert.equal(backTabKey(stack('Journey')), 'tab_journey');
  assert.equal(backTabKey(stack('Protocols')), 'tab_protocols');
  assert.equal(backTabKey(stack('Body')), 'tab_body');
  assert.equal(backTabKey(stack('Settings')), 'tab_settings');
});

test('nothing known (no state, a tab without nested state) → Journey, the screen\'s home', () => {
  assert.equal(backTabKey(null), 'tab_journey');
  assert.equal(backTabKey({ index: 1, routes: [{ name: 'MainTabs' }, { name: 'Progress' }] }), 'tab_journey');
});

test('Progress uses it for its back row', () => {
  const src = read('screens/ProgressScreen.js');
  assert.match(src, /t\(backTabKey\(navigation\.getState\(\)\)\)/);
  assert.doesNotMatch(src, /<Text style=\{s\.back\}>\{t\('tab_journey'\)\}<\/Text>/);
});
