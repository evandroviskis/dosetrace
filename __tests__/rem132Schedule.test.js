'use strict';
// 1.3.2 — the reminder (REM) defects of the 1.3.0 audit, scheduling side (lib/notifications,
// lib/notificationPlan, lib/reminderRefresh, lib/backgroundTasks, the sync listener).
// docs/product/DIVERGENCES.md DV-046, DV-047, DV-048, DV-051, DV-052, DV-053, DV-054, DV-055,
// DV-139, DV-224, DV-225, DV-045 (registration). Each runs the REAL code (helpers/extractFn) with
// fakes, and failed on the code before its fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');

function fakeN(ids = []) {
  const scheduled = new Map(ids.map((id) => [id, { identifier: id, content: { data: {} } }]));
  return {
    scheduled, added: [], cancelled: [],
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { this.cancelled.push(id); scheduled.delete(id); },
    async scheduleNotificationAsync(req) { this.added.push(req); scheduled.set(req.identifier || `x${this.added.length}`, req); return req.identifier; },
  };
}
const memStore = (init = {}) => { const m = { ...init }; return { m, getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = String(v); }, removeItem: async (k) => { delete m[k]; } }; };

// ── DV-046 (DL-47): a refresh is OK only when the reminders were rebuilt ─────────────────────────
const { runReminderRefresh } = require('../lib/reminderRefresh');
function refreshDeps(over = {}) {
  const runs = [];
  return { runs, d: { now: () => 1000, isWipePending: async () => null, ensureDb: () => true, readStoredUser: async () => ({ id: 'u1' }),
    setBackgroundRun: () => {}, syncAllNotifications: async () => ({ ok: true }), countScheduled: async () => 12, saveLastRun: async (r) => { runs.push(r); }, ...over } };
}
test('DV-046: the database does not open → the run is recorded ok: false, nothing is resynced', async () => {
  let synced = 0;
  const { d, runs } = refreshDeps({ ensureDb: () => false, syncAllNotifications: async () => { synced++; return { ok: true }; } });
  const r = await runReminderRefresh(d);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'db_closed');
  assert.equal(synced, 0);
  assert.equal(runs[0].ok, false);
});
test('DV-046: the resync could not rebuild the dose reminders → ok: false; a good run keeps its count', async () => {
  const bad = refreshDeps({ syncAllNotifications: async () => ({ ok: false, reason: 'error' }) });
  assert.equal((await runReminderRefresh(bad.d)).ok, false);
  const good = refreshDeps();
  const r = await runReminderRefresh(good.d);
  assert.equal(r.ok, true); assert.equal(r.scheduled, 12);
});
test('DV-046: saveLastRun keeps the scheduled count; the dose resync reports a failed read', async () => {
  const mem = {};
  const AsyncStorage = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; } };
  const save = loadFn('lib/backgroundTasks.js', 'export async function saveLastRun(', 'saveLastRun', { AsyncStorage, LAST_RUN_KEY: 'L' });
  await save({ at: 5, ok: true, reason: null, scheduled: 31 });
  assert.equal(JSON.parse(mem.L).scheduled, 31);
  const fn = loadFn('lib/notifications.js', 'async function syncAllDoseRemindersNow(', 'syncAllDoseRemindersNow', {
    usesServerPush: () => false, getCachedUser: async () => ({ id: 'u1', user_metadata: {} }),
    getActiveProtocols: () => { throw new Error('database not open'); },
  });
  assert.deepEqual(await fn(), { ok: false, reason: 'error' });
});

// ── DV-045: the registration time is stored once ───────────────────────────────────────────────
test('DV-045: the refresh registration time is stored at the first registration and never moved', async () => {
  const store = memStore();
  const mark = loadFn('lib/backgroundTasks.js', 'export async function markRegistered(', 'markRegistered', { AsyncStorage: store, REGISTERED_AT_KEY: 'R' });
  assert.equal(await mark(store, 100), true);
  assert.equal(await mark(store, 999), false);
  assert.equal(store.m.R, '100');
  assert.match(sliceBlock(read('lib/backgroundTasks.js'), 'export async function registerReminderRefresh('), /await markRegistered\(\);/);
  assert.match(sliceBlock(read('lib/notifications.js'), 'export async function readReminderHealth('), /dosetrace_refresh_registered_at/);
});

// ── DV-047: Silent mode as the account has it now ──────────────────────────────────────────────
function silentReader({ fresh, cached }) {
  const deps = { getFreshUser: async () => fresh, getCachedUser: async () => cached, _silent: null, _silentAt: 0, SILENT_TTL_MS: 30000 };
  return loadFn('lib/notifications.js', 'async function silentNow(', 'silentNow', deps);
}
test('DV-047: cache false, user_metadata true → scheduleDoseReminder schedules nothing', async () => {
  const silentNow = silentReader({ fresh: { user_metadata: { silent_mode: true } }, cached: { user_metadata: { silent_mode: false } } });
  const scheduleReq = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', { silentNow, androidChannelRequest: plan.androidChannelRequest, withFireMs: plan.withFireMs, Platform: { OS: 'ios' } });
  const N = fakeN();
  const schedule = loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', {
    Platform: { OS: 'ios' }, getActiveProtocols: () => [{ id: 1 }], doseBudget: plan.doseBudget, getNotifications: () => N,
    getT: async () => Object.assign((k) => k, { language: 'en' }), isPersistentEnabled: async () => false, fill: (s) => s,
    decimalText: String, unitText: String, ymd: plan.ymd, handledSlotIndexes: plan.handledSlotIndexes, getTodayLogs: () => [],
    showNamesInNotifications: async () => true, protocolDisplayName: () => 'X', needsSiteQuestion: () => false, FOLLOWUP_DELAYS: [5, 10],
    doseSlots: plan.doseSlots, snoozedDoseSlots: async () => new Set(), scheduleReq,
  });
  const start = new Date(); start.setDate(start.getDate() - 1);
  await schedule({ id: 1, user_id: 'u1', reminder_time: '08:00,20:00', interval_days: 1, start_date: plan.ymd(start), type: 'oral' }, 24, 10);
  assert.equal(N.added.length, 0, 'nothing scheduled while the account says Silent');
  // The account says not silent: the reminders are scheduled.
  const on = silentReader({ fresh: { user_metadata: {} }, cached: { user_metadata: { silent_mode: true } } });
  assert.equal(await on(), false);
  // Offline / no fresh read: the cached value as before.
  assert.equal(await silentReader({ fresh: null, cached: { user_metadata: { silent_mode: true } } })(), true);
});
test('DV-047: the fresh read never goes to the network in the background run or a headless action', async () => {
  let asked = 0;
  const req = () => ({ supabase: { auth: { getUser: async () => { asked++; return { data: { user: { user_metadata: { silent_mode: true } } } }; } } } });
  const bg = loadFn('lib/notifications.js', 'async function getFreshUser(', 'getFreshUser', { _background: true, AppState: { currentState: 'active' }, require: req });
  assert.equal(await bg(), null);
  const headless = loadFn('lib/notifications.js', 'async function getFreshUser(', 'getFreshUser', { _background: false, AppState: { currentState: 'background' }, require: req });
  assert.equal(await headless(), null);
  assert.equal(asked, 0);
  const fg = loadFn('lib/notifications.js', 'async function getFreshUser(', 'getFreshUser', { _background: false, AppState: { currentState: 'active' }, require: req });
  assert.equal((await fg()).user_metadata.silent_mode, true);
});

// ── DV-048 (AD-25): "Nothing new logged" goes through the Silent gate and the dose channel ──────
function nothingLogged({ silent }) {
  const N = fakeN();
  const scheduleReq = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', { silentNow: async () => silent, androidChannelRequest: plan.androidChannelRequest, withFireMs: plan.withFireMs, Platform: { OS: 'android' } });
  const postInfoNotice = loadFn('lib/notifications.js', 'export async function postInfoNotice(', 'postInfoNotice', { getNotifications: () => N, scheduleReq, Platform: { OS: 'android' } });
  const fn = loadFn('lib/notificationActions.js', 'async function notifyNothingLogged(', 'notifyNothingLogged', {
    Platform: { OS: 'android' }, N, readAppLanguage: async () => 'pt', postInfoNotice, require: (m) => require(m.replace('../i18n/', '../i18n/')),
  });
  return { N, run: fn };
}
test('DV-048: Silent on → "Nothing new logged" is not posted; off → posted on the dose channel, in the app language', async () => {
  const off = nothingLogged({ silent: true });
  await off.run();
  assert.equal(off.N.added.length, 0);
  const on = nothingLogged({ silent: false });
  await on.run();
  assert.equal(on.N.added.length, 1);
  assert.equal(on.N.added[0].trigger.channelId, 'dose-reminders');
  const T = require('../i18n/translations.js').translations;
  assert.equal(on.N.added[0].content.title, T.pt.notif_taken_nothing_title);
  assert.doesNotMatch(read('lib/notificationActions.js'), /N\.scheduleNotificationAsync\(/, 'no direct post left');
});

// ── DV-051: one re-plan after a protocol / vial write ──────────────────────────────────────────
test('DV-051: afterProtocolChange re-plans doses, the morning summary and the vial alerts; a delete cancels first', async () => {
  const calls = [];
  const fn = loadFn('lib/notifications.js', 'export async function afterProtocolChange(', 'afterProtocolChange', {
    cancelDoseReminder: async (id) => calls.push(['cancel', id]), syncAllDoseReminders: async () => calls.push(['doses']),
    syncMorningSummary: async () => calls.push(['summary']), syncVialAlerts: async () => calls.push(['vials']),
    askPermissionForReminders: async (ps) => calls.push(['ask', ps.map((p) => p.id)]),
  });
  await fn({ removedIds: [4] });
  assert.deepEqual(calls, [['cancel', 4], ['doses'], ['summary'], ['vials']]);
  calls.length = 0;
  await fn({ saved: { id: 9 } });
  assert.deepEqual(calls, [['doses'], ['summary'], ['vials'], ['ask', [9]]]);
});
test('DV-051: delete a protocol → the summary plan excludes it (every Protocols write goes through afterProtocolChange)', () => {
  // The summary is planned from the ACTIVE protocols, so the re-plan after the delete leaves it out.
  const today = '2026-10-20';
  const ps = [{ id: 1, name: 'BPC-157', start_date: today, interval_days: 1 }, { id: 2, name: 'TB-500', start_date: today, interval_days: 1 }];
  const after = plan.morningSummaryPlan(ps.filter((p) => p.id !== 2), today, 7, 45);
  assert.ok(after.every((d) => !(d.list || []).includes('TB-500')));
  const src = read('screens/ProtocolsScreen.js');
  assert.doesNotMatch(src, /scheduleDoseReminder\(/, 'no write re-plans only its doses any more');
  for (const fnName of ['async function deleteProtocol(id) {', 'function deleteEndedProtocol(p) {', 'function confirmPurge(ids) {']) {
    assert.match(sliceBlock(src, fnName), /afterProtocolChange\(\{ removedIds: /, fnName);
  }
  for (const fnName of ['async function restoreProtocol(id) {', 'function refillVial(id) {', 'function refillOralBottle(id) {']) {
    assert.match(sliceBlock(src, fnName), /afterProtocolChange\(/, fnName);
  }
  assert.match(src, /if \(protocolData\) afterProtocolChange\(\{ saved: protocolData \}\)/, 'create');
  assert.match(src, /if \(editedProtocol\) afterProtocolChange\(\{ saved: editedProtocol \}\)/, 'edit');
  assert.match(src, /if \(restarted\) afterProtocolChange\(\{ saved: restarted \}\)/, 'restart');
});

// ── DV-052 (TRD H-9): a pull with another device's dose logs re-plans the reminders ─────────────
test('DV-052: pull with a Taken row for today → the sync reports dose_logs and the reminders are re-planned', async () => {
  const { makeDb, makeCloud } = require('./helpers/syncHarness');
  const { pullChanges } = require('../lib/syncCore');
  const db = makeDb();
  const cloud = makeCloud();
  const p = await cloud.insert('protocols', { user_id: 'u1', name: 'BPC-157', type: 'recon', dose: '250', dose_unit: 'mcg', interval_days: 1, doses_per_day: 1, active: 1 });
  const first = await pullChanges(db, cloud, 'u1');
  assert.ok(first.changed.includes('protocols'));
  // Phone A logs today's dose as Taken; phone B pulls it.
  await cloud.insert('dose_logs', { user_id: 'u1', protocol_id: p.data.id, outcome: 'Taken', logged_at: new Date().toISOString(), dose: '250', dose_unit: 'mcg' });
  const r = await pullChanges(db, cloud, 'u1');
  assert.deepEqual(r.changed, ['dose_logs']);
  assert.equal(plan.syncEventNeedsResync({ type: 'sync_complete', changed: r.changed }), true);
  // Nothing new → no re-plan; food logs alone → no dose re-plan.
  assert.deepEqual((await pullChanges(db, cloud, 'u1')).changed, []);
  assert.equal(plan.syncEventNeedsResync({ type: 'sync_complete', changed: [] }), false);
  assert.equal(plan.syncEventNeedsResync({ type: 'sync_complete', changed: ['food_logs'] }), false);
  assert.equal(plan.syncEventNeedsResync({ type: 'import_complete' }), true);
  // Wiring: the pass reports the tables, the event carries them, App.js re-plans on them.
  assert.match(read('lib/syncPassCore.js'), /return \{ ran: true, changed \};/);
  assert.match(read('lib/sync.js'), /\{ type: 'sync_complete', changed: \(r && r\.changed\) \|\| \[\] \}/);
  assert.match(read('App.js'), /if \(syncEventNeedsResync\(e\)\) syncAllNotifications\(\)\.catch/);
});

// ── DV-053: iPhone's 64 cap — the TOTAL of every kind, soonest first ───────────────────────────
function iosPlanned(protocolCount, vials) {
  const b = plan.doseBudget({ os: 'ios', protocolCount, expiryAlerts: vials });
  // Every protocol can fill its share (daily, 3 times a day, persistent repeats).
  const now = new Date(2026, 9, 20, 6, 0, 0, 0);
  const slotsById = {};
  for (let i = 1; i <= protocolCount; i++) {
    slotsById[i] = plan.doseSlots({ protocol: { id: i, reminder_time: '08:00,14:00,20:00', interval_days: 1, start_date: '2026-10-01' }, now, windowDays: b.windowDays, persistent: true });
  }
  const shares = plan.allocateSoonest(slotsById, b.total);
  const doses = Object.values(shares.counts).reduce((a, n) => a + n, 0);
  return { doses, total: doses + vials + plan.IOS_OTHER_RESERVED, shares, slotsById };
}
test('DV-053: 25 protocols + 10 vials (every other kind at its most) → planned ≤ 64', () => {
  const r = iosPlanned(25, 10);
  assert.ok(r.total <= 64, `planned ${r.total}`);
  // Soonest first: every reminder kept fires before every reminder left out, and the time of the
  // first one left out is recorded (nothing dropped silently).
  const kept = []; const left = [];
  for (const id of Object.keys(r.slotsById)) r.slotsById[id].forEach((s, i) => (i < r.shares.counts[id] ? kept : left).push(s.fireMs));
  assert.ok(Math.max(...kept) <= Math.min(...left));
  assert.equal(r.shares.untilMs, Math.min(...left));
  for (const [n, v] of [[1, 0], [10, 8], [40, 20], [60, 60]]) assert.ok(iosPlanned(n, v).total <= 64 || v > 64 - plan.IOS_OTHER_RESERVED, `n=${n} v=${v}`);
});
test('DV-053: the guard keeps the soonest 64 and records when the first one cut would have fired', () => {
  const list = Array.from({ length: 70 }, (_, i) => ({ identifier: `n${i}`, content: { data: { type: 'dose_reminder', fireMs: 1000 + (69 - i) } } }));
  const { cancel, untilMs } = plan.trimToCap(list, 64, {});
  assert.equal(cancel.length, 6);
  assert.deepEqual(cancel.sort(), ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
  assert.equal(untilMs, 1000 + 64);
  assert.deepEqual(plan.trimToCap(list.slice(0, 64), 64, {}).cancel, []);
});
test('DV-053: the full iPhone resync shares the dose total soonest first and records it', async () => {
  const store = memStore();
  const fn = loadFn('lib/notifications.js', 'async function iosDoseShares(', 'iosDoseShares', {
    isPersistentEnabled: async () => false, snoozedDoseSlots: async () => new Set(), ymd: plan.ymd, handledSlotIndexes: plan.handledSlotIndexes,
    getTodayLogs: () => [], doseSlots: plan.doseSlots, FOLLOWUP_DELAYS: [5, 10], allocateSoonest: plan.allocateSoonest, AsyncStorage: store, PENDING_CAP_KEY: 'C',
  });
  const start = '2026-01-01';
  const ps = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, user_id: 'u', reminder_time: '08:00,20:00', interval_days: 1, start_date: start }));
  const shares = await fn(ps, { total: 20, windowDays: 10 });
  assert.equal(Object.values(shares.counts).reduce((a, n) => a + n, 0), 20);
  const rec = JSON.parse(store.m.C);
  assert.ok(Number.isFinite(rec.untilMs) && rec.dropped > 0);
  assert.match(sliceBlock(read('lib/notifications.js'), 'async function syncAllDoseRemindersNow('), /Platform\.OS === 'ios' \? await iosDoseShares\(protocols, b\)/);
});

// ── DV-054 (AD-88): no permission request at app open or sign-in ───────────────────────────────
test('DV-054: onboarding "Not now" → boot and sign-in never call the permission request', () => {
  const app = read('App.js');
  assert.doesNotMatch(app, /requestNotificationPermissions/, 'App.js never asks');
  assert.doesNotMatch(sliceBlock(read('lib/notifications.js'), 'export async function registerPushToken('), /requestNotificationPermissions|requestPermissionsAsync/);
});
test('DV-054: the first save (or first sync arrival) of a protocol with a reminder time asks once', async () => {
  const store = memStore();
  let asked = 0;
  const fn = loadFn('lib/notifications.js', 'export async function askPermissionForReminders(', 'askPermissionForReminders', {
    reminderTimes: plan.reminderTimes, AsyncStorage: store, PERMISSION_ASKED_KEY: 'P',
    requestNotificationPermissions: async () => { asked++; return false; }, syncAllNotifications: async () => {}, registerPushToken: async () => {},
  });
  assert.equal(await fn([]), false, 'no protocol → not asked');
  assert.equal(asked, 0);
  assert.equal(await fn([{ id: 1, reminder_time: '08:00' }]), true);
  assert.equal(await fn([{ id: 2, reminder_time: '09:00' }]), false, 'never twice on this phone');
  assert.equal(asked, 1);
  assert.match(read('App.js'), /askPermissionForArrivedProtocols\(\)\.catch/);
});

// ── DV-055: the weekly check-in as dated one-shots ─────────────────────────────────────────────
test('DV-055: the plan returns dated triggers for the next Sundays at 10:00, no weekly repeat', async () => {
  const wed = new Date(2026, 9, 21, 12, 0, 0, 0).getTime(); // Wednesday
  const p = plan.checkinPlan(wed, 3);
  assert.deepEqual(p.map((x) => x.id), ['checkin-2026-10-25', 'checkin-2026-11-01', 'checkin-2026-11-08']);
  for (const x of p) { const d = new Date(x.fireMs); assert.equal(d.getDay(), 0); assert.equal(d.getHours(), 10); }
  const sunAfter = new Date(2026, 9, 25, 11, 0, 0, 0).getTime(); // Sunday after 10:00 → next week
  assert.equal(plan.checkinPlan(sunAfter, 1)[0].id, 'checkin-2026-11-01');
  const N = fakeN(['checkin-weekly']);
  const fn = loadFn('lib/notifications.js', 'export async function syncCheckinReminder(', 'syncCheckinReminder', {
    getNotifications: () => N, getCachedUser: async () => ({ id: 'u', user_metadata: {} }), getT: async () => (k) => k,
    checkinPlan: plan.checkinPlan, CHECKIN_WEEKS: plan.CHECKIN_WEEKS, Platform: { OS: 'android' },
    scheduleReq: async (n, req) => n.scheduleNotificationAsync(req),
    cancelUnwanted: loadFn('lib/notifications.js', 'async function cancelUnwanted(', 'cancelUnwanted'),
  });
  await fn();
  assert.ok(N.added.length === 3 && N.added.every((r) => r.trigger.type === 'date' && Number.isFinite(r.trigger.date)));
  assert.ok(!N.scheduled.has('checkin-weekly'), 'the old repeating check-in is cancelled');
  assert.doesNotMatch(sliceBlock(read('lib/notifications.js'), 'export async function syncCheckinReminder('), /type: 'weekly'/);
});

// ── DV-224: a snoozed persistent reminder's +5/+10 repeats are not re-added ─────────────────────
test('DV-224: stored snooze for t0 + resync at slot + 1 min → no dose-…-t0-f* scheduled', async () => {
  const RealDate = Date;
  const slot = new RealDate(2026, 9, 20, 8, 0, 0, 0).getTime();
  const NOW = slot + 60 * 1000;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const snoozes = [{ id: 'snz-dose-1-2026-10-20-t0', origId: 'dose-1-2026-10-20-t0', fireAt: NOW + 3600e3, dose: { protocolId: 1, dayKey: '2026-10-20', ti: 0 } }];
  const snoozedDoseSlots = loadFn('lib/notifications.js', 'async function snoozedDoseSlots(', 'snoozedDoseSlots', { Date: FakeDate, loadSnoozes: async () => snoozes });
  const N = fakeN();
  const fn = loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', {
    Date: FakeDate, Platform: { OS: 'android' }, getActiveProtocols: () => [{ id: 1 }], doseBudget: plan.doseBudget, getNotifications: () => N,
    getT: async () => Object.assign((k) => k, { language: 'en' }), isPersistentEnabled: async () => true, fill: (s) => s,
    decimalText: String, unitText: String, ymd: plan.ymd, handledSlotIndexes: plan.handledSlotIndexes, getTodayLogs: () => [],
    showNamesInNotifications: async () => true, protocolDisplayName: () => 'X', needsSiteQuestion: () => false, FOLLOWUP_DELAYS: [5, 10],
    doseSlots: plan.doseSlots, snoozedDoseSlots, scheduleReq: async (n, req) => n.scheduleNotificationAsync(req),
  });
  await fn({ id: 1, user_id: 'u', reminder_time: '08:00', interval_days: 1, start_date: '2026-10-19', type: 'oral' }, 60, 3);
  const ids = N.added.map((r) => r.identifier);
  assert.ok(!ids.some((id) => id.startsWith('dose-1-2026-10-20-t0-f')), ids.join(','));
  assert.ok(ids.includes('dose-1-2026-10-21-t0-f0'), "tomorrow's repeats are still planned");
});

// ── DV-225: a switched-off kind's snoozed copies go too ────────────────────────────────────────
test('DV-225: switch off + stored vial_low snooze → the copy is cancelled and the record dropped', async () => {
  const future = Date.now() + 3600e3;
  const list = [
    { id: 'snz-vial-low-7', origId: 'vial-low-7', fireAt: future, createdAt: 2, data: { type: 'vial_low', remaining: 2 } },
    { id: 'snz-checkin-2026-10-25', origId: 'checkin-2026-10-25', fireAt: future, createdAt: 1, data: { type: 'checkin_reminder' } },
  ];
  const N = fakeN(list.map((r) => r.id));
  let saved = null;
  const fn = loadFn('lib/notifications.js', 'async function restoreSnoozesLocked(', 'restoreSnoozesLocked', {
    getNotifications: () => N, loadSnoozes: async () => list, getCachedUser: async () => ({ user_metadata: { vial_alerts: false } }),
    pruneSnoozes: plan.pruneSnoozes, snoozeKindOff: plan.snoozeKindOff, doseSlotResolved: () => false, getT: async () => (k) => k, fill: (s) => s,
    isOne: () => false, scheduleSnoozeCopy: async () => {}, saveSnoozes: async (l) => { saved = l; },
  });
  await fn();
  assert.ok(N.cancelled.includes('snz-vial-low-7'));
  assert.ok(!N.cancelled.includes('snz-checkin-2026-10-25'), 'other kinds stay');
  assert.deepEqual(saved.map((r) => r.id), ['snz-checkin-2026-10-25']);
  // Every kind follows its own switch.
  assert.equal(plan.snoozeKindOff(list[1], { checkin_reminders: false }), true);
  assert.equal(plan.snoozeKindOff({ id: 'snz-food-log-2026-10-20', data: { type: 'food_log' } }, { food_reminders: false }), true);
  assert.equal(plan.snoozeKindOff({ id: 'snz-dose-1-2026-10-20-t0', dose: {} }, { dose_reminders: false }), true);
  assert.equal(plan.snoozeKindOff(list[0], {}), false);
});

// ── DV-139: "Next reminder" is the earliest of any kind ────────────────────────────────────────
test('DV-139: a pending snooze in 10 min is shown as next', () => {
  const now = 1_000_000;
  const list = [
    { identifier: 'dose-1-2026-10-20-t1', content: { title: 'BPC-157', data: { type: 'dose_reminder', protocolId: 1, slotMs: now + 2 * 3600e3, fireMs: now + 2 * 3600e3 } } },
    // A snoozed copy keeps the ORIGINAL (past) slot; it fires at its record's time.
    { identifier: 'snz-dose-1-2026-10-20-t0', content: { title: 'BPC-157', data: { type: 'dose_reminder', protocolId: 1, slotMs: now - 3600e3, snoozed: true } } },
    { identifier: 'reminder-test', content: { data: { type: 'reminder_test', fireMs: now + 1000 } } },
  ];
  const next = plan.nextScheduled(list, now, { 'snz-dose-1-2026-10-20-t0': now + 10 * 60e3 });
  assert.equal(next.atMs, now + 10 * 60e3);
  // A follow-up or the morning summary can be next too.
  assert.equal(plan.nextScheduled([{ identifier: 'summary-x', content: { title: 'Good morning', data: { type: 'morning_summary', fireMs: now + 60e3 } } }, list[0]], now, {}).type, 'morning_summary');
  // Every dated request records its fire time on the way in (iPhone reports only an interval).
  assert.equal(plan.withFireMs({ content: { data: { type: 'x' } }, trigger: { type: 'date', date: 42 } }).content.data.fireMs, 42);
  assert.equal(plan.withFireMs({ content: { data: {} }, trigger: null }).content.data.fireMs, undefined);
});
