'use strict';
// 1.3.2 REM branch — Gate B review of 95bdc1a (coordinator, 2026-10-20): F1–F6, F8 and the DV-045
// split. Each test failed on 95bdc1a before its fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations;

const NOTIF = read('lib/notifications.js');
const memStore = (init = {}) => { const m = { ...init }; return { m, getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = String(v); }, removeItem: async (k) => { delete m[k]; } }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── F1: no network read of the user on any resync path (auth-js lock, SIGNED_OUT on a dead session) ─
test('F1: getUser is never called on any resync path; Silent comes from the cached user, re-read at each full resync', async () => {
  assert.doesNotMatch(NOTIF, /auth\.getUser\(/, 'lib/notifications never calls supabase.auth.getUser()');
  assert.doesNotMatch(NOTIF, /getFreshUser/);
  let reads = 0;
  const silentNow = loadFn('lib/notifications.js', 'async function silentNow(', 'silentNow', {
    getCachedUser: async () => { reads++; return { user_metadata: { silent_mode: true } }; }, _silent: null,
  });
  assert.equal(await silentNow(), true);
  assert.equal(await silentNow(), true);
  assert.equal(reads, 1, 'cached until the next full resync resets it');
  const now = sliceBlock(NOTIF, 'async function syncAllNotificationsNow(');
  assert.ok(now.indexOf('resetSilent();') >= 0 && now.indexOf('resetSilent();') < now.indexOf('await silentNow()'));
});

// ── F2: the weekly check-in never stops for someone who does not open the app ───────────────────
test('F2: 6 weeks without an open → the check-in still fires (one repeating weekly trigger, Sunday 10:00)', async () => {
  const scheduled = new Map([['checkin-2026-10-25', {}]]);
  const added = [];
  const N = {
    async getAllScheduledNotificationsAsync() { return [...scheduled.keys()].map((identifier) => ({ identifier })); },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async scheduleNotificationAsync(req) { added.push(req); scheduled.set(req.identifier, req); },
  };
  const fn = loadFn('lib/notifications.js', 'export async function syncCheckinReminder(', 'syncCheckinReminder', {
    getNotifications: () => N, getCachedUser: async () => ({ id: 'u', user_metadata: {} }), getT: async () => (k) => k,
    Platform: { OS: 'android' }, scheduleReq: async (n, req) => n.scheduleNotificationAsync(req),
    cancelUnwanted: loadFn('lib/notifications.js', 'async function cancelUnwanted(', 'cancelUnwanted'), restoreSnoozes: async () => {},
  });
  await fn();
  assert.equal(added.length, 1);
  assert.equal(added[0].identifier, 'checkin-weekly');
  assert.deepEqual(added[0].trigger, { type: 'weekly', weekday: 1, hour: 10, minute: 0 });
  // A repeating trigger has no last date: weeks 1…6 after the last open all fire.
  const fires = (trigger, weeks) => (trigger.type === 'weekly' ? Array.from({ length: weeks }, (_, i) => i + 1) : []);
  assert.deepEqual(fires(added[0].trigger, 6), [1, 2, 3, 4, 5, 6]);
  assert.ok(!scheduled.has('checkin-2026-10-25'), 'a dated copy from an earlier build is cancelled');
});

// ── F3: the permission ask (AD-88) ─────────────────────────────────────────────────────────────
function asker({ status, verdict = null }) {
  const calls = { requested: 0 };
  const N = { getPermissionsAsync: async () => ({ status }), requestPermissionsAsync: async () => { calls.requested++; return { status: 'granted' }; } };
  const fn = loadFn('lib/notifications.js', 'export async function askPermissionForReminders(', 'askPermissionForReminders', {
    reminderTimes: plan.reminderTimes, getNotifications: () => N, AsyncStorage: memStore(verdict ? { V: verdict } : {}), DEVICE_VERDICT_KEY: 'V',
    syncAllNotifications: async () => {}, registerPushToken: async () => {}, _askInFlight: null,
    // What 95bdc1a used (its own flag + the generic request, which asks unless granted).
    PERMISSION_ASKED_KEY: 'P',
    requestNotificationPermissions: async () => { const { status: s } = await N.getPermissionsAsync(); if (s === 'granted') return true; return (await N.requestPermissionsAsync()).status === 'granted'; },
  });
  return { calls, fn };
}
const P = [{ id: 1, reminder_time: '08:00' }];
test('F3: a 1.3.0 upgrader who denied on Android 13 → no dialog', async () => {
  const a = asker({ status: 'denied' });
  assert.equal(await a.fn(P), false);
  assert.equal(a.calls.requested, 0);
});
test('F3: denied (or allowed) at onboarding "Never miss a dose" → no second ask', async () => {
  for (const status of ['denied', 'granted']) { const a = asker({ status }); await a.fn(P); assert.equal(a.calls.requested, 0, status); }
});
test('F3: undetermined + first protocol saved → one ask; a replaced phone or no protocol → none', async () => {
  const a = asker({ status: 'undetermined' });
  assert.equal(await a.fn(P), true);
  assert.equal(a.calls.requested, 1);
  const none = asker({ status: 'undetermined' });
  await none.fn([]);
  assert.equal(none.calls.requested, 0);
  const replaced = asker({ status: 'undetermined', verdict: 'replaced' });
  await replaced.fn(P);
  assert.equal(replaced.calls.requested, 0, 'never on a phone that lost the account');
  assert.doesNotMatch(NOTIF, /PERMISSION_ASKED_KEY/, 'the OS stores the answer; no flag of our own');
});
test('F3: the sync listener asks only after a pass that was not refused, at most once a minute', () => {
  const app = read('App.js');
  assert.match(app, /if \(!e\.refused && nowTs - lastPermissionAsk > 60000\) \{ lastPermissionAsk = nowTs; askPermissionForArrivedProtocols\(\)\.catch/);
  assert.match(read('lib/sync.js'), /\{ type: 'sync_complete', changed: \(r && r\.changed\) \|\| \[\], refused: !!\(r && r\.refused\) \}/);
});

// ── F4 + F5: every protocol / vial change re-plans through the one full resync ─────────────────
test('F4: Today\'s "Continue" and "New vial" re-plan through afterProtocolChange (no direct scheduleDoseReminder)', () => {
  const today = read('screens/TodayScreen.js');
  assert.doesNotMatch(today, /scheduleDoseReminder\(/);
  assert.match(sliceBlock(today, 'function continueCourse('), /afterProtocolChange\(\{ saved: fresh \}\)/);
  assert.match(sliceBlock(today, 'async function createNewVial('), /afterProtocolChange\(\)/);
});
test('F4: the reviewer\'s probe (3 protocols 3×/day persistent + 1 weekly + 4 vials + every other kind at its most) → ≤ 64', () => {
  const now = new Date(2026, 9, 20, 6, 0, 0, 0);
  const ps = [1, 2, 3].map((id) => ({ id, reminder_time: '08:00,14:00,20:00', interval_days: 1, start_date: '2026-10-01' }));
  ps.push({ id: 4, reminder_time: '09:00', interval_days: 7, start_date: '2026-10-01' });
  const other = plan.iosOtherPending({ summaries: 7, checkin: 1, weighIn: 1, food: 7 });
  const b = plan.doseBudget({ os: 'ios', protocolCount: 4, expiryAlerts: 4, otherPending: other });
  const slotsById = {};
  for (const p of ps) slotsById[p.id] = plan.doseSlots({ protocol: p, now, windowDays: b.windowDays, persistent: true });
  const shares = plan.allocateSoonest(slotsById, b.total, now.getTime());
  const doses = Object.values(shares.counts).reduce((a, n) => a + n, 0);
  assert.ok(doses + 4 + other <= 64, `planned ${doses + 4 + other}`);
});
test('F5: a protocol delete during a running resync → the morning summary never lists the deleted protocol', async () => {
  const db = { active: ['BPC-157', 'TB-500'] };
  const out = { summary: null };
  // The resync reads the active protocols when it starts, then writes the summary when it ends.
  const fakes = {
    syncAllNotificationsNow: async () => { const names = [...db.active]; await sleep(40); out.summary = names; },
    syncMorningSummary: async () => { out.summary = [...db.active]; }, syncAllDoseReminders: async () => {}, syncVialAlerts: async () => {},
    cancelDoseReminder: async () => {}, askPermissionForReminders: async () => {},
    _background: false, getCachedUser: async () => null, AsyncStorage: memStore(), FG_SYNC_KEY: 'F',
  };
  const parts = ['let _notifSyncing = null;', 'let _notifSyncedOnce = false;', 'const _syncedListeners = new Set();', 'let _rerun = null;',
    sliceBlock(NOTIF, 'export async function syncAllNotifications(').replace(/^export\s+/, ''),
    sliceBlock(NOTIF, 'export async function afterProtocolChange(').replace(/^export\s+/, '')];
  // eslint-disable-next-line no-new-func
  const { syncAllNotifications, afterProtocolChange } = new Function(...Object.keys(fakes), `${parts.join('\n')}\nreturn { syncAllNotifications, afterProtocolChange };`)(...Object.values(fakes));
  const running = syncAllNotifications(); // e.g. the foreground top-up
  await sleep(5);
  db.active = ['BPC-157']; // Protocols: delete TB-500
  const replan = afterProtocolChange({});
  await Promise.all([running, replan]);
  await sleep(60);
  assert.deepEqual(out.summary, ['BPC-157']);
});

// ── F6: the iPhone dose budget from what is really scheduled; main reminders first ─────────────
function iosRun({ vials, other, protocols = 3 }) {
  const now = new Date(2026, 9, 20, 6, 0, 0, 0);
  const b = plan.doseBudget({ os: 'ios', protocolCount: protocols, expiryAlerts: vials, otherPending: other });
  const slotsById = {};
  for (let id = 1; id <= protocols; id++) slotsById[id] = plan.doseSlots({ protocol: { id, reminder_time: '08:00,14:00,20:00', interval_days: 1, start_date: '2026-10-01' }, now, windowDays: b.windowDays, persistent: true });
  const shares = plan.allocateSoonest(slotsById, b.total, now.getTime());
  const kept = [];
  for (const id of Object.keys(slotsById)) kept.push(...slotsById[id].slice(0, shares.counts[id]));
  return { b, shares, kept, now };
}
test('F6: three heavy persistent protocols → the main reminders cover the most days (repeats days out come last)', () => {
  const r = iosRun({ vials: 20, other: plan.iosOtherPending({ summaries: 7, checkin: 1, weighIn: 0, food: 0 }) });
  assert.equal(r.kept.length, r.b.total);
  const DAY = 86400000;
  const mainDays = new Set(r.kept.filter((s) => s.kind === 'main').map((s) => s.dayKey));
  const farRepeats = r.kept.filter((s) => s.kind === 'followup' && s.fireMs - r.now.getTime() > DAY);
  // 64 − 20 vials − 12 others = 32 slots. Today (from 06:00): 9 mains + their 18 repeats = 27; then
  // tomorrow's MAIN reminders (5 of them) before any repeat a day or more out. Soonest-first alone
  // kept 3 mains + 2 repeats there.
  const mains = r.kept.filter((s) => s.kind === 'main').length;
  assert.equal(mains, 14, `main reminders kept: ${mains}`);
  assert.ok(mainDays.size >= 2, `main days ${mainDays.size}`);
  assert.equal(farRepeats.length, 0, 'no repeat a day or more out while a main reminder is left out');
});
test('F6: only the kinds really scheduled are reserved (food, weigh-in, check-in off → more dose reminders)', () => {
  const full = plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 0, otherPending: plan.iosOtherPending({ summaries: 7, checkin: 1, weighIn: 1, food: 7 }) }).total;
  const quiet = plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 0, otherPending: plan.iosOtherPending({ summaries: 7, checkin: 0, weighIn: 0, food: 0 }) }).total;
  assert.equal(quiet - full, 9);
  assert.equal(plan.iosOtherPending({}), plan.MAX_SNOOZES, 'the snoozes a user can still add stay reserved');
});
test('F6: 43 vials → no dose budget is negative; 20 vials → 64 − 20 − others', () => {
  const other = plan.iosOtherPending({ summaries: 7, checkin: 1 });
  assert.equal(plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 43, otherPending: other }).total, 64 - 43 - other);
  assert.equal(plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 60, otherPending: other }).total, 0);
  assert.equal(plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 20, otherPending: other }).total, 64 - 20 - other);
  // The vials counted are the ones that really get an expiry alert.
  assert.match(sliceBlock(NOTIF, 'async function syncAllDoseRemindersNow('), /vialExpiryPlan\(/);
});

// ── F8 ─────────────────────────────────────────────────────────────────────────────────────────
test('F8: a snoozed vial-expiry copy posts on the vial channel', () => {
  assert.match(NOTIF, /const CHANNEL_FOR = \{[^}]*vial_expiry: 'vial-alerts'/);
});
test('F8: the error screen uses the app language rule (lib/appLanguage)', () => {
  const eb = sliceBlock(read('App.js'), 'class ErrorBoundary extends React.Component {');
  assert.match(eb, /readAppLanguage\(\)/);
  assert.doesNotMatch(eb, /getItem\('dosetrace_language'\)/);
});
test('F8: a language change re-words the snoozed copies too', async () => {
  const calls = [];
  const changed = loadFn('lib/notifications.js', 'export async function onAppLanguageChanged(', 'onAppLanguageChanged', {
    syncNotificationChannels: async () => calls.push('channels'), syncAllNotifications: async () => calls.push('resync'), restoreSnoozes: async (o) => calls.push(['snoozes', o]),
  });
  await changed();
  assert.deepEqual(calls, ['channels', 'resync', ['snoozes', { relanguage: true }]]);
  const t = Object.assign((k) => T.pt[k] || k, { language: 'pt' });
  const content = loadFn('lib/notifications.js', 'function snoozeContent(', 'snoozeContent', {
    fill: loadFn('lib/notifications.js', 'function fill(', 'fill'), decimalText: String, unitText: (u) => u, protocolDisplayName: (p) => p.name,
    pluralKey: require('../lib/plural').pluralKey, isOne: require('../lib/plural').isOne,
  });
  const dose = content({ data: { type: 'dose_reminder', protocolId: 1 }, dose: { protocolId: 1 } }, t, { protocol: { name: 'BPC-157', dose: 250, dose_unit: 'mcg' }, showNames: true });
  assert.equal(dose.title, 'BPC-157');
  assert.equal(dose.body, T.pt.notif_dose_body.replace('{dose}', '250').replace('{unit}', 'mcg'));
  assert.equal(content({ data: { type: 'food_log' } }, t, {}).title, T.pt.notif_food_title);
  assert.equal(content({ data: { type: 'vial_low', remaining: 2 } }, t, { showNames: false }).title, T.pt.notif_vial_title);
});
test('F8: the 64 guard never cancels a user snooze before an ordinary reminder', () => {
  const list = Array.from({ length: 64 }, (_, i) => ({ identifier: `dose-${i}`, content: { data: { type: 'dose_reminder', fireMs: 1000 + i } } }));
  list.push({ identifier: 'snz-dose-9-2026-10-20-t0', content: { data: { type: 'dose_reminder' } } }); // its time is in the record
  const { cancel } = plan.trimToCap(list, 64, { 'snz-dose-9-2026-10-20-t0': 999999 });
  assert.deepEqual(cancel, ['dose-63']);
});

// ── DV-045 split (coordinator 2026-10-20): the diagnostic row judges ONLY the background task ───
const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 86400000;
const base = { os: 'android', manufacturer: 'Google', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2, nowMs: NOW, scheduledCount: 9, dueInWindow: 9, syncedOnce: true };
test('DV-045 split: registered 3 days ago, never ran, the app opened an hour ago → the Reminder check and Settings say late; Today does not', () => {
  const h = { ...base, lastRefresh: null, refreshRegisteredAt: NOW - 3 * DAY, foregroundSyncAt: NOW - 3600e3 };
  const row = R.reminderChecks(h).find((c) => c.id === 'refresh');
  assert.equal(row.state, 'warn', 'the diagnostic row judges only the background task');
  assert.equal(row.foregroundAt, NOW - 3600e3, 'the app-open resync is reported separately');
  assert.equal(R.setupRowState(h).kind, 'warn');
  assert.equal(R.setupRowState(h).staleDays, 3);
  assert.equal(R.staleRefreshDays(h), 0, "Today: someone looking at Today just had the reminders scheduled");
  assert.equal(R.staleRefreshDays({ ...h, foregroundSyncAt: null }), 3);
});
