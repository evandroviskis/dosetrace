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
  assert.match(m, /runOnUiThread \{[^}]*val c = Color\.parseColor\(color\)\s*window\.setBackgroundDrawable\(ColorDrawable\(c\)\)/);
});

test('A-194: the JS wrapper is a no-op where the function is missing (older binary, iPhone)', () => {
  const j = read('modules/dt-exact-alarm/index.js');
  assert.match(j, /export function setWindowBackground\(color\) \{\s*if \(!Native \|\| !Native\.setWindowBackground\) return false;/);
});

test('A-194: the app paints the window with the theme ground whenever the theme changes', () => {
  const app = read('App.js');
  assert.match(app, /useEffect\(\(\) => \{ setWindowBackground\(colors\.ground\); \}, \[colors\.ground\]\);/);
});

// A-194 device check 2026-10-30 (Fold7 unfolded, system dark, debug APK with the fix above): the strip
// stayed light. dumpsys showed our window with vsysui=0x10 (LIGHT_NAVIGATION_BAR, dark icons): Samsung's
// taskbar (a navigationBars inset, 168 px) is drawn for a LIGHT bar, and the enforced contrast scrim
// lightens it further. Fix: the same native call sets the navigation-bar appearance from the colour
// (dark ground → light icons → the taskbar is drawn dark) and turns the contrast scrim off.
test('A-194 (2): the bar appearance follows the colour — light icons on a dark ground, dark icons on a light one', () => {
  const m = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt');
  assert.match(m, /val lightBar = Color\.luminance\(c\) > 0\.5f/);
  assert.match(m, /setSystemBarsAppearance\(\s*if \(lightBar\) WindowInsetsController\.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,\s*WindowInsetsController\.APPEARANCE_LIGHT_NAVIGATION_BARS\s*\)/);
  // Android 8-10: the legacy flag, set or cleared the same way
  assert.match(m, /View\.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR/);
});

test('A-194 (2): the contrast scrim behind the navigation bar / taskbar is off (Android 10+)', () => {
  const m = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt');
  assert.match(m, /window\.isNavigationBarContrastEnforced = false/);
});
