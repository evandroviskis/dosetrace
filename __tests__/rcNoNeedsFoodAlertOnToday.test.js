// Founder 2026-11-24: on Today, the reality-check alert "Weight logged — log food N more days in a row
// for your result" has no function: the food-log reminder already asks for food every day, and the
// alert only predicts what she has not done yet. After the weigh-in, Today shows no reality-check
// alert while food days are missing; the state stays on Progress (the check's own card).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { todayShowsCheckAlert } = require('../lib/realityCheckRules');

test('Today shows the check alert for every state except needs_food', () => {
  assert.equal(todayShowsCheckAlert('needs_food'), false);
  for (const k of ['when', 'due', 'ready', 'locked', 'no_result']) assert.equal(todayShowsCheckAlert(k), true, k);
});

test('Today uses the rule and no longer renders the needs-food line', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  assert.match(src, /todayShowsCheckAlert\(kind\)/);
  assert.doesNotMatch(src, /today_alert_rc_needs_food/);
});

test('Progress still says how many food days are missing', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/components/CalculatorSection.js'), 'utf8');
  assert.match(src, /today_alert_rc_needs_food/);
});
