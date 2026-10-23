'use strict';
// A-177 (found 2026-10-23 while verifying A-176 on build 6): an app-written "Missed" row sits next
// to a "Taken" of the same protocol that was already in the cloud before the Missed was written —
// the journal shows a miss that did not happen. Real account: daily 1-dose protocols (20:30 /
// 20:45), Taken 10–140 min from the slot, Missed written 1–3 days later, two iPhones. Cause: the
// phone that wrote the Missed had not pulled the Taken when it scanned — the scan's gate
// (lib/firstSyncGate) also opens on sync_error, offline or a 15 s cap, so it judged without fresh
// data; and the A-123 cleanup can never remove these rows (no zone-history slots before the
// upgrade, schedule ledger starts now, exact-instant match, 14-day window).
// Fix: (1) PREVENT — a slot is written as Missed only when a SUCCESSFUL pull of dose_logs finished
// after slot + 12 h (lib/pullStamp, recorded by lib/sync.js, passed in as opts.pulledThroughMs);
// (2) CLEAN — a zone-free rule over 60 days (lib/missedDoses falseMissedRows) removes an
// app-written Missed of a 1-dose/day protocol when a Taken / Skipped of that protocol lies within
// ±3 h and this Missed is the nearest Missed to it.
// The wall clock of these rows is New York's (the real account's phone): the Gate B rule below reads
// a Missed's local time.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMissedDoses, falseMissedRows, LATE_MS } = require('../lib/missedDoses');
const S = require('../lib/pullStamp');
const { pullChanges, fullImport } = require('../lib/syncCore');
const SH = require('./helpers/syncHarness');
const { loadFn, read } = require('./helpers/extractFn');

const NOW = Date.parse('2026-10-23T18:00:00Z');
const proto = (id, over = {}) => ({ id, remote_id: 'rp' + id, user_id: 'u', created_at: '2026-09-01T00:00:00Z', frequency: 'daily', interval_days: 1, doses_per_day: 1, reminder_time: '20:30', start_date: '2026-09-01', active: 1, ...over });
let seq = 0;
const row = (pid, outcome, loggedAt, over = {}) => ({ id: ++seq, protocol_id: pid, protocol_remote_id: 'rp' + pid, outcome, logged_at: loggedAt, injection_site: null, ...over });
const ids = (rows) => rows.map((r) => r.id).sort((a, b) => a - b);

// The six pairs on the real account (Missed slot vs the Taken already in the cloud).
const REAL = [
  ['2026-10-07T01:45:00.000Z', '2026-10-07T00:35:56.000Z', '20:45'],
  ['2026-10-07T01:30:00.000Z', '2026-10-07T02:09:07.000Z', '20:30'],
  ['2026-10-16T00:30:00.000Z', '2026-10-16T01:51:47.000Z', '20:30'],
  ['2026-10-19T00:45:00.000Z', '2026-10-19T01:42:22.000Z', '20:45'],
  ['2026-10-19T00:30:00.000Z', '2026-10-19T01:45:52.000Z', '20:30'],
  ['2026-10-22T00:30:00.000Z', '2026-10-22T02:50:40.000Z', '20:30'],
];

test('A-177: the real false Missed rows next to a Taken are removed when they sit at a dose time of the schedule; the Taken rows never', () => {
  const protocols = REAL.map((_, i) => proto(i + 1, { reminder_time: REAL[i][2] }));
  const missed = REAL.map(([m], i) => row(i + 1, 'Missed', m));
  const taken = REAL.map(([, t], i) => row(i + 1, 'Taken', t));
  const gone = falseMissedRows(protocols, [...missed, ...taken], NOW, { lookbackDays: 60 });
  // Gate B: the two 10-07 rows were written at 20:45 / 20:30 of a UTC−5 clock — 21:45 / 21:30 on this
  // phone, no dose time of the schedule — so nothing proves they are not a real miss: kept.
  assert.deepEqual(ids(gone), ids(missed.slice(2)));
  // A Skipped covers the same way (the user answered that dose).
  const p = proto(7);
  const m = row(7, 'Missed', '2026-10-20T00:30:00.000Z');
  assert.deepEqual(ids(falseMissedRows([p], [m, row(7, 'Skipped', '2026-10-20T00:30:00.000Z')], NOW, { lookbackDays: 60 })), [m.id]);
});

test('A-177: an edited Missed (a site or a note) is kept — also when it is the nearest one', () => {
  const p = proto(1);
  const t = row(1, 'Taken', '2026-10-16T01:51:47.000Z');
  const site = row(1, 'Missed', '2026-10-16T00:30:00.000Z', { injection_site: '{"type":"subq","sites":["abdomen_ul"]}' });
  const note = row(1, 'Missed', '2026-10-16T00:30:00.000Z', { notes: 'forgot' });
  assert.deepEqual(falseMissedRows([p], [site, t], NOW), []);
  assert.deepEqual(falseMissedRows([p], [note, t], NOW), []);
  // The nearest Missed is the edited one: a plain one farther away is not taken instead.
  const farPlain = row(1, 'Missed', '2026-10-15T23:30:00.000Z');
  const nearSite = row(1, 'Missed', '2026-10-16T01:30:00.000Z', { injection_site: 'x' });
  assert.deepEqual(falseMissedRows([p], [farPlain, nearSite, t], NOW), []);
});

test('A-177: a 2-dose protocol and a protocol with a repeated dose time are untouched', () => {
  const two = proto(1, { doses_per_day: 2, reminder_time: '08:00,20:30' });
  const rep = proto(2, { reminder_time: '20:30,20:30' });
  const logs = [
    row(1, 'Missed', '2026-10-16T00:30:00.000Z'), row(1, 'Taken', '2026-10-16T01:51:47.000Z'),
    row(2, 'Missed', '2026-10-16T00:30:00.000Z'), row(2, 'Taken', '2026-10-16T01:51:47.000Z'),
  ];
  assert.deepEqual(falseMissedRows([two, rep], logs, NOW), []);
});

test('A-177: a Missed whose nearest Taken is 11 h away (the next morning) is kept', () => {
  const p = proto(1);
  const logs = [row(1, 'Missed', '2026-10-16T00:30:00.000Z'), row(1, 'Taken', '2026-10-16T11:30:00.000Z')];
  assert.deepEqual(falseMissedRows([p], logs, NOW), []);
  // Just past 3 h is kept too; exactly 3 h counts.
  assert.deepEqual(falseMissedRows([p], [row(1, 'Missed', '2026-10-16T00:30:00.000Z'), row(1, 'Taken', '2026-10-16T03:30:01.000Z')], NOW), []);
  const at3 = row(1, 'Missed', '2026-10-16T00:30:00.000Z');
  assert.deepEqual(ids(falseMissedRows([p], [at3, row(1, 'Taken', '2026-10-16T03:30:00.000Z')], NOW)), [at3.id]);
});

test('A-177: a Missed with seconds in logged_at (a user tap, not the scan) is kept', () => {
  const p = proto(1);
  for (const at of ['2026-10-16T00:30:17.000Z', '2026-10-16T00:30:00.250Z']) {
    assert.deepEqual(falseMissedRows([p], [row(1, 'Missed', at), row(1, 'Taken', '2026-10-16T01:51:47.000Z')], NOW), [], at);
  }
});

test('A-177: one Taken clears only one Missed — the nearest; a tie clears none', () => {
  // Gate B: the rows sit at the schedule's dose time (21:45 / 21:30 New York) so only nearness decides.
  const p = proto(1, { reminder_time: '21:45' });
  const t = row(1, 'Taken', '2026-10-16T01:40:00.000Z');
  const near = row(1, 'Missed', '2026-10-16T01:45:00.000Z');
  const far = row(1, 'Missed', '2026-10-16T01:30:00.000Z');
  assert.deepEqual(ids(falseMissedRows([p], [far, near, t], NOW)), [near.id]);
  const a = row(1, 'Missed', '2026-10-16T01:30:00.000Z');
  const b = row(1, 'Missed', '2026-10-16T01:50:00.000Z');
  assert.deepEqual(falseMissedRows([proto(1, { reminder_time: '21:30' })], [a, b, t], NOW), [], 'a dose exactly between two Missed rows cannot say which');
});

test('A-177: rows are matched to their protocol by cloud id, else local id; an unknown protocol is untouched', () => {
  const p = proto(1);
  // Same cloud protocol, a stale local id on the pulled Taken: still the same protocol.
  const m = row(1, 'Missed', '2026-10-16T00:30:00.000Z');
  const t = row(99, 'Taken', '2026-10-16T01:51:47.000Z', { protocol_remote_id: 'rp1' });
  assert.deepEqual(ids(falseMissedRows([p], [m, t], NOW)), [m.id]);
  // No cloud id on the rows: the local id matches.
  const m2 = row(1, 'Missed', '2026-10-17T00:30:00.000Z', { protocol_remote_id: null });
  const t2 = row(1, 'Taken', '2026-10-17T01:00:00.000Z', { protocol_remote_id: null });
  assert.deepEqual(ids(falseMissedRows([p], [m2, t2], NOW)), [m2.id]);
  // A Taken of ANOTHER protocol never clears it; a protocol not in the list is never touched.
  const other = row(2, 'Taken', '2026-10-16T01:51:47.000Z');
  assert.deepEqual(falseMissedRows([p, proto(2)], [m, other], NOW), []);
  assert.deepEqual(falseMissedRows([], [m, t], NOW), []);
  assert.deepEqual(falseMissedRows([p], [row(5, 'Missed', '2026-10-16T00:30:00.000Z'), row(5, 'Taken', '2026-10-16T01:00:00.000Z')], NOW), []);
});

test('A-177: the cleanup looks back 60 days (not the scan\'s 14), and no further', () => {
  const p = proto(1);
  const d40 = row(1, 'Missed', '2026-09-13T00:30:00.000Z');
  const old = row(1, 'Missed', '2026-08-20T00:30:00.000Z');
  const logs = [d40, row(1, 'Taken', '2026-09-13T01:10:00.000Z'), old, row(1, 'Taken', '2026-08-20T01:10:00.000Z')];
  assert.deepEqual(ids(falseMissedRows([p], logs, NOW, { lookbackDays: 60 })), [d40.id]);
});

// ── (1) PREVENT ────────────────────────────────────────────────
const P1 = { id: 1, user_id: 'u', created_at: '2026-10-01T00:00:00Z', frequency: 'daily', interval_days: 1, doses_per_day: 1, reminder_time: '20:30', start_date: '2026-10-01', active: 1 };
// Device-local slots (no zone history): yesterday's 20:30 on the machine running the test.
function yesterdaySlot(nowMs) {
  const d = new Date(nowMs); d.setDate(d.getDate() - 1); d.setHours(20, 30, 0, 0); return d.getTime();
}

test('A-177 prevent: a slot is written as Missed only after a successful pull that finished after slot + 12 h', () => {
  const now = new Date(2026, 9, 23, 18, 0, 0, 0).getTime(); // 18:00 on the test machine's clock
  const slot = yesterdaySlot(now);
  assert.ok(now - slot >= LATE_MS, 'yesterday\'s slot is due');
  const due = (opts) => computeMissedDoses([P1], [], now, 0, { lookbackDays: 1, ...opts }).map((m) => m.scheduledAtMs);
  // Without the option (other callers, older tests): as before.
  assert.deepEqual(due({}), [slot]);
  // The last good pull ended before slot + 12 h: the Taken from the other phone may not be here yet.
  assert.deepEqual(due({ pulledThroughMs: slot + LATE_MS - 1 }), []);
  // No successful pull known (offline, sync_error, the 15 s cap): no new Missed.
  assert.deepEqual(due({ pulledThroughMs: null }), []);
  assert.deepEqual(due({ pulledThroughMs: undefined }), [], 'passed but unknown counts as no pull');
  // A pull after slot + 12 h: judged as before.
  assert.deepEqual(due({ pulledThroughMs: slot + LATE_MS }), [slot]);
  assert.deepEqual(due({ pulledThroughMs: now }), [slot]);
  // A logged dose still covers the slot.
  assert.deepEqual(computeMissedDoses([P1], [{ protocol_id: 1, logged_at: new Date(slot + 600000).toISOString() }], now, 0, { lookbackDays: 1, pulledThroughMs: now }), []);
});

test('A-177 prevent: the pull stamp belongs to one user and a future stamp proves nothing', async () => {
  const mem = new Map();
  const storage = { getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); }, removeItem: async (k) => { mem.delete(k); } };
  assert.equal(await S.readDoseLogsPull(storage, 'u', NOW), null, 'never pulled');
  await S.recordDoseLogsPull(storage, 'u', NOW - 1000);
  assert.equal(await S.readDoseLogsPull(storage, 'u', NOW), NOW - 1000);
  assert.equal(await S.readDoseLogsPull(storage, 'other', NOW), null, 'another account never uses it');
  assert.equal(await S.readDoseLogsPull(storage, 'u', NOW - 2000), null, 'a clock put back: the stamp is ahead, no pull known');
  await S.forgetDoseLogsPull(storage);
  assert.equal(await S.readDoseLogsPull(storage, 'u', NOW), null);
  // Broken storage never throws.
  const bad = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); }, removeItem: async () => { throw new Error('x'); } };
  assert.equal(await S.readDoseLogsPull(bad, 'u', NOW), null);
  await S.recordDoseLogsPull(bad, 'u', NOW);
  await S.forgetDoseLogsPull(bad);
  assert.equal(S.pulledThroughMs('{not json', 'u', NOW), null);
});

test('A-177 prevent: pullChanges / fullImport report dose_logs as pulled only when its fetch had no error', async () => {
  const db = SH.makeDb();
  const cloud = SH.makeCloud();
  const good = await pullChanges(db, cloud, 'u');
  assert.ok(good && good.ok.includes('dose_logs'), JSON.stringify(good));
  const failing = { ...cloud, fetchSince: async (t, u, s) => (t === 'dose_logs' ? { data: [], error: new Error('timeout') } : cloud.fetchSince(t, u, s)) };
  const bad = await pullChanges(db, failing, 'u');
  assert.ok(!bad.ok.includes('dose_logs'), 'a failed dose_logs fetch is no successful pull');
  assert.ok(bad.ok.includes('protocols'), 'the other tables still report');
  const thrown = { ...cloud, fetchSince: async (t, u, s) => { if (t === 'dose_logs') throw new Error('offline'); return cloud.fetchSince(t, u, s); } };
  assert.ok(!(await pullChanges(db, thrown, 'u')).ok.includes('dose_logs'));
  const imp = await fullImport(SH.makeDb(), cloud, 'u');
  assert.ok(imp.ok.includes('dose_logs'));
  const impBad = await fullImport(SH.makeDb(), { ...cloud, fetchAll: async (t, u) => (t === 'dose_logs' ? { data: [], error: new Error('x') } : cloud.fetchAll(t, u)) }, 'u');
  assert.ok(!impBad.ok.includes('dose_logs'));
});

test('A-177 prevent: lib/sync.js records the pull time (taken before the pull) only for a successful dose_logs pull', async () => {
  const calls = [];
  const mk = (res) => loadFn('lib/sync.js', 'async function pullCloudChanges(', 'pullCloudChanges', {
    getCachedUser: async () => ({ id: 'u' }), ownerBlocksThisSync: () => false, getDB: () => ({}), cloud: {},
    pullChanges: async () => { calls.push('pull'); return res; },
    AsyncStorage: {}, recordDoseLogsPull: async (st, uid, ms) => { calls.push(['record', uid, typeof ms]); },
  });
  await mk({ ok: ['protocols', 'dose_logs'] })();
  assert.deepEqual(calls, ['pull', ['record', 'u', 'number']]);
  calls.length = 0;
  await mk({ ok: ['protocols'] })();
  assert.deepEqual(calls, ['pull'], 'no record when dose_logs did not pull');
  const src = read('lib/sync.js');
  const pull = src.slice(src.indexOf('async function pullCloudChanges('), src.indexOf('// Pull reality_check_open'));
  assert.ok(pull.indexOf('Date.now()') < pull.indexOf('await pullChanges('), 'the stamp is the time BEFORE the pull');
  // The record is awaited inside the pull, so it lands before syncPass emits sync_complete (the scan's gate).
  assert.match(pull, /await recordDoseLogsPull\(AsyncStorage, user\.id, /);
  const imp = src.slice(src.indexOf('export async function fullImportFromCloud('));
  assert.ok(imp.indexOf('forgetDoseLogsPull(AsyncStorage)') > -1 && imp.indexOf('forgetDoseLogsPull(AsyncStorage)') < imp.indexOf('await fullImport('), 'an import replaces the local data: the old stamp goes first');
  assert.match(imp, /recordDoseLogsPull\(AsyncStorage, user\.id, /);
});

test('A-177: scanMissedDoses always passes the pull time and runs the 60-day cleanup after the duplicates', () => {
  const src = read('lib/doseActions.js');
  const body = src.slice(src.indexOf('export async function scanMissedDoses'));
  assert.match(body, /const pulledThroughMs = await readDoseLogsPull\(AsyncStorage, user\.id, nowMs\)/);
  const call = body.slice(body.indexOf('computeMissedDoses(protocols, kept'));
  assert.match(call.slice(0, call.indexOf(';')), /pulledThroughMs/);
  assert.match(body, /falseMissedRows\(\[\.\.\.protocols, \.\.\.ended\], /);
  assert.ok(body.indexOf('duplicateMissedRows(') < body.indexOf('falseMissedRows('), 'after the A-176 duplicates');
  assert.ok(body.indexOf('falseMissedRows(') < body.indexOf('coveredMissedRows('), 'before A-123 and the judging');
  assert.match(body, /FALSE_MISSED_LOOKBACK_DAYS \+ 1\) \* 86400000/, 'its own 60-day read of the logs');
  assert.match(src, /const FALSE_MISSED_LOOKBACK_DAYS = 60;/);
});

test('A-177 Gate B: a real miss from an older schedule is never removed (2 doses a day → 1)', () => {
  // 08:00 and 10:00 a day; 08:00 taken, 10:00 really missed; the schedule is now 1 dose at 08:00.
  const p = proto(1, { reminder_time: '08:00' });
  const realMiss = row(1, 'Missed', '2026-10-16T14:00:00.000Z'); // 10:00 New York
  const taken = row(1, 'Taken', '2026-10-16T12:05:00.000Z'); // 08:05 New York
  assert.deepEqual(falseMissedRows([p], [realMiss, taken], NOW), [], 'it sits at no dose time of the schedule');
  // The same Missed at the schedule's own time is the false one (a Taken 5 min later covers it).
  const atSlot = row(1, 'Missed', '2026-10-16T12:00:00.000Z'); // 08:00 New York
  assert.deepEqual(ids(falseMissedRows([p], [atSlot, taken], NOW)), [atSlot.id]);
});

test('A-177 Gate B: the A-123 case stays — a 09:00 Missed (before the time moved to 08:00) next to a 09:30 Taken is kept', () => {
  const p = proto(1, { reminder_time: '08:00' });
  const odd = row(1, 'Missed', '2026-10-16T13:00:00.000Z'); // 09:00 New York
  const taken = row(1, 'Taken', '2026-10-16T13:30:00.000Z'); // 09:30 New York
  assert.deepEqual(falseMissedRows([p], [odd, taken], NOW), []);
});
