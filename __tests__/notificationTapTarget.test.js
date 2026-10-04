'use strict';
// A-44 (founder 2026-09-28, target 1.2.6 → ships in 1.3.0): a notification tap lands on its
// reason — the matching item, highlighted, its action one tap away — not on the Journey hub.
//   dose reminder / follow-up → Today, that exact dose highlighted at the top (Skip / Mark complete)
//   vial running low          → My Protocols, that protocol (its vial and New vial)
//   weekly weigh-in reminder  → Progress, "Log today's weight" opened
//   day-21 reality check      → Progress, scrolled to the reality check
//   morning summary           → Today
//   8 PM food question        → the food chat (unchanged)
// Action buttons stay shortcuts: Snooze and "Nothing else today" never navigate; Mark complete
// opens Today. One router (lib/notificationPlan notifTapTarget) serves the running listener and
// the tap that launched the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifTapTarget } = require('../lib/notificationPlan');
const { read, sliceBlock } = require('./helpers/extractFn');

const NOW = Date.parse('2026-10-03T12:00:00Z');
const resp = (data, actionIdentifier = 'expo.modules.notifications.actions.DEFAULT', identifier = 'x') => ({
  actionIdentifier, notification: { date: NOW, request: { identifier, content: { data } } },
});

test('a dose reminder opens Today on that exact dose', () => {
  const t = notifTapTarget(resp({ type: 'dose_reminder', protocolId: 7, dayKey: '2026-10-03', ti: 1, slotMs: 123 }), NOW);
  assert.equal(t.screen, 'MainTabs');
  assert.equal(t.params.screen, 'Today');
  assert.deepEqual(t.params.params.focusDose, { protocolId: 7, dayKey: '2026-10-03', ti: 1, slotMs: 123, nonce: NOW });
  const f = notifTapTarget(resp({ type: 'dose_followup', protocolId: 7, dayKey: '2026-10-02', ti: 0, slotMs: 99 }), NOW);
  assert.equal(f.params.params.focusDose.dayKey, '2026-10-02', 'a follow-up for yesterday lands on yesterday\'s pending dose');
});

test('vial low opens that protocol in My Protocols (by protocol, or by vial for older alerts)', () => {
  const t = notifTapTarget(resp({ type: 'vial_low', vialId: 9, protocolId: 4, remaining: 1 }), NOW);
  assert.deepEqual(t, { screen: 'MainTabs', params: { screen: 'Protocols', params: { openProtocolId: 4 } } });
  const old = notifTapTarget(resp({ type: 'vial_low', vialId: 9, remaining: 1 }), NOW);
  assert.deepEqual(old.params.params, { openVialId: 9 });
});

test('weigh-in and day-21 reminders open Progress on the weight entry / the reality check', () => {
  assert.deepEqual(notifTapTarget(resp({ type: 'checkin_reminder' }), NOW), { screen: 'Progress', params: { focus: 'weighin', nonce: NOW } });
  assert.deepEqual(notifTapTarget(resp({ type: 'reality_check' }), NOW), { screen: 'Progress', params: { focus: 'reality', nonce: NOW } });
});

test('morning summary → Today; food → the chat; snooze / nothing-else never navigate; Mark complete → Today', () => {
  assert.deepEqual(notifTapTarget(resp({ type: 'morning_summary' }), NOW), { screen: 'MainTabs', params: { screen: 'Today' } });
  assert.equal(notifTapTarget(resp({ type: 'food_log', dayKey: '2026-10-02' }, undefined, 'food-log-2026-10-02'), NOW).screen, 'FoodChat');
  assert.equal(notifTapTarget(resp({ type: 'dose_reminder', protocolId: 7 }, 'SNOOZE_HOUR'), NOW), null);
  assert.equal(notifTapTarget(resp({ type: 'food_log' }, 'FOOD_DAY_DONE'), NOW), null);
  assert.deepEqual(notifTapTarget(resp({ type: 'dose_reminder', protocolId: 7 }, 'MARK_TAKEN'), NOW), { screen: 'MainTabs', params: { screen: 'Today' } });
  assert.equal(notifTapTarget(resp({ type: 'something_new' }), NOW), null);
});

test('App.js routes every tap (listener and launch) through notifTapTarget', () => {
  const app = read('App.js');
  const at = app.indexOf('notifResponseSub = N.addNotificationResponseReceivedListener(response =>');
  const listener = sliceBlock(app.slice(at), 'response => {');
  assert.match(listener, /routeTap\(response, 0\)/);
  assert.doesNotMatch(listener, /screen: 'Journey'/, 'no tap lands on the Journey hub');
  assert.match(app, /getLastNotificationResponseAsync\(\)\.then\(\(last\) => \{ if \(last\) routeTap\(last, 12 \* 3600 \* 1000\); \}\)/);
  assert.match(app, /const target = notifTapTarget\(response, Date\.now\(\)\);/);
  assert.match(app, /nav\.navigate\('Main', \{ screen: target\.screen, params: target\.params \}\);/);
});

test('the vial alert carries its protocol; Today, Protocols and Progress act on the target', () => {
  assert.match(read('lib/notifications.js'), /data: \{ type: 'vial_low', vialId: v\.id, protocolId: v\.protocol_id, remaining \}/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /route\.params\?\.focusDose/);
  assert.match(today, /t\('today_notif_focus_title'\)/);
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /route\.params\?\.openVialId/);
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /focus !== 'weighin'/);
  assert.match(read('screens/ProgressScreen.js'), /route\.params\.nonce/);
});
