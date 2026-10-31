// A-206 (founder 2026-10-31): Apple's own tab bar (react-native-bottom-tabs) is for the iPhone only;
// Android keeps the JS glass bar (components/GlassTabBar). So the package's native Android code is not
// linked (no Material 3 theme change, nothing unused in the APK).
module.exports = {
  dependencies: {
    'react-native-bottom-tabs': {
      platforms: { android: null },
    },
  },
};
