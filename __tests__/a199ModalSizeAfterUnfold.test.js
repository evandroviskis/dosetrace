'use strict';
// A-199 (Fold7 2026-10-30): with the app started on the closed Fold and the phone then opened, a
// sheet in a React Native Modal ("Never guess the draw") appeared shifted left, cut off the screen.
// Cause: React Native sizes a new Modal from DisplayMetricsHolder's cached SCREEN metrics, filled at
// start; MainActivity handles fold changes itself (plugins/withFoldConfigChanges: no activity restart),
// so the cache kept the closed-Fold width. Fix: our native module refreshes React Native's display
// metrics on every configuration change (fold / unfold), so the next Modal takes the real size.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const KT = 'modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt';

test('A-199: a configuration change (fold / unfold) refreshes React Native display metrics', () => {
  const m = read(KT);
  assert.match(m, /import com\.facebook\.react\.uimanager\.DisplayMetricsHolder/);
  assert.match(m, /override fun onConfigurationChanged\(newConfig: Configuration\) \{[^}]*DisplayMetricsHolder\.initDisplayMetrics\(/);
});

test('A-199: the callback is registered when the module starts and removed when it stops', () => {
  const m = read(KT);
  assert.match(m, /OnCreate \{[\s\S]*?registerComponentCallbacks\(/);
  assert.match(m, /OnDestroy \{[\s\S]*?unregisterComponentCallbacks\(/);
});

test('A-199: the activity still handles fold changes itself (the cause stays, the fix covers it)', () => {
  assert.match(read('plugins/withFoldConfigChanges.js'), /'smallestScreenSize'/);
});
