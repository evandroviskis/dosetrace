'use strict';
// A-107 (founder 2026-10-07, option B; journey review AC2/AC3). The daily background refresh re-runs
// the reminder scheduling where Android can kill it at any moment. Scheduling used to CANCEL a
// protocol's reminders first and rebuild them after — a kill in between left the protocol silent.
// Now it schedules first (same id = replaced) and cancels only what is no longer wanted at the end.
// It also keeps the +5/+10 repeats of a slot that has just fired (they used to be dropped).
// Runs the REAL scheduleDoseReminder (helpers/extractFn) with a fake expo-notifications.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');
const { needsSiteQuestion } = require('../lib/siteQuestion');

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fakeN(ids) {
  const scheduled = new Map(ids.map((id) => [id, { identifier: id, content: { data: {} } }]));
  return {
    scheduled,
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
  };
}

function load(N, { persistent = false, scheduleReq } = {}) {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../lib/notifications.js'), 'utf8');
  const fill = loadFn('lib/notifications.js', 'function fill(', 'fill');
  const parseReminderTimes = loadFn('lib/notifications.js', 'function parseReminderTimes(', 'parseReminderTimes', { reminderTimes: plan.reminderTimes });
  const deps = {
    getActiveProtocols: () => [{ id: 1 }],
    doseBudget: plan.doseBudget, Platform: { OS: 'android' },
    getNotifications: () => N,
    cancelDoseReminder: async (pid) => { for (const id of [...N.scheduled.keys()]) if (id.startsWith(`dose-${pid}-`)) N.scheduled.delete(id); },
    getT: async () => Object.assign((k) => k, { language: 'en' }),
    parseReminderTimes, fill,
    isPersistentEnabled: async () => persistent,
    showNamesInNotifications: async () => true,
    decimalText: (x) => String(x),
    ymd: plan.ymd, parseYmd: plan.parseYmd, dueDateKeys: plan.dueDateKeys,
    getTodayLogs: () => [],
    needsSiteQuestion,
    FOLLOWUP_DELAYS: [5, 10],
    scheduleReq: scheduleReq || (async (n, req) => { n.scheduled.set(req.identifier, req); return req.identifier; }),
  };
  assert.ok(src.includes('export async function scheduleDoseReminder('));
  return loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', deps);
}

function protocolAt(times, startDaysAgo = 5) {
  const s = new Date(); s.setDate(s.getDate() - startDaysAgo);
  return { id: 1, user_id: 'u1', name: 'Vitamin D', dose: 1, dose_unit: 'cap', type: 'oral', reminder_time: times, start_date: plan.ymd(s), interval_days: 1, doses_per_day: 1 };
}

test('AC2: a refresh killed partway leaves every reminder that was already scheduled', async () => {
  const later = new Date(Date.now() + 2 * 3600e3);
  if (later.getDate() !== new Date().getDate()) return; // near midnight: the slot moves to tomorrow, skip
  const p = protocolAt(hm(later));
  // Yesterday's run left 10 days of reminders.
  const N = fakeN([]);
  await load(N)(p, 400, 10);
  const before = [...N.scheduled.keys()].sort();
  assert.ok(before.length >= 9);
  // Today's run is killed after its 3rd schedule call (the promise never settles).
  let calls = 0;
  const killed = load(N, { scheduleReq: (n, req) => (++calls <= 3 ? Promise.resolve(n.scheduled.set(req.identifier, req)) : new Promise(() => {})) });
  await Promise.race([killed(p, 400, 10), new Promise((r) => setTimeout(r, 50))]);
  for (const id of before) assert.ok(N.scheduled.has(id), `kept ${id}`);
});

test('AC2: what is no longer wanted is cancelled at the end (time changed 08:00 → 21:00)', async () => {
  const p = protocolAt('08:00');
  const N = fakeN([]);
  await load(N)(p, 400, 10);
  const old = [...N.scheduled.keys()];
  await load(N)({ ...p, reminder_time: '21:00' }, 400, 10);
  const now = [...N.scheduled.keys()];
  assert.ok(now.length > 0);
  for (const id of now) assert.match(id, /^dose-1-\d{4}-\d{2}-\d{2}-t0$/);
  // every 08:00 one is gone or replaced by the same day's 21:00 (same id: dose-1-{day}-t0)
  const fire = (id) => new Date(N.scheduled.get(id).trigger.date).getHours();
  for (const id of now) assert.equal(fire(id), 21, id);
  assert.ok(old.length > 0);
});

test('AC2: another protocol\'s reminders are never touched (dose-1- vs dose-12-)', async () => {
  const N = fakeN(['dose-12-2099-01-01-t0', 'dose-12-2099-01-02-t0']);
  await load(N)(protocolAt('21:00'), 400, 10);
  assert.ok(N.scheduled.has('dose-12-2099-01-01-t0') && N.scheduled.has('dose-12-2099-01-02-t0'));
});

test('AC3: a resync 3 minutes after a slot fired keeps its +5 and +10 repeats', async () => {
  const fired = new Date(Date.now() - 3 * 60e3);
  if (fired.getDate() !== new Date().getDate()) return; // just after midnight: skip
  const p = protocolAt(hm(fired));
  const N = fakeN([]);
  await load(N, { persistent: true })(p, 400, 10);
  const today = plan.ymd(new Date());
  assert.ok(N.scheduled.has(`dose-1-${today}-t0-f0`) || N.scheduled.has(`dose-1-${today}-t0-f1`), [...N.scheduled.keys()].join(','));
  assert.ok(!N.scheduled.has(`dose-1-${today}-t0`), 'the slot itself is past — never re-armed');
});

// ── The other kinds (summary, 20:00 food question, weigh-in, vial, check-in) — AC1/AC2 ──
const cancelUnwanted = loadFn('lib/notifications.js', 'async function cancelUnwanted(', 'cancelUnwanted');
function foodFn(N, { user = { id: 'u1', user_metadata: {} }, start, startThrows = false } = {}) {
  const reqMap = {
    './realityCheck': { getRealityStart: async () => { if (startThrows) throw new Error('offline'); return start; } },
    './foodLogActions': { loadFoodAccess: async () => ({ access: { kind: 'premium' } }) },
  };
  return loadFn('lib/notifications.js', 'export async function syncFoodLogReminder(', 'syncFoodLogReminder', {
    getNotifications: () => N, usesServerPush: () => false, getCachedUser: async () => user, cancelUnwanted,
    require: (m) => reqMap[m], ymd: plan.ymd, parseYmd: plan.parseYmd, closedDays: () => new Set(), getFoodLogsSince: () => [],
    foodNudgeDays: plan.foodNudgeDays, remindersForAccess: (d) => d, FOOD_WINDOW_DAYS: 7, FOOD_HOUR: 20, FOOD_MIN: 0,
    getT: async () => (k) => k, Platform: { OS: 'android' },
    scheduleReq: async (n, req) => { n.scheduled.set(req.identifier, req); },
  });
}
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return plan.ymd(d); };

test('AC1: the 20:00 food question survives a run that cannot read the check (offline) or knows no user', async () => {
  const id = `food-log-${tomorrow()}`;
  const N = fakeN([id]);
  await foodFn(N, { startThrows: true })();
  assert.ok(N.scheduled.has(id), 'read failed → kept');
  await foodFn(N, { user: null })();
  assert.ok(N.scheduled.has(id), 'no user known → kept');
});

test('AC2: the food question is cancelled when the check is really closed, and kept/rebuilt while open', async () => {
  const id = `food-log-${tomorrow()}`;
  const N = fakeN([id, 'food-log-daily']);
  const s0 = new Date(); s0.setDate(s0.getDate() - 2);
  await foodFn(N, { start: { date: plan.ymd(s0) } })();
  assert.ok(N.scheduled.has(id), 'open check → tomorrow still asked');
  assert.ok(!N.scheduled.has('food-log-daily'), 'the old single id goes');
  await foodFn(N, { start: null })();
  assert.ok(![...N.scheduled.keys()].some((k) => k.startsWith('food-log-')), 'closed check → none left');
});

test('AC2: the weigh-in reminder is kept when the check cannot be read, cancelled when there is none', async () => {
  const mk = (N, startThrows, start) => loadFn('lib/notifications.js', 'export async function syncRealityCheckReminder(', 'syncRealityCheckReminder', {
    getNotifications: () => N, cancelUnwanted, REALITY_CHECK_DAYS: 21, getT: async () => (k) => k, Platform: { OS: 'android' },
    require: () => ({ getRealityStart: async () => { if (startThrows) throw new Error('x'); return start; } }),
    scheduleReq: async (n, req) => { n.scheduled.set(req.identifier, req); },
  });
  const N = fakeN(['reality-check-weigh']);
  await mk(N, true)();
  assert.ok(N.scheduled.has('reality-check-weigh'));
  await mk(N, false, null)();
  assert.ok(!N.scheduled.has('reality-check-weigh'));
});

test('AC2: the morning summary schedules first and only then drops days no longer wanted', async () => {
  const stale = 'summary-2000-01-01';
  const N = fakeN([stale, 'morning-summary']);
  let calls = 0;
  const fn = (scheduleReq) => loadFn('lib/notifications.js', 'export async function syncMorningSummary(', 'syncMorningSummary', {
    getNotifications: () => N, getCachedUser: async () => ({ id: 'u1', user_metadata: {} }), cancelByPrefix: async () => {}, cancelUnwanted,
    getT: async () => Object.assign((k) => k, { language: 'en' }), getActiveProtocols: () => [protocolAt('09:00')],
    usesServerPush: () => false, ymd: plan.ymd, parseYmd: plan.parseYmd, morningSummaryPlan: plan.morningSummaryPlan,
    SUMMARY_WINDOW_DAYS: 7, SUMMARY_HORIZON_DAYS: 45, MORNING_HOUR: 7, MORNING_MIN: 0,
    showNamesInNotifications: async () => true, fill: (s) => s, formatList: (l) => l.join(', '), pluralKey: (k) => k, Platform: { OS: 'android' },
    scheduleReq,
  });
  // killed after the 2nd summary: the stale ones are still there (nothing cancelled first)
  await Promise.race([fn((n, req) => (++calls <= 2 ? Promise.resolve(n.scheduled.set(req.identifier, req)) : new Promise(() => {})))(), new Promise((r) => setTimeout(r, 50))]);
  assert.ok(N.scheduled.has(stale) && N.scheduled.has('morning-summary'), 'killed partway → nothing lost');
  await fn(async (n, req) => { n.scheduled.set(req.identifier, req); })();
  assert.ok(!N.scheduled.has(stale) && !N.scheduled.has('morning-summary'), 'a full run drops what is no longer wanted');
  assert.ok([...N.scheduled.keys()].filter((k) => k.startsWith('summary-')).length >= 6, 'the week is scheduled');
});
