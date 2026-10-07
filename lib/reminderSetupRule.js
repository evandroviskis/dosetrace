'use strict';
// A-112 SP-5: the "Make sure your reminders arrive" screen opens by itself once per phone, on Android,
// for a user with a protocol that has a reminder time who has not seen it on this phone. Pure.
function shouldOpenSetup({ os, seen, activeWithTime }) {
  return os === 'android' && !seen && activeWithTime > 0;
}
module.exports = { shouldOpenSetup };
