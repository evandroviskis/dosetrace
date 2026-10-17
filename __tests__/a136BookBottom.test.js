'use strict';
// A-136 (1) — guided device session 2026-10-17 (Galaxy Z Fold7 unfolded, 1.3.0 build 49): on
// Today, My Protocols and Settings both book pages stopped ~80 dp above the tab bar (content cut,
// an empty band, the gutter hairline short too), while Journey reached the tab bar. My Body had
// the same short pages (its content is shorter, so it showed less). Today's right page (the
// embedded dose log) stopped even higher.
// Cause: the tab screens' root SafeAreaView kept its default edges, bottom included. The tab bar
// already sits above the system's bottom bar (lib/tabBarStyle pads it by the inset), so on
// Android the bottom edge added the Samsung taskbar's inset a SECOND time above the tab bar
// (Journey passes top/left/right and was right). The embedded dose log and curve added it a
// third time inside the page ('bottom' in their embedded edges).
// Fix: one rule, lib/tabBarStyle TAB_SCREEN_EDGES = top, left, right: the tab bar owns the
// bottom. Every tab screen's root uses it; an embedded page (Log, Curve, Progress) takes no
// bottom edge; My Protocols' Recently deleted bar (shown in place of the hidden tab bar) adds
// the inset itself. Pushed full screens (Log, Curve not embedded) keep every edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-136 (1): the shared rule says the tab bar owns the bottom', () => {
  const src = read('lib/tabBarStyle.js');
  const m = src.match(/export const TAB_SCREEN_EDGES = (\[[^\]]*\])/);
  assert.ok(m, 'TAB_SCREEN_EDGES exported');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), ['top', 'left', 'right']);
});

for (const f of ['screens/TodayScreen.js', 'screens/ProtocolsScreen.js', 'screens/JourneyScreen.js', 'screens/BodyScreen.js', 'screens/SettingsScreen.js']) {
  test(`A-136 (1): ${f} root takes no bottom inset (the tab bar sits under it)`, () => {
    const src = read(f);
    const roots = src.match(/<SafeAreaView style=\{s\.container\}[^>]*>/g) || [];
    assert.ok(roots.length > 0, 'a root SafeAreaView');
    for (const r of roots) assert.match(r, /edges=\{TAB_SCREEN_EDGES\}/, `${f}: ${r}`);
    assert.match(src, /import \{[^}]*TAB_SCREEN_EDGES[^}]*\} from '\.\.\/lib\/tabBarStyle'/);
  });
}

for (const f of ['screens/LogScreen.js', 'screens/SerumCurveScreen.js', 'screens/ProgressScreen.js']) {
  test(`A-136 (1): ${f} embedded on a book page takes no bottom inset`, () => {
    const src = read(f);
    const m = src.match(/<SafeAreaView style=\{s\.container\} edges=\{embedded \? (\[[^\]]*\])/);
    assert.ok(m, 'embedded edges');
    assert.doesNotMatch(m[1], /bottom/, `${f}: ${m[1]}`);
  });
}

test('A-136 (1): the Recently deleted bar (tab bar hidden) clears the system bar itself', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /<View style=\{\[s\.trashBar, \{ paddingBottom: 12 \+ insets\.bottom \}\]\}>/);
});
