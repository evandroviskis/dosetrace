'use strict';
// Shared DTWheel (My Protocols, Progress, My Body, the Curve): tapping the row just above or
// below the band moved TWO rows (found 2026-10-03 on the simulator: Oct 2026 → tap 2027 →
// 2028). Traced with logs on the wheel: the tap picked row 11 (2027) and scrolled there; then
// iOS reported the end of that programmatic scroll at y = 480 (row 12), and the column took
// that as a new choice. A scroll the app started itself is never a choice: after a tap the
// choice stays the tapped row and the column is put back on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { wheelSettle } = require('../lib/wheelPick');

test('after a tap, the end of the scroll it started never picks another row', () => {
  // tapped row 11; iOS reports the scroll ending on row 12
  assert.deepEqual(wheelSettle({ y: 480, row: 40, count: 26, lastSent: 11, fromTap: true }), { pick: null, snapTo: 11 });
  // and when it does end on the tapped row, nothing to do
  assert.deepEqual(wheelSettle({ y: 440, row: 40, count: 26, lastSent: 11, fromTap: true }), { pick: null, snapTo: null });
});

test('a real swipe still picks the row it stops on (clamped to the column)', () => {
  assert.deepEqual(wheelSettle({ y: 480, row: 40, count: 26, lastSent: 11, fromTap: false }), { pick: 12, snapTo: null });
  assert.deepEqual(wheelSettle({ y: 438, row: 40, count: 26, lastSent: 11, fromTap: false }), { pick: null, snapTo: null }, 'same row: no new pick');
  assert.deepEqual(wheelSettle({ y: 4000, row: 40, count: 26, lastSent: 11, fromTap: false }), { pick: 25, snapTo: null });
  assert.deepEqual(wheelSettle({ y: -50, row: 40, count: 26, lastSent: 3, fromTap: false }), { pick: 0, snapTo: null });
});

test('the wheel column marks a tap, clears it when the user drags, and settles through wheelSettle', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'ProtocolParts.js'), 'utf8');
  const col = src.slice(src.indexOf('function WheelColumn('), src.indexOf('export function DTWheel('));
  assert.match(col, /onScrollBeginDrag=\{\(\) => \{ tapped\.current = false; \}\}/);
  assert.match(col, /onPress=\{\(\) => \{ tapped\.current = true;/);
  assert.match(col, /wheelSettle\(\{ y, row: ROW, count: values\.length, lastSent: lastSent\.current, fromTap \}\)/);
  assert.match(col, /onMomentumScrollEnd=\{\(e\) => \{ const fromTap = tapped\.current; tapped\.current = false; settle\(e\.nativeEvent\.contentOffset\.y, fromTap\); \}\}/);
});
