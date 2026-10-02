'use strict';
// Q3 = C (founder 2026-10-02, "Barras: Q3=C"): the food entry editor matches the prototype
// foodEditor (docs/design/prototype.html): no category chips per item, and the day is the
// shared bar Today / Yesterday / Earlier day instead of the stepper. Earlier day shows the
// stepper under the bar, limited to 2…7 days ago (catch-ups are max 7 days, founder rule),
// starting at 2. An entry already dated 2–7 days ago opens on Earlier day at its own day.
// The stored category is NOT dropped or changed: the item keeps whatever it had.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(__dirname, '..', ...p));
const TODAY = '2026-10-02';

function lib() {
  assert.ok(exists('lib', 'foodEntryDay.js'), 'lib/foodEntryDay.js not built yet');
  return require('../lib/foodEntryDay');
}

test('Q3: an entry opens on the segment of its own day', () => {
  const d = lib();
  assert.equal(d.dayChoice('2026-10-02', TODAY), 'today');
  assert.equal(d.dayChoice('2026-10-01', TODAY), 'yesterday');
  assert.equal(d.dayChoice('2026-09-30', TODAY), 'earlier', '2 days ago');
  assert.equal(d.dayChoice('2026-09-25', TODAY), 'earlier', '7 days ago');
  assert.equal(d.dayChoice('2026-09-10', TODAY), 'earlier', 'older entries stay on Earlier day at their own date');
  assert.equal(d.daysAgo('2026-09-25', TODAY), 7);
  assert.equal(d.daysAgo('2026-03-01', '2026-03-02'), 1, 'month edge');
  assert.equal(d.daysAgo('2026-03-29', '2026-03-30'), 1, 'DST week (Europe) is still one day');
});

test('Q3: Today = 0, Yesterday = 1, Earlier day = 2 (or the day it already had)', () => {
  const d = lib();
  assert.equal(d.pickDay('today', '2026-09-28', TODAY), '2026-10-02');
  assert.equal(d.pickDay('yesterday', '2026-10-02', TODAY), '2026-10-01');
  assert.equal(d.pickDay('earlier', '2026-10-02', TODAY), '2026-09-30', 'from Today: 2 days ago');
  assert.equal(d.pickDay('earlier', '2026-10-01', TODAY), '2026-09-30', 'from Yesterday: 2 days ago');
  assert.equal(d.pickDay('earlier', '2026-09-27', TODAY), '2026-09-27', 'already earlier: keeps its day');
  assert.equal(d.pickDay('earlier', '2026-09-10', TODAY), '2026-09-10', 'an older entry is never moved by a tap on its own segment');
});

test('Q3: the Earlier day stepper stays within 2…7 days ago and never moves a date on its own', () => {
  const d = lib();
  assert.equal(d.EARLIER_MIN, 2);
  assert.equal(d.EARLIER_MAX, 7);
  assert.equal(d.stepEarlier('2026-09-30', -1, TODAY), '2026-09-29', 'one day older');
  assert.equal(d.stepEarlier('2026-09-29', 1, TODAY), '2026-09-30', 'one day newer');
  assert.equal(d.stepEarlier('2026-09-30', 1, TODAY), '2026-09-30', 'not newer than 2 days ago (that is Yesterday)');
  assert.equal(d.stepEarlier('2026-09-25', -1, TODAY), '2026-09-25', 'not older than 7 days ago');
  assert.deepEqual(d.earlierBounds('2026-09-30', TODAY), { canOlder: true, canNewer: false });
  assert.deepEqual(d.earlierBounds('2026-09-25', TODAY), { canOlder: false, canNewer: true });
  // An entry logged before this rule, 10 days ago: untouched unless the user moves it newer.
  assert.deepEqual(d.earlierBounds('2026-09-22', TODAY), { canOlder: false, canNewer: true });
  assert.equal(d.stepEarlier('2026-09-22', -1, TODAY), '2026-09-22');
  assert.equal(d.stepEarlier('2026-09-22', 1, TODAY), '2026-09-23');
});

test('Q3: the editor has the day bar and no category chips; the stored category is kept', () => {
  const src = read('screens', 'components', 'FoodEntryEditor.js');
  assert.doesNotMatch(src, /nutri_cat_/, 'category chips are still rendered');
  assert.doesNotMatch(src, /CATEGORIES/, 'the editor no longer offers categories');
  assert.doesNotMatch(src, /\n\s+cats?(On|Text|TextOn)?: \{/, 'the chip styles are gone');
  const i = src.indexOf('<SegmentedBar');
  assert.ok(i > 0, 'the day is the shared bar');
  const bar = src.slice(i, src.indexOf('/>', i));
  assert.match(bar, /nutri_day_today/);
  assert.match(bar, /nutri_day_yesterday/);
  assert.match(bar, /nutri_day_earlier/);
  assert.match(src, /dayChoice\(date, today\)/);
  assert.match(src, /pickDay\(/);
  assert.match(src, /stepEarlier\(/);
  assert.match(src, /dayChoice\(date, today\) === 'earlier'/, 'the stepper shows only on Earlier day');
  // The items are saved as they were read (category included); nothing sets or clears it.
  assert.doesNotMatch(src, /setField\(i, 'category'/);
  assert.doesNotMatch(src, /category: (null|undefined|'')/);
  // lib/nutrition keeps the original category when an answer has none.
  assert.match(read('lib', 'nutrition.js'), /: orig\.category/);
});

test('Q3: "Earlier day" exists in all 6 languages; Today / Yesterday reuse the existing keys', () => {
  const want = { en: 'Earlier day', es: 'Otro día', pt: 'Outro dia', fr: 'Autre jour', de: 'Anderer Tag', it: 'Altro giorno' };
  for (const [l, v] of Object.entries(want)) {
    assert.equal(translations[l].nutri_day_earlier, v, l);
    assert.ok(translations[l].nutri_day_today && translations[l].nutri_day_yesterday, l);
  }
});
