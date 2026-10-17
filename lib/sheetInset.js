// How far a bottom sheet stays off the screen's bottom edge (A-136 (2), Fold 7 2026-10-17: the
// curve's "Choose compounds" sheet had its last row behind the Samsung taskbar). On Android the
// app draws edge to edge and a transparent Modal covers the whole window, the navigation bar or
// taskbar included, so a sheet must clear the system's bottom inset itself. iPhone keeps the
// approved prototype gaps (the same split as lib/tabBarStyle). Pure: the hook is
// components/useSheetInset.

// A floating sheet (the scrim's bottom padding, prototype .scrim.bot 30 pt): at least `base`,
// and on Android at least 8 above the system bar.
export function sheetGap(base, bottomInset = 0, os = 'ios') {
  if (os === 'ios') return base;
  return Math.max(base, Math.ceil(bottomInset || 0) + 8);
}

// An edge sheet (flush with the bottom, its own bottom padding): on Android the padding grows
// by the inset so the last row sits above the system bar.
export function sheetEdgePad(base, bottomInset = 0, os = 'ios') {
  if (os === 'ios') return base;
  return base + Math.ceil(bottomInset || 0);
}
