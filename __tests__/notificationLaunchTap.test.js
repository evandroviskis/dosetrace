'use strict';
// A-171 (build 5 council 2026-10-22, recommendation accepted for 1.3.2): a notification tap that
// LAUNCHED the app was dropped when the notification had arrived more than 12 h earlier. App.js
// routed the launch response with routeTap(last, 12 h), and the age counted from DELIVERY, not
// from the tap: an evening reminder tapped next morning, after the phone had closed the app,
// opened Today instead of its dose / team message / food question — while the same tap with the
// app in the background routed with no limit. Now the launch tap routes exactly like a background
// tap, whatever its age. Replays stay blocked by the stored tap keys (dosetrace_nav_handled), and
// a dose already logged is never logged twice from where the tap lands.
// These tests run App.js's real routeTap, listener and launch block (helpers/routeTapHarness).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp, fakeStorage } = require('./helpers/routeTapHarness');
const { notifTapTarget } = require('../lib/notificationPlan');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const MT = require('../lib/markTaken');
const { questionAnswered } = require('../lib/siteQuestion');
const { pendingFromYesterday } = require('../lib/pendingYesterday');
const { cardPlan } = require('../lib/dosePageState');

const H = 3600 * 1000;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
// The evening reminder: delivered yesterday at 20:00, tapped this morning.
const DELIVERED = local(2026, 10, 2, 20, 0);

// expo-notifications: notification.date is SECONDS on iOS, milliseconds on Android (A-168).
const tapResp = (data, deliveredMs, { ios = false, id = 'n1', action = 'expo.modules.notifications.actions.DEFAULT' } = {}) => ({
  actionIdentifier: action,
  notification: { date: ios ? deliveredMs / 1000 : deliveredMs, request: { identifier: id, content: { data } } },
});
const doseData = { type: 'dose_reminder', protocolId: 1, dayKey: '2026-10-02', ti: 0, slotMs: DELIVERED };
const KINDS = [
  ['dose reminder', doseData, 'Today'],
  ['team message', { type: 'team_message', id: 'm7' }, 'Today'],
  ['food question', { type: 'food_log', dayKey: '2026-10-02' }, 'FoodChat'],
  ['weigh-in', { type: 'checkin_reminder' }, 'Progress'],
  ['vial low', { type: 'vial_low', vialId: 9, protocolId: 4 }, 'Protocols'],
];
const where = (nav) => (nav.screen === 'MainTabs' ? nav.params.screen : nav.screen);
// The target without its nonce (the tap time, different on every call).
const shape = (nav) => JSON.parse(JSON.stringify(nav, (k, v) => (k === 'nonce' || k === 'logIt' ? undefined : v)));

test('A-171: a tap that LAUNCHED the app routes to its reason however long ago the notification arrived (iOS seconds and Android ms)', async () => {
  for (const ageH of [0.01, 11, 13, 30, 24 * 9]) {
    for (const ios of [true, false]) {
      for (const [name, data, screen] of KINDS) {
        const app = makeApp();
        await app.launch(tapResp(data, Date.now() - ageH * H, { ios, id: `${name}-${ageH}` }));
        assert.equal(app.navs.length, 1, `${name}, ${ageH} h old, ${ios ? 'iOS' : 'Android'}: routed`);
        assert.equal(where(app.navs[0]), screen, `${name} → ${screen}`);
      }
    }
  }
  // A launch response without a date (never seen, but harmless) still routes.
  const app = makeApp();
  await app.launch({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request: { identifier: 'x', content: { data: { type: 'checkin_reminder' } } } } });
  assert.equal(app.navs.length, 1);
});

test('A-171: the launch tap lands exactly where the same tap lands with the app in the background', async () => {
  for (const ageH of [0.01, 13, 48]) {
    for (const [name, data] of KINDS) {
      const resp = tapResp(data, Date.now() - ageH * H, { ios: true, id: `bg-${name}` });
      const cold = makeApp();
      await cold.launch(resp);
      const warm = makeApp();
      await warm.background(resp);
      assert.equal(warm.navs.length, 1, `${name}: the background tap routes`);
      assert.deepEqual(shape(cold.navs[0]), shape(warm.navs[0]), `${name}, ${ageH} h: same target cold and warm`);
    }
  }
  // The evening dose reminder tapped next morning: that dose of yesterday on Today.
  const app = makeApp();
  await app.launch(tapResp(doseData, Date.now() - 13 * H, { ios: true }));
  const f = app.navs[0].params.params.focusDose;
  assert.equal(f.protocolId, 1);
  assert.equal(f.dayKey, '2026-10-02');
  assert.equal(f.slotMs, DELIVERED);
  // App.js keeps one routeTap with no age limit on either path.
  const src = read('App.js');
  assert.doesNotMatch(src, /routeTap\([^)]*,\s*12 \* 3600/, 'no 12 h limit on the launch tap');
  assert.doesNotMatch(src, /maxAgeMs/, 'routeTap takes no age limit');
});

test('A-171: a tap already handled is never replayed, whatever its age (stored keys, also across relaunches)', async () => {
  const resp = tapResp(doseData, Date.now() - 40 * H, { ios: false, id: 'dose-1-2026-10-02-t0' });
  // The listener and the launch path deliver the same tap in one process: one navigation.
  const app = makeApp();
  await app.background(resp);
  await app.launch(resp);
  assert.equal(app.navs.length, 1, 'listener + launch: routed once');
  // Android re-delivers the old launch response on a later relaunch: the stored key stops it.
  const disk = fakeStorage();
  const first = makeApp({ storage: disk });
  await first.launch(resp);
  assert.equal(first.navs.length, 1);
  const again = makeApp({ storage: disk });
  await again.launch(resp);
  assert.equal(again.navs.length, 0, 'a relaunch never replays the handled tap');
  // With no age limit the stored key is the only guard, so it must outlive many later taps.
  const later = makeApp({ storage: disk });
  for (let i = 0; i < 150; i++) await later.background(tapResp({ type: 'morning_summary' }, Date.now(), { id: `ms-${i}` }));
  assert.equal(later.navs.length, 150);
  const third = makeApp({ storage: disk });
  await third.launch(resp);
  assert.equal(third.navs.length, 0, 'still not replayed after 150 later taps');
  const list = JSON.parse(disk.store.dosetrace_nav_handled);
  assert.ok(list.length <= 200, 'the stored list stays bounded');
});

// ── A dose already logged is never logged twice from where the launch tap lands ─────────────
const recon = { id: 1, user_id: 'u1', remote_id: 'r1', type: 'recon', active: 1, doses_per_day: 1, interval_days: 1, reminder_time: '20:00', start_date: '2026-09-01', created_at: '2026-09-01T07:00:00.000Z', dose: '0.25', dose_unit: 'mg', amount: '5', unit: 'mg', water: '2' };
function fakeDb(logs) {
  const writes = [];
  return {
    writes,
    deps: {
      getProtocolById: (id) => (id === recon.id ? recon : null),
      getLogsSince: () => logs,
      getActiveVials: () => [{ id: 7, protocol_id: 1, active: 1, doses_taken: 3, total_doses: 20 }],
      insertDoseLog: (row) => { writes.push(['insert', row]); return 100; },
      updateDoseLog: (id, f) => writes.push(['updateLog', id, f]),
      updateVial: (id, f) => writes.push(['updateVial', id, f]),
      updateProtocol: (id, f) => writes.push(['updateProtocol', id, f]),
      planMarkTaken: MT.planMarkTaken,
      markTakenDay: MT.markTakenDay,
      questionAnswered,
    },
  };
}
const recordDoseTaken = (deps) => loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', deps);
const isDoseAlreadyLogged = (deps) => loadFn('lib/doseActions.js', 'export function isDoseAlreadyLogged(', 'isDoseAlreadyLogged', deps);

test('A-171: the launch tap itself writes nothing — it only opens the dose (no take in its target)', () => {
  for (const ageH of [0.01, 13, 72]) {
    const t = notifTapTarget(tapResp(doseData, Date.now() - ageH * H, { ios: true }), Date.now());
    assert.equal(t.params.params.focusDose.take, undefined, 'only My Protocols\' Mark complete carries take (A-42)');
  }
});

test('A-171: yesterday\'s evening dose already logged — the morning launch tap offers nothing to log and a Mark taken for it writes nothing', () => {
  const taken = { id: 41, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 10, 2, 20, 5)).toISOString() };
  const morning = local(2026, 10, 3, 7, 30); // inside yesterday's pending window (slot + 12 h)
  const t = notifTapTarget(tapResp(doseData, DELIVERED, { ios: true }), morning);
  const f = t.params.params.focusDose;
  // Today highlights the focused dose only among yesterday's still-pending slots: none.
  assert.deepEqual(pendingFromYesterday({ protocols: [recon], logs: [taken], nowMs: morning }), []);
  // Not logged yet: the same slot IS pending (the highlight has something to show).
  assert.equal(pendingFromYesterday({ protocols: [recon], logs: [], nowMs: morning }).length, 1);
  // The write path of a pending slot (takePending → writePending → recordDoseTaken) refuses it.
  const db = fakeDb([taken]);
  const r = recordDoseTaken(db.deps)(f.protocolId, { dayKey: f.dayKey, slotMs: f.slotMs });
  assert.equal(r.alreadyLogged, true);
  assert.equal(r.logId, null);
  assert.deepEqual(db.writes, [], 'no row, no vial count');
  // The injectable's site question checks the same before it opens and before it writes.
  assert.equal(isDoseAlreadyLogged(fakeDb([taken]).deps)(f.protocolId, { dayKey: f.dayKey, slotMs: f.slotMs, tapMs: morning }), true);
  assert.equal(isDoseAlreadyLogged(fakeDb([]).deps)(f.protocolId, { dayKey: f.dayKey, slotMs: f.slotMs, tapMs: morning }), false, 'an open dose is still asked');
});

test('A-171: today\'s dose already logged — no focus card is pulled up and a Mark taken writes nothing', () => {
  const morningProto = { ...recon, reminder_time: '08:00' };
  const slot = local(2026, 10, 3, 8, 0);
  const evening = local(2026, 10, 3, 21, 0); // 13 h after the reminder
  const taken = { id: 42, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 10, 3, 8, 10)).toISOString() };
  assert.equal(cardPlan({ protocol: morningProto, logs: [taken], nowMs: evening }).next, null, 'logged: no focus card');
  assert.ok(cardPlan({ protocol: morningProto, logs: [], nowMs: evening }).next, 'open: the focus card shows');
  const db = fakeDb([taken]);
  db.deps.getProtocolById = (id) => (id === 1 ? morningProto : null);
  const r = recordDoseTaken(db.deps)(1, { tapMs: evening, slotMs: slot });
  assert.equal(r.alreadyLogged, true);
  assert.deepEqual(db.writes, []);
});

test('A-171: Today pulls the focused dose up only while it is open, and every take from it goes through the guarded write', () => {
  const today = read('screens/TodayScreen.js');
  const focus = today.slice(today.indexOf('const focusCard = (() => {'), today.indexOf('const isFocusPend'));
  assert.match(focus, /cardPlan\(\{ protocol: p, logs: todayRows, nowMs: Date\.now\(\) \}\)\.next \? p : null/);
  assert.match(today, /const isFocusPend = \(item\) => !!\(notifFocus && notifFocus\.dayKey && notifFocus\.dayKey !== todayKey/);
  assert.match(sliceBlock(today, 'function writePending('), /recordDoseTaken\(protocolId, write\)/);
  assert.match(sliceBlock(today, 'async function markTaken('), /recordDoseTaken\(protocol\.id, opts\.write \|\| \{\}\)/);
  assert.match(sliceBlock(today, 'function commitQuestion('), /isDoseAlreadyLogged\(q\.protocolId, o\)/);
});
