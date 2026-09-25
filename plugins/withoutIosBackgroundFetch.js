// expo-task-manager's auto-applied plugin adds UIBackgroundModes: ["fetch"] on iOS.
// DoseTrace registers no iOS background task (the notification-action task runs on
// Android only), so drop the unused mode: an undeclared-purpose background mode is
// an App Review question (Guideline 2.5.4) we don't need to answer.
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withoutIosBackgroundFetch(config) {
  return withInfoPlist(config, (c) => {
    const modes = c.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const next = modes.filter((m) => m !== 'fetch');
      if (next.length) c.modResults.UIBackgroundModes = next;
      else delete c.modResults.UIBackgroundModes;
    }
    return c;
  });
};
