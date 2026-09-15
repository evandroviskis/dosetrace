// Check whether an optional native module is present in THIS build, without
// loading the JS package that would throw when it's absent.
//
// Expo modules do `export default requireNativeModule('X')` at the top level, so
// simply `require('expo-print')` in a build that lacks the native module throws
// at module-evaluation time — and under Metro lazy bundling that throw can escape
// a try/catch placed around the require(). requireOptionalNativeModule() checks
// the native registry directly and returns null instead of throwing, so we can
// decide safely and only require() the package once we know it's there.

export function hasNativeModule(name) {
  try {
    const core = require('expo-modules-core');
    return typeof core.requireOptionalNativeModule === 'function'
      && core.requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}
