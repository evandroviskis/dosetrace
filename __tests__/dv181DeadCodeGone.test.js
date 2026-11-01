// DV-181 (parked-error sweep 2026-10-31; rebuild = replace): dead code and unused copy are deleted, not kept
// "just in case". Each name below was set and never read, exported and never imported, or a string no
// screen shows. keepUndo stays: it clears the A-78 undone mark (its never-read record map is gone).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-181: dead code is gone', () => {
  const today = read('screens/TodayScreen.js');
  for (const n of ['expiryColor', 'undoRecordsRef', 'monthConsistency', 'setMonthAdherence', /\bendProtocol,/]) assert.doesNotMatch(today, n instanceof RegExp ? n : new RegExp(`\\b${n}\\b`), String(n));
  assert.doesNotMatch(read('screens/ProtocolsScreen.js'), /\btotalDoses\b|setTotalDoses|up to 5 active/);
  assert.doesNotMatch(read('screens/SettingsScreen.js'), /BIRTH_YEARS/);
  assert.doesNotMatch(read('lib/vialExpiry.js'), /expiryColor/);
  assert.doesNotMatch(read('lib/nutrition.js'), /rollingAvgKcal|unloggedCheckDays/);
  assert.doesNotMatch(read('lib/database.js'), /getFoodLogDayCount/);
  assert.doesNotMatch(read('App.js'), /consent: false/);
  assert.match(today, /function keepUndo\(record\) \{\s*if \(record && record\.logId != null\) \{\s*undoneIdsRef\.current\.delete\(record\.logId\);/);
});

test('DV-181: copy no screen shows is gone in all six languages', () => {
  const { translations } = require('../i18n/translations');
  const dead = ['cal_overview_title', 'cal_rc_rate_gained', 'cal_rc_rate_losing', 'cal_rc_rate_lost', 'cal_rc_start_weight',
    'cal_rc_why_1', 'cal_rc_why_2', 'cal_rc_why_3', 'cal_rc_why_4', 'cal_rc_why_5', 'cal_rc_why_title', 'notif_morning_body',
    'nutri_run_rule', 'today_alert_rc_remove_msg', 'today_alert_rc_remove_title'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of dead) assert.equal(translations[l][k], undefined, `${l}.${k}`);
});
