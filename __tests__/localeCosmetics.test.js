'use strict';
// Review 2026-10-02 (cosmetic, item 5):
//  - the measured date columns shrink back when the language changes (a stale layout from
//    the old language is ignored);
//  - UI-thread numbers (the animated level, the previews) pick up a language change;
//  - the date wheels show the same short months as the date labels ("out." not "Out");
//  - dates and grouping follow CLDR/ICU exactly (Spanish "sept"/"oct" without a dot,
//    Italian 4-digit numbers ungrouped, German standalone weekday "Mo").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatDate, formatInt, MONTHS_SHORT } = require('../lib/localeFormat');
const { columnWidthState, columnWidthOf } = require('../lib/columnWidth');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LOC = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const norm = (s) => s.replace(/[  ]/g, ' ');

test('every date style matches ICU (node full-icu) in all six languages', () => {
  const styles = [
    ['dayMonth', { month: 'short', day: 'numeric' }],
    ['dayMonthYear', { month: 'short', day: 'numeric', year: 'numeric' }],
    ['weekdayDayMonth', { weekday: 'short', month: 'short', day: 'numeric' }],
    ['weekdayDayMonthYear', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }],
    ['long', { month: 'long', day: 'numeric', year: 'numeric' }],
    ['weekdayLong', { weekday: 'long', month: 'long', day: 'numeric' }],
    ['weekday', { weekday: 'short' }],
  ];
  for (const l of Object.keys(LOC)) {
    for (let m = 0; m < 12; m++) for (const d of [1, 9, 28]) {
      const dt = new Date(2026, m, d, 12);
      for (const [st, o] of styles) {
        assert.equal(formatDate(dt, l, st), norm(dt.toLocaleDateString(LOC[l], o)), `${l} ${st} ${dt.toDateString()}`);
      }
    }
  }
  assert.equal(formatDate('2026-09-30', 'es'), '30 sept');
  assert.equal(formatDate('2026-10-19', 'es'), '19 oct');
  assert.equal(formatDate('2026-10-19', 'de', 'weekday'), 'Mo');
});

test('whole-number grouping matches ICU (Italian and Spanish leave 4-digit numbers ungrouped)', () => {
  for (const l of Object.keys(LOC)) {
    for (const n of [980, 2480, 24800, 1234567]) assert.equal(norm(formatInt(n, l)), norm(n.toLocaleString(LOC[l])), `${l} ${n}`);
  }
  assert.equal(formatInt(2480, 'it'), '2480');
  assert.equal(formatInt(24800, 'it'), '24.800');
});

test('a measured column starts over on a new language and ignores a stale layout', () => {
  let st = columnWidthState(undefined, { key: 'pt', w: 69 });
  assert.equal(columnWidthOf(st, 'pt', 64), 69);
  // the language changes to English: the old width no longer counts
  assert.equal(columnWidthOf(st, 'en', 64), 64);
  // a late layout event from the Portuguese row is ignored
  st = columnWidthState(st, { key: 'pt', w: 69, current: 'en' });
  assert.equal(columnWidthOf(st, 'en', 64), 64);
  st = columnWidthState(st, { key: 'en', w: 49, current: 'en' });
  assert.equal(columnWidthOf(st, 'en', 64), 64);
  st = columnWidthState(st, { key: 'en', w: 70, current: 'en' });
  assert.equal(columnWidthOf(st, 'en', 64), 70);
  const hook = read('components', 'useColumnWidth.js');
  assert.match(hook, /columnWidthState/);
  assert.match(hook, /columnWidthOf/);
});

test('the measured cells report their own text width, never the stretched column', () => {
  const today = read('screens', 'TodayScreen.js');
  assert.match(today, /<Text style=\{\[s\.upDay, s\.measureSelf\]\} numberOfLines=\{1\} onLayout=\{onUpColLayout\}>/);
  const calc = read('screens', 'components', 'CalculatorSection.js');
  assert.match(calc, /<View style=\{\[s\.dayDate, \{ minWidth: dateColW \}\]\}><Text style=\{\[s\.sec, s\.tnum, s\.measureSelf\]\} numberOfLines=\{1\} onLayout=\{onDateColLayout\}>/);
});

test('UI-thread numbers and previews remount on a language change', () => {
  assert.match(read('components', 'AccumulationHero.js'), /<AnimatedNumber key=\{language\}/);
  assert.match(read('screens', 'SerumCurveScreen.js'), /<AnimatedNumber key=\{language\} value=\{statLevel\}/);
  assert.match(read('components', 'FeaturePreviews.js'), /<f\.Fx key=\{language\}/);
  assert.match(read('components', 'FeatureExplainers.js'), /<Fx key=\{language\}/);
});

test('the date wheels use the same short months as the labels', () => {
  for (const f of [['screens', 'SerumCurveScreen.js'], ['screens', 'ProtocolsScreen.js'], ['screens', 'components', 'CalculatorSection.js']]) {
    const src = read(...f);
    assert.doesNotMatch(src, /dateColumns\([^)]*MONTH_KEYS/, f.join('/'));
  }
  assert.match(read('screens', 'components', 'CalculatorSection.js'), /const monthLabels = MONTHS_SHORT\[language\] \|\| MONTHS_SHORT\.en;/);
  assert.equal(MONTHS_SHORT.pt[9], 'out.');
});
