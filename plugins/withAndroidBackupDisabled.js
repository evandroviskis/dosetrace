// Config plugin: disable Android auto-backup for DoseTrace.
//
// A health journal should not have its app data (the SQLite DB, cached files)
// swept into Google's cloud auto-backup or device-to-device transfer. Setting
// android:allowBackup="false" is the master switch that disables both.
//
// CNG-correct: there is no checked-in AndroidManifest.xml, so this runs at
// prebuild and the generated manifest / APK carries android:allowBackup="false".
// Council default for a health app (2026-09-19 security handoff); override only
// with an explicit founder decision.

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidBackupDisabled(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application && application.$) {
      application.$['android:allowBackup'] = 'false';
    }
    return cfg;
  });
};
