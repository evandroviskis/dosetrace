'use strict';
// A-197 fix 2: which background refresh this binary uses (pure, node --test).
// Android with the native headless refresh (modules/dt-exact-alarm HeadlessRefreshWorker): our worker,
// and the old expo-background-task registration is removed so the two never run side by side.
// Android without it (an older binary; with the fingerprint runtime this JS cannot reach one by EAS
// Update, but a missing module must still never leave a phone without a refresh): expo-background-task.
// iOS: no background refresh (AC11).
// scheduled: whether our worker was really scheduled (review 5: never left with no refresh at all).
function planRefreshRegistration({ android, hasHeadless, scheduled = true }) {
  if (!android) return { headless: false, expo: false, unregisterExpo: false };
  if (hasHeadless) return scheduled ? { headless: true, expo: false, unregisterExpo: true } : { headless: true, expo: true, unregisterExpo: false };
  return { headless: false, expo: true, unregisterExpo: false };
}

module.exports = { planRefreshRegistration };
