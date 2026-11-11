// A-155 (Fold, build 54, 2026-10-20): Progress › Your numbers had the Waist field focused; Set a
// target was opened and closed (Back twice) and a tap on Weigh-ins showed the numeric keyboard with
// no visible field focused. Root cause: opening a sheet never ended the typing behind it. On Android
// a Modal (and the system date dialog) is its own window: the page's field keeps its focus in the
// page window (and in React Native's TextInputState), the keyboard only hides because the new
// window has no field. When the sheet closes, the page window takes the focus back with that field
// still focused, and Android brings its keyboard back — over a field that may have scrolled away
// or sit under a folded section. Fix (one owner): every overlay ends the typing behind it as it
// opens — components/PresenceModal (every Modal in the app) and the Android system date/time
// dialog (ProtocolParts SystemPicker), through useReleaseFieldBehind (components/tapAwayKeyboard),
// rule lib/fieldBehind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { releaseFieldBehind } = require('../lib/fieldBehind');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Android's windows as the Fold showed them: each window keeps its own focused field; the keyboard
// follows the focused window, and a window that takes the focus back with a field still focused
// brings that field's keyboard back. currentlyFocused = React Native's TextInputState.
function fold() {
  const windows = [{ name: 'page', field: null }];
  const top = () => windows[windows.length - 1];
  const dev = {
    keyboard: false,
    currentlyFocused: null,
    focus(field) { top().field = field; dev.currentlyFocused = field; dev.keyboard = true; },
    // Keyboard.dismiss(): TextInputState.blurTextInput(currentlyFocusedInput()).
    dismiss() {
      const f = dev.currentlyFocused;
      if (!f) return;
      for (const w of windows) if (w.field === f) w.field = null;
      dev.currentlyFocused = null;
      dev.keyboard = false;
    },
    // A sheet opens: its overlay runs what it runs on opening, then its window takes the focus.
    openSheet(onOpen) {
      if (onOpen) onOpen();
      windows.push({ name: 'sheet', field: null });
      dev.keyboard = false;
    },
    // Back closes the sheet: the page window takes the focus back.
    closeSheet() {
      windows.pop();
      if (top().field) dev.keyboard = true;
    },
  };
  return dev;
}
const overlayOpening = (dev) => () => releaseFieldBehind({ focused: () => dev.currentlyFocused, dismiss: () => dev.dismiss() });

test('A-155: the Fold path — Waist typed, Set a target opened and closed — leaves no keyboard and no field focused', () => {
  const dev = fold();
  dev.focus('waist');
  dev.openSheet(overlayOpening(dev));
  dev.closeSheet(); // Back
  assert.equal(dev.keyboard, false, 'the keyboard does not come back after the sheet closes');
  assert.equal(dev.currentlyFocused, null, 'the Waist field is no longer being typed');
});

test('A-155: without the release the model reproduces the Fold (the keyboard comes back for the hidden field)', () => {
  const dev = fold();
  dev.focus('waist');
  dev.openSheet(null);
  dev.closeSheet();
  assert.equal(dev.keyboard, true);
  assert.equal(dev.currentlyFocused, 'waist');
});

test('A-155: a sheet opened over a sheet (the target date wheel over the target weight) ends that typing too', () => {
  const dev = fold();
  dev.openSheet(overlayOpening(dev));
  dev.focus('targetWeight');
  dev.openSheet(overlayOpening(dev));
  dev.closeSheet();
  assert.equal(dev.keyboard, false);
  assert.equal(dev.currentlyFocused, null);
});

test('A-155: nothing typed, nothing closed; a failing read never breaks the opening', () => {
  let dismissed = 0;
  assert.equal(releaseFieldBehind({ focused: () => null, dismiss: () => { dismissed++; } }), false);
  assert.equal(releaseFieldBehind({ focused: () => { throw new Error('unmounted'); }, dismiss: () => { dismissed++; } }), false);
  assert.equal(releaseFieldBehind({ focused: () => ({}), dismiss: () => { throw new Error('gone'); } }), true);
  assert.equal(dismissed, 0);
});

test('A-155: every Modal ends the typing behind it as it opens, before its own fields take focus', () => {
  const tap = read('components/tapAwayKeyboard.js');
  // A layout effect on the opening only (a re-render of an open sheet never closes its own keyboard).
  assert.match(tap, /export function useReleaseFieldBehind\(open\) \{\s*useLayoutEffect\(\(\) => \{\s*if \(open\) releaseFieldBehind\(\{ focused: focusedInput, dismiss: \(\) => Keyboard\.dismiss\(\) \}\);\s*\}, \[!!open\]\);/);
  const modal = read('components/PresenceModal.js');
  assert.match(modal, /const shown = props\.visible === undefined \? true : !!props\.visible;\s*useSheetPresence\(shown\);\s*useReleaseFieldBehind\(shown\);/);
});

test('A-155: every Android system date / time dialog ends the typing behind it (SystemPicker), none drawn raw', () => {
  const parts = read('screens/components/ProtocolParts.js');
  assert.match(parts, /export function SystemPicker\(props\) \{\s*useReleaseFieldBehind\(true\);\s*return <DateTimePicker \{\.\.\.props\} \/>;\s*\}/);
  assert.match(parts.slice(parts.indexOf('export function AndroidDateDialog')), /^\s*<SystemPicker$/m);
  // A dialog (display="default") anywhere else in the app must come from SystemPicker.
  const files = execSync("grep -rl '<DateTimePicker' screens components App.js || true", { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const raw = [];
  for (const f of files) {
    const src = read(f);
    const re = /<DateTimePicker\b[\s\S]*?\/>/g;
    let m;
    while ((m = re.exec(src))) {
      if (f.endsWith('ProtocolParts.js') && /\{\.\.\.props\}/.test(m[0])) continue;
      if (!/display="spinner"/.test(m[0])) raw.push(`${f}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(raw, []);
});
