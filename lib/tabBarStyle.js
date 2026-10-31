// The Graduated tab bar (DESIGN.md §5): flat on the ground, hairline on top. Shared by App's tab
// navigator and screens that hide it for a while (Recently deleted selection) and put it back.
// bottomInset (react-native-safe-area-context): what the system reserves at the bottom. iPhone keeps
// the approved bar (84 high, 22 padding over the home indicator). On Android the app draws edge to
// edge, so the bar must sit ABOVE the navigation bar or the Fold's taskbar (founder 2026-10-04:
// the icons were behind the device's bar): its padding grows with the inset, the room above stays 62.
import { StyleSheet, Platform } from 'react-native';

// A-136 (1): a tab screen takes no bottom safe-area edge. The tab bar sits under it and already
// clears the system bar (its padding above); a bottom edge on the screen added that inset again
// (the Fold taskbar: both book pages stopped ~80 dp above the tab bar).
export const TAB_SCREEN_EDGES = ['top', 'left', 'right'];

const ROOM = 62;
const BASE_PAD = 22;

export function tabBarStyle(colors, bottomInset = 0, os = Platform.OS) {
  const pad = os === 'ios' ? BASE_PAD : Math.max(BASE_PAD, Math.ceil(bottomInset || 0) + 8);
  return {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    elevation: 0,
    shadowOpacity: 0,
    backgroundColor: colors.ground,
    paddingBottom: pad,
    paddingTop: 8,
    height: ROOM + pad,
  };
}

// A-206 (founder 2026-10-31): the floating glass bar on Android (components/GlassTabBar). It takes
// its own room in the layout — the capsule plus a gap under it and the system's bottom bar — so no
// screen ends behind it. barHeight: the capsule; bottomGap: capsule to the system bar.
export function glassBarRoom(bottomInset = 0) {
  const barHeight = 64;
  const topGap = 6;
  const bottomGap = 8;
  const inset = Math.max(0, Math.ceil(bottomInset || 0));
  return { barHeight, topGap, bottomGap, inset, total: topGap + barHeight + bottomGap + inset };
}

// The height the tab bar takes on this platform: Android draws the glass bar; iPhone keeps the
// navigator's bar (Apple's own glass bar arrives with the native build).
export function tabBarSpace(colors, bottomInset = 0, os = Platform.OS) {
  return os === 'android' ? glassBarRoom(bottomInset).total : tabBarStyle(colors, bottomInset, os).height;
}
