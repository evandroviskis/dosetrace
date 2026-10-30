'use strict';
// A-194 (Gate S pass on the Fold, 2026-10-28): on the unfolded Fold the system taskbar area under the
// tab bar is painted with the Android WINDOW background, which never followed the app theme (a light
// strip, also in dark). Fix: the window background follows the theme's ground colour, through our own
// native module (no new dependency); a binary without the function does nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('A-194: the native module sets the window background on the UI thread', () => {
  const m = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt');
  assert.match(m, /Function\("setWindowBackground"\) \{ color: String ->/);
  assert.match(m, /runOnUiThread \{[^}]*window\.setBackgroundDrawable\(ColorDrawable\(Color\.parseColor\(color\)\)\)/);
});

test('A-194: the JS wrapper is a no-op where the function is missing (older binary, iPhone)', () => {
  const j = read('modules/dt-exact-alarm/index.js');
  assert.match(j, /export function setWindowBackground\(color\) \{\s*if \(!Native \|\| !Native\.setWindowBackground\) return false;/);
});

test('A-194: the app paints the window with the theme ground whenever the theme changes', () => {
  const app = read('App.js');
  assert.match(app, /useEffect\(\(\) => \{ setWindowBackground\(colors\.ground\); \}, \[colors\.ground\]\);/);
});
