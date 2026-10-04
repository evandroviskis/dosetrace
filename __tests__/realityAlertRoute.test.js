'use strict';
// Pre-build pass 2026-10-03, m6: Today's reality-check alert opened the Journey hub. The tap now
// lands on the reality check itself: Progress, scrolled to the reality-check card (the same
// card the check lives in; Q-N "the reality check lives inside Progress").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the Today alert opens Progress on the reality check', () => {
  const src = read('screens/TodayScreen.js');
  const i = src.indexOf("id: 'reality_check'");
  const alert = src.slice(i, src.indexOf('snoozeId', i));
  assert.match(alert, /onPress: \(\) => navigation\.navigate\('Progress', \{ focus: 'reality' \}\)/);
  assert.doesNotMatch(alert, /navigate\('Journey'\)/);
});

test('Progress passes the focus to the calculator, which scrolls to the reality-check card once', () => {
  const prog = read('screens/ProgressScreen.js');
  assert.match(prog, /focus=\{embedded \? null : \(route && route\.params && route\.params\.focus\) \|\| null\}/);
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /export default function CalculatorSection\(\{[^}]*focus = null[^}]*\}\)/);
  assert.match(calc, /<View key="rc" style=\{s\.card\} onLayout=\{onRcLayout\}>/);
  assert.match(calc, /if \(focus !== 'reality' \|\| !loaded \|\| rcY == null \|\| focusedRef\.current\) return;/);
  assert.match(calc, /scrollRef\.current\.scrollTo\(\{ y: Math\.max\(0, rcY - 8\), animated: true \}\)/);
});
