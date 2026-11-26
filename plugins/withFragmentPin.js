// Config plugin: pin androidx.fragment to 1.6.1 (Fold 2026-11-26, how-to videos HV-3).
//
// expo-video pulls androidx.fragment 1.6.2 over the 1.6.1 every other library of the app uses. With
// 1.6.2 in the binary, on the open Galaxy Z Fold the system resized the app window about 80 times a
// second on every screen (even signed out): battery spent for nothing, and the how-to video drew no
// picture. Forcing 1.6.1 brought it to 0 with the video playing. CNG-correct: there is no checked-in
// android/ folder; this runs at prebuild. Remove it only after re-measuring on the open Fold
// (adb logcat | grep -c handleResized while idle must stay at 0).

const { withAppBuildGradle } = require('@expo/config-plugins');

const PIN = 'configurations.all { resolutionStrategy { force "androidx.fragment:fragment:1.6.1", "androidx.fragment:fragment-ktx:1.6.1" } }';

function addFragmentPin(contents) {
  if (contents.includes('androidx.fragment:fragment:1.6.1')) return contents;
  return `${contents}\n// DoseTrace: androidx.fragment 1.6.1 (plugins/withFragmentPin.js)\n${PIN}\n`;
}

function withFragmentPin(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = addFragmentPin(c.modResults.contents);
    return c;
  });
}

module.exports = withFragmentPin;
module.exports.addFragmentPin = addFragmentPin;
module.exports.PIN = PIN;
