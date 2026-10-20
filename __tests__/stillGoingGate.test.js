'use strict';
// A-122 (founder 2026-10-15, iPhone on store 1.2.4): on opening the app "Ainda em andamento?" asked
// about Goli although the Dose log showed Goli Taken on 14/10 (yesterday). Cause: Today's
// checkTreatmentStillActive decided "no dose for N days" from the phone's local dose_logs the moment
// Today got focus, BEFORE the session's startup download from the cloud (lib/sync: requestSync →
// sync_complete, or fullImportFromCloud → import_complete) had brought the doses logged on the other
// phone; they arrived a moment later. The rule: the "Still going?" decision runs only after the
// session's first sync pass has settled (success OR a definite error/offline result, so an offline
// user is still asked), and it re-reads the logs at that moment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, loadFn, sliceBlock } = require('./helpers/extractFn');

// The lib file is an ES module with no imports: load its exports under plain node.
function loadEsm(file) {
  const src = read(file).replace(/^export\s+/gm, '');
  const names = [...src.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)].map((m) => m[1] || m[2]);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { ${names.join(', ')} };`)();
}
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));
const ticks = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function deferred() { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; }

// A stand-in for lib/sync's listener bus and NetInfo state.
function fakeSync(online = null) {
  let listeners = [];
  const bus = {
    online,
    addSyncListener: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
    isOnlineNow: () => bus.online,
    emit: (e) => { for (const fn of listeners) fn(e); },
  };
  return bus;
}

// ── (1) the pure rule ──────────────────────────────────────────────────────────────────────────
test('A-122 (1): mayCheckStillGoing — only after the first sync settled, or when known to be offline', () => {
  assert.ok(exists('lib/stillGoingGate.js'), 'lib/stillGoingGate.js');
  const { mayCheckStillGoing } = loadEsm('lib/stillGoingGate.js');
  assert.equal(mayCheckStillGoing({ firstSyncSettled: false, online: true }), false, 'online, download not finished: wait');
  assert.equal(mayCheckStillGoing({ firstSyncSettled: false, online: null }), false, 'connectivity not known yet: wait');
  assert.equal(mayCheckStillGoing({ firstSyncSettled: false, online: undefined }), false);
  assert.equal(mayCheckStillGoing({ firstSyncSettled: false, online: false }), true, 'offline: no download is coming, ask from the phone');
  assert.equal(mayCheckStillGoing({ firstSyncSettled: true, online: true }), true);
  assert.equal(mayCheckStillGoing({ firstSyncSettled: true, online: false }), true);
  assert.equal(mayCheckStillGoing({ firstSyncSettled: true, online: null }), true);
  assert.equal(mayCheckStillGoing({}), false);
  assert.equal(mayCheckStillGoing(), false);
});

// ── (2) the session gate over lib/sync's events ────────────────────────────────────────────────
test('A-122 (2): the gate opens on the first sync / import result (success or error), not before', async () => {
  const { createFirstSyncGate } = loadEsm('lib/stillGoingGate.js');
  for (const type of ['sync_complete', 'sync_error', 'import_complete', 'import_error']) {
    const sync = fakeSync(true);
    const gate = createFirstSyncGate(sync);
    let opened = false;
    gate.whenOpen().then(() => { opened = true; });
    assert.equal(gate.isOpen(), false);
    for (const other of ['sync_start', 'import_start', 'data_changed', 'connectivity']) sync.emit({ type: other, online: true });
    await ticks();
    assert.equal(opened, false, `not opened before ${type}`);
    sync.emit({ type });
    await ticks();
    assert.equal(opened, true, `${type} opens the gate`);
    assert.equal(gate.isOpen(), true);
    let again = false;
    gate.whenOpen().then(() => { again = true; });
    await ticks();
    assert.equal(again, true, 'once open, a later focus checks at once');
  }
});

test('A-122 (2): offline (known) opens the gate, so an offline user is still asked', async () => {
  const { createFirstSyncGate } = loadEsm('lib/stillGoingGate.js');
  const sync = fakeSync(null);
  const gate = createFirstSyncGate(sync);
  let opened = false;
  gate.whenOpen().then(() => { opened = true; });
  sync.online = true; sync.emit({ type: 'connectivity', online: true });
  await ticks();
  assert.equal(opened, false, 'online: the download is still coming');
  sync.online = false; sync.emit({ type: 'connectivity', online: false });
  await ticks();
  assert.equal(opened, true, 'offline: the sync pass will not run, ask now');
  // Already offline when Today asks.
  const s2 = fakeSync(false);
  const g2 = createFirstSyncGate(s2);
  let o2 = false;
  g2.whenOpen().then(() => { o2 = true; });
  await ticks();
  assert.equal(o2, true);
});

test('A-122 (2): a fresh import (new account / new device) closes the gate until it finishes', async () => {
  const { createFirstSyncGate } = loadEsm('lib/stillGoingGate.js');
  const sync = fakeSync(true);
  const gate = createFirstSyncGate(sync);
  sync.emit({ type: 'sync_complete' });
  assert.equal(gate.isOpen(), true);
  sync.emit({ type: 'import_start' });
  assert.equal(gate.isOpen(), false, 'the local data is being replaced: wait');
  let opened = false;
  gate.whenOpen().then(() => { opened = true; });
  await ticks();
  assert.equal(opened, false);
  sync.emit({ type: 'import_complete' });
  await ticks();
  assert.equal(opened, true);
});

// ── (3) behaviour: Today's real check, run through the real gate wiring ────────────────────────
const DAY = 86400000;
function makeToday({ sync, logs, firstShown }) {
  const { createFirstSyncGate } = loadEsm('lib/stillGoingGate.js');
  const firstSyncGate = createFirstSyncGate(sync);
  const now = Date.now();
  const goli = { id: 7, name: 'Goli', interval_days: 1, start_date: null, created_at: new Date(now - 60 * DAY).toISOString() };
  const shown = [];
  const calls = { reads: 0 };
  const refs = {
    bodyMapOpenRef: { current: false }, siteQueueRef: { current: [] }, logPopupOpenRef: { current: false },
    inactivePromptOpenRef: { current: false }, focusedRef: { current: true }, stillGoingWaitRef: { current: false },
    // A-121 SG-22: nor over any other Today popup.
    vialPromptOpenRef: { current: false }, skipSheetOpenRef: { current: false }, todaySheetOpenRef: { current: false },
  };
  const firstShownRef = { current: firstShown || { p: Promise.resolve() } };
  const checkTreatmentStillActive = loadFn('screens/TodayScreen.js', 'async function checkTreatmentStillActive(', 'checkTreatmentStillActive', {
    getCachedUser: async () => ({ id: 'u1' }),
    getActiveProtocols: () => [goli],
    // A-121: the logs of every outcome (the course-end question counts Taken / Skipped), decided by
    // the real lib/protocolEnd nextTodayQuestion.
    getLogsSince: () => { calls.reads++; return logs.slice(); },
    nextTodayQuestion: require('../lib/protocolEnd').nextTodayQuestion,
    markProtocolStillGoing: () => false, requestSync: () => {},
    AsyncStorage: { getItem: async () => null, removeItem: async () => {} },
    ...refs,
    setInactiveProtocol: (p) => shown.push(p && p.name),
    setShowInactivePrompt: () => {}, setInactiveKind: () => {}, setInactiveStep: () => {},
  });
  const checkStillGoingWhenSynced = loadFn('screens/TodayScreen.js', 'function checkStillGoingWhenSynced(', 'checkStillGoingWhenSynced', {
    firstSyncGate, firstShownRef, checkTreatmentStillActive, ...refs,
  });
  return { checkStillGoingWhenSynced, shown, calls, refs, now };
}

test('A-122 (3): a Taken dose that arrives with the first sync prevents "Still going?"', async () => {
  const sync = fakeSync(true);
  const logs = [{ protocol_id: 7, logged_at: new Date(Date.now() - 10 * DAY).toISOString(), outcome: 'Taken' }];
  const t = makeToday({ sync, logs });
  t.checkStillGoingWhenSynced(); // Today gets focus on opening the app
  await ticks();
  assert.equal(t.calls.reads, 0, 'the logs are not read before the download');
  assert.deepEqual(t.shown, [], 'no prompt from the half-synced phone');
  // The startup download brings yesterday's dose logged on the other phone, then the pass ends.
  logs.push({ protocol_id: 7, logged_at: new Date(Date.now() - 1 * DAY).toISOString(), outcome: 'Taken' });
  sync.emit({ type: 'sync_complete' });
  await ticks();
  assert.equal(t.calls.reads, 1, 'the logs are re-read once the sync settled');
  assert.deepEqual(t.shown, [], 'Goli was taken yesterday: not asked');
});

test('A-122 (3): with no newer dose in the cloud the prompt still comes, after the sync settles', async () => {
  const sync = fakeSync(true);
  const logs = [{ protocol_id: 7, logged_at: new Date(Date.now() - 10 * DAY).toISOString(), outcome: 'Taken' }];
  const t = makeToday({ sync, logs });
  t.checkStillGoingWhenSynced();
  await ticks();
  assert.deepEqual(t.shown, []);
  sync.emit({ type: 'sync_error', error: 'timeout' }); // a failed pass still settles the wait
  await ticks();
  assert.deepEqual(t.shown, ['Goli']);
});

test('A-122 (3): offline, the user is still asked from the phone\'s data', async () => {
  const sync = fakeSync(null);
  const logs = [{ protocol_id: 7, logged_at: new Date(Date.now() - 10 * DAY).toISOString(), outcome: 'Taken' }];
  const t = makeToday({ sync, logs });
  t.checkStillGoingWhenSynced();
  await ticks();
  assert.deepEqual(t.shown, []);
  sync.online = false; sync.emit({ type: 'connectivity', online: false });
  await ticks();
  assert.deepEqual(t.shown, ['Goli']);
});

test('A-122 (3): one wait at a time, never over another tab, never before the first screen (A-120)', async () => {
  // Several focuses before the sync settles → one check, one prompt.
  const sync = fakeSync(true);
  const logs = [];
  const t = makeToday({ sync, logs });
  t.checkStillGoingWhenSynced(); t.checkStillGoingWhenSynced(); t.checkStillGoingWhenSynced();
  sync.emit({ type: 'sync_complete' });
  await ticks();
  assert.equal(t.calls.reads, 1, 'one check for the queued focuses');
  assert.deepEqual(t.shown, ['Goli']);

  // Left Today before the sync settled → no prompt over the other tab.
  const s2 = fakeSync(true);
  const t2 = makeToday({ sync: s2, logs: [] });
  t2.checkStillGoingWhenSynced();
  t2.refs.focusedRef.current = false;
  s2.emit({ type: 'sync_complete' });
  await ticks();
  assert.deepEqual(t2.shown, [], 'not over another tab');
  t2.refs.focusedRef.current = true;
  t2.checkStillGoingWhenSynced(); // back on Today: the gate is open, the check runs now
  await ticks();
  assert.deepEqual(t2.shown, ['Goli']);

  // Sync settled but Today's first screen still loading → the check waits for it.
  const s3 = fakeSync(true);
  const first = deferred();
  const t3 = makeToday({ sync: s3, logs: [], firstShown: first });
  s3.emit({ type: 'sync_complete' });
  t3.checkStillGoingWhenSynced();
  await ticks();
  assert.deepEqual(t3.shown, [], 'never over the loading spinner');
  first.resolve();
  await ticks();
  assert.deepEqual(t3.shown, ['Goli']);

  // The prompt already up → a later check never opens it a second time.
  const s4 = fakeSync(true);
  const t4 = makeToday({ sync: s4, logs: [] });
  s4.emit({ type: 'sync_complete' });
  t4.refs.inactivePromptOpenRef.current = true;
  t4.checkStillGoingWhenSynced();
  await ticks();
  assert.deepEqual(t4.shown, [], 'one modal at a time');
});

// ── (4) source guards ──────────────────────────────────────────────────────────────────────────
test('A-122 (4): Today runs "Still going?" only through the first-sync gate', () => {
  const today = read('screens/TodayScreen.js');
  // One gate for the app session, created when a module loads (before App starts the sync), so
  // the first pass's result is never missed by a Today that mounts later. A-123: it lives in
  // lib/firstSyncGate.js, shared with the Missed scan (missedScanGate.test.js).
  assert.match(today, /import \{ firstSyncGate \} from '\.\.\/lib\/firstSyncGate';/);
  // A-123 F4: the same gate also closes on return to the foreground (missedScanGate.test.js F4).
  assert.match(read('lib/firstSyncGate.js'), /^export const firstSyncGate = createFirstSyncGate\(\{ addSyncListener, isOnlineNow, addForegroundListener, requestSync \}\);/m, 'module-scope gate');
  assert.doesNotMatch(today, /createFirstSyncGate\(/, 'Today makes no gate of its own');
  // checkTreatmentStillActive( is called in exactly one place: inside the gate wrapper.
  const calls = [...today.matchAll(/(?<!function )checkTreatmentStillActive\(/g)].map((m) => m.index);
  assert.equal(calls.length, 1, 'one call site');
  const wrapper = sliceBlock(today, 'function checkStillGoingWhenSynced(');
  const wrapperAt = today.indexOf(wrapper);
  assert.ok(calls[0] > wrapperAt && calls[0] < wrapperAt + wrapper.length, 'called only inside checkStillGoingWhenSynced');
  assert.match(wrapper, /firstSyncGate\.whenOpen\(\)/);
  assert.match(wrapper, /firstShownRef\.current\.p/);
  // The focus effect asks through the wrapper.
  const focus = today.slice(today.indexOf('focusedRef.current = true;'), today.indexOf('askKeptQuestions();', today.indexOf('focusedRef.current = true;')));
  assert.match(focus, /checkStillGoingWhenSynced\(\);/);
  // The check itself still reads the logs when it runs and keeps the snooze key.
  const check = sliceBlock(today, 'async function checkTreatmentStillActive(');
  assert.match(check, /getLogsSince\(user\.id, since\.toISOString\(\)\)/);
  assert.match(check, /dosetrace_tx_check_\$\{p\.id\}/);
  assert.match(check, /if \(inactivePromptOpenRef\.current\) return;/);
});

test('A-122 (4): lib/stillGoingGate.js is pure (no imports): the sync bus is passed in', () => {
  const src = read('lib/stillGoingGate.js');
  assert.ok(!/^\s*import\s/m.test(src), 'no imports');
  assert.ok(!/require\(/.test(src), 'no require');
});
