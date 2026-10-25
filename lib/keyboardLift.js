'use strict';
// Where to scroll a page so a focused field sits just above the keyboard (A-136 (9), Fold 7
// 2026-10-17: the note on Today's right page stayed under the keyboard — the app draws edge to
// edge on Android, so the window is not resized and nothing moved the page). The field's top /
// bottom and the page's top come from measureInWindow; the keyboard's top is keyboardDidShow's
// endCoordinates.screenY; scrollY is the page's current scroll offset.
// windowShift: how far measureInWindow's origin sits below screenY's (see windowShift below). On
// Android edge to edge (RN 0.81, new architecture) a page's measureInWindow is measured from the
// bottom of the status bar while screenY is measured from the top of the window, so the keyboard
// is moved up by the status bar before comparing (A-152, Fold 7 cover 2026-10-21: without it the
// Waist field stopped 42.3 dp short, 26 dp under the keyboard). 0 on iPhone and inside a Modal.
// null = leave the page where it is (no keyboard, or the field is already visible). A field
// taller than the room above the keyboard shows its top, never scrolled past the page's top.
function liftScrollY({ fieldTop, fieldBottom, kbTop, viewTop = 0, scrollY = 0, margin = 16, windowShift: shift = 0 }) {
  if (kbTop == null || !Number.isFinite(kbTop)) return null;
  const top = kbTop - (Number.isFinite(shift) ? shift : 0);
  const over = fieldBottom + margin - top;
  if (!(over > 0)) return null;
  const maxUp = Math.max(0, fieldTop - viewTop - margin);
  return scrollY + Math.min(over, maxUp);
}

// The gap between the two coordinate spaces, measured on one view: its measure() pageY (from the
// React root's top = the window's top, screenY's space) minus its measureInWindow y (React Native
// 0.81 Android adds the root's viewport offset, locationOnScreen - visible display frame top =
// minus the status bar on an edge-to-edge page; 0 for a view inside a Modal, its own root, and on
// iPhone). Unmeasured / not a number / implausible (more than any status bar, e.g. a view measured
// while unmounted): 0, the old behaviour.
function windowShift(pageY, windowY) {
  const s = pageY - windowY;
  return Number.isFinite(s) && Math.abs(s) <= 200 ? s : 0;
}

module.exports = { liftScrollY, windowShift };
