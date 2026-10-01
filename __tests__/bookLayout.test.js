'use strict';
// S-26 book layout (docs/specs/book-layout.md, founder-signed 2026-10-01): the pure rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isBook, paneWidths, defaultSelection, foldPlan, unfoldPlan, GUTTER } = require('../lib/bookLayout');
const sel = require('../lib/bookSelection');

test('BK-1: two pages only when the window is at least 700 wide and 560 tall', () => {
  assert.equal(isBook(830, 750), true, 'Z Fold 7 open');
  assert.equal(isBook(750, 830), true, 'Z Fold 7 open, turned');
  assert.equal(isBook(904, 640), true, 'iPhone Duo open (with a 27.1 SDK build)');
  assert.equal(isBook(412, 900), false, 'Z Fold 7 closed');
  assert.equal(isBook(440, 956), false, 'iPhone 17 Pro Max portrait');
  assert.equal(isBook(956, 440), false, 'iPhone 17 Pro Max landscape stays one column');
  assert.equal(isBook(699, 800), false);
  assert.equal(isBook(800, 559), false);
});

test('BK-9: two equal pages around a centred gutter (the fold lands in the gutter)', () => {
  const w = 830;
  const p = paneWidths(w);
  assert.equal(p.gutter, GUTTER);
  assert.equal(p.left, p.right);
  assert.ok(p.left + p.gutter + p.right <= w && w - (p.left + p.gutter + p.right) <= 1);
  const hingeX = w / 2;
  assert.ok(hingeX > p.left && hingeX < p.left + p.gutter, 'the hinge is inside the gutter');
});

test('BK-3…BK-7: the default right page per tab', () => {
  assert.equal(defaultSelection('Today'), 'log');
  assert.equal(defaultSelection('Protocols', { protocolIds: ['a', 'b'] }), 'a');
  assert.equal(defaultSelection('Protocols', { protocolIds: ['a', 'b'], openProtocolId: 'b' }), 'b', 'a deep link wins');
  assert.equal(defaultSelection('Journey'), 'progress');
  assert.equal(defaultSelection('Body', { newestReportKey: '2026-09-28|t1' }), '2026-09-28|t1');
  assert.equal(defaultSelection('Settings'), 'notifications');
});

test('BK-10: folding pushes only an item the user opened that lives on a stack screen', () => {
  assert.deepEqual(foldPlan({ tab: 'Today', sel: 'log', explicit: true }), { route: 'Log' });
  assert.deepEqual(foldPlan({ tab: 'Journey', sel: 'curve', explicit: true }), { route: 'SerumCurve' });
  assert.deepEqual(foldPlan({ tab: 'Journey', sel: 'food', explicit: true }), { route: 'FoodChat' });
  assert.equal(foldPlan({ tab: 'Today', sel: 'log', explicit: false }), null, 'a default is never pushed');
  assert.equal(foldPlan({ tab: 'Today', sel: 'dose:p1', explicit: true }), null, 'a dose lives on Today itself');
  assert.equal(foldPlan({ tab: 'Protocols', sel: 'p1', explicit: true }), null, 'the protocol screen is inside the tab');
  assert.equal(foldPlan({ tab: 'Settings', sel: 'privacy', explicit: true }), null);
});

test('BK-10: unfolding moves a pushed screen onto its tab page', () => {
  assert.deepEqual(unfoldPlan('Log'), { tab: 'Today', sel: 'log' });
  assert.deepEqual(unfoldPlan('Progress'), { tab: 'Journey', sel: 'progress' });
  assert.deepEqual(unfoldPlan('SerumCurve'), { tab: 'Journey', sel: 'curve' });
  assert.deepEqual(unfoldPlan('FoodChat'), { tab: 'Journey', sel: 'food' });
  assert.equal(unfoldPlan('Paywall'), null, 'BK-11: the paywall stays a full screen');
  assert.equal(unfoldPlan('FAQ'), null);
});

test('BK-8: each tab keeps its own open item; listeners hear changes', () => {
  sel.resetAllSelections();
  const heard = [];
  const off = sel.onSelectionChange((tab, v) => heard.push([tab, v && v.sel]));
  sel.setSelection('Protocols', 'p2');
  sel.setSelection('Journey', 'curve');
  assert.equal(sel.getSelection('Protocols').sel, 'p2');
  assert.equal(sel.getSelection('Journey').sel, 'curve');
  assert.equal(sel.getSelection('Today'), null);
  sel.setSelection('Protocols', 'p2'); // same value: no second event
  off();
  sel.setSelection('Protocols', 'p3');
  assert.deepEqual(heard, [['Protocols', 'p2'], ['Journey', 'curve']]);
  sel.resetAllSelections();
});
