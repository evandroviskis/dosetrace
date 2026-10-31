// A-204 (founder on the Fold 2026-10-31: "Execute essa mudança no aplicativo inteiro"): a tap away
// from the field being typed ends the typing there and closes the keyboard — a birth month, a
// Male/Female choice, any option or empty space. A tap on the field's own row (the password eye, a
// unit beside it) keeps it; a tap on another field moves the typing there and the keyboard stays
// (checked once that field has focus); a drag is scrolling and changes nothing. Rule:
// lib/keyboardLift tapLeavesField. Spread tapAwayProps on the app's root view (App.js) and on the
// first view inside every Modal (a Modal is its own root: touches in it never reach App's view).
import { Keyboard, TextInput } from 'react-native';
import { tapLeavesField } from '../lib/keyboardLift';

let start = null;

function focusedInput() {
  try { return TextInput.State.currentlyFocusedInput(); } catch { return null; }
}

export const tapAwayProps = {
  onTouchStart: (e) => { start = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; },
  onTouchEnd: (e) => {
    const from = start;
    start = null;
    const input = focusedInput();
    if (!from || !input || !input.measure) return;
    const { pageX, pageY } = e.nativeEvent;
    input.measure((x, y, w, h, px, py) => {
      if (!tapLeavesField({ startX: from.x, startY: from.y, endX: pageX, endY: pageY, fieldTop: py, fieldBottom: py + h })) return;
      setTimeout(() => { if (focusedInput() === input) Keyboard.dismiss(); }, 80);
    });
  },
};
