// Keeps a focused field of a scrolling page above the keyboard (A-136 (9)). Spread scrollProps on
// the page's ScrollView, put spacer at the end of its content (room to scroll the last field up
// while the keyboard is open), and call liftField(ref) from the field's onFocus. The field is
// lifted on focus and again once the keyboard has opened. Rule: lib/keyboardLift.
// enabled = false turns it off (no listeners, no spacer, no lift): a sheet whose
// KeyboardAvoidingView already lifts it on iPhone uses it on Android only (food editor, Fold
// 2026-10-17, foodEditorKeyboard.test.js).
import { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { liftScrollY } from '../lib/keyboardLift';

export default function useKeyboardLift(extRef, enabled = true) {
  const scroll = useRef(null);
  const scrollY = useRef(0);
  const kbTop = useRef(null);
  const field = useRef(null);
  const [kbHeight, setKbHeight] = useState(0);

  function lift() {
    const node = field.current && field.current.current;
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
      setTimeout(lift, 60); // once the spacer has laid out
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbTop.current = null;
      field.current = null;
      setKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    scrollProps: {
      ref: (n) => { scroll.current = n; if (extRef) extRef.current = n; },
      onScroll: (e) => { scrollY.current = e.nativeEvent.contentOffset.y; },
      scrollEventThrottle: 32,
    },
    spacer: enabled && kbHeight > 0 ? <View style={{ height: kbHeight }} /> : null,
    liftField: (ref) => { if (!enabled) return; field.current = ref; lift(); },
  };
}
