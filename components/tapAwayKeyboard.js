// A-204 (founder on the Fold 2026-10-31: "Execute essa mudança no aplicativo inteiro"): a tap away
// from the field being typed ends the typing there and closes the keyboard — a birth month, a
// Male/Female choice, any option or empty space. A tap on the field's own row (the password eye, a
// unit beside it) keeps it; a tap on another field moves the typing there and the keyboard stays
// (checked once that field has focus); a drag is scrolling and changes nothing. Rule:
// lib/keyboardLift tapLeavesField. Spread tapAwayProps on the app's root view (App.js) and on the
// first view inside every Modal (a Modal is its own root: touches in it never reach App's view).
// The field is measured when the finger goes down, before anything moves (iPhone 2026-10-31: typing
// the first letter reshaped the screen above the field; measured after the touch, the tap that had
// focused it read as "away"). A tap that starts with no field focused never closes anything.
import { Keyboard, TextInput } from 'react-native';
import { tapLeavesField } from '../lib/keyboardLift';

let start = null;

function focusedInput() {
  try { return TextInput.State.currentlyFocusedInput(); } catch { return null; }
}

export const tapAwayProps = {
  onTouchStart: (e) => {
    const touch = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, input: focusedInput(), rect: null };
    start = touch;
    if (!touch.input || !touch.input.measure) return;
    touch.input.measure((x, y, w, h, px, py) => { touch.rect = { top: py, bottom: py + h }; });
  },
  onTouchEnd: (e) => {
    const from = start;
    start = null;
    if (!from || !from.input || !from.rect) return;
    const { pageX, pageY } = e.nativeEvent;
    if (!tapLeavesField({ startX: from.x, startY: from.y, endX: pageX, endY: pageY, fieldTop: from.rect.top, fieldBottom: from.rect.bottom })) return;
    const input = from.input;
    setTimeout(() => { if (focusedInput() === input) Keyboard.dismiss(); }, 80);
  },
};
