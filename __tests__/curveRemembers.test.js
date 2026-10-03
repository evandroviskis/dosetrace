'use strict';
// Bug (founder 2026-10-02): Dose accumulation must open with the LAST configuration the user
// left — exactly the compounds he left selected (nothing added, nothing reset), Combined on/off
// and the projection horizon. Before this fix the selection lived only in component state and
// every open fell back to the first charted protocol (the newest one created).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const C = () => require('../lib/curveView');

// Charted protocols as splitCurveProtocols returns them (newest first, as getActiveProtocols).
const active = [
  { id: 'new', name: 'Brand new' },   // created last → was the default on every open
  { id: 'tb', name: 'TB-500' },
  { id: 'bpc', name: 'BPC-157' },
  { id: 'testo', name: 'Testosterone' },
  { id: 'hgh', name: 'HGH (IU)' },
];
const unitOf = (id) => (id === 'hgh' ? 'IU' : 'mg');

test('Curve: [A,B,C] narrowed to [Testosterone] only → reopening shows [Testosterone] only', () => {
  const { curveViewPatch, restoreCurveView } = C();
  let saved = curveViewPatch(null, { selectedIds: ['tb', 'bpc', 'testo'] });
  saved = curveViewPatch(saved, { selectedIds: ['testo'] });
  const v = restoreCurveView({ saved, active, unitOf });
  assert.deepEqual(v.selectedIds, ['testo']);
});

test('Curve: a protocol created afterwards never changes the remembered selection', () => {
  const { curveViewPatch, restoreCurveView } = C();
  const saved = curveViewPatch(null, { selectedIds: ['testo'] });
  const withNewer = [{ id: 'newer', name: 'Created today' }, ...active];
  assert.deepEqual(restoreCurveView({ saved, active: withNewer, unitOf }).selectedIds, ['testo']);
});

test('Curve: Combined on/off and the projection horizon come back as the user left them', () => {
  const { curveViewPatch, restoreCurveView } = C();
  let saved = curveViewPatch(null, { selectedIds: ['tb', 'bpc'] });
  saved = curveViewPatch(saved, { showCombined: false });
  saved = curveViewPatch(saved, { futureDays: 30 });
  const v = restoreCurveView({ saved, active, unitOf });
  assert.deepEqual(v, { selectedIds: ['tb', 'bpc'], showCombined: false, futureDays: 30 });
  assert.deepEqual(saved.selectedIds, ['tb', 'bpc'], 'a patch merges, never drops another key');
});

test('Curve: a deleted / no longer chartable compound is dropped; mixed units keep the first unit; nothing valid → today\'s default', () => {
  const { restoreCurveView } = C();
  assert.deepEqual(restoreCurveView({ saved: { selectedIds: ['gone', 'bpc'] }, active, unitOf }).selectedIds, ['bpc']);
  assert.deepEqual(restoreCurveView({ saved: { selectedIds: ['tb', 'hgh', 'bpc'] }, active, unitOf }).selectedIds, ['tb', 'bpc']);
  assert.deepEqual(restoreCurveView({ saved: { selectedIds: ['gone'] }, active, unitOf }).selectedIds, ['new'], 'the current default');
  assert.deepEqual(restoreCurveView({ saved: null, active, unitOf }), { selectedIds: ['new'], showCombined: true, futureDays: 7 });
  assert.deepEqual(restoreCurveView({ saved: { futureDays: 45, showCombined: 'yes' }, active, unitOf }), { selectedIds: ['new'], showCombined: true, futureDays: 7 }, 'unknown values fall back');
  assert.deepEqual(restoreCurveView({ saved: { selectedIds: ['tb'] }, active: [], unitOf }).selectedIds, []);
});

test('Curve: the Journey tile\'s Est. level follows the remembered first compound', () => {
  const { tileProtocol } = C();
  assert.equal(tileProtocol({ saved: { selectedIds: ['testo', 'tb'] }, active, unitOf }).id, 'testo');
  assert.equal(tileProtocol({ saved: null, active, unitOf }).id, 'new');
  assert.equal(tileProtocol({ saved: null, active: [], unitOf }), null);
});

test('Curve: the view is per user and never written on open — only when the user changes it', () => {
  const { curveViewKey } = C();
  assert.equal(curveViewKey('u1'), 'dosetrace_curve_view_u1');
  assert.notEqual(curveViewKey('u1'), curveViewKey('u2'));
  const src = read('screens/SerumCurveScreen.js');
  const fetch = src.match(/async function fetchData\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fetch, /loadCurveView\(user\.id\)/);
  assert.doesNotMatch(fetch, /saveCurveView/, 'opening the screen writes nothing');
  assert.match(src, /function rememberView\(patch\)/);
  for (const fn of ['toggle', 'changeCombined', 'changeHorizon']) {
    const body = src.match(new RegExp(`function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`));
    assert.ok(body, fn);
    assert.match(body[0], /rememberView\(/, `${fn} remembers the choice`);
  }
  const journey = read('screens/JourneyScreen.js');
  assert.match(journey, /defaultCurveLevel\(getActiveProtocols\(user\.id\), Date\.now\(\), undefined, savedView\)/, 'the Journey tile uses the remembered selection');
  assert.match(journey, /const savedView = await loadCurveView\(user\.id\);/);
  assert.match(src, /saveCurveView\(userIdRef\.current, patch\)\.then\(\(\) => notifyDataChanged\('curve'\)\)/, 'the tile beside the curve page follows a change');
  assert.match(journey, /e\.what === 'curve'/);
});
