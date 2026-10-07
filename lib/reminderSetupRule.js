'use strict';
// A-110 RG-1: the "Make sure your reminders arrive" step opens by itself once, on Android, right
// after the user saves their first protocol that has a reminder time. Pure.
function shouldOpenSetup({ os, seen, activeWithTime }) {
  return os === 'android' && !seen && activeWithTime > 0;
}
module.exports = { shouldOpenSetup };
