// The Graduated tab bar (DESIGN.md §5): flat on the ground, hairline on top. Shared by App's tab
// navigator and screens that hide it for a while (Recently deleted selection) and put it back.
import { StyleSheet } from 'react-native';

export function tabBarStyle(colors) {
  return {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    elevation: 0,
    shadowOpacity: 0,
    backgroundColor: colors.ground,
    paddingBottom: 22,
    paddingTop: 8,
    height: 84,
  };
}
