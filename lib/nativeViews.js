// A-206 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md): two native views arrive with the next
// store build — Apple's own tab bar on iPhone (react-native-bottom-tabs, view RNCTabView: iOS 26 Liquid
// Glass) and the real blur behind Android's glass capsule (expo-blur, module ExpoBlurView). The binaries
// installed today (the iPhone simulator app, the Fold's dev client) get new JS swapped in without them,
// so each is used only when its native view is really in the binary; otherwise the JS keeps today's
// bars. Any error while checking means "not there" — never a crash. The packages are required only
// after the check passes, so a binary without them never loads their views.
import { Platform, UIManager } from 'react-native';
import { hasNativeModule } from './nativeModule';

export function hasNativeTabs({ os = Platform.OS, ui = UIManager } = {}) {
  if (os !== 'ios') return false; // Android keeps the JS glass bar (components/GlassTabBar)
  try {
    if (!ui) return false;
    if (typeof ui.hasViewManagerConfig === 'function') return !!ui.hasViewManagerConfig('RNCTabView');
    if (typeof ui.getViewManagerConfig === 'function') return !!ui.getViewManagerConfig('RNCTabView');
    return false;
  } catch (e) {
    return false;
  }
}

export function hasNativeBlur({ os = Platform.OS, hasModule = hasNativeModule } = {}) {
  if (os !== 'android') return false; // the iPhone has Apple's glass; the JS glass bar is Android-only
  try {
    return !!hasModule('ExpoBlurView');
  } catch (e) {
    return false;
  }
}

// { createNavigator } for Apple's tab bar, or null (today's JS navigator stays).
export function loadNativeTabs() {
  if (!hasNativeTabs()) return null;
  try {
    const { NativeBottomTabView } = require('@bottom-tabs/react-navigation');
    const { BottomTabBarHeightContext } = require('react-native-bottom-tabs');
    const { createNativeTabs } = require('../components/NativeTabs');
    return { createNavigator: () => createNativeTabs({ NativeBottomTabView, BottomTabBarHeightContext }) };
  } catch (e) {
    return null;
  }
}

// expo-blur's BlurView, or null (the capsule paints its glass fill as before).
export function loadBlurView() {
  if (!hasNativeBlur()) return null;
  try {
    return require('expo-blur').BlurView || null;
  } catch (e) {
    return null;
  }
}
