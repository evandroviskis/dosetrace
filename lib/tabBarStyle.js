// A-136 (1): a tab screen takes no bottom safe-area edge. The tab bar sits under it and already
// clears the system bar (its padding above); a bottom edge on the screen added that inset again
// (the Fold taskbar: both book pages stopped ~80 dp above the tab bar).
export const TAB_SCREEN_EDGES = ['top', 'left', 'right'];

// A-206 (founder 2026-10-31; iPhone too since 2026-11-01): the floating glass bar (components/GlassTabBar). It takes
// its own room in the layout — the capsule plus a gap under it and the system's bottom bar — so no
// screen ends behind it. barHeight: the capsule; bottomGap: capsule to the system bar.
export function glassBarRoom(bottomInset = 0) {
  const barHeight = 64;
  const topGap = 6;
  const bottomGap = 8;
  const inset = Math.max(0, Math.ceil(bottomInset || 0));
  return { barHeight, topGap, bottomGap, inset, total: topGap + barHeight + bottomGap + inset };
}

// The height the glass bar takes (both platforms, founder 2026-11-01): what sits above it (the update
// notice) is placed from it.
export function tabBarSpace(bottomInset = 0) {
  return glassBarRoom(bottomInset).total;
}
