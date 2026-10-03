'use strict';
// Founder 2026-10-02: in Portuguese the "Your reality check so far" day list wrapped its date
// ("30 de / set.") in a fixed 64 pt column. The column is now as wide as its widest date in
// the app language (measured on screen, components/useColumnWidth), never less than 64 pt,
// one line, and the date is the short day + month (a check is at most 21 days long).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatDate } = require('../lib/localeFormat');

const ROOT = path.join(__dirname, '..');
const CALC = fs.readFileSync(path.join(ROOT, 'screens', 'components', 'CalculatorSection.js'), 'utf8');
const HOOK = fs.readFileSync(path.join(ROOT, 'components', 'useColumnWidth.js'), 'utf8');

test('the so-far date column has no fixed width: it measures its widest date, at least 64 pt', () => {
  assert.doesNotMatch(CALC, /dayDate: \{ width: 64 \}/, 'the fixed 64 pt column is gone');
  assert.match(CALC, /const \[dateColW, onDateColLayout\] = useColumnWidth\(64, language\);/);
  assert.match(CALC, /<Text style=\{\[s\.sec, s\.tnum, s\.dayDate, \{ minWidth: dateColW \}\]\} numberOfLines=\{1\} onLayout=\{onDateColLayout\}>\{formatDate\(r\.date, language, 'dayMonth'\)\}<\/Text>/);
  assert.match(CALC, /dayDate: \{ flexShrink: 0 \}/);
});

test('useColumnWidth keeps the widest cell, never less than the minimum, and restarts on a new language', () => {
  assert.match(HOOK, /setMeasured\(\(prev\) => \(w > prev \? w : prev\)\)/);
  assert.match(HOOK, /return \[Math\.max\(min, measured\), onLayout\];/);
  assert.match(HOOK, /useEffect\(\(\) => \{ setMeasured\(0\); \}, \[resetKey\]\);/);
});

test('the so-far dates in every language are one short day + month (the longest ones)', () => {
  const longest = { en: 'Sep 30', pt: '30 de set.', es: '30 sept.', fr: '30 juil.', de: '30. Sept.', it: '30 set' };
  for (const [l, s] of Object.entries(longest)) {
    const d = l === 'fr' ? '2026-07-30' : '2026-09-30';
    assert.equal(formatDate(d, l, 'dayMonth'), s, l);
    assert.doesNotMatch(s, /\d{4}/, `${l}: no year in the 21-day list`);
  }
});
