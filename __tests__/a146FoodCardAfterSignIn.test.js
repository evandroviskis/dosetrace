'use strict';
// A-146 (Fold device test of test build 3, 2026-10-17, step 14): signed out and back in, the doses
// came back at once but Today's food card read "Nada registrado hoje ainda" while the cloud had 2
// entries for the day, until the food log was opened. Cause: screens/components/FoodLogHero.js
// read only on focus; the cloud import fills food_logs later. Fix: the card also reloads on the
// sync events Today's dose lists use (import_complete, sync_complete, data_changed), debounced,
// with the same read as on focus, and stops listening on unmount. Runs the real card read and the
// real subscription (cut out of the component file), with the database and the sync bus faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { todaySummary } = require('../lib/foodThread');

const FILE = 'screens/components/FoodLogHero.js';
const TODAY = '2026-10-17';

function bus() {
  let listeners = [];
  return {
    addSyncListener: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
    emit: (e) => { for (const fn of listeners.slice()) fn(e); },
    count: () => listeners.length,
  };
}

function cardReader(db) {
  return loadFn(FILE, 'async function readFoodCard(', 'readFoodCard', {
    getCachedUser: async () => ({ id: 'u1' }),
    localISO: () => TODAY,
    loadFoodAccess: async () => ({ access: { canLog: true, freeFrom: null, reason: null }, rcStart: { date: '2026-10-10' } }),
    getFoodLogsSince: (uid, since) => db.filter((r) => r.user_id === uid && r.entry_date >= since),
    readCheckNow: async () => null,
    todaySummary,
  });
}

const reloadOnSync = (...args) => loadFn(FILE, 'function reloadOnSync(', 'reloadOnSync', {})(...args);
const flush = (ms) => new Promise((r) => setTimeout(r, ms));

test('A-146: an import_complete after mount makes the card read the entries the import brought', async () => {
  const db = []; // food_logs right after sign-in: the cloud import has not run yet
  const readFoodCard = cardReader(db);
  let state = (await readFoodCard()).state; // the focus read
  assert.equal(state.sum.items, 0, 'empty before the import (the "Nothing logged today" line)');

  const b = bus();
  let reads = 0;
  const off = reloadOnSync(b.addSyncListener, async () => { reads++; state = (await readFoodCard()).state; }, 20);
  // The import writes the day's two entries, then announces it.
  db.push({ user_id: 'u1', entry_date: TODAY, parse_status: 'done', parsed_items: JSON.stringify([{ name: 'eggs' }]), kcal: 300 });
  db.push({ user_id: 'u1', entry_date: TODAY, parse_status: 'done', parsed_items: JSON.stringify([{ name: 'rice' }]), kcal: 468 });
  b.emit({ type: 'import_complete' });
  await flush(60);
  assert.equal(reads, 1);
  assert.equal(state.sum.items, 2, 'the card now reads "Today: 2 items"');
  assert.equal(state.sum.kcal, 768);
  off();
});

test('A-146: sync_complete and data_changed reload too; other events do not', async () => {
  const b = bus();
  let reads = 0;
  const off = reloadOnSync(b.addSyncListener, () => { reads++; }, 10);
  for (const type of ['sync_start', 'import_start', 'connectivity', 'sync_error', 'import_error']) b.emit({ type });
  b.emit(null);
  await flush(40);
  assert.equal(reads, 0, 'no reload for events that bring no data');
  b.emit({ type: 'sync_complete' });
  await flush(40);
  b.emit({ type: 'data_changed', what: 'food' });
  await flush(40);
  assert.equal(reads, 2);
  off();
});

test('A-146: a burst of events reloads once (no reload storm)', async () => {
  const b = bus();
  let reads = 0;
  const off = reloadOnSync(b.addSyncListener, () => { reads++; }, 20);
  b.emit({ type: 'import_complete' });
  b.emit({ type: 'sync_complete' });
  b.emit({ type: 'data_changed' });
  b.emit({ type: 'sync_complete' });
  await flush(80);
  assert.equal(reads, 1);
  off();
});

test('A-146: unmount removes the listener and drops a reload still waiting', async () => {
  const b = bus();
  let reads = 0;
  const off = reloadOnSync(b.addSyncListener, () => { reads++; }, 20);
  assert.equal(b.count(), 1, 'subscribed');
  b.emit({ type: 'import_complete' });
  off();
  assert.equal(b.count(), 0, 'listener removed on unmount');
  await flush(60);
  b.emit({ type: 'import_complete' });
  await flush(60);
  assert.equal(reads, 0, 'nothing reads after unmount');
});

test('A-146: the card subscribes once with addSyncListener and reloads with its focus read', () => {
  const src = read(FILE);
  assert.match(src, /import \{ addSyncListener \} from '\.\.\/\.\.\/lib\/sync';/);
  // The effect returns the unsubscribe (cleanup on unmount) and runs once.
  assert.match(src, /useEffect\(\(\) => reloadOnSync\(addSyncListener, \(\) => \{ if \(readRef\.current\) readRef\.current\(\)\.catch\(\(\) => \{\}\); \}\), \[\]\);/);
  // The focus effect hands its own read to the listener and takes it back on blur.
  const focus = src.slice(src.indexOf('useFocusEffect(useCallback('), src.indexOf('}, [language]));'));
  assert.match(focus, /readRef\.current = read;/);
  assert.match(focus, /return \(\) => \{ alive = false; readRef\.current = null; \};/);
  assert.match(focus, /const r = await readFoodCard\(\);/, 'the same read on focus and on a sync event');
  assert.match(focus, /try \{ await read\(\); \} finally \{ if \(onReady\) onReady\(\); \}/, 'A-120 first-load signal kept');
});
