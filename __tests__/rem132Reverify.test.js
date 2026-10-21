'use strict';
// 1.3.2 REM branch — re-verification of 0053a37 (coordinator, 2026-10-20): R1 (every re-plan goes
// through the one full resync), the shared permission ask for A-127, the weekly check-in's fire
// time, and a floor for dose reminders under many vial-expiry alerts. Each failed on 0053a37.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');

const ROOT = path.join(__dirname, '..');
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

// ── R1: drift guard ────────────────────────────────────────────────────────────────────────────
const PER_KIND = ['syncRealityCheckReminder', 'syncFoodLogReminder', 'syncVialAlerts', 'syncMorningSummary', 'syncCheckinReminder', 'scheduleDoseReminder', 'syncAllDoseReminders'];
test('R1 drift guard: no per-kind scheduler (weigh-in, food, vial alerts, morning summary, check-in, dose) is called outside lib/notifications.js', () => {
  const files = ['App.js', ...jsFiles('screens'), ...jsFiles('components'), ...jsFiles('lib')].filter((f) => f !== path.join('lib', 'notifications.js'));
  const hits = [];
  const re = new RegExp(`(^|[^\\w])(${PER_KIND.join('|')})\\(`, 'g');
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    src.forEach((line, i) => { if (!/^\s*\/\//.test(line) && re.test(line)) hits.push(`${f}:${i + 1}`); re.lastIndex = 0; });
  }
  assert.deepEqual(hits, [], 'every re-plan goes through syncAllNotifications (serialized, the 64 guard)');
});

test('R1: starting, resetting, stopping and finishing a reality check re-plan through the full resync', () => {
  const calc = read('screens/components/CalculatorSection.js');
  assert.ok((calc.match(/syncAllNotifications\(\)\.catch/g) || []).length >= 4);
  const clear = read('lib/realityCheck.js');
  const body = clear.slice(clear.indexOf('export async function clearRealityStart'), clear.indexOf('export async function getCalcInputs'));
  assert.match(body, /n\.syncAllNotifications\(\)\.catch/);
});

test('R1 probe: a phone at 64 that starts a reality check stays ≤ 64 (the full resync re-shares the dose total)', async () => {
  const now = new Date(2026, 9, 20, 6, 0, 0, 0);
  const ps = [1, 2, 3].map((id) => ({ id, reminder_time: '08:00,14:00,20:00', interval_days: 1, start_date: '2026-10-01' }));
  const user = { id: 'u', user_metadata: {} };
  const other = (open) => loadFn('lib/notifications.js', 'async function iosOtherPendingNow(', 'iosOtherPendingNow', {
    morningSummaryPlan: plan.morningSummaryPlan, ymd: plan.ymd, parseYmd: plan.parseYmd, SUMMARY_WINDOW_DAYS: 7, SUMMARY_HORIZON_DAYS: 45, MORNING_HOUR: 7, MORNING_MIN: 0,
    iosOtherPending: plan.iosOtherPending, require: () => ({ getRealityStart: async () => (open ? { date: '2026-10-20' } : null) }),
  })(user, ps);
  const planned = async (open) => {
    const o = await other(open);
    const b = plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 0, otherPending: o });
    const slotsById = {};
    for (const p of ps) slotsById[p.id] = plan.doseSlots({ protocol: p, now, windowDays: b.windowDays, persistent: true });
    const doses = Object.values(plan.allocateSoonest(slotsById, b.total, now.getTime()).counts).reduce((a, n) => a + n, 0);
    return { doses, o, total: doses + o };
  };
  const before = await planned(false);
  assert.ok(before.total <= 64 && before.total >= 60, `before ${before.total}`);
  const after = await planned(true); // the weigh-in and 7 food questions now count
  assert.ok(after.total <= 64, `after ${after.total}`);
  assert.equal(after.o - before.o, 8);
});

// ── A-127: one shared permission ask ───────────────────────────────────────────────────────────
function shared({ status, verdict = null }) {
  const calls = { requested: 0 };
  const N = { getPermissionsAsync: async () => ({ status }), requestPermissionsAsync: async () => { calls.requested++; return { status: 'granted' }; } };
  const store = { getItem: async (k) => (k === 'V' ? verdict : null) };
  const ask = loadFn('lib/notifications.js', 'export async function askNotificationPermission(', 'askNotificationPermission', {
    getNotifications: () => N, AsyncStorage: store, DEVICE_VERDICT_KEY: 'V', syncAllNotifications: async () => {}, registerPushToken: async () => {}, _askInFlight: null,
  });
  return { calls, ask };
}
test('A-127 hook: askNotificationPermission asks only while undetermined, never on a replaced phone, one at a time', async () => {
  const u = shared({ status: 'undetermined' });
  const [a, b] = await Promise.all([u.ask(), u.ask()]);
  assert.equal(a, true); assert.equal(b, true);
  assert.equal(u.calls.requested, 1, 'single flight');
  for (const status of ['granted', 'denied']) { const s = shared({ status }); assert.equal(await s.ask(), false); assert.equal(s.calls.requested, 0); }
  const r = shared({ status: 'undetermined', verdict: 'replaced' });
  assert.equal(await r.ask(), false); assert.equal(r.calls.requested, 0);
  // askPermissionForReminders keeps its reminder-time filter and calls the shared ask.
  let shares = 0;
  const forReminders = loadFn('lib/notifications.js', 'export async function askPermissionForReminders(', 'askPermissionForReminders', {
    reminderTimes: plan.reminderTimes, askNotificationPermission: async () => { shares++; return true; },
  });
  assert.equal(await forReminders([]), false);
  assert.equal(await forReminders([{ id: 1, reminder_time: '08:00' }]), true);
  assert.equal(shares, 1);
});

// ── Low: the weekly check-in's next fire time ──────────────────────────────────────────────────
test('the weekly check-in has a fire time (next Sunday 10:00): the 64 guard does not cut it first and it can be next', () => {
  const wed = new Date(2026, 9, 21, 12, 0, 0, 0).getTime();
  const sun = new Date(2026, 9, 25, 10, 0, 0, 0).getTime();
  const weeklyAndroid = { identifier: 'checkin-weekly', trigger: { type: 'weekly', weekday: 1, hour: 10, minute: 0 }, content: { title: 'Weekly check-in', data: { type: 'checkin_reminder' } } };
  const calendarIos = { identifier: 'checkin-weekly', trigger: { type: 'calendar', repeats: true, dateComponents: { weekday: 1, hour: 10, minute: 0 } }, content: { data: { type: 'checkin_reminder' } } };
  assert.equal(plan.fireAtOf(weeklyAndroid, {}, wed), sun);
  assert.equal(plan.fireAtOf(calendarIos, {}, wed), sun);
  const sunLater = new Date(2026, 9, 25, 11, 0, 0, 0).getTime(); // Sunday after 10:00 → next week
  assert.equal(plan.fireAtOf(weeklyAndroid, {}, sunLater), new Date(2026, 10, 1, 10, 0, 0, 0).getTime());
  // It is next when it comes first.
  const dose = { identifier: 'dose-1-2026-10-26-t0', content: { data: { type: 'dose_reminder', protocolId: 1, fireMs: new Date(2026, 9, 26, 8, 0, 0, 0).getTime() } } };
  assert.equal(plan.nextScheduled([dose, weeklyAndroid], wed, {}).type, 'checkin_reminder');
  // 65 pending with the check-in → a later dose reminder is cut, not the check-in.
  const later = Array.from({ length: 64 }, (_, i) => ({ identifier: `dose-${i}`, content: { data: { type: 'dose_reminder', fireMs: sun + (i + 1) * 3600e3 } } }));
  assert.deepEqual(plan.trimToCap([weeklyAndroid, ...later], 64, {}, wed).cancel, ['dose-63']);
});

// ── Low: expiry alerts capped on iPhone (dose reminders keep a floor) ──────────────────────────
test('iPhone: 60 vials with an expiry alert → the soonest 8 are scheduled; dose reminders keep their share', () => {
  const alerts = Array.from({ length: 60 }, (_, i) => ({ id: `vial-exp-${i}-7`, vialId: i, protocolId: 1, fireAtMs: 1000 + (59 - i), daysLeft: 7 }));
  const ios = plan.capExpiryAlerts(alerts, 'ios');
  assert.equal(ios.length, plan.IOS_EXPIRY_CAP);
  assert.equal(plan.IOS_EXPIRY_CAP, 8);
  assert.deepEqual(ios.map((a) => a.fireAtMs), [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007]);
  assert.equal(plan.capExpiryAlerts(alerts, 'android').length, 60, 'Android has no 64 cap');
  const b = plan.doseBudget({ os: 'ios', protocolCount: 3, expiryAlerts: 60, otherPending: plan.iosOtherPending({ summaries: 7, checkin: 1 }) });
  assert.equal(b.total, 64 - 8 - 12, 'the budget counts at most 8 expiry alerts');
  assert.match(sliceBlock(read('lib/notifications.js'), 'export async function syncVialAlerts('), /capExpiryAlerts\(vialExpiryPlan\(/);
  assert.match(sliceBlock(read('lib/notifications.js'), 'async function syncAllDoseRemindersNow('), /capExpiryAlerts\(vialExpiryPlan\(/);
});
