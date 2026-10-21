'use strict';
// 1.3.1 code review (DV-072 C follow-up): the curve read the Dose log and the protocols only on focus,
// so a sync that brought a Taken row (another phone, the cloud import after sign-in) or a dose marked
// on the Today page beside it (book layout) left a hollow tick stale until the screen was left and
// opened again. Fix (the A-146 FoodLogHero pattern): while the curve is focused it reads again on
// import_complete, sync_complete and data_changed for doses / protocols, debounced (a burst reloads
// once), never for its own view saves ('curve'), and stops listening on unmount. Runs the real
// subscription cut out of the screen file, with the sync bus faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');

const FILE = 'screens/SerumCurveScreen.js';
const reloadOnSync = (...args) => loadFn(FILE, 'function curveReloadOnSync(', 'curveReloadOnSync', {})(...args);
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
function bus() {
  let listeners = [];
  return {
    add: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
    emit: (e) => { for (const fn of listeners.slice()) fn(e); },
    count: () => listeners.length,
  };
}

test('a sync, an import or a dose / protocol change reloads the curve; its own view save and other data do not', async () => {
  const b = bus();
  let reads = 0;
  const off = reloadOnSync(b.add, () => { reads++; }, 10);
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
  const off = reloadOnSync(b.add, () => { reads++; }, 20);
  b.emit({ type: 'import_complete' }); b.emit({ type: 'sync_complete' }); b.emit({ type: 'data_changed', what: 'dose_logs' });
  await flush(80);
  assert.equal(reads, 1);
  b.emit({ type: 'sync_complete' });
  off();
  assert.equal(b.count(), 0);
  await flush(60);
  assert.equal(reads, 1, 'nothing reads after unmount');
});

test('the screen subscribes once and reloads with its focus read, only while focused', () => {
  const src = read(FILE);
  assert.match(src, /import \{ notifyDataChanged, addSyncListener \} from '\.\.\/lib\/sync';/);
  assert.match(src, /useEffect\(\(\) => curveReloadOnSync\(addSyncListener, \(\) => \{ if \(readRef\.current\) readRef\.current\(\)\.catch\(\(\) => \{\}\); \}\), \[\]\);/);
  const focus = src.slice(src.indexOf('useFocusEffect('), src.indexOf('}, [navigation, embedded])'));
  assert.match(focus, /if \(isMounted\) \{ readRef\.current = fetchData; fetchData\(\); \}/, 'the same read as on focus, after the Premium check');
  assert.match(focus, /return \(\) => \{ isMounted = false; readRef\.current = null; \};/, 'blurred: no reload');
  // the read covers both: the protocols and the Dose log
  const fetch = src.slice(src.indexOf('async function fetchData('), src.indexOf('// One muted line per reason'));
  assert.match(fetch, /getHistoryProtocols\(user\.id\)/);
  assert.match(fetch, /setDoseLogs\(getLogsSince\(user\.id, /);
});
