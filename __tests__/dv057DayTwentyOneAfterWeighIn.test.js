// DV-057 (parked-error sweep 2026-10-31): the day-21 "weigh in for your real numbers" reminder (10:00) was planned
// from the start date only and never re-planned on a weigh-in, so it fired after the person had already weighed in
// that morning. A weigh-in on or after the due day cancels it, and every saved Progress change re-plans it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-057: the reminder is not wanted once the due day has a weigh-in', () => {
  const n = read('lib/notifications.js');
  const fn = n.slice(n.indexOf('export async function syncRealityCheckReminder('), n.indexOf('export async function syncRealityCheckReminder(') + 2200);
  assert.match(fn, /hasWeighInOnOrAfter\(dueKey\)/);
  assert.match(fn, /if \(weighed\) \{ await none\(\); return; \}/);
  const db = read('lib/database.js');
  assert.match(db, /export function hasWeighInOnOrAfter\(dateKey\) \{/);
  assert.match(db, /SELECT 1 FROM calc_snapshots WHERE entry_date >= \? AND weight_kg IS NOT NULL AND sync_status != 'deleted' LIMIT 1/);
});

test('DV-057: every weigh-in write re-plans it (through syncAllNotifications)', () => {
  const c = read('screens/components/CalculatorSection.js');
  for (const h of ['function saveTodayWeighIn(', 'function saveBackfillWeighIn(', 'function applyWeightEdit(', 'function saveWeighInEdit(', 'function deleteWeighInNow(']) {
    const i = c.indexOf(h); assert.match(c.slice(i, c.indexOf('\n  }\n', i)), /calcChanged\(\);\n    syncAllNotifications\(\)\.catch\(\(\) => \{\}\); \/\/ DV-057/, h);
  }
});
