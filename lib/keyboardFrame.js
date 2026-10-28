'use strict';
// The keyboard's place from a keyboardDidShow event, for the lift hooks (components/useSheetKeyboard,
// components/useKeyboardLift). A-188 (Fold, split screen, 2026-10-27): Android gives the activity
// window no keyboard inset when the app shares the screen, so React Native reports a height of
// 0 - the taskbar (measured { screenY: 768, height: -64 } on an 832 dp window, real keyboard top
// 453.7 dp). Such a report is unusable: on Android the keyboard is then taken to cover the lower
// SPLIT_SHARE of the window (a little more than the measured 45%, so the field and the actions
// stay above it). A usable report is taken as it is; off Android an unusable one stays "no keyboard".
// ec: endCoordinates; windowHeight: the measured window height (useWindowSize, dp); android: estimate
// when unusable. Also seen on the Fold in full screen with the floating keyboard ({ height: -8 }): the
// lift puts the sheet in the top half, clear of a keyboard floating over the middle (council 2026-10-27).
// → { kbTop, kbHeight, estimated } | null (nothing to lift)
const SPLIT_SHARE = 0.5;

function keyboardFrame(ec, windowHeight, android) {
  if (!ec) return null;
  const h = Number(ec.height);
  if (Number.isFinite(h) && h > 0) return { kbTop: ec.screenY, kbHeight: h, estimated: false };
  if (!android || !(Number.isFinite(windowHeight) && windowHeight > 0)) return null;
  const kbHeight = Math.round(windowHeight * SPLIT_SHARE);
  return { kbTop: windowHeight - kbHeight, kbHeight, estimated: true };
}

module.exports = { keyboardFrame, SPLIT_SHARE };
