'use strict';
// A-171 review (2026-10-26): with the launch-tap age limit gone, an OLD 8 PM food question tapped
// today opened the food chat on the notification's own day, with "Log it" / "Done for that day" —
// so food could be written more than 7 days back, past the catch-up rule (FL-2 / FL-45,
// lib/nutrition MAX_CATCHUP_DAYS: older food is too hard to remember exactly and is not logged).
// Now a reminder day older than MAX_CATCHUP_DAYS is ignored where the tap params are built
// (lib/notificationPlan foodTapParams), so the cold-start tap and the background tap both open the
// food chat on TODAY. Up to 7 days back still opens that day, as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { foodTapParams, notifTapTarget } = require('../lib/notificationPlan');
const { MAX_CATCHUP_DAYS } = require('../lib/nutrition');
const { makeApp } = require('./helpers/routeTapHarness');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = local(2026, 10, 26, 9, 0); // a Monday morning
const foodResp = (dayKey, { id = 'food-log-' + dayKey, action = 'expo.modules.notifications.actions.DEFAULT', deliveredMs = local(2026, 10, 1, 20) } = {}) => ({
  actionIdentifier: action,
  notification: { date: deliveredMs, request: { identifier: id, content: { data: { type: 'food_log', dayKey } } } },
});

test('A-171: the catch-up limit is the food log\'s own (7 days)', () => {
  assert.equal(MAX_CATCHUP_DAYS, 7);
});

test('A-171: a food question up to 7 days old still opens on its own day', () => {
  for (const day of ['2026-10-26', '2026-10-25', '2026-10-20', '2026-10-19']) {
    assert.deepEqual(foodTapParams(foodResp(day), NOW), { eveningDay: day, nonce: NOW }, day);
  }
});

test('A-171: a food question more than 7 days old opens the food chat on today, never on its day', () => {
  for (const day of ['2026-10-18', '2026-10-02', '2026-09-01', '2025-10-26']) {
    assert.deepEqual(foodTapParams(foodResp(day), NOW), { eveningDay: null, nonce: NOW }, day);
    // The day read from the id only (Android headless shape) obeys it too.
    const android = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date: 1, request: { identifier: 'food-log-' + day, content: { data: { dataString: '{"type":"food_log"}' } } } } };
    assert.deepEqual(foodTapParams(android, NOW), { eveningDay: null, nonce: NOW }, 'id ' + day);
    // A snoozed copy of an old question as well.
    assert.deepEqual(foodTapParams(foodResp(day, { id: 'snz-food-log-' + day }), NOW), { eveningDay: null, nonce: NOW }, 'snz ' + day);
    assert.deepEqual(notifTapTarget(foodResp(day), NOW), { screen: 'FoodChat', params: { eveningDay: null, nonce: NOW } });
  }
  // The buttons are unchanged: "Log it" opens the composer (today), the others never navigate.
  assert.deepEqual(foodTapParams(foodResp('2026-10-02', { action: 'FOOD_LOG_IT' }), NOW), { logIt: NOW });
  assert.equal(foodTapParams(foodResp('2026-10-02', { action: 'FOOD_DAY_DONE' }), NOW), null);
});

test('A-171: the tap that launched the app and the background tap both open today for an old question', async () => {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const cold = makeApp();
    await cold.launch(foodResp('2026-10-02', { id: 'food-log-2026-10-02' }));
    assert.equal(cold.navs.length, 1);
    assert.deepEqual(cold.navs[0], { screen: 'FoodChat', params: { eveningDay: null, nonce: NOW } });
    const warm = makeApp();
    await warm.background(foodResp('2026-10-03', { id: 'food-log-2026-10-03' }));
    assert.equal(warm.navs.length, 1);
    assert.deepEqual(warm.navs[0], { screen: 'FoodChat', params: { eveningDay: null, nonce: NOW } });
    // Within the 7 days, both paths still open the question's own day.
    const recent = makeApp();
    await recent.launch(foodResp('2026-10-21', { id: 'food-log-2026-10-21' }));
    assert.deepEqual(recent.navs[0], { screen: 'FoodChat', params: { eveningDay: '2026-10-21', nonce: NOW } });
  } finally {
    Date.now = realNow;
  }
});
