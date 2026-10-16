'use strict';
// A-123 (found while fixing A-122, 2026-10-15): lib/doseActions.js scanMissedDoses wrote Missed rows
// from the phone's local dose_logs on Today focus, refreshIfNewDay, the Dose log focus (also the
// Fold's right page) and the Settings report export — BEFORE the session's startup download had
// brought a dose logged on the other phone. The same slot then showed Missed and Taken, and nothing
// reconciled them on pull. The rules:
//   1. the scan runs only once the session's first sync has a result (sync/import complete or
//      error) or the phone is known to be offline — from every caller (one shared gate,
//      lib/firstSyncGate.js, the A-122 gate);
//   2. the Settings report export never hangs: it waits for the gate at most a short cap, then
//      makes the report without scanning (no Missed rows from a half-synced phone);
//   3. the scan is idempotent against a Taken / Skipped that arrives later for a slot that already
//      has the app's Missed row: that Missed row is removed (a deletion everywhere); a row the user
//      entered (Taken / Skipped) is never touched, and a Missed row whose slot nothing covers stays.
// Behaviour runs the REAL scanMissedDoses and the REAL lib/database.js reads/writes over the sync
// harness (in-memory SQLite + fake cloud, real lib/syncCore push/pull).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const MD = require('../lib/missedDoses');
const PE = require('../lib/protocolEnd');
const { read, loadFn, sliceBlock } = require('./helpers/extractFn');

const USER = 'u1';
const DAY = 86400000;
const ticks = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// lib/stillGoingGate.js is an ES module with no imports: load its exports under plain node.
function loadEsm(file) {
  const src = read(file).replace(/^export\s+/gm, '');
  const names = [...src.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)].map((m) => m[1] || m[2]);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { ${names.join(', ')} };`)();
}
const { createFirstSyncGate } = loadEsm('lib/stillGoingGate.js');

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

// Local times relative to now (the scan reads the real clock).
function at(daysBack, h, m = 0) { const d = new Date(); d.setDate(d.getDate() - daysBack); d.setHours(h, m, 0, 0); return d; }
const iso = (d) => d.toISOString();
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// One protocol, synced on this phone and in the cloud (the other phone logs against it).
async function seedProtocol(db, cloud, { times = '08:00', dpd = 1 } = {}) {
  const created = at(30, 7);
  const p = await cloud.insert('protocols', { user_id: USER, name: 'Goli', type: 'oral', active: true, reminder_time: times, doses_per_day: dpd, interval_days: 1, start_date: dayKey(created), created_at: iso(created) });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, reminder_time, doses_per_day, interval_days, start_date, active, created_at, updated_at, sync_status)
    VALUES (?, ?, 'Goli', 'oral', '#185FA5', ?, ?, 1, ?, 1, ?, ?, 'synced')`, [p.data.id, USER, times, dpd, dayKey(created), iso(created), p.data.updated_at]);
  return { pid: db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id, remote: p.data.id };
}
// The other phone logs a dose: it is in the cloud, not yet on this phone.
const otherPhoneLogs = (cloud, remote, outcome, when) => cloud.insert('dose_logs', { user_id: USER, protocol_id: remote, outcome, logged_at: iso(when) });
// A row already on this phone and in the cloud (an earlier scan's Missed row, pushed).
async function syncedRow(db, cloud, p, outcome, when) {
  const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.remote, outcome, logged_at: iso(when) });
  db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [l.data.id, USER, p.pid, p.remote, outcome, iso(when), l.data.updated_at]);
  return db.getFirstSync('SELECT id FROM dose_logs WHERE remote_id = ?', [l.data.id]).id;
}
const liveRows = (db, outcome) => db.getAllSync(`SELECT * FROM dose_logs WHERE outcome = ? AND sync_status != 'deleted' ORDER BY logged_at`, [outcome]);

// The real scanMissedDoses, with the real lib/database.js functions over this phone's db.
function phone(db, sync, { sinceMs = at(1, 0).getTime() } = {}) {
  const dbDeps = { getDB: () => db, PE };
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, dbDeps);
  const firstSyncGate = createFirstSyncGate(sync);
  const scan = loadFn('lib/doseActions.js', 'export async function scanMissedDoses(', 'scanMissedDoses', {
    ...MD,
    getActiveProtocols: fromDb('getActiveProtocols'),
    getLogsSince: fromDb('getLogsSince'),
    insertDoseLog: fromDb('insertDoseLog'),
    deleteDoseLog: fromDb('deleteDoseLog'),
    getCachedUser: async () => ({ id: USER }),
    getMissedWatermark: async () => ({ sinceMs, zoneHistory: null }),
    firstSyncGate,
    MISSED_LOOKBACK_DAYS: 14,
    _missedScanInFlight: false,
  });
  return { scan, firstSyncGate };
}

// ── (1) the scan waits for the session's first sync result ─────────────────────────────────────
test('A-123 (1): a Taken logged on the other phone arriving with the first sync -> no Missed row for that slot', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(1, 8, 10)); // yesterday 08:10 on phone A
  const sync = fakeSync(true);
  const { scan } = phone(B, sync);
  let done = false;
  const run = scan().then((n) => { done = true; return n; }); // Today gets focus on opening the app
  await ticks();
  assert.equal(liveRows(B, 'Missed').length, 0, 'nothing written before the startup download');
  assert.equal(done, false, 'the scan waits for the first sync result');
  await pullChanges(B, cloud, USER); // the startup download brings phone A's dose
  sync.emit({ type: 'sync_complete' });
  assert.equal(await run, 0);
  assert.equal(liveRows(B, 'Missed').length, 0, 'yesterday 08:00 is covered by the Taken: no Missed row');
  assert.equal(liveRows(B, 'Taken').length, 1);
});

test('A-123 (1): with no dose in the cloud the scan still writes the real miss, once, after the sync settles', async () => {
  for (const settle of ['sync_complete', 'sync_error', 'import_complete', 'import_error']) {
    const cloud = makeCloud();
    const B = makeDb();
    await seedProtocol(B, cloud);
    const sync = fakeSync(true);
    const { scan } = phone(B, sync);
    // Today focus, the new-day refresh and the Dose log focus all ask before the sync settles.
    const runs = [scan(), scan(), scan()];
    await ticks();
    assert.equal(liveRows(B, 'Missed').length, 0, `${settle}: waits`);
    await pullChanges(B, cloud, USER);
    sync.emit({ type: settle });
    const ns = await Promise.all(runs);
    assert.equal(ns.reduce((a, b) => a + b, 0), 1, `${settle}: one row written in all`);
    const missed = liveRows(B, 'Missed');
    assert.equal(missed.length, 1, `${settle}: yesterday's slot, once`);
    assert.equal(Date.parse(missed[0].logged_at), at(1, 8).getTime(), 'at the slot time');
  }
});

test('A-123 (1): offline (known), the scan runs from what the phone has', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  await seedProtocol(B, cloud);
  const { scan } = phone(B, fakeSync(false));
  assert.equal(await scan(), 1, 'already offline: no download is coming');
  assert.equal(liveRows(B, 'Missed').length, 1);

  const B2 = makeDb();
  await seedProtocol(B2, makeCloud());
  const s2 = fakeSync(null);
  const { scan: scan2 } = phone(B2, s2);
  const run = scan2();
  await ticks();
  assert.equal(liveRows(B2, 'Missed').length, 0, 'connectivity not known yet: wait');
  s2.online = false; s2.emit({ type: 'connectivity', online: false });
  assert.equal(await run, 1, 'known offline: runs');
});

// ── (2) the report export never hangs ──────────────────────────────────────────────────────────
test('A-123 (2): the report export waits at most its cap, then goes on without writing Missed rows', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  await seedProtocol(B, cloud);
  const sync = fakeSync(true); // online, the startup sync never answers (stalled network)
  const { scan } = phone(B, sync);
  const t0 = Date.now();
  const n = await scan({ maxWaitMs: 40 });
  const took = Date.now() - t0;
  assert.equal(n, 0);
  assert.ok(took >= 30 && took < 1000, `returned after the cap (${took} ms)`);
  assert.equal(liveRows(B, 'Missed').length, 0, 'no Missed rows from a half-synced phone');
  // Gate already open: no wait at all.
  sync.emit({ type: 'sync_complete' });
  assert.equal(await scan({ maxWaitMs: 40 }), 1);
});

test('A-123 (2): the gate\'s capped wait (lib/stillGoingGate whenOpenWithin): true when it opens in time, false after the cap', async () => {
  const s = fakeSync(true);
  const g = createFirstSyncGate(s);
  assert.equal(typeof g.whenOpenWithin, 'function');
  const early = g.whenOpenWithin(1000);
  s.emit({ type: 'sync_complete' });
  assert.equal(await early, true);
  assert.equal(await g.whenOpenWithin(10), true, 'open: at once');
  const s2 = fakeSync(true);
  const g2 = createFirstSyncGate(s2);
  assert.equal(await g2.whenOpenWithin(20), false, 'never opened: the cap');
});

test('A-123 (2): Settings report export scans with the cap (REPORT_SCAN_WAIT_MS = 5000)', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /const REPORT_SCAN_WAIT_MS = 5000;/);
  const fn = src.slice(src.indexOf('async function handleAdherenceReport'), src.indexOf('async function handleSignOut'));
  assert.match(fn, /await scanMissedDoses\(\{ maxWaitMs: REPORT_SCAN_WAIT_MS \}\)/);
});

// ── (3) a late Taken / Skipped removes the app's Missed row for that slot ──────────────────────
test('A-123 (3): a late Taken for a slot with an app Missed row -> the Missed row is removed everywhere', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  const missedId = await syncedRow(B, cloud, p, 'Missed', at(1, 8)); // an earlier scan, pushed
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(1, 8, 25));
  const sync = fakeSync(true);
  const { scan } = phone(B, sync);
  await pullChanges(B, cloud, USER);
  sync.emit({ type: 'sync_complete' });
  await scan();
  assert.equal(liveRows(B, 'Missed').length, 0, 'the slot is Taken: the Missed row goes');
  assert.equal(B.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [missedId]).sync_status, 'deleted', 'as a deletion (tombstone), synced up');
  assert.equal(liveRows(B, 'Taken').length, 1, 'the Taken row is untouched');
  await pushPending(B, cloud, USER);
  assert.deepEqual(cloud.rows('dose_logs', USER).map((r) => r.outcome), ['Taken'], 'gone from the cloud too');
  assert.equal(B.getFirstSync('SELECT COUNT(*) AS n FROM dose_logs WHERE id = ?', [missedId]).n, 0);
  // Run again: nothing more to do, no Missed row comes back.
  assert.equal(await scan(), 0);
  assert.equal(liveRows(B, 'Missed').length, 0);
});

test('A-123 (3): a Skipped arriving later does the same; an unsent Missed row is removed too', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  B.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, 'Missed', ?, ?, 'pending')`,
    [USER, p.pid, p.remote, iso(at(1, 8)), iso(new Date())]); // written offline, never sent
  await otherPhoneLogs(cloud, p.remote, 'Skipped', at(1, 8));
  const sync = fakeSync(true);
  const { scan } = phone(B, sync);
  await pullChanges(B, cloud, USER);
  sync.emit({ type: 'sync_complete' });
  await scan();
  assert.equal(liveRows(B, 'Missed').length, 0);
  assert.equal(liveRows(B, 'Skipped').length, 1);
  await pushPending(B, cloud, USER);
  assert.deepEqual(cloud.rows('dose_logs', USER).map((r) => r.outcome), ['Skipped'], 'the unsent Missed row never reaches the cloud');
});

test('A-123 (3): only the covered slot\'s Missed row goes — the other slot\'s miss and the user\'s rows stay', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud, { times: '08:00,20:00', dpd: 2 });
  await syncedRow(B, cloud, p, 'Missed', at(1, 8));
  const eveningMiss = await syncedRow(B, cloud, p, 'Missed', at(1, 20));
  await syncedRow(B, cloud, p, 'Taken', at(2, 8, 5)); // the user's own rows on other days
  await syncedRow(B, cloud, p, 'Skipped', at(2, 20));
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(1, 8, 15)); // only the morning dose was taken
  const sync = fakeSync(true);
  const { scan } = phone(B, sync, { sinceMs: at(2, 0).getTime() });
  await pullChanges(B, cloud, USER);
  sync.emit({ type: 'sync_complete' });
  await scan();
  const missed = liveRows(B, 'Missed');
  assert.deepEqual(missed.map((r) => r.id), [eveningMiss], 'yesterday 20:00 stays Missed (nothing covers it)');
  assert.equal(liveRows(B, 'Taken').length, 2, 'every Taken row stays');
  assert.equal(liveRows(B, 'Skipped').length, 1, 'every Skipped row stays');
});

test('A-123 (3): a Missed row the schedule does not explain (a slot not in the scan window) is never removed', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  // An older Missed at 09:00 (written before the time was changed to 08:00) with a Taken next to it:
  // it sits at no slot of today's schedule, so the scan cannot tell which slot it was and leaves it.
  const odd = await syncedRow(B, cloud, p, 'Missed', at(3, 9));
  await syncedRow(B, cloud, p, 'Taken', at(3, 9, 30));
  const sync = fakeSync(true);
  const { scan } = phone(B, sync, { sinceMs: at(1, 0).getTime() });
  sync.emit({ type: 'sync_complete' });
  await scan();
  assert.ok(liveRows(B, 'Missed').some((r) => r.id === odd), 'kept: never destroy on a maybe');
});

// ── (4) one shared gate, every caller through it ───────────────────────────────────────────────
test('A-123 (4): one gate for the session in lib/firstSyncGate.js, shared by Today and the Missed scan', () => {
  const mod = read('lib/firstSyncGate.js');
  assert.match(mod, /import \{ addSyncListener, isOnlineNow \} from '\.\/sync';/);
  assert.match(mod, /import \{ createFirstSyncGate \} from '\.\/stillGoingGate';/);
  assert.match(mod, /export const firstSyncGate = createFirstSyncGate\(\{ addSyncListener, isOnlineNow \}\);/);
  // Nobody else makes a second gate (a second one would miss the first pass's result).
  const roots = ['lib', 'screens', 'components'];
  const makers = [];
  for (const dir of roots) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', dir))) {
      if (!f.endsWith('.js')) continue;
      const src = read(`${dir}/${f}`);
      if (/(?<!function )createFirstSyncGate\(\{/.test(src)) makers.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(makers, ['lib/firstSyncGate.js']);
  assert.match(read('screens/TodayScreen.js'), /import \{ firstSyncGate \} from '\.\.\/lib\/firstSyncGate';/);
  assert.match(read('lib/doseActions.js'), /import \{ firstSyncGate \} from '\.\/firstSyncGate';/);
  // The scan waits on the gate before it reads a single log, and claims the in-flight guard only
  // after the wait (a waiting scan never makes another caller skip).
  const scan = sliceBlock(read('lib/doseActions.js'), 'export async function scanMissedDoses(');
  const waitAt = scan.search(/firstSyncGate\.whenOpen/);
  assert.ok(waitAt > 0, 'waits on the gate');
  assert.ok(waitAt < scan.indexOf('getLogsSince('), 'before reading the logs');
  assert.ok(waitAt < scan.indexOf('_missedScanInFlight = true'), 'before the in-flight guard');
});

test('A-123 (4): every caller goes through scanMissedDoses (Today focus, new day, Dose log, report)', () => {
  const today = read('screens/TodayScreen.js');
  assert.equal((today.match(/scanMissedDoses\(\)/g) || []).length, 2, 'Today focus + refreshIfNewDay');
  assert.equal((read('screens/LogScreen.js').match(/scanMissedDoses\(\)/g) || []).length, 1, 'Dose log focus (also the Fold right page)');
  // No other writer of Missed rows from screens.
  for (const f of ['TodayScreen.js', 'LogScreen.js', 'SettingsScreen.js']) {
    assert.doesNotMatch(read(`screens/${f}`), /computeMissedDoses\(/, f);
  }
});

// ── (5) a waiting scan never holds a screen back ───────────────────────────────────────────────
// The scan now waits for the first sync, so a screen that used to load its list only after the scan
// would sit on its spinner until the download ends (forever on a stalled network). The Dose log
// (also the Fold's right page) loads its list at once and reads it again when the scan has run
// (then the doses the download brought are there too).
test('A-123 (5): the Dose log loads its list at once, not after the waiting Missed scan', () => {
  const log = read('screens/LogScreen.js');
  const focus = log.slice(log.indexOf('useFocusEffect('), log.indexOf('function openMissedEditor('));
  const scanAt = focus.indexOf('scanMissedDoses()');
  assert.ok(scanAt > 0);
  const firstFetch = focus.indexOf('fetchLogs();');
  assert.ok(firstFetch >= 0 && firstFetch < scanAt, 'fetchLogs() runs before the scan is started');
  assert.match(focus.slice(scanAt), /^scanMissedDoses\(\)\.then\(\(n\) => \{\s*if \(n > 0\) requestSync\(\);\s*fetchLogs\(\);\s*\}\)\.catch\(\(\) => \{\}\);/, 'and again after it');
  // Today never waits for the scan before its first screen (A-120's first reads do not include it).
  const today = read('screens/TodayScreen.js');
  const reads = today.slice(today.indexOf('const firstReads = ['), today.indexOf('];', today.indexOf('const firstReads = [')));
  assert.doesNotMatch(reads, /scanMissedDoses/);
});
