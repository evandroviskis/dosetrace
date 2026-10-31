// A-206 GB-7 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md): the iPhone's tab navigator over
// Apple's own tab bar (react-native-bottom-tabs; on iOS 26 the Liquid Glass capsule, the bubble that
// morphs between tabs and the bar that shrinks on scroll). It is the package's createNativeBottomTabNavigator
// with two DoseTrace additions, so no screen has to change:
// - GB-5: a screen that hides the bar with tabBarStyle { display: 'none' } (Recently deleted selection,
//   the same option the Android bar honours) hides Apple's bar too (the package only has a
//   navigator-wide tabBarHidden);
// - GB-3: Apple's bar floats over the screens, so every tab screen ends above it (its measured height),
//   and takes no room while the bar is hidden.
// Built only when the native view is in the binary (lib/nativeViews loadNativeTabs), which passes the
// package's pieces in.
import { useContext } from 'react';
import { View } from 'react-native';
import { createNavigatorFactory, TabRouter, useNavigationBuilder } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { isTabBarHidden, tabBarSpace } from '../lib/tabBarStyle';

export function createNativeTabs({ NativeBottomTabView, BottomTabBarHeightContext }) {
  function BarRoom({ hidden, children }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const measured = useContext(BottomTabBarHeightContext);
    // Before Apple's bar reports its height: the iPhone bar's own height (lib/tabBarStyle).
    const room = hidden ? 0 : measured > 0 ? measured : tabBarSpace(colors, insets.bottom, 'ios');
    return <View style={{ flex: 1, paddingBottom: room }}>{children}</View>;
  }

  const barRoomLayout = ({ children, options }) => <BarRoom hidden={isTabBarHidden(options?.tabBarStyle)}>{children}</BarRoom>;

  function NativeTabNavigator({
    id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior, children, layout,
    screenListeners, screenOptions, screenLayout, UNSTABLE_router, ...rest
  }) {
    const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(TabRouter, {
      id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior, children, layout,
      screenListeners, screenOptions, screenLayout: screenLayout || barRoomLayout, UNSTABLE_router,
    });
    const hidden = isTabBarHidden(descriptors[state.routes[state.index].key]?.options?.tabBarStyle);
    return (
      <NavigationContent>
        <NativeBottomTabView {...rest} tabBarHidden={hidden} state={state} navigation={navigation} descriptors={descriptors} />
      </NavigationContent>
    );
  }

  return createNavigatorFactory(NativeTabNavigator)();
}
