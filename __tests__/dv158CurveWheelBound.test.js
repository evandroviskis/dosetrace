// DV-158 (DL-35; parked-error sweep 2026-10-31): the curve's "Other date" wheel went 10 years back while the
// chart reaches 365 days, so an older date showed "—" with no reason. The wheel (and the bloodwork-date chips)
// stop at the oldest date the window can always reach: today − (CURVE_MAX_PAST_DAYS − 1). The shared wheel
// keeps its default for Protocols, the Calculator and the assistant (curve-only bound via opts.minISO).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { curveOldestReadoutISO, curveWindowDays, curveGridStart, readoutMoment, CURVE_MAX_PAST_DAYS } = require('../lib/serumModel');
const { dateAfter } = require('../lib/wheelPick');

test('DV-158: the oldest pickable date is always inside the drawn window, at any time of day', () => {
  assert.equal(curveOldestReadoutISO('2026-10-31'), '2025-11-01');
  for (const hhmm of ['00:10', '08:00', '12:30', '18:00', '23:50']) {
    const now = new Date(`2026-10-31T${hhmm}:00`).getTime();
    const oldest = curveOldestReadoutISO('2026-10-31');
    const start = curveGridStart(now, curveWindowDays(oldest, '2026-10-31'));
    assert.ok(readoutMoment(oldest, '2026-10-31', now) >= start, hhmm);
  }
  assert.equal(CURVE_MAX_PAST_DAYS, 365);
});

test('DV-158: the wheel cannot settle before the bound; the default wheel still reaches years back', () => {
  const now = new Date('2026-10-31T12:00:00');
  const minISO = curveOldestReadoutISO('2026-10-31');
  assert.equal(dateAfter('2025-11-10', now, 0, 9, { minISO }), minISO); // October 2025 is before the bound
  assert.deepEqual(require('../lib/wheelPick').dateColumns('2025-11-10', now, Array.from({ length: 12 }, String), { minISO })[2].values, ['2025', '2026', '2027', '2028']);
  assert.equal(dateAfter('2025-11-10', now, 2, 0), '2016-11-10');
});

test('DV-158: the curve screen passes the bound to its wheel and drops older bloodwork chips', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /columns=\{dateColumns\(readoutISO, new Date\(\), MONTHS_SHORT\[language\] \|\| MONTHS_SHORT\.en, \{ minISO: oldestReadout \}\)\}/);
  assert.match(src, /setReadoutDate\(dateAfter\(readoutISO, new Date\(\), col, i, \{ minISO: oldestReadout \}\)\)/);
  assert.match(src, /const labChips = labDates\.filter\(\(d\) => d >= oldestReadout\);/);
  assert.match(src, /\{labChips\.map\(d => \{/);
});
