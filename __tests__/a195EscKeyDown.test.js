// A-195 (Gate S 2026-10-28; root cause on the S25 and the Fold, Android 17, 2026-10-31): a hardware
// Esc closed the New protocol wizard without the discard question. Android 17 dismisses a dialog on
// the Esc key-DOWN; React Native 0.81's Modal only catches Back/Esc on key-UP (ReactModalHostView.kt),
// so the dialog was gone before JS was asked. Founder approved the native fix for the next store
// build (2026-10-31 "Aprovo"). The app's own module takes over every Modal dialog's key listener:
// Esc down is consumed, Esc/Back up go through the dialog's back dispatcher (React Native's own
// onRequestClose path), other keys go to the activity as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('A-195: an Esc key-down on a Modal dialog is consumed before Android can dismiss it', () => {
  const g = read('ModalEscGuard.kt');
  assert.match(g, /keyCode == KeyEvent\.KEYCODE_ESCAPE && event\.action == KeyEvent\.ACTION_DOWN\) return@setOnKeyListener true/);
});

test('A-195: Esc/Back key-up still ask JS (the dialog back dispatcher = React Native onRequestClose)', () => {
  const g = read('ModalEscGuard.kt');
  assert.match(g, /dialog\.onBackPressedDispatcher\.onBackPressed\(\)/);
  // other keys keep React Native's behaviour: key-up goes to the activity (dev menu etc.)
  assert.match(g, /activity\.onKeyUp\(keyCode, event\)/);
});

test('A-195: every Modal dialog is found, nested ones too, each patched once', () => {
  const g = read('ModalEscGuard.kt');
  // the Modal host view is not in the activity's view tree (Fabric): the dialogs are found among the app's windows
  assert.match(g, /WindowInspector\.getGlobalWindowViews\(\)/);
  assert.match(g, /is ReactModalHostView\.DialogRootViewGroup/);
  assert.match(g, /findViewTreeOnBackPressedDispatcherOwner\(\) as\? ComponentDialog/);
  assert.match(g, /addOnWindowFocusChangeListener/);
  assert.match(g, /watch\(activity, root\)/); // a Modal over a Modal: the dialog's own window is watched too
  assert.match(g, /WeakHashMap/); // each dialog and window patched once
});

test('A-195: the module installs the guard on the activity', () => {
  const m = read('DtExactAlarmModule.kt');
  assert.match(m, /ModalEscGuard\.install\(/);
  assert.match(m, /OnActivityEntersForeground/);
});
