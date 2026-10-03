'use strict';
// My Protocols part 18 (founder 2026-10-02): the prototype wheel replaces the native iOS
// spinner for the start date and the dose time — short months ("Sep"), the chosen row bold
// on a well band, 19 / 21 pt rows, 14 between the title and the wheel, the lighter scrim.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dateColumns, dateAfter, timeColumns, timeAfter } = require('../lib/wheelPick');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const PARTS = read('screens', 'components', 'ProtocolParts.js');
const style = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`, 'g'));
  assert.ok(m && m.length, `style ${name} not found`);
  return m[m.length - 1];
};
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date(2026, 9, 2, 15, 0);

test('date wheel: month, day, year on the chosen date; years 10 back to 2 ahead', () => {
  const c = dateColumns('2026-09-29', NOW, MN);
  assert.equal(c[0].values[c[0].index], 'Sep');
  assert.equal(c[1].values[c[1].index], '29');
  assert.equal(c[2].values[c[2].index], '2026');
  assert.equal(c[2].values[0], '2016');
  assert.equal(c[2].values[c[2].values.length - 1], '2028');
  assert.equal(dateColumns('2009-03-01', NOW, MN)[2].values[0], '2009', 'an older start keeps its year');
  const none = dateColumns('', NOW, MN); // a protocol without a start date opens on today
  assert.equal(none[0].values[none[0].index], 'Oct');
  assert.equal(none[1].values[none[1].index], '2');
});

test('date wheel: turning a column; the day is clamped to the month', () => {
  assert.equal(dateAfter('2026-09-29', NOW, 0, 7), '2026-08-29');
  assert.equal(dateAfter('2026-09-29', NOW, 1, 0), '2026-09-01');
  assert.equal(dateAfter('2026-01-31', NOW, 0, 1), '2026-02-28');
  assert.equal(dateAfter('2026-09-29', NOW, 2, 0), '2016-09-29');
  assert.equal(dateAfter('2024-02-29', NOW, 2, 9), '2025-02-28');
});

test('time wheel: 12-hour hour / minute / AM-PM, 24-hour hour / minute; every minute kept', () => {
  const c = timeColumns('19:42', true, ['AM', 'PM']);
  assert.deepEqual(c.map(x => x.values[x.index]), ['7', '42', 'PM']);
  assert.equal(c[1].values.length, 60);
  assert.deepEqual(timeColumns('00:05', true, ['AM', 'PM']).map(x => x.values[x.index]), ['12', '05', 'AM']);
  assert.deepEqual(timeColumns('19:42', false, ['AM', 'PM']).map(x => x.values[x.index]), ['19', '42']);
  assert.equal(timeAfter('19:42', true, 0, 7), '20:42');
  assert.equal(timeAfter('19:42', true, 2, 0), '07:42');
  assert.equal(timeAfter('07:42', true, 0, 11), '00:42');
  assert.equal(timeAfter('19:42', true, 1, 5), '19:05');
  assert.equal(timeAfter('19:42', false, 0, 6), '06:42');
});

test('part 18: the wizard wheels are DTWheel in the DoseTrace picker sheet, no native spinner', () => {
  assert.doesNotMatch(SCREEN, /display="spinner"/);
  // (review 2026-10-02: the same short months as the date labels, lib/localeFormat)
  assert.match(SCREEN, /<DTWheel\s+columns=\{dateColumns\(startDate, new Date\(\), MONTHS_SHORT\[language\] \|\| MONTHS_SHORT\.en\)\}/);
  assert.match(SCREEN, /onChange=\{\(col, i\) => setStartDate\(dateAfter\(startDate, new Date\(\), col, i\)\)\}/);
  assert.match(SCREEN, /<DTWheel\s+columns=\{timeColumns\(reminderTimes\[activeTimeIndex\] \|\| currentTimeRounded5\(\), wheel12h, dayParts\)\}/);
  // the drawing: 40-high rows, 5 shown, the well band, 19 ink3 rows and the 21 / 600 ink chosen row
  assert.match(PARTS, /export function DTWheel\(/);
  assert.match(PARTS, /const ROW = 40;/);
  assert.match(style(PARTS, 'wheelBand'), /height: 40, borderRadius: 10, backgroundColor: c\.well/);
  assert.match(style(PARTS, 'wheelText'), /fontSize: 19, color: c\.ink3/);
  assert.match(style(PARTS, 'wheelTextOn'), /fontSize: 21, fontWeight: '600', color: c\.ink/);
  assert.match(style(PARTS, 'pickSheet'), /gap: 14/);
  assert.match(style(PARTS, 'scrim'), /backgroundColor: c\.scrim/);
  // each column is adjustable for VoiceOver
  assert.match(PARTS, /accessibilityRole="adjustable"/);
});
