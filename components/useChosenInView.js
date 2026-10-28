// A horizontal month row that keeps its chosen month in view (A-190; rule: lib/monthRow). Spread
// rowProps on the ScrollView and give each pill onLayout={itemLayout(i)}. While the row opens it is
// placed again on every new measure (pills, its width, its content: a sheet that is still sliding in
// can clamp the first scroll, seen on the Fold); the opening ends at the first drag or the first
// change of the chosen month. Afterwards only a chosen month out of view moves it (Yesterday /
// Today), never a tap on a month already showing.
import { useEffect, useMemo, useRef } from 'react';
import { chosenScrollX } from '../lib/monthRow';

export default function useChosenInView(chosen) {
  const scroll = useRef(null);
  const layouts = useRef({});
  const offset = useRef(0);
  const viewport = useRef(0);
  const opening = useRef(true);
  const chosenRef = useRef(chosen);
  const seen = useRef(chosen);
  chosenRef.current = chosen;

  const place = (force) => {
    const x = chosenScrollX({ layouts: layouts.current, chosen: chosenRef.current, offset: offset.current, viewport: viewport.current, force });
    if (x == null || !scroll.current) return;
    scroll.current.scrollTo({ x, animated: !force });
    offset.current = x;
  };
  const reopen = () => { if (opening.current) place(true); };

  useEffect(() => {
    if (seen.current === chosen) return;
    seen.current = chosen;
    if (opening.current && chosenRef.current != null && layouts.current[chosen] == null) return; // not measured yet
    opening.current = false;
    place(false);
  }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemLayout = (i) => (e) => { layouts.current[i] = e.nativeEvent.layout; reopen(); };

  const rowProps = useMemo(() => ({
    // A row that leaves the screen (a step or a sheet closing) opens again when it comes back.
    ref: (n) => { scroll.current = n; if (!n) { opening.current = true; layouts.current = {}; offset.current = 0; } },
    onLayout: (e) => { viewport.current = e.nativeEvent.layout.width; reopen(); },
    onContentSizeChange: () => reopen(),
    onScrollBeginDrag: () => { opening.current = false; },
    onScroll: (e) => { offset.current = e.nativeEvent.contentOffset.x; },
    scrollEventThrottle: 32,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { rowProps, itemLayout };
}
