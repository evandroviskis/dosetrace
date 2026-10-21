'use strict';
// 1.3.1 code review (DV-072 C follow-up): the curve read the Dose log and the protocols only on focus,
// so a sync that brought a Taken row (another phone, the cloud import after sign-in) or a dose marked
// on the Today page beside it (book layout) left a hollow tick stale until the screen was left and
// opened again. Fix (the A-146 FoodLogHero pattern): while the curve is focused it reads again on
// import_complete, sync_complete and data_changed for doses / protocols, debounced (a burst reloads
// once), never for its own view saves ('curve'), and stops listening on unmount (lib/curveReload).
// Re-review 2026-10-20:
//  - the founder rule "the curve keeps the exact last selection" (curve-opens-last-view): a reload
//    re-reads ONLY protocols, the Dose log and the lab dates and keeps the current selection
//    (filtered to protocols that still exist) — it never re-runs restoreCurveView, which with nothing
//    saved falls back to the newest protocol;
//  - a reload whose data did not change sets no state (one Mark taken was two full rebuilds);
//  - the Journey tile (PK-16) reloads on the same events.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { curveReloadOnSync, curveReloadPatch } = require('../lib/curveReload');

const flush = (ms) => new Promise((r) => setTimeout(r, ms));
function bus() {
  let listeners = [];
  return {
    add: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
    emit: (e) => { for (const fn of listeners.slice()) fn(e); },
    count: () => listeners.length,
  };
}

test('a sync, an import or a dose / protocol change reloads; the curve\'s own view save and other data do not', async () => {
  const b = bus();
  let reads = 0;
  const off = curveReloadOnSync(b.add, () => { reads++; }, 10);
  for (const e of [null, { type: 'sync_start' }, { type: 'import_start' }, { type: 'connectivity' }, { type: 'sync_error' },
    { type: 'data_changed', what: 'curve' }, { type: 'data_changed', what: 'food_logs' }, { type: 'data_changed', what: 'calc' }]) b.emit(e);
  await flush(40);
  assert.equal(reads, 0, 'nothing that brings no dose / protocol data');
  for (const e of [{ type: 'sync_complete' }, { type: 'import_complete' }, { type: 'data_changed', what: 'dose_logs' }, { type: 'data_changed', what: 'protocol' }, { type: 'data_changed' }]) {
    b.emit(e);
    await flush(40);
  }
  assert.equal(reads, 5);
  off();
});

test('a burst reloads once; unmount removes the listener and drops a waiting reload', async () => {
  const b = bus();
  let reads = 0;
  const off = curveReloadOnSync(b.add, () => { reads++; }, 20);
  b.emit({ type: 'import_complete' }); b.emit({ type: 'sync_complete' }); b.emit({ type: 'data_changed', what: 'dose_logs' });
  await flush(80);
  assert.equal(reads, 1);
  b.emit({ type: 'sync_complete' });
  off();
  assert.equal(b.count(), 0);
  await flush(60);
  assert.equal(reads, 1, 'nothing reads after unmount');
});

const A = { id: 1, name: 'A', updated_at: 'x' };
const B = { id: 2, name: 'B', updated_at: 'y' };
const cur = () => ({ protocols: [A], notCharted: { iu: [], noData: [], noDose: [] }, doseLogs: [{ id: 9, outcome: 'Taken' }], labDates: [], selectedIds: [1] });

test('reload: a new protocol B (added beside, or by sync) never switches the chart — A stays selected', () => {
  const fresh = { protocols: [B, A], notCharted: cur().notCharted, doseLogs: cur().doseLogs, labDates: [] }; // newest first
  const patch = curveReloadPatch(cur(), fresh);
  assert.deepEqual(patch.protocols, [B, A]);
  assert.ok(!('selectedIds' in patch), 'the selection is not touched');
});

test('reload: a selected protocol that is gone leaves the selection; the rest of it is kept', () => {
  const c = { ...cur(), protocols: [B, A], selectedIds: [1, 2] };
  const patch = curveReloadPatch(c, { protocols: [B], notCharted: c.notCharted, doseLogs: c.doseLogs, labDates: [] });
  assert.deepEqual(patch.selectedIds, [2]);
  // nothing selected is left → the first chartable one, so the chart is never empty
  const p2 = curveReloadPatch({ ...cur() }, { protocols: [B], notCharted: cur().notCharted, doseLogs: [], labDates: [] });
  assert.deepEqual(p2.selectedIds, [2]);
});

test('reload: unchanged data → an empty patch (no state is set, no rebuild); a new log row → only doseLogs', () => {
  const c = cur();
  const same = { protocols: [{ ...A }], notCharted: { iu: [], noData: [], noDose: [] }, doseLogs: [{ id: 9, outcome: 'Taken' }], labDates: [] };
  assert.deepEqual(curveReloadPatch(c, same), {});
  const withRow = { ...same, doseLogs: [{ id: 9, outcome: 'Taken' }, { id: 10, outcome: 'Taken' }] };
  assert.deepEqual(Object.keys(curveReloadPatch(c, withRow)), ['doseLogs']);
});

test('the curve screen: focus reads the view once; a sync reload never re-runs restoreCurveView', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /import \{ curveReloadOnSync, curveReloadPatch \} from '\.\.\/lib\/curveReload';/);
  assert.match(src, /import \{ notifyDataChanged, addSyncListener \} from '\.\.\/lib\/sync';/);
  assert.match(src, /useEffect\(\(\) => curveReloadOnSync\(addSyncListener, \(\) => \{ if \(readRef\.current\) readRef\.current\(\)\.catch\(\(\) => \{\}\); \}\), \[\]\);/);
  const focus = src.slice(src.indexOf('useFocusEffect('), src.indexOf('}, [navigation, embedded])'));
  assert.match(focus, /if \(isMounted\) \{ readRef\.current = reloadData; fetchData\(\); \}/, 'focus: the full read; sync: the reload');
  assert.match(focus, /return \(\) => \{ isMounted = false; readRef\.current = null; \};/, 'blurred: no reload');
  const reload = src.slice(src.indexOf('async function reloadData('), src.indexOf('// One muted line per reason'));
  assert.ok(reload.length > 0);
  assert.doesNotMatch(reload, /restoreCurveView|loadCurveView|setShowCombined|setFutureDays/);
  assert.match(reload, /curveReloadPatch\(curRef\.current, readCurveData\(user\.id\)\)/);
  const data = src.slice(src.indexOf('function readCurveData('), src.indexOf('async function fetchData('));
  assert.match(data, /getHistoryProtocols\(userId\)/);
  assert.match(data, /getLogsSince\(userId, /);
});

test('PK-16: the Journey tile re-reads its Est. level on the same sync / dose / protocol events', () => {
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /import \{ curveReloadOnSync \} from '\.\.\/lib\/curveReload';/);
  assert.match(src, /useEffect\(\(\) => curveReloadOnSync\(addSyncListener, \(\) => \{ if \(premium === true\) loadLevel\(\)\.catch\(\(\) => \{\}\); \}\), \[premium, loadLevel\]\);/);
});
