// A-206 (founder 2026-10-31): the real blur behind the glass capsule on Android (expo-blur, module
// ExpoBlurView) arrives with the store build. A binary without it (a dev client built before) gets the
// new JS without the view, so it is used only when the view is really in the binary; otherwise the
// capsule paints its glass fill. Any error while checking means "not there" — never a crash. The
// package is required only after the check passes.
import { Platform } from 'react-native';
import { hasNativeModule } from './nativeModule';

export function hasNativeBlur({ os = Platform.OS, hasModule = hasNativeModule } = {}) {
  if (os !== 'android') return false; // the iPhone paints the glass fill, no blur (founder 2026-11-01: like Android, nothing shows through)
  try {
    return !!hasModule('ExpoBlurView');
  } catch (e) {
    return false;
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
