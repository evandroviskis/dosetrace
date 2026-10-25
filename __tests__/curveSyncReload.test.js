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
const { read, loadFn } = require('./helpers/extractFn');
const { curveReloadOnSync, curveReloadPatch, keepSelection, sameCurveLevel } = require('../lib/curveReload');

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
  assert.ok(!('selectedIds' in patch), 'the patch never carries a selection');
  const prev = [1];
  assert.equal(keepSelection(prev, fresh.protocols), prev, 'same array back: no state change');
});

test('reload: a selected protocol that is gone leaves the selection; the rest of it is kept', () => {
  assert.deepEqual(keepSelection([1, 2], [B]), [2]);
  // nothing selected is left → the first chartable one, so the chart is never empty
  assert.deepEqual(keepSelection([1], [B]), [2]);
});

// Re-review 2: the reload as the screen runs it, cut out of the file, with the state faked. The
// selection goes through a functional updater (never a curRef snapshot), and the reload waits for the
// first focus read: at a cold open (book layout at launch) a sync_complete could arrive while
// selectedIds is still [] and pick the newest protocol over the saved view.
function screenState(initial) {
  const st = { protocols: [], notCharted: { iu: [], noData: [], noDose: [] }, doseLogs: [], labDates: [], selectedIds: [], ...initial };
  const sets = { n: 0 };
  const setter = (k) => (v) => { sets.n++; st[k] = typeof v === 'function' ? v(st[k]) : v; };
  return { st, sets, deps: {
    setNotCharted: setter('notCharted'), setProtocols: setter('protocols'), setSelectedIds: setter('selectedIds'),
    setLabDates: setter('labDates'), setDoseLogs: setter('doseLogs'),
  } };
}
function reloadFor(state, db, viewReadyRef) {
  return loadFn('screens/SerumCurveScreen.js', 'async function reloadData(', 'reloadData', {
    ...state.deps,
    getCachedUser: async () => ({ id: 'u1' }),
    curRef: { get current() { return state.st; } },
    viewReadyRef,
    readCurveData: () => db(),
    curveReloadPatch, keepSelection,
  });
}

test('cold open: a reload that fires before the first focus read commits does nothing — the saved selection wins', async () => {
  const s = screenState();
  const db = () => ({ protocols: [B, A], notCharted: { iu: [], noData: [], noDose: [] }, doseLogs: [], labDates: [] });
  const ready = { current: false };
  const reload = reloadFor(s, db, ready);
  await reload(); // sync_complete at launch, before fetchData restored the view
  assert.equal(s.sets.n, 0, 'no state set before the view is restored');
  assert.deepEqual(s.st.selectedIds, []);
  // fetchData commits the saved view: A (not the newest, B)
  s.st.protocols = [B, A]; s.st.selectedIds = [1]; ready.current = true;
  await reload();
  assert.deepEqual(s.st.selectedIds, [1], 'the saved selection stays');
});

test('the selection is applied with a functional updater: a tap that landed after the snapshot is kept', async () => {
  const s = screenState({ protocols: [B, A], selectedIds: [1] });
  const db = () => ({ protocols: [B, A], notCharted: { iu: [], noData: [], noDose: [] }, doseLogs: [{ id: 3 }], labDates: [] });
  const reload = reloadFor(s, db, { current: true });
  const snapshot = { ...s.st };
  s.st.selectedIds = [2]; // the user tapped B while the reload was reading
  await reload();
  assert.deepEqual(s.st.selectedIds, [2]);
  assert.notDeepEqual(snapshot.selectedIds, s.st.selectedIds);
  const src = read('screens/SerumCurveScreen.js');
  const r = src.slice(src.indexOf('async function reloadData('), src.indexOf('// One muted line per reason'));
  assert.match(r, /if \(!viewReadyRef\.current\) return;/);
  assert.match(r, /setSelectedIds\(\(prev\) => keepSelection\(prev, /);
  const f = src.slice(src.indexOf('async function fetchData('), src.indexOf('async function reloadData('));
  assert.match(f, /setSelectedIds\(view\.selectedIds\);[\s\S]*viewReadyRef\.current = true;/, 'ready only after the view is applied');
  const focus = src.slice(src.indexOf('useFocusEffect('), src.indexOf('}, [navigation, embedded])'));
  assert.match(focus, /return \(\) => \{ isMounted = false; readRef\.current = null; viewReadyRef\.current = false; \};/);
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
  assert.match(src, /import \{ curveReloadOnSync, curveReloadPatch, keepSelection \} from '\.\.\/lib\/curveReload';/);
  assert.match(src, /import \{ notifyDataChanged, addSyncListener \} from '\.\.\/lib\/sync';/);
  assert.match(src, /useEffect\(\(\) => curveReloadOnSync\(addSyncListener, \(\) => \{ if \(readRef\.current\) readRef\.current\(\)\.catch\(\(\) => \{\}\); \}\), \[\]\);/);
  const focus = src.slice(src.indexOf('useFocusEffect('), src.indexOf('}, [navigation, embedded])'));
  assert.match(focus, /if \(isMounted\) \{ readRef\.current = reloadData; fetchData\(\); \}/, 'focus: the full read; sync: the reload');
  assert.match(focus, /return \(\) => \{ isMounted = false; readRef\.current = null; viewReadyRef\.current = false; \};/, 'blurred: no reload');
  const reload = src.slice(src.indexOf('async function reloadData('), src.indexOf('// One muted line per reason'));
  assert.ok(reload.length > 0);
  assert.doesNotMatch(reload, /restoreCurveView|loadCurveView|setShowCombined|setFutureDays/);
  assert.match(reload, /const fresh = readCurveData\(user\.id\);\s*const patch = curveReloadPatch\(curRef\.current, fresh\);/);
  const data = src.slice(src.indexOf('function readCurveData('), src.indexOf('async function fetchData('));
  assert.match(data, /getHistoryProtocols\(userId\)/);
  assert.match(data, /getLogsSince\(userId, /);
});

test('PK-16: the Journey tile re-reads its Est. level on the same sync / dose / protocol events', () => {
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /import \{ curveReloadOnSync, sameCurveLevel \} from '\.\.\/lib\/curveReload';/);
  assert.match(src, /useEffect\(\(\) => curveReloadOnSync\(addSyncListener, \(\) => \{ if \(premium === true\) loadLevel\(\)\.catch\(\(\) => \{\}\); \}\), \[premium, loadLevel\]\);/);
});

test('E: the Journey tile keeps its state when a reload reads the same level (no re-render)', () => {
  const lv = (id, value, unit = 'mg') => ({ protocol: { id }, value, unit });
  assert.equal(sameCurveLevel(lv(1, 0.5), lv(1, 0.5)), true);
  assert.equal(sameCurveLevel(null, null), true);
  assert.equal(sameCurveLevel(lv(1, 0.5), lv(1, 0.6)), false);
  assert.equal(sameCurveLevel(lv(1, 0.5), lv(2, 0.5)), false);
  assert.equal(sameCurveLevel(lv(1, 0.5), lv(1, 0.5, 'IU')), false);
  assert.equal(sameCurveLevel(null, lv(1, 0.5)), false);
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /const next = defaultCurveLevel\(getActiveProtocols\(user\.id\), Date\.now\(\), undefined, savedView\);/);
  assert.match(src, /setLevel\(\(prev\) => \(sameCurveLevel\(prev, next\) \? prev : next\)\);/);
  assert.match(src, /import \{ curveReloadOnSync, sameCurveLevel \} from '\.\.\/lib\/curveReload';/);
});
