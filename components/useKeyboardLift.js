// Keeps a focused field of a scrolling page above the keyboard (A-136 (9), A-152). Spread
// scrollProps on the page's ScrollView, put spacer at the end of its content (room to scroll the
// last field up while the keyboard is open), and either spread fieldProps(key) on each field or
// call liftField(ref) from the field's onFocus. The field is lifted on focus, again once the
// keyboard has opened, again once the spacer has laid out (a lift before that stopped short: the
// page could not scroll that far yet — the protocol page's note on the Fold, A-152), and again
// while a multiline field grows. Rule: lib/keyboardLift.
// enabled = false turns it off (no listeners, no spacer, no lift): a sheet whose
// KeyboardAvoidingView already lifts it on iPhone uses it on Android only (food editor, Fold
// 2026-10-17, foodEditorKeyboard.test.js).
// opts.auto: with no field registered, lift the focused input itself (TextInput.State). Only for a
// ScrollView that is the sole place to type in its window (a Modal's form): on a page a sheet's
// field would move the page behind it.
import { useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { liftScrollY } from '../lib/keyboardLift';

export default function useKeyboardLift(extRef, enabled = true, opts = {}) {
  const auto = !!(opts && opts.auto);
  const scroll = useRef(null);
  const scrollY = useRef(0);
  const kbTop = useRef(null);
  const field = useRef(null);
  const nodes = useRef({});
  const [kbHeight, setKbHeight] = useState(0);

  function focusedNode() {
    const registered = field.current && field.current.current;
    if (registered) return registered;
    if (!auto) return null;
    try { return TextInput.State.currentlyFocusedInput(); } catch { return null; }
  }

  function lift() {
    const node = focusedNode();
    const sv = scroll.current;
    if (!node || !sv || kbTop.current == null || !node.measureInWindow || !sv.measureInWindow) return;
    sv.measureInWindow((sx, sy) => {
      node.measureInWindow((fx, fy, fw, fh) => {
        const y = liftScrollY({ fieldTop: fy, fieldBottom: fy + fh, kbTop: kbTop.current, viewTop: sy, scrollY: scrollY.current });
        if (y != null) sv.scrollTo({ y, animated: true });
      });
    });
  }

  useEffect(() => {
    if (!enabled) {
      // Turned off (a sheet closed with the keyboard up): forget the keyboard, so the next
      // opening never starts with a keyboard-tall blank space.
      kbTop.current = null;
      field.current = null;
      setKbHeight(0);
      return undefined;
    }
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const ec = e && e.endCoordinates;
      kbTop.current = ec ? ec.screenY : null;
      setKbHeight(ec ? ec.height : 0);
      setTimeout(lift, 60); // once the spacer has laid out (onContentSizeChange lifts again)
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbTop.current = null;
      field.current = null;
      setKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const liftField = (ref) => { if (!enabled) return; field.current = ref; lift(); };

  // Props for one field: its ref (kept by key, so a field needs no ref of its own), the lift on
  // focus, and a lift while it grows (multiline). extra: the field's own onFocus /
  // onContentSizeChange / ref, still called.
  const fieldProps = (key, extra = {}) => {
    if (!nodes.current[key]) nodes.current[key] = { current: null };
    const box = nodes.current[key];
    return {
      ref: (n) => {
        box.current = n;
        if (typeof extra.ref === 'function') extra.ref(n); else if (extra.ref) extra.ref.current = n;
      },
      onFocus: (e) => { liftField(box); if (extra.onFocus) extra.onFocus(e); },
      onContentSizeChange: (e) => { if (field.current === box && kbTop.current != null) lift(); if (extra.onContentSizeChange) extra.onContentSizeChange(e); },
    };
  };

  return {
    scrollProps: {
      ref: (n) => { scroll.current = n; if (extRef) extRef.current = n; },
      onScroll: (e) => { scrollY.current = e.nativeEvent.contentOffset.y; },
      scrollEventThrottle: 32,
      // The spacer (or anything else) changed the page's height while a field waits: lift again.
      onContentSizeChange: () => { if (enabled && kbTop.current != null) lift(); },
    },
    spacer: enabled && kbHeight > 0 ? <View style={{ height: kbHeight }} /> : null,
    liftField,
    fieldProps,
  };
}
