'use strict';
// AD-87 A (founder 2026-10-15, OPEN-06 = A; picture docs/design/ad87a-reminder-window-end.html,
// founder 2026-10-20 "AD-87 A = A (the sentence joins the last dose reminder), texts as drawn").
// iPhone has no background refresh: the reminders end with the window the last app open planned.
// RW rows of docs/specs/ad87a-ad88.md. Each test runs the REAL code (helpers/extractFn) with fakes.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');
const R = require('../lib/reminderHealth');

function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const TR = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tOf = (lang) => Object.assign((k) => (TR[lang] && TR[lang][k]) || TR.en[k] || k, { language: lang });
const fill = loadFn('lib/notifications.js', 'function fill(', 'fill');

const RealDate = Date;
const NOW = new RealDate(2026, 9, 20, 6, 0, 0, 0).getTime(); // Tuesday 20 Oct 2026, 06:00
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const now = new RealDate(NOW);
const daily = (id, times = '08:00', extra = {}) => ({ id, user_id: 'u', reminder_time: times, interval_days: 1, start_date: '2026-10-01', dose: 2.5, dose_unit: 'mg', type: 'oral', ...extra });

function planFor(protocols, { total = 54, windowDays = 10, persistent = false } = {}) {
  const slotsById = {};
  for (const p of protocols) slotsById[p.id] = plan.doseSlots({ protocol: p, now, windowDays, persistent });
  const shares = plan.allocateSoonest(slotsById, total, NOW);
  return { slotsById, shares, end: plan.windowEndSlot({ slotsById, counts: shares.counts, protocols, now, windowDays, untilMs: shares.untilMs }) };
}

// ── The last reminder of the window ─────────────────────────────────────────────────────────────
test('RW-1: one daily protocol on iPhone → the window\'s last main reminder (day 10, 08:00) is the one', () => {
  const { shares, end } = planFor([daily(1)]);
  assert.equal(shares.untilMs, null, 'everything fits: the window, not the cap, ends the plan');
  assert.ok(end, 'a window end is found');
  assert.equal(end.id, 'dose-1-2026-10-29-t0');
  assert.equal(end.protocolId, '1');
  assert.equal(end.fireMs, new RealDate(2026, 9, 29, 8, 0, 0, 0).getTime());
});
test('RW-2: a course whose last dose falls inside the window → no sentence (no reminder is owed after it)', () => {
  const { end } = planFor([daily(1, '08:00', { start_date: '2026-10-20', schedule_total: 5 })]);
  assert.equal(end, null);
  // A protocol whose next dose is past the window still makes the others' last reminder the end.
  const { end: e2 } = planFor([daily(1, '08:00', { start_date: '2026-10-20', schedule_total: 5 }), { ...daily(2), interval_days: 14, start_date: '2026-11-01' }]);
  assert.ok(e2, 'protocol 2 owes a reminder on 1 Nov, after the window');
  assert.equal(e2.id, 'dose-1-2026-10-24-t0');
});
test('RW-3: the 64 cap cut the plan → the last KEPT main reminder carries it (before the first one left out)', () => {
  const ps = [1, 2, 3, 4, 5, 6].map((id) => daily(id, '08:00,20:00'));
  const { slotsById, shares, end } = planFor(ps, { total: 30, persistent: true });
  assert.ok(Number.isFinite(shares.untilMs), 'the cap cut the plan');
  assert.ok(end && end.fireMs < shares.untilMs);
  let lastKept = 0;
  for (const id of Object.keys(slotsById)) for (const s of slotsById[id].slice(0, shares.counts[id])) if (s.kind === 'main') lastKept = Math.max(lastKept, s.fireMs);
  assert.equal(end.fireMs, lastKept);
  assert.ok(slotsById[end.protocolId].slice(0, shares.counts[end.protocolId]).some((s) => s.id === end.id), 'it is one of the scheduled reminders');
});
test('RW-3: nothing kept (budget 0) → no window end', () => {
  assert.equal(planFor([daily(1)], { total: 0 }).end, null);
});

// ── The sentence on the reminder (and its repeats) ──────────────────────────────────────────────
function scheduler({ silent = false, showNames = true, lang = 'en', os = 'ios' } = {}) {
  const added = [];
  const N = {
    async getAllScheduledNotificationsAsync() { return []; },
    async cancelScheduledNotificationAsync() {},
    async scheduleNotificationAsync(req) { added.push(req); return req.identifier; },
  };
  const scheduleReq = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', {
    silentNow: async () => silent, androidChannelRequest: plan.androidChannelRequest, withFireMs: plan.withFireMs, Platform: { OS: os },
  });
  const fn = loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', {
    Date: FakeDate, Platform: { OS: os }, getActiveProtocols: () => [{ id: 1 }], doseBudget: plan.doseBudget, getNotifications: () => N,
    getT: async () => tOf(lang), isPersistentEnabled: async () => true, fill,
    decimalText: (v, l) => (l === 'en' ? String(v) : String(v).replace('.', ',')), unitText: String, ymd: plan.ymd, handledSlotIndexes: plan.handledSlotIndexes, getTodayLogs: () => [],
    showNamesInNotifications: async () => showNames, protocolDisplayName: () => 'Tirzepatide', needsSiteQuestion: () => false, FOLLOWUP_DELAYS: [5, 10],
    doseSlots: plan.doseSlots, snoozedDoseSlots: async () => new Set(), scheduleReq,
  });
  return { added, fn };
}
const SENT_EN = 'Open DoseTrace to keep getting your reminders.';
const END = 'dose-1-2026-10-22-t0';

test('RW-4: the last reminder and its +5/+10 repeats get the sentence at the end; every other reminder is unchanged', async () => {
  const s = scheduler();
  await s.fn(daily(1), 60, 3, { windowEnd: END });
  const by = Object.fromEntries(s.added.map((r) => [r.identifier, r.content]));
  assert.equal(by[END].body, `Time for your 2.5 mg dose. ${SENT_EN}`);
  assert.equal(by[`${END}-f0`].body, `Reminder: your 2.5 mg dose is still pending. ${SENT_EN}`);
  assert.ok(by[`${END}-f1`].body.endsWith(SENT_EN));
  assert.equal(by['dose-1-2026-10-21-t0'].body, 'Time for your 2.5 mg dose');
  assert.ok(!by['dose-1-2026-10-21-t0-f0'].body.includes(SENT_EN));
  assert.equal(by[END].title, 'Tirzepatide');
  // Without the option (Android, or not the protocol that holds the last reminder) nothing changes.
  const plain = scheduler();
  await plain.fn(daily(1), 60, 3);
  assert.ok(plain.added.every((r) => !r.content.body.includes(SENT_EN)));
});
test('RW-4: Portuguese reads as drawn — "Hora da sua dose de 2,5 mg. Abra o DoseTrace para continuar recebendo seus lembretes."', async () => {
  const s = scheduler({ lang: 'pt' });
  await s.fn(daily(1), 60, 3, { windowEnd: END });
  assert.equal(s.added.find((r) => r.identifier === END).content.body, 'Hora da sua dose de 2,5 mg. Abra o DoseTrace para continuar recebendo seus lembretes.');
});
test('RW-5: "Show names in notifications" off → the title stays "Dose reminder" and the sentence is the same', async () => {
  const s = scheduler({ showNames: false });
  await s.fn(daily(1), 60, 3, { windowEnd: END });
  const c = s.added.find((r) => r.identifier === END).content;
  assert.equal(c.title, 'Dose reminder');
  assert.equal(c.body, `Time for your 2.5 mg dose. ${SENT_EN}`);
});
test('RW-6: Silent mode → nothing is scheduled, the sentence never arrives', async () => {
  const s = scheduler({ silent: true });
  await s.fn(daily(1), 60, 3, { windowEnd: END });
  assert.equal(s.added.length, 0);
});
test('RW-7: the sentence costs no slot of the 64 (same requests, same ids, with or without it)', async () => {
  const a = scheduler(); await a.fn(daily(1, '08:00,20:00'), 9, 3, { windowEnd: END });
  const b = scheduler(); await b.fn(daily(1, '08:00,20:00'), 9, 3);
  assert.equal(a.added.length, 9);
  assert.deepEqual(a.added.map((r) => r.identifier), b.added.map((r) => r.identifier));
});

// ── Only iPhone, only through the full resync ───────────────────────────────────────────────────
function resync(os) {
  const calls = [];
  const fn = loadFn('lib/notifications.js', 'async function syncAllDoseRemindersNow(', 'syncAllDoseRemindersNow', {
    usesServerPush: () => false, getCachedUser: async () => ({ id: 'u', user_metadata: {} }), getActiveProtocols: () => [daily(1), daily(2)],
    getNotifications: () => ({ async getAllScheduledNotificationsAsync() { return []; }, async cancelScheduledNotificationAsync() {} }),
    orphanDoseIds: plan.orphanDoseIds, cancelAllDoseReminders: async () => {}, capExpiryAlerts: plan.capExpiryAlerts, vialExpiryPlan: plan.vialExpiryPlan, getActiveVials: () => [],
    Platform: { OS: os }, iosOtherPendingNow: async () => 10, doseBudget: plan.doseBudget,
    iosDoseShares: async () => ({ counts: { 1: 10, 2: 10 }, untilMs: null, windowEnd: { id: 'dose-2-2026-10-29-t0', protocolId: '2', fireMs: 1 } }),
    scheduleDoseReminder: async (p, n, w, opts) => { calls.push({ id: p.id, opts: opts || {} }); },
  });
  return { calls, fn };
}
test('RW-8: iPhone → only the protocol that holds the window\'s last reminder is told; Android → never', async () => {
  const ios = resync('ios');
  await ios.fn();
  assert.deepEqual(ios.calls.map((c) => [c.id, c.opts.windowEnd || null]), [[1, null], [2, 'dose-2-2026-10-29-t0']]);
  const android = resync('android');
  await android.fn();
  assert.deepEqual(android.calls.map((c) => c.opts.windowEnd || null), [null, null], 'Android renews in the background (21 days)');
});
test('RW-8: iosDoseShares computes the window end from the same plan it shares out', async () => {
  const store = { m: {}, async setItem(k, v) { this.m[k] = v; } };
  const fn = loadFn('lib/notifications.js', 'async function iosDoseShares(', 'iosDoseShares', {
    Date: FakeDate, isPersistentEnabled: async () => false, snoozedDoseSlots: async () => new Set(), ymd: plan.ymd, handledSlotIndexes: plan.handledSlotIndexes,
    getTodayLogs: () => [], doseSlots: plan.doseSlots, FOLLOWUP_DELAYS: [5, 10], allocateSoonest: plan.allocateSoonest, windowEndSlot: plan.windowEndSlot, AsyncStorage: store, PENDING_CAP_KEY: 'C',
  });
  const shares = await fn([daily(1)], { total: 40, windowDays: 10 });
  assert.equal(shares.windowEnd && shares.windowEnd.id, 'dose-1-2026-10-29-t0');
});

// ── Today: "Reminders set until Thursday" when the renewed window is short ──────────────────────
const tue10 = new RealDate(2026, 9, 20, 10, 0, 0, 0).getTime();
const thu20 = new RealDate(2026, 9, 22, 20, 0, 0, 0).getTime();
const H = { os: 'ios', remindersOn: true, silent: false, activeWithTime: 6, capUntilMs: thu20 + 12 * 3600e3, lastScheduledMs: thu20, nowMs: tue10 };
test('RW-9: iPhone, the cap cut the plan and the last reminder is 2 days out or less → Today warns', () => {
  assert.deepEqual(R.shouldWarnWindow(H), { days: 2, atMs: thu20 });
  assert.equal(R.shouldWarnWindow({ ...H, lastScheduledMs: new RealDate(2026, 9, 21, 8, 0).getTime() }).days, 1);
  assert.equal(R.shouldWarnWindow({ ...H, lastScheduledMs: new RealDate(2026, 9, 20, 20, 0).getTime() }).days, 0);
});
test('RW-9: no warning on Android, with a full window, past 2 days, in Silent mode, reminders off or no timed protocol', () => {
  assert.equal(R.shouldWarnWindow({ ...H, os: 'android' }), null);
  assert.equal(R.shouldWarnWindow({ ...H, capUntilMs: null }), null, 'the cap did not cut: 10 days are planned');
  assert.equal(R.shouldWarnWindow({ ...H, lastScheduledMs: new RealDate(2026, 9, 23, 8, 0).getTime() }), null, '3 days');
  assert.equal(R.shouldWarnWindow({ ...H, silent: true }), null);
  assert.equal(R.shouldWarnWindow({ ...H, remindersOn: false }), null);
  assert.equal(R.shouldWarnWindow({ ...H, activeWithTime: 0 }), null);
  assert.equal(R.shouldWarnWindow({ ...H, lastScheduledMs: null }), null, 'nothing scheduled is the blocked card');
  assert.equal(R.shouldWarnWindow({ ...H, lastScheduledMs: tue10 - 1000 }), null);
});
test('RW-10: the title as drawn — "até quinta" / "até amanhã" / "até hoje", in every language', () => {
  const w2 = { days: 2, atMs: thu20 };
  assert.equal(R.windowAlertTitle(w2, tOf('pt'), 'pt'), 'Lembretes garantidos até quinta');
  assert.equal(R.windowAlertTitle(w2, tOf('en'), 'en'), 'Reminders set until Thursday');
  assert.equal(R.windowAlertTitle({ days: 1, atMs: thu20 }, tOf('pt'), 'pt'), 'Lembretes garantidos até amanhã');
  assert.equal(R.windowAlertTitle({ days: 0, atMs: thu20 }, tOf('pt'), 'pt'), 'Lembretes garantidos até hoje');
  const day = { es: 'jueves', fr: 'jeudi', de: 'Donnerstag', it: 'giovedì' };
  for (const l of Object.keys(day)) assert.ok(R.windowAlertTitle(w2, tOf(l), l).includes(day[l]), l);
  assert.equal(TR.pt.today_alert_window_body, 'O iPhone guarda um número limitado de lembretes. Abra o DoseTrace até lá para garantir os próximos.');
  assert.equal(TR.en.today_alert_window_body, 'Your iPhone holds a limited number of reminders. Open DoseTrace by then to set the next ones.');
  for (const l of LANGS) {
    for (const k of ['today_alert_window_title_day', 'today_alert_window_title_tomorrow', 'today_alert_window_title_today', 'today_alert_window_body', 'notif_window_end_body']) {
      assert.ok(TR[l][k], `${l}.${k} exists`);
      if (l !== 'en') assert.notEqual(TR[l][k], TR.en[k], `${l}.${k} is translated`);
    }
    assert.match(TR[l].today_alert_window_title_day, /\{day\}/, l);
    assert.match(TR[l].notif_window_end_body, /^\{body\}\. /, l);
  }
});
test('RW-11: Today shows it in Alerts like "Your reminders may stop": bell, alert dot, Remind me later, opens the Reminder check', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /setRemindersWindow\(shouldWarnWindow\(h\)\)/);
  const card = today.slice(today.indexOf("id: 'reminders_window'") - 200, today.indexOf("id: 'reminders_window'") + 500);
  assert.match(card, /iconName: 'bell', due: true/);
  assert.match(card, /windowAlertTitle\(remindersWindow, t, language\)/);
  assert.match(card, /t\('today_alert_window_body'\)/);
  assert.match(card, /navigation\.navigate\('ReminderCheck'\)/);
  assert.match(card, /snoozeId: 'reminders_window'/);
  // Decision 3: with another reminder warning it joins the one combined card.
  assert.deepEqual(R.reminderWarnings({ blocked: true, late: false, stop: false, stale: 0, window: true }), ['blocked', 'window']);
  assert.deepEqual(R.reminderWarnings({ blocked: false, late: false, stop: false, stale: 0, window: false }), []);
  assert.match(today, /reminderWarnings\(\{[^}]*window: !!remindersWindow/);
});
test('RW-12: the full resync passes the window end on iPhone only (source)', () => {
  const block = sliceBlock(read('lib/notifications.js'), 'async function syncAllDoseRemindersNow(');
  assert.match(block, /Platform\.OS === 'ios' \? await iosDoseShares\(protocols, b\)/);
  assert.match(block, /windowEnd/);
});
