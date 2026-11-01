// DV-203 (parked-error sweep 2026-10-31): "Longest unused in your log" (the site picker), the Dose-log site
// editor and the last-site line read only the last 30 days, so a site used 40 days ago looked never used. One
// site-history window for all three: a year (lib/bodySites SITE_HISTORY_DAYS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SITE_HISTORY_DAYS } = require('../lib/bodySites');

test('DV-203: the three site reads use the one year window', () => {
  assert.equal(SITE_HISTORY_DAYS, 365);
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const log = fs.readFileSync(path.join(__dirname, '..', 'screens/LogScreen.js'), 'utf8');
  assert.equal(today.split('since.setDate(since.getDate() - SITE_HISTORY_DAYS);').length - 1, 2);
  assert.equal(log.split('since.setDate(since.getDate() - SITE_HISTORY_DAYS);').length - 1, 1);
});
