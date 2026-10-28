'use strict';
// A-197 fix 2: which background refresh this binary uses (pure, node --test).
// Android with the native headless refresh (modules/dt-exact-alarm HeadlessRefreshWorker): our worker,
// and the old expo-background-task registration is removed so the two never run side by side.
// Android without it (an older binary receiving this JS by EAS Update): expo-background-task as before.
// iOS: no background refresh (AC11).
function planRefreshRegistration({ android, hasHeadless }) {
  if (!android) return { headless: false, expo: false, unregisterExpo: false };
  if (hasHeadless) return { headless: true, expo: false, unregisterExpo: true };
  return { headless: false, expo: true, unregisterExpo: false };
}

module.exports = { planRefreshRegistration };
