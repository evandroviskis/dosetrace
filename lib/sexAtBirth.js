// A-139 — when the app explains a change of "Sex at birth" (founder 2026-10-17 / 2026-10-20 B, C, E + D′;
// picture docs/design/a139-sex-at-birth.html). Pure rules, CommonJS so plain Node tests run them.
//  • C (Edit profile, sign-up About you): the "What this changes" note shows only while an
//    already-saved value is changed; it goes away when the choice is back to the saved value, and
//    never shows on a first choice. Save writes.
//  • D′ (Progress › Your numbers, where a tap saves at once): changing a saved value asks first
//    (Cancel / Change); a first choice saves at once; tapping the chosen value does nothing.

function isSex(v) {
  return v === 'male' || v === 'female';
}

function sexChangeNoteShown(saved, current) {
  return isSex(saved) && isSex(current) && saved !== current;
}

// 'none' | 'save' | 'confirm'
function sexTapAction(saved, next) {
  if (!isSex(next) || next === saved) return 'none';
  return isSex(saved) ? 'confirm' : 'save';
}

module.exports = { isSex, sexChangeNoteShown, sexTapAction };
