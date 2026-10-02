// Config plugin: MainActivity handles fold/unfold itself (S-26, council 2026-10-01).
//
// Folding or unfolding a Galaxy Z Fold changes smallestScreenSize (and screenLayout).
// Expo's default configChanges lists screenLayout but not smallestScreenSize, so Android
// would recreate the activity on every fold: the whole app remounts, navigation resets and
// anything typed but not yet kept is lost — before the book layout can move anything.
// CNG-correct: there is no checked-in android/ folder; this runs at prebuild.

const { withAndroidManifest } = require('@expo/config-plugins');

const NEEDED = ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation'];

function addFoldConfigChanges(androidManifest) {
  const app = androidManifest.manifest && androidManifest.manifest.application && androidManifest.manifest.application[0];
  const main = app && (app.activity || []).find((a) => a.$ && a.$['android:name'] === '.MainActivity');
  if (!main) return androidManifest;
  const have = (main.$['android:configChanges'] || '').split('|').filter(Boolean);
  for (const k of NEEDED) if (!have.includes(k)) have.push(k);
  main.$['android:configChanges'] = have.join('|');
  return androidManifest;
}

module.exports = function withFoldConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    addFoldConfigChanges(cfg.modResults);
    return cfg;
  });
};
module.exports.addFoldConfigChanges = addFoldConfigChanges;
