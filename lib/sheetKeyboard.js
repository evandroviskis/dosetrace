'use strict';
// Where a bottom sheet sits while the Android keyboard is up (Fold folded, build 53: the
// calculator's "Log today's weight" sheet sat under the keyboard — fields, Save and title all
// hidden). The app draws edge to edge, so a transparent Modal is never resized for the keyboard
// and the sheets' KeyboardAvoidingView pads on iPhone only. On Android the sheet is lifted by
// the keyboard instead: its bottom padding becomes the keyboard's overlap with the Modal plus a
// small gap, and its height is capped to the room left above the keyboard (minus the scrim's top
// room), so the sheet's own ScrollView scrolls and a footer under it stays above the keyboard.
// Pure: the hook is components/useSheetKeyboard. All values in dp, in the Modal's coordinates
// (the Modal covers the whole screen edge to edge, so the keyboard's screenY is in them too).
//
// rootHeight: the Modal's root view height (onLayout); 0 / unknown = no cap, height only.
// kbTop:      the keyboard's top (keyboardDidShow endCoordinates.screenY).
// kbHeight:   the keyboard's height (endCoordinates.height). On Android React Native reports it
//             without the navigation bar under it, so the real overlap with an edge-to-edge
//             Modal is rootHeight - kbTop; that is trusted only within a navigation bar's worth
//             (navSlack) above kbHeight, never less than the keyboard itself.
// gap:        the space between the sheet and the keyboard (0 for a sheet flush on it).
// topRoom:    the space kept above the sheet (the scrim's top padding).
// null = the keyboard is down: the sheet keeps its normal place.
const { liftScrollY } = require('./keyboardLift');

function sheetKeyboardLift({ rootHeight, kbTop, kbHeight, gap = 8, topRoom = 48, navSlack = 96 } = {}) {
  const h = Number.isFinite(kbHeight) && kbHeight > 0 ? kbHeight : 0;
  const root = Number.isFinite(rootHeight) && rootHeight > 0 ? rootHeight : 0;
  let overlap = h;
  if (root && Number.isFinite(kbTop) && kbTop > 0 && kbTop < root) {
    overlap = Math.min(Math.max(root - kbTop, h), h + navSlack);
  }
  if (!(overlap > 0)) return null;
  const bottom = Math.ceil(overlap + gap);
  const maxHeight = root ? Math.max(0, Math.floor(root - topRoom - bottom)) : null;
  return { bottom, maxHeight };
}

// Where to scroll the lifted sheet's ScrollView so the focused field shows (the sheet may be
// taller than the room above the keyboard). The field, the scroll view and the keyboard top in
// window coordinates (measureInWindow / screenY); the visible area ends at the scroll view's
// bottom or the keyboard's top, whichever is higher. null = leave it (no field in this scroll
// view, or the field already shows). Same rule as lib/keyboardLift, including windowShift (the
// keyboard's screenY moved into measureInWindow's space: 0 inside a Modal, where every sheet lives
// today, so sheets keep their numbers; the status bar if one is ever used on an Android page).
function sheetFocusScrollY({ fieldTop, fieldBottom, viewTop, viewBottom, kbTop = null, scrollY = 0, margin = 12, windowShift: shift = 0 } = {}) {
  if (![fieldTop, fieldBottom, viewTop, viewBottom].every(Number.isFinite)) return null;
  if (fieldTop < viewTop) return null; // not in this scroll view (or scrolled above it)
  const top = Number.isFinite(kbTop) ? kbTop - (Number.isFinite(shift) ? shift : 0) : null;
  const limit = top != null ? Math.min(viewBottom, top) : viewBottom;
  return liftScrollY({ fieldTop, fieldBottom, kbTop: limit, viewTop, scrollY, margin });
}

module.exports = { sheetKeyboardLift, sheetFocusScrollY };
