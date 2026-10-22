'use strict';
// A-152 still failing on Android (founder's Galaxy Z Fold7 cover screen, 1.3.1 release vc55,
// 2026-10-21): Journey › Progress › Your numbers, tap Waist. The page scrolled ~265 px on focus,
// then stopped with the field's box [556,1474]-[991,1606] px still under the keyboard; no second
// correction after 2 s.
//
// Device (adb, read 2026-10-21): 1080 x 2520 px, 420 dpi (2.625 px/dp); status bar
// InsetsSource statusBars [0,0][1080,111]; gesture navigation bar [0,2481][1080,2520] (39 px);
// the InputMethod window frame is [0,111][1080,2520] (it starts under the status bar) with
// mGivenVisibleInsets / mGivenContentInsets top 1426, so the keyboard (toolbar included) starts at
// 111 + 1426 = 1537 px on screen (touchable region top 1537, ime visibleFrame top 1537).
//
// What React Native 0.81 reports on Android (new architecture, edge to edge):
//   - keyboardDidShow endCoordinates.screenY = the window's visible display frame bottom
//     (ReactRootView.checkForKeyboardEvents, adjustResize) = 1537 px = 585.5 dp, measured from the
//     TOP OF THE WINDOW (y 0 = top of the screen, status bar included);
//     endCoordinates.height = ime inset - system bars inset = 983 - 39 = 944 px = 359.6 dp;
//   - measureInWindow = layout + the root's viewport offset, and ReactSurfaceView's viewport offset
//     is locationOnScreen - getWindowVisibleDisplayFrame().top = 0 - 111 px: measured from the
//     BOTTOM OF THE STATUS BAR, i.e. 42.3 dp less than the window coordinates of screenY;
//   - measure()'s pageY is the same position without that offset (DOM.cpp measure:
//     includeViewportOffset false), i.e. in screenY's coordinates. Inside a Modal (its own root
//     node, edge to edge) both are equal, and on iPhone the root sits at the window's origin, so
//     the shift is 0 there.
// The lift compared a field 42.3 dp too high with the keyboard's true top: it scrolled
// 670.5 + 16 - 585.5 = 101.0 dp (= the 265 px measured) instead of 143.3 dp, and the field stayed
// 26.3 dp under the keyboard (+ the 16 dp gap). Every later lift (keyboardDidShow + 60 ms, the
// spacer's onContentSizeChange) repeats the same arithmetic, so nothing corrects it.
// Fix: the keyboard's top is moved into measureInWindow's coordinates by the shift measured on the
// same view (measure pageY - measureInWindow y), in lib/keyboardLift and lib/sheetKeyboard; the
// hooks measure the shift on Android only (iPhone: 0, its code path unchanged).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { liftScrollY, windowShift } = require('../lib/keyboardLift');
const { sheetFocusScrollY, sheetKeyboardLift } = require('../lib/sheetKeyboard');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DP = 2.625;
const dp = (px) => px / DP;

// The Fold 7 cover screen, Waist focused, before any lift (the measured box + the 265 px scroll).
const STATUS = dp(111);
const KB_TOP_SCREEN = dp(111 + 1426); // 585.5 dp: where the keyboard really starts
const FIELD_TOP_SCREEN = dp(1474 + 265);
const FIELD_BOTTOM_SCREEN = dp(1606 + 265); // 712.8 dp
const RN = {
  screenY: dp(1537), // endCoordinates.screenY
  height: dp(2520 - 1537 - 39), // endCoordinates.height, 359.6 dp
  fieldWinTop: FIELD_TOP_SCREEN - STATUS, // measureInWindow
  fieldWinBottom: FIELD_BOTTOM_SCREEN - STATUS,
  viewWinTop: dp(400) - STATUS, // the ScrollView (any top above the field)
  viewPageY: dp(400), // measure() pageY of the same view
};

test('A-152 Fold: without the shift the lift stops 42.3 dp short — exactly the 265 px measured', () => {
  const y = liftScrollY({ fieldTop: RN.fieldWinTop, fieldBottom: RN.fieldWinBottom, kbTop: RN.screenY, viewTop: RN.viewWinTop, scrollY: 0 });
  assert.ok(Math.abs(y * DP - 265) < 1, `old arithmetic scrolls ${(y * DP).toFixed(1)} px`);
  assert.ok(FIELD_BOTTOM_SCREEN - y > KB_TOP_SCREEN, 'and the field ends under the keyboard');
});

test('A-152 Fold: the shift is the status bar, measured on the scroll view', () => {
  const s = windowShift(RN.viewPageY, RN.viewWinTop);
  assert.ok(Math.abs(s - STATUS) < 1e-9, `shift ${s}`);
  assert.equal(windowShift(120, 120), 0, 'Modal / iPhone: no shift');
  assert.equal(windowShift(undefined, 120), 0, 'unmeasured: no shift');
  assert.equal(windowShift(NaN, 120), 0);
});

test('A-152 Fold: with the shift the Waist field ends 16 dp above the keyboard', () => {
  const shift = windowShift(RN.viewPageY, RN.viewWinTop);
  const y = liftScrollY({ fieldTop: RN.fieldWinTop, fieldBottom: RN.fieldWinBottom, kbTop: RN.screenY, viewTop: RN.viewWinTop, scrollY: 0, windowShift: shift });
  assert.ok(Math.abs(y - 143.3) < 0.1, `lift ${y.toFixed(2)} dp`);
  const bottomAfter = FIELD_BOTTOM_SCREEN - y;
  assert.ok(Math.abs(KB_TOP_SCREEN - bottomAfter - 16) < 1e-6, `gap ${(KB_TOP_SCREEN - bottomAfter).toFixed(2)} dp`);
  // what adb should show: box about [556,1363]-[991,1495] px, keyboard from 1537 px
  assert.equal(Math.round((FIELD_BOTTOM_SCREEN - y) * DP), 1495);
  assert.equal(Math.round((FIELD_TOP_SCREEN - y) * DP), 1363);
});

test('A-152: no shift (iPhone, a Modal) gives exactly the old result', () => {
  const cases = [
    { fieldTop: 562, fieldBottom: 634, kbTop: 453, viewTop: 60, scrollY: 300 },
    { fieldTop: 600, fieldBottom: 1100, kbTop: 453, viewTop: 60, scrollY: 0 },
    { fieldTop: 2085, fieldBottom: 2215, kbTop: 1500, viewTop: 200, scrollY: 0, margin: 42 },
    { fieldTop: 200, fieldBottom: 260, kbTop: 453, viewTop: 60, scrollY: 120 },
  ];
  for (const c of cases) assert.equal(liftScrollY({ ...c, windowShift: 0 }), liftScrollY(c));
});

test('A-152: a field already above the true keyboard top is left alone after the shift', () => {
  // 30 dp above the keyboard in screen terms: no scroll
  const fieldBottom = KB_TOP_SCREEN - 30 - STATUS;
  assert.equal(liftScrollY({ fieldTop: fieldBottom - 50, fieldBottom, kbTop: RN.screenY, viewTop: RN.viewWinTop, windowShift: STATUS }), null);
});

test('A-152: a sheet scroll view uses the same shift (0 inside a Modal, so sheets are unchanged)', () => {
  // A sheet's scroll view running under the keyboard on a page root (shift = status bar): the
  // visible part ends at the keyboard's true top.
  const viewTop = dp(300) - STATUS;
  const viewBottom = dp(2400) - STATUS;
  const y = sheetFocusScrollY({ fieldTop: RN.fieldWinTop, fieldBottom: RN.fieldWinBottom, viewTop, viewBottom, kbTop: RN.screenY, scrollY: 0, windowShift: STATUS });
  assert.ok(Math.abs(FIELD_BOTTOM_SCREEN - y - (KB_TOP_SCREEN - 12)) < 1e-6);
  // inside a Modal: shift 0, the old numbers
  const old = { fieldTop: 400, fieldBottom: 450, viewTop: 120, viewBottom: 600, kbTop: 440, scrollY: 0 };
  assert.equal(sheetFocusScrollY({ ...old, windowShift: 0 }), sheetFocusScrollY(old));
  // the sheet's padding works from the Modal's height and screenY (both window coordinates): the
  // overlap on the Fold is the keyboard plus the navigation bar under it, 374.5 dp
  const lift = sheetKeyboardLift({ rootHeight: dp(2520), kbTop: RN.screenY, kbHeight: RN.height, gap: 8 });
  assert.equal(lift.bottom, Math.ceil(dp(2520 - 1537) + 8));
});

test('A-152: the hooks measure the shift on Android and pass it to the rule', () => {
  for (const f of ['components/useKeyboardLift.js', 'components/useSheetKeyboard.js']) {
    const src = read(f);
    assert.match(src, /import \{[^}]*windowShift[^}]*\} from '\.\.\/lib\/keyboardLift';/, f);
    assert.match(src, /Platform\.OS !== 'android'/, `${f}: iPhone keeps its path (shift 0, no extra measure)`);
    assert.match(src, /\.measure\(\(x, y, w, h, pageX, pageY\) => /, f);
    assert.match(src, /windowShift: shift/, f);
  }
});
