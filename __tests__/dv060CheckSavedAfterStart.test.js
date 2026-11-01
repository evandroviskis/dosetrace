// DV-060 (parked-error sweep 2026-10-31): a new reality check started on the day of the previous result's
// weigh-in (W) counted as "already saved" (a result dated >= its start), so it showed the old result, blocked
// the typed-calories link and never finished while the 8 PM question and the alerts ran until Stop. A result
// belongs to a check only when it is dated AFTER the check's start (a check cannot finish on its first day).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-060: both predicates compare results dated after the start', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  assert.match(src, /const checkSaved = !!rcStart && realityLog\.some\(c => c\.date > rcStartISO\);/);
  const fn = src.match(/async function completeRealityCheck\(res\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /if \(getRealityChecks\(uid\)\.some\(r => r\.entry_date > startDay\)\) return;/);
});

test('DV-060: a result on W never closes a check that starts on W', () => {
  const saved = (log, start) => log.some((c) => c.date > start);
  assert.equal(saved([{ date: '2026-10-10' }], '2026-10-10'), false);
  assert.equal(saved([{ date: '2026-10-31' }], '2026-10-10'), true);
});
