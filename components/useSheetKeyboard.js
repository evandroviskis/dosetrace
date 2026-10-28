// Keeps a bottom sheet in a Modal above the Android keyboard (Fold folded, build 53: the
// calculator's weigh-in sheet sat wholly under the keyboard). Sheet level, no per-input wiring:
// put onLayout on the Modal's root view, use lift.bottom as the sheet's bottom padding (or the
// root's), sheetStyle on the sheet (the height cap) and spread scrollProps on its ScrollView.
// While the keyboard is up the sheet sits above it, capped to the room left, and the focused
// field is scrolled into the sheet's visible part, also while a multiline field grows. enabled =
// false (iPhone, or the sheet is closed): no listeners, lift null, no props — the sheet renders
// exactly as before. The protocol editor uses it on iPhone too (A-152: its page sheet's
// KeyboardAvoidingView made no room).
// Rules: lib/sheetKeyboard (sheetKeyboard.test.js). The focus scroll moves the keyboard's screenY
// into measureInWindow's space on Android (A-152, a152WindowShift.test.js): 0 inside the Modal every
// sheet lives in, the status bar if this is ever used on a page. iPhone: no shift, no extra measure.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';
import { sheetKeyboardLift, sheetFocusScrollY } from '../lib/sheetKeyboard';
import { windowShift } from '../lib/keyboardLift';
import { keyboardFrame } from '../lib/keyboardFrame';
import { useWindowSize } from '../lib/windowSize';

const NO_PROPS = Object.freeze({});

export default function useSheetKeyboard(enabled, { gap = 8, topRoom = 48 } = {}) {
  const [kb, setKb] = useState(null); // { kbTop, kbHeight } while the keyboard is up
  const [rootHeight, setRootHeight] = useState(0);
  const scroll = useRef(null);
  const scrollY = useRef(0);
  const kbRef = useRef(null); // the keyboard now, for the scroll view's own callbacks
  const winHeight = useRef(0);
  winHeight.current = useWindowSize().height; // the measured window (A-129), for keyboardFrame

  useEffect(() => {
    if (!enabled) {
      kbRef.current = null;
      setKb(null);
      return undefined;
    }
    // A-188: a split-screen report with no usable height is estimated (lib/keyboardFrame).
    const apply = (ec) => {
      const k = keyboardFrame(ec, winHeight.current, Platform.OS === 'android');
      const next = k ? { kbTop: k.kbTop, kbHeight: k.kbHeight } : null;
      kbRef.current = next; setKb(next);
    };
    // A sheet opened while the keyboard is already up lifts at once.
    try { if (Keyboard.isVisible()) apply(Keyboard.metrics()); } catch (e) { /* older RN: wait for the event */ }
    const show = Keyboard.addListener('keyboardDidShow', (e) => apply(e && e.endCoordinates));
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbRef.current = null; setKb(null); });
    return () => { show.remove(); hide.remove(); };
  }, [enabled]);

  const lift = useMemo(
    () => (enabled && kb ? sheetKeyboardLift({ rootHeight, kbTop: kb.kbTop, kbHeight: kb.kbHeight, gap, topRoom }) : null),
    [enabled, kb, rootHeight, gap, topRoom],
  );

  // Bring the focused field into the sheet's visible part.
  function focusScroll() {
    try {
      const input = TextInput.State.currentlyFocusedInput();
      const sv = scroll.current;
      const k = kbRef.current;
      if (!input || !sv || !k || !input.measureInWindow || !sv.measureInWindow) return;
      sv.measureInWindow((sx, sy, sw, sh) => {
        const withShift = (done) => {
          if (Platform.OS !== 'android' || !sv.measure) { done(0); return; }
          sv.measure((x, y, w, h, pageX, pageY) => done(windowShift(pageY, sy)));
        };
        withShift((shift) => {
          input.measureInWindow((fx, fy, fw, fh) => {
            const y = sheetFocusScrollY({
              fieldTop: fy, fieldBottom: fy + fh, viewTop: sy, viewBottom: sy + sh,
              kbTop: k.kbTop, scrollY: scrollY.current, windowShift: shift,
            });
            if (y != null) sv.scrollTo({ y, animated: true });
          });
        });
      });
    } catch (e) { /* nothing focused / unmounted: leave the sheet as it is */ }
  }

  // Once the lifted, capped sheet has laid out, bring the focused field into its visible part.
  useEffect(() => {
    if (!lift) return undefined;
    const timer = setTimeout(focusScroll, 80);
    return () => clearTimeout(timer);
  }, [lift && lift.bottom, lift && lift.maxHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollProps = useMemo(() => ({
    ref: (n) => { scroll.current = n; },
    onScroll: (e) => { scrollY.current = e.nativeEvent.contentOffset.y; },
    scrollEventThrottle: 32,
    // A multiline field that grows while typing (A-152, the protocol notes): follow it.
    onContentSizeChange: () => { if (kbRef.current) focusScroll(); },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    lift,
    onLayout: enabled ? (e) => setRootHeight(e.nativeEvent.layout.height) : undefined,
    sheetStyle: lift && lift.maxHeight != null ? { maxHeight: lift.maxHeight } : null,
    scrollProps: enabled ? scrollProps : NO_PROPS,
  };
}
