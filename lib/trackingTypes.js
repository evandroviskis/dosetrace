'use strict';
// "What you use" (tracking_types; onboarding and Edit profile, DV-113 / DL-58): toggles one key and
// keeps every other one as it was — an older or unknown value is never dropped. Pure.
function toggleKey(list, key) {
  const cur = Array.isArray(list) ? list : [];
  return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
}

module.exports = { toggleKey };
