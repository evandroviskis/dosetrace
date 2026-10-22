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
//      has the app's Missed row: that Missed row is removed (a deletion pushed to the cloud; other
//      phones re-derive it — tombstones everywhere are OPEN-16 b / A-119); a row the user entered
//      (Taken / Skipped) is never touched, and a Missed row whose slot nothing covers stays.
//   6. (journey review 2026-10-15, F1–F6) the removal is certain or it does not happen: the covering
//      row is on the slot's own day, that slot is the one of the day nearest to it (a tie removes
//      nothing), the protocol's schedule is known unchanged since that day, and ended protocols are
//      cleaned up to (not on) their end day; coming back from the background the gate closes again
//      until the foreground sync's result (F4).
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
const { createFirstSyncGate, isForegroundStale, FOREGROUND_CAP_MS } = loadEsm('lib/stillGoingGate.js');

// A stand-in for lib/sync's listener bus, NetInfo state, AppState 'active' and the gate's clock.
function fakeSync(online = null) {
  let listeners = [];
  let fg = [];
  const bus = {
    online,
    clock: 1000000,
    addSyncListener: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
    isOnlineNow: () => bus.online,
    addForegroundListener: (fn) => { fg.push(fn); },
    now: () => bus.clock,
    emit: (e) => { for (const fn of listeners) fn(e); },
    foreground: () => { for (const fn of fg) fn(); },
    // lib/sync requestSync (debounced) and the gate's timers, on the fake clock.
    requests: 0,
    requestSync: () => { bus.requests += 1; },
    timers: [],
    setTimer: (fn, ms) => { const t = { fn, at: bus.clock + ms, done: false }; bus.timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.done = true; },
    advance: (ms) => {
      bus.clock += ms;
      for (const t of bus.timers) if (!t.done && t.at <= bus.clock) { t.done = true; t.fn(); }
    },
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
// scheduleSince (F1): since when this phone knows each protocol's schedule unchanged (what the scan's
// schedule ledger, observeSchedules, answers). Default: since the protocol was set up 30 days ago —
// the scenarios above never edit the schedule. null: nothing is known (an edit, or never observed).
function phone(db, sync, { sinceMs = at(1, 0).getTime(), scheduleSince = at(30, 7).getTime() } = {}) {
  const dbDeps = { getDB: () => db, PE };
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, dbDeps);
  const firstSyncGate = createFirstSyncGate(sync);
  const scan = loadFn('lib/doseActions.js', 'export async function scanMissedDoses(', 'scanMissedDoses', {
    ...MD,
    getActiveProtocols: fromDb('getActiveProtocols'),
    getEndedProtocols: fromDb('getEndedProtocols'),
    getLogsSince: fromDb('getLogsSince'),
    observeSchedules: async (userId, protocols) => Object.fromEntries(scheduleSince == null ? [] : protocols.map((p) => [p.id, scheduleSince])),
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
  // Two days back, not yesterday: a Missed row less than 12 h old is not due yet and goes anyway
  // (notYetDueMissedRows, LATE_MS), so 'yesterday 20:00' failed whenever the suite ran before 08:00.
  await syncedRow(B, cloud, p, 'Missed', at(2, 8));
  const eveningMiss = await syncedRow(B, cloud, p, 'Missed', at(2, 20));
  await syncedRow(B, cloud, p, 'Taken', at(3, 8, 5)); // the user's own rows on other days
  await syncedRow(B, cloud, p, 'Skipped', at(3, 20));
  await syncedRow(B, cloud, p, 'Taken', at(1, 8, 5)); // yesterday both taken, so the scan writes nothing new
  await syncedRow(B, cloud, p, 'Taken', at(1, 20, 5));
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(2, 8, 15)); // only the morning dose was taken
  const sync = fakeSync(true);
  const { scan } = phone(B, sync, { sinceMs: at(3, 0).getTime() });
  await pullChanges(B, cloud, USER);
  sync.emit({ type: 'sync_complete' });
  await scan();
  const missed = liveRows(B, 'Missed');
  assert.deepEqual(missed.map((r) => r.id), [eveningMiss], 'the 20:00 miss stays (nothing covers it)');
  assert.equal(liveRows(B, 'Taken').length, 4, 'every Taken row stays');
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
  assert.match(mod, /import \{ addSyncListener, isOnlineNow, requestSync \} from '\.\/sync';/);
  assert.match(mod, /import \{ createFirstSyncGate \} from '\.\/stillGoingGate';/);
  assert.match(mod, /export const firstSyncGate = createFirstSyncGate\(\{ addSyncListener, isOnlineNow, addForegroundListener, requestSync \}\);/);
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

// ── (6) journey review 2026-10-15: the cleanup removes a Missed row only when it is certain ─────
// Founder rule (CLAUDE.md): never destroy on a maybe. Leaving a Missed row next to a Taken is the
// status quo before A-123 and is safe; removing a TRUE Missed row is not. Fixed dates, the real
// matcher; scanOnce = what scanMissedDoses does (cleanup, then the scan over what is left).
const D = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const isoMs = (ms) => new Date(ms).toISOString();
const NOW = D(13, 12);
const proto = (over = {}) => ({ id: 1, user_id: USER, created_at: isoMs(D(1, 7)), updated_at: isoMs(D(1, 7)), start_date: '2026-10-01', interval_days: 1, active: 1, doses_per_day: 1, reminder_time: '20:00', ...over });
const row = (id, outcome, ms) => ({ id, protocol_id: 1, outcome, logged_at: isoMs(ms) });
function scanOnce(protocols, logs, opts = {}, sinceMs = D(10, 0)) {
  const o = { lookbackDays: 14, ...opts };
  const gone = MD.coveredMissedRows(protocols, logs, NOW, o);
  const ids = new Set(gone.map((r) => r.id));
  const kept = logs.filter((l) => !ids.has(l.id));
  return { deleted: gone.map((r) => r.id).sort(), added: MD.computeMissedDoses(protocols.filter((p) => p.active !== 0), kept, NOW, sinceMs, o).map((a) => a.scheduledAtMs) };
}
const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

test('A-123 F1: twice daily 08:00+20:00 edited to once daily 20:00 -> the true evening Missed stays', () => {
  // Day 10 under the OLD schedule: 08:00 taken at 08:05, 20:00 really missed. Edited on day 11.
  const logs = [row('T', 'Taken', D(10, 8, 5)), row('M', 'Missed', D(10, 20))];
  const edited = proto({ updated_at: isoMs(D(11, 9)) });
  assert.deepEqual(scanOnce([edited], logs).deleted, [], 'edited after that day, nothing on the phone says otherwise: kept');
  for (const zoneHistory of [[{ tz: deviceTz(), sinceMs: NOW }], [{ tz: deviceTz(), sinceMs: D(1, 0) - 20 * DAY }]]) {
    assert.deepEqual(scanOnce([edited], logs, { zoneHistory }).deleted, [], 'zone-aware path too');
  }
  // The schedule ledger saw the old schedule and then the new one: the change is known -> kept,
  // even when updated_at (another phone's clock, a clock change) looks older than that day.
  const seen = MD.noteSchedules({}, [proto({ doses_per_day: 2, reminder_time: '08:00,20:00' })], { userId: USER, nowMs: D(2, 9) });
  const after = MD.noteSchedules(seen.next, [proto({ updated_at: isoMs(D(1, 7)) })], { userId: USER, nowMs: D(11, 10) });
  assert.equal(after.sinceById[1], D(11, 10), 'the change is dated when this phone first saw it');
  assert.deepEqual(scanOnce([proto()], logs, { scheduleSince: after.sinceById }).deleted, [], 'ledger knows of the edit: kept');
  // Control: the schedule really was once daily 20:00 all along (taken early, A-43) -> the Missed
  // row is the duplicate it looks like and goes.
  assert.deepEqual(scanOnce([proto()], logs).deleted, ['M'], 'unchanged schedule: the duplicate goes');
});

test('A-123 F2: daily 20:00, day 10 Missed, day 11 dose Taken at 07:00 -> day 10 stays Missed and day 11 gets no false Missed', () => {
  const logs = [row('M10', 'Missed', D(10, 20)), row('T11', 'Taken', D(11, 7)), row('T12', 'Taken', D(12, 20))];
  const r = scanOnce([proto()], logs);
  assert.deepEqual(r.deleted, [], 'a row on another calendar day never removes a Missed row');
  assert.deepEqual(r.added, [], 'and no Missed row is written for day 11');
});

test('A-123 F3: twice daily, both Missed, a Taken at 19:00 -> the 20:00 Missed goes, the 08:00 one stays', () => {
  const p = proto({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  // Day 9 was logged (otherwise its open 20:00 slot, as in the real scan, would take day 10's 08:00 row).
  const d9 = [row('T9a', 'Taken', D(9, 8, 5)), row('T9b', 'Taken', D(9, 20, 5))];
  const logs = [...d9, row('M8', 'Missed', D(10, 8)), row('M20', 'Missed', D(10, 20)), row('T', 'Taken', D(10, 19))];
  const r = scanOnce([p], logs);
  assert.deepEqual(r.deleted, ['M20'], 'the slot nearest to the Taken');
  assert.deepEqual(r.added.filter((ms) => ms >= D(10, 0) && ms < D(11, 0)), [], 'nothing written back for day 10');
  // A tie (14:00 is 6 h from both) cannot say which slot it was: nothing is removed.
  const tie = scanOnce([p], [...d9, row('M8', 'Missed', D(10, 8)), row('M20', 'Missed', D(10, 20)), row('T', 'Taken', D(10, 14))]);
  assert.deepEqual(tie.deleted, [], 'tie: both kept');
  // One Taken removes at most one slot's Missed row; the morning one taken at 08:10 -> only 08:00.
  assert.deepEqual(scanOnce([p], [...d9, row('M8', 'Missed', D(10, 8)), row('M20', 'Missed', D(10, 20)), row('T', 'Taken', D(10, 8, 10))]).deleted, ['M8']);
  // A Taken at 15:00 is nearer 20:00, but the matcher counts it for 08:00 (the 20:00 slot stays
  // open, so the scan would write the Missed row straight back): nothing is removed.
  assert.deepEqual(scanOnce([p], [...d9, row('M20', 'Missed', D(10, 20)), row('T', 'Taken', D(10, 15))]).deleted, []);
});

test('A-123 F6: an ended protocol is cleaned up up to its end; its end day is left alone', () => {
  const ended = proto({ active: 0, ended_at: isoMs(D(11, 12)), updated_at: isoMs(D(11, 12)), reminder_time: '08:00' });
  const logs = [row('M9', 'Missed', D(9, 8)), row('T9', 'Taken', D(9, 8, 20)), row('M11', 'Missed', D(11, 8)), row('T11', 'Taken', D(11, 8, 20))];
  // The ledger has seen this schedule since day 2 (ending the protocol does not change its slots before the end).
  const scheduleSince = MD.noteSchedules(MD.noteSchedules({}, [proto({ reminder_time: '08:00' })], { userId: USER, nowMs: D(2, 9) }).next, [ended], { userId: USER, nowMs: NOW }).sinceById;
  assert.equal(scheduleSince[1], D(2, 9), 'ending is not a schedule change');
  assert.deepEqual(scanOnce([ended], logs, { scheduleSince }).deleted, ['M9'], 'before the end day: the duplicate goes; on the end day: kept');
});

test('A-123 F1: the schedule ledger (lib/missedDoses noteSchedules)', () => {
  const a = proto({ updated_at: isoMs(D(12, 9)) }); // an oral dose bumps updated_at every day (units_taken)
  const first = MD.noteSchedules(null, [a], { userId: USER, nowMs: D(3, 9) });
  assert.equal(first.sinceById[1], D(3, 9), 'first seen: since now (updated_at is later)');
  assert.equal(MD.noteSchedules(null, [proto()], { userId: USER, nowMs: D(3, 9) }).sinceById[1], D(1, 7), 'first seen, never written since day 1: updated_at says so');
  const again = MD.noteSchedules(first.next, [a], { userId: USER, nowMs: D(12, 10) });
  assert.equal(again.sinceById[1], D(3, 9), 'same schedule seen again: still since day 3 although updated_at moved');
  const moved = MD.noteSchedules(again.next, [{ ...a, reminder_time: '21:00' }], { userId: USER, nowMs: D(12, 11) });
  assert.equal(moved.sinceById[1], D(12, 11), 'time edited: since now');
  const later = MD.noteSchedules(moved.next, [{ ...a, reminder_time: '21:00', updated_at: isoMs(D(1, 7)) }], { userId: USER, nowMs: D(13, 9) });
  assert.equal(later.sinceById[1], D(12, 11), 'after a seen change an old-looking updated_at never certifies more');
  assert.equal(MD.noteSchedules(again.next, [a], { userId: 'other', nowMs: D(12, 10) }).sinceById[1], D(12, 9), 'another account: nothing carried over (first sight: its updated_at)');
  assert.equal(MD.noteSchedules(again.next, [a], { userId: USER, nowMs: D(2, 10) }).sinceById[1], D(2, 10), 'clock set back before the entry: since now');
  assert.equal(MD.noteSchedules({}, [proto({ updated_at: isoMs(NOW + DAY) })], { userId: USER, nowMs: NOW }).sinceById[1], NOW, 'a future updated_at certifies nothing');
});

test('A-123 F1 through the real scan: nothing known about the schedule -> the Missed row next to a Taken stays', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud, { times: '20:00' });
  await syncedRow(B, cloud, p, 'Taken', at(2, 8, 5));
  const miss = await syncedRow(B, cloud, p, 'Missed', at(2, 20));
  const sync = fakeSync(true);
  const { scan } = phone(B, sync, { sinceMs: Date.now(), scheduleSince: at(1, 9).getTime() }); // edit seen yesterday
  sync.emit({ type: 'sync_complete' });
  await scan();
  assert.deepEqual(liveRows(B, 'Missed').map((r) => r.id), [miss], 'kept');
});

test('A-123 F6 through the real scan: an ended protocol\'s duplicate Missed row goes', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  B.runSync(`UPDATE protocols SET active = 0, ended_at = ? WHERE id = ?`, [iso(at(0, 6)), p.pid]);
  const miss = await syncedRow(B, cloud, p, 'Missed', at(2, 8));
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(2, 8, 20));
  const sync = fakeSync(true);
  const { scan } = phone(B, sync, { sinceMs: at(3, 0).getTime() });
  await pullChanges(B, cloud, USER);
  B.runSync(`UPDATE protocols SET active = 0, ended_at = ? WHERE id = ?`, [iso(at(0, 6)), p.pid]); // the pull kept the end
  sync.emit({ type: 'sync_complete' });
  await scan();
  assert.equal(B.getFirstSync('SELECT sync_status FROM dose_logs WHERE id = ?', [miss]).sync_status, 'deleted');
  assert.equal(liveRows(B, 'Missed').length, 0, 'and no new Missed rows for an ended protocol');
});

test('A-123 F4: back from the background on a new day, the other phone\'s dose only in the cloud -> no Missed before the sync', async () => {
  const cloud = makeCloud();
  const B = makeDb();
  const p = await seedProtocol(B, cloud);
  const sync = fakeSync(true);
  const { scan, firstSyncGate } = phone(B, sync);
  sync.emit({ type: 'sync_complete' }); // the session's first sync, the evening before
  sync.clock += 14 * 3600000; // a night in the background
  await otherPhoneLogs(cloud, p.remote, 'Taken', at(1, 8, 10)); // phone A logged yesterday's dose meanwhile
  sync.foreground(); // AppState 'active': Today's refreshIfNewDay starts the scan
  assert.equal(firstSyncGate.isOpen(), false, 'closed again: "Still going?" waits on the same gate');
  const run = scan();
  await ticks();
  assert.equal(liveRows(B, 'Missed').length, 0, 'nothing written before the foreground sync');
  await pullChanges(B, cloud, USER);
  sync.emit({ type: 'sync_complete' });
  assert.equal(await run, 0);
  assert.equal(liveRows(B, 'Missed').length, 0, 'the dose arrived: no Missed row');
});

test('A-123 F4: the foreground close — fresh sync result, offline, a sync error', async () => {
  const s = fakeSync(true);
  const g = createFirstSyncGate(s);
  s.emit({ type: 'sync_complete' });
  s.clock += 30000;
  s.foreground();
  assert.equal(g.isOpen(), true, 'a result under a minute old (App.js syncs at most once a minute): stays open');
  s.clock += 60000;
  s.foreground();
  assert.equal(g.isOpen(), false, 'older: closed until the next result');
  s.emit({ type: 'sync_error' });
  assert.equal(g.isOpen(), true, 'an error is a result too');
  s.clock += 120000;
  s.online = false;
  s.foreground();
  assert.equal(g.isOpen(), true, 'known offline: no download is coming');
  // Without a foreground listener (older callers) the gate behaves as before.
  const g2 = createFirstSyncGate({ addSyncListener: s.addSyncListener, isOnlineNow: () => true });
  s.emit({ type: 'sync_complete' });
  assert.equal(g2.isOpen(), true);
});

test('A-123 F4: the app\'s gate listens to AppState, with the same minute as App.js\'s foreground sync', () => {
  const mod = read('lib/firstSyncGate.js');
  assert.match(mod, /import \{ AppState \} from 'react-native';/);
  assert.match(mod, /AppState\.addEventListener\('change'/);
  const gate = read('lib/stillGoingGate.js');
  const m = gate.match(/const FOREGROUND_FRESH_MS = (\d+);/);
  assert.ok(m, 'FOREGROUND_FRESH_MS');
  // App.js decides with the gate's own rule (isForegroundStale, same minute), so the two never drift.
  const app = read('App.js');
  assert.match(app, /import \{ isForegroundStale \} from '\.\/lib\/stillGoingGate';/);
  assert.match(app, /if \(!isForegroundStale\(nowTs, lastFgSync\)\) return;/, 'App.js asks for the foreground sync with the shared rule');
  assert.doesNotMatch(app, /nowTs - lastFgSync < \d+/, 'no second copy of the minute in App.js');
});

// ── Council fix 1 (founder 2026-10-16): the gate never stays closed ─────────────────────────────
// App.js asked for the foreground sync only when getSession() had a session AND nowTs - lastFgSync
// reached a minute: after the clock moved BACK the difference was negative (no sync asked), and with
// no session no sync ran — the gate, closed on foreground, waited for a result that never came, so
// the Missed scan and "Still going?" waited forever.
test('council fix 1: isForegroundStale — a minute or more, or a clock that moved back, is stale', () => {
  assert.equal(isForegroundStale(1000000, 1000000 - 30000), false, '30 s: fresh');
  assert.equal(isForegroundStale(1000000, 1000000 - 60000), true, 'a minute: stale');
  assert.equal(isForegroundStale(1000000, 1000000 + 3 * 3600000), true, 'clock moved back 3 h: stale, not "fresh"');
  assert.equal(isForegroundStale(1000000, 0), true, 'never synced: stale');
});

test('council fix 1: clock moved back -> the gate closes, asks for a sync itself, and opens on its result', async () => {
  const s = fakeSync(true);
  const g = createFirstSyncGate(s);
  s.emit({ type: 'sync_complete' });
  s.clock -= 3 * 3600000; // the user (or the test) moves the clock back 3 h
  s.foreground();
  assert.equal(g.isOpen(), false, 'a result "from the future" is not fresh: closed');
  assert.equal(s.requests, 1, 'the gate asked lib/sync for the sync it waits on');
  let opened = false;
  g.whenOpen().then(() => { opened = true; });
  s.emit({ type: 'sync_start' });
  s.advance(60000); // a slow pass: past the cap, but a sync IS running
  await ticks();
  assert.equal(opened, false, 'A-123: never open before a real sync result that is coming');
  s.emit({ type: 'sync_complete' });
  await ticks();
  assert.equal(opened, true, 'the result opens it');
});

test('council fix 1: no session (App.js asks no sync) -> the gate asks itself; if no pass starts it reopens after the cap', async () => {
  const s = fakeSync(true);
  const g = createFirstSyncGate(s);
  s.emit({ type: 'sync_complete' });
  s.advance(2 * 60000);
  s.foreground();
  assert.equal(g.isOpen(), false);
  assert.equal(s.requests, 1, 'asked for a sync even though App.js had no session');
  let opened = false;
  g.whenOpen().then(() => { opened = true; });
  s.advance(FOREGROUND_CAP_MS - 1000);
  await ticks();
  assert.equal(opened, false, 'still waiting inside the cap');
  s.advance(1000); // no sync_start ever came (no pass will run)
  await ticks();
  assert.equal(opened, true, 'the cap opens it: the scan and "Still going?" never wait forever');
  assert.equal(g.isOpen(), true);
  assert.ok(FOREGROUND_CAP_MS > 0 && FOREGROUND_CAP_MS <= 20000, 'about 15 s');
});

test('council fix 1: a pass that starts inside the cap keeps the gate closed until its result; an import does too', async () => {
  for (const start of ['sync_start', 'import_start']) {
    const s = fakeSync(true);
    const g = createFirstSyncGate(s);
    s.emit({ type: 'sync_complete' });
    s.advance(2 * 60000);
    s.foreground();
    s.advance(2000);
    s.emit({ type: start });
    s.advance(FOREGROUND_CAP_MS * 3);
    assert.equal(g.isOpen(), false, `${start}: the cap is off once a pass runs`);
    s.emit({ type: start === 'sync_start' ? 'sync_error' : 'import_complete' });
    assert.equal(g.isOpen(), true, `${start}: its result opens it`);
  }
});

test('council fix 1: before the session\'s first sync result the foreground neither asks a sync nor arms the cap', async () => {
  // At launch the startup sync is still coming (App.js, after the session is restored): an early
  // pass with no user yet would "settle" the gate before the real download (A-123).
  const s = fakeSync(true);
  const g = createFirstSyncGate(s);
  s.foreground();
  assert.equal(s.requests, 0);
  s.advance(FOREGROUND_CAP_MS * 4);
  assert.equal(g.isOpen(), false, 'still waits for the startup result');
  s.emit({ type: 'sync_complete' });
  assert.equal(g.isOpen(), true);
});

test('council fix 1: the app\'s gate is given lib/sync requestSync', () => {
  const mod = read('lib/firstSyncGate.js');
  assert.match(mod, /import \{ addSyncListener, isOnlineNow, requestSync \} from '\.\/sync';/);
  assert.match(mod, /createFirstSyncGate\(\{ addSyncListener, isOnlineNow, addForegroundListener, requestSync \}\)/);
});
