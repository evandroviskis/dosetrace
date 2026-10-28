'use strict';
// A-188 (Fold, split screen, 2026-10-27): with DoseTrace beside another app, the keyboard covered the
// field being typed and Save (Edit vial; the protocol sheet's dose field). Measured on the Fold with
// the development client: keyboardDidShow came with { screenY: 768, height: -64 } on an 832 dp window
// — Android gives the activity window no keyboard inset in split screen, so React Native's
// imeInsets.bottom - barInsets.bottom is 0 - 64 (the taskbar). The real keyboard top was 453.7 dp
// (y 1191 px / 2.625; dumpsys: ime frame [0,1191][1968,2184]). The hooks dropped the event (height
// <= 0) and nothing lifted. Rule (lib/keyboardFrame): an Android keyboard reported with no usable
// height covers the lower half of the window (estimated, a little more than the measured 45%), so
// the field and the actions stay above it; a usable report is taken as it is.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { keyboardFrame, SPLIT_SHARE } = require('../lib/keyboardFrame');
const { sheetKeyboardLift } = require('../lib/sheetKeyboard');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('A-188: a usable keyboard report is taken as it is (full screen, iPhone)', () => {
  assert.deepEqual(keyboardFrame({ screenY: 454, height: 314 }, 832, true), { kbTop: 454, kbHeight: 314, estimated: false });
  assert.deepEqual(keyboardFrame({ screenY: 500, height: 300 }, 844, false), { kbTop: 500, kbHeight: 300, estimated: false });
});

test('A-188: Android split screen (height <= 0) -> the lower half of the window is the keyboard', () => {
  const f = keyboardFrame({ screenY: 768, height: -64, width: 371.8, screenX: 377.9 }, 832, true);
  assert.equal(f.estimated, true);
  assert.equal(f.kbHeight, Math.round(832 * SPLIT_SHARE));
  assert.equal(f.kbTop, 832 - f.kbHeight);
  assert.ok(SPLIT_SHARE >= 0.455, 'at least the measured share (993 of 2184 px)');
  assert.ok(f.kbTop <= 453.7, 'the estimated top is at or above the real keyboard top');
  assert.equal(keyboardFrame({ screenY: 832, height: 0 }, 832, true).estimated, true, 'zero counts as unusable');
});

test('A-188: off Android an unusable report stays "no keyboard" (iPhone behaviour unchanged)', () => {
  assert.equal(keyboardFrame({ screenY: 832, height: 0 }, 832, false), null);
  assert.equal(keyboardFrame(null, 832, true), null, 'no coordinates: nothing to lift');
  assert.equal(keyboardFrame({ screenY: 768, height: -64 }, 0, true), null, 'unknown window: no guess');
});

test('A-188: with the measured numbers the Edit vial sheet ends above the real keyboard top', () => {
  const f = keyboardFrame({ screenY: 768, height: -64 }, 832, true);
  // Edit vial: useSheetKeyboard(…, { gap: 16 }) (topRoom 48); the Modal root measured 768 dp.
  const lift = sheetKeyboardLift({ rootHeight: 768, kbTop: f.kbTop, kbHeight: f.kbHeight, gap: 16 });
  assert.ok(lift && lift.bottom > 0);
  assert.ok(768 - lift.bottom <= 453.7, `sheet bottom ${768 - lift.bottom} dp must sit above the keyboard top 453.7 dp`);
  assert.ok(lift.maxHeight >= 200, `room left for the sheet (${lift.maxHeight} dp)`);
});

test('A-188: both keyboard hooks read the event through keyboardFrame (sheets and pages)', () => {
  const sheet = read('components/useSheetKeyboard.js');
  assert.match(sheet, /require\('\.\.\/lib\/keyboardFrame'\)|from '\.\.\/lib\/keyboardFrame'/);
  assert.match(sheet, /keyboardFrame\(ec, winHeight\.current, Platform\.OS === 'android'\)/);
  assert.match(sheet, /winHeight\.current = useWindowSize\(\)\.height/, 'the measured window (A-129), never Dimensions');
  const page = read('components/useKeyboardLift.js');
  assert.match(page, /from '\.\.\/lib\/keyboardFrame'/);
  assert.match(page, /keyboardFrame\(ec, winHeight\.current, Platform\.OS === 'android'\)/);
  assert.match(page, /winHeight\.current = useWindowSize\(\)\.height/);
});
