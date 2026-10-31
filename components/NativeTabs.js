// A-206 GB-7 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md): the iPhone's tab navigator over
// Apple's own tab bar (react-native-bottom-tabs; on iOS 26 the Liquid Glass capsule, the bubble that
// morphs between tabs and the bar that shrinks on scroll). It is the package's createNativeBottomTabNavigator
// with two DoseTrace additions, so no screen has to change:
// - GB-5: a screen that hides the bar with tabBarStyle { display: 'none' } (Recently deleted selection,
//   the same option the Android bar honours) hides Apple's bar too (the package only has a
//   navigator-wide tabBarHidden);
// - GB-3 (founder's approved preview): the screens run behind the glass; each page scroll view keeps
//   its end reachable through lib/tabBarStyle TAB_SCROLL_PROPS (UIKit's own inset).
// Built only when the native view is in the binary (lib/nativeViews loadNativeTabs), which passes the
// package's pieces in.
import { createNavigatorFactory, TabRouter, useNavigationBuilder } from '@react-navigation/native';
import { isTabBarHidden } from '../lib/tabBarStyle';

export function createNativeTabs({ NativeBottomTabView }) {

  function NativeTabNavigator({
    id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior, children, layout,
    screenListeners, screenOptions, screenLayout, UNSTABLE_router, ...rest
  }) {
    const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(TabRouter, {
      id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior, children, layout,
      screenListeners, screenOptions, screenLayout, UNSTABLE_router,
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
