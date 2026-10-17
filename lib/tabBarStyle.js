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
