// Keeps a bottom sheet in a Modal above the Android keyboard (Fold folded, build 53: the
// calculator's weigh-in sheet sat wholly under the keyboard). Sheet level, no per-input wiring:
// put onLayout on the Modal's root view, use lift.bottom as the sheet's bottom padding (or the
// root's), sheetStyle on the sheet (the height cap) and spread scrollProps on its ScrollView.
// While the keyboard is up the sheet sits above it, capped to the room left, and the focused
// field is scrolled into the sheet's visible part. enabled = false (iPhone, or the sheet is
// closed): no listeners, lift null, no props — the sheet renders exactly as before.
// Rules: lib/sheetKeyboard (sheetKeyboard.test.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { sheetKeyboardLift, sheetFocusScrollY } from '../lib/sheetKeyboard';

const NO_PROPS = Object.freeze({});

export default function useSheetKeyboard(enabled, { gap = 8, topRoom = 48 } = {}) {
  const [kb, setKb] = useState(null); // { kbTop, kbHeight } while the keyboard is up
  const [rootHeight, setRootHeight] = useState(0);
  const scroll = useRef(null);
  const scrollY = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setKb(null);
      return undefined;
    }
    const apply = (ec) => setKb(ec && ec.height > 0 ? { kbTop: ec.screenY, kbHeight: ec.height } : null);
    // A sheet opened while the keyboard is already up lifts at once.
    try { if (Keyboard.isVisible()) apply(Keyboard.metrics()); } catch (e) { /* older RN: wait for the event */ }
    const show = Keyboard.addListener('keyboardDidShow', (e) => apply(e && e.endCoordinates));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(null));
    return () => { show.remove(); hide.remove(); };
  }, [enabled]);

  const lift = useMemo(
    () => (enabled && kb ? sheetKeyboardLift({ rootHeight, kbTop: kb.kbTop, kbHeight: kb.kbHeight, gap, topRoom }) : null),
    [enabled, kb, rootHeight, gap, topRoom],
  );

  // Once the lifted, capped sheet has laid out, bring the focused field into its visible part.
  useEffect(() => {
    if (!lift) return undefined;
    const timer = setTimeout(() => {
      try {
        const input = TextInput.State.currentlyFocusedInput();
        const sv = scroll.current;
        if (!input || !sv || !input.measureInWindow || !sv.measureInWindow) return;
        sv.measureInWindow((sx, sy, sw, sh) => {
          input.measureInWindow((fx, fy, fw, fh) => {
            const y = sheetFocusScrollY({
              fieldTop: fy, fieldBottom: fy + fh, viewTop: sy, viewBottom: sy + sh,
              kbTop: kb ? kb.kbTop : null, scrollY: scrollY.current,
            });
            if (y != null) sv.scrollTo({ y, animated: true });
          });
        });
      } catch (e) { /* nothing focused / unmounted: leave the sheet as it is */ }
    }, 80);
    return () => clearTimeout(timer);
  }, [lift && lift.bottom, lift && lift.maxHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollProps = useMemo(() => ({
    ref: (n) => { scroll.current = n; },
    onScroll: (e) => { scrollY.current = e.nativeEvent.contentOffset.y; },
    scrollEventThrottle: 32,
  }), []);

  return {
    lift,
    onLayout: enabled ? (e) => setRootHeight(e.nativeEvent.layout.height) : undefined,
    sheetStyle: lift && lift.maxHeight != null ? { maxHeight: lift.maxHeight } : null,
    scrollProps: enabled ? scrollProps : NO_PROPS,
  };
}
