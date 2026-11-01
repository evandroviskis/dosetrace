// DV-138 (parked-error sweep 2026-10-31): shouldWarnLate re-implemented remindersMatter inline. One owner now;
// the answers are unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { shouldWarnLate } = require('../lib/reminderHealth');

test('DV-138: same answers through remindersMatter', () => {
  const base = { os: 'android', exactAlarms: false, remindersOn: true, silent: false, activeWithTime: 2 };
  assert.equal(shouldWarnLate(base), true);
  assert.equal(shouldWarnLate({ ...base, silent: true }), false);
  assert.equal(shouldWarnLate({ ...base, activeWithTime: 0 }), false);
  assert.equal(shouldWarnLate({ ...base, os: 'ios' }), false);
  assert.equal(shouldWarnLate({ ...base, exactAlarms: true }), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/reminderHealth.js'), 'utf8');
  assert.match(src, /return h\.os === 'android' && h\.exactAlarms === false && remindersMatter\(h\);/);
});
