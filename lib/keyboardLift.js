'use strict';
// Where to scroll a page so a focused field sits just above the keyboard (A-136 (9), Fold 7
// 2026-10-17: the note on Today's right page stayed under the keyboard — the app draws edge to
// edge on Android, so the window is not resized and nothing moved the page). All values in the
// window's coordinates: the field's top / bottom (measureInWindow), the keyboard's top
// (endCoordinates.screenY), the page's top, and the page's current scroll offset.
// null = leave the page where it is (no keyboard, or the field is already visible). A field
// taller than the room above the keyboard shows its top, never scrolled past the page's top.
function liftScrollY({ fieldTop, fieldBottom, kbTop, viewTop = 0, scrollY = 0, margin = 16 }) {
  if (kbTop == null || !Number.isFinite(kbTop)) return null;
  const over = fieldBottom + margin - kbTop;
  if (!(over > 0)) return null;
  const maxUp = Math.max(0, fieldTop - viewTop - margin);
  return scrollY + Math.min(over, maxUp);
}

module.exports = { liftScrollY };
