'use strict';
// A-155 (Fold, build 54): a sheet opened while a page field was being typed left that field
// focused behind it. On Android a Modal (and the system date dialog) is its own window: the page
// window keeps its focused field, and when the sheet closes the page window takes the focus back
// and Android brings that field's keyboard back — over a field that may be out of sight. Every
// overlay ends the typing behind it as it opens (components/tapAwayKeyboard useReleaseFieldBehind,
// used by components/PresenceModal and the ProtocolParts SystemPicker). Plain CommonJS so the rule
// runs under node (a155KeyboardAfterSheet.test.js).

// focused(): the field being typed now (TextInput.State.currentlyFocusedInput), or null.
// dismiss(): end that typing (Keyboard.dismiss blurs the focused field and closes the keyboard).
// → true when a field was being typed and its typing was ended.
function releaseFieldBehind({ focused, dismiss }) {
  let field = null;
  try { field = focused(); } catch { field = null; }
  if (!field) return false;
  try { dismiss(); } catch { /* unmounted: nothing left to close */ }
  return true;
}

module.exports = { releaseFieldBehind };
