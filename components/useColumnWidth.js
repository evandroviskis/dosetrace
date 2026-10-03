// A list column as wide as its widest cell (founder 2026-10-02: "30 de / set." wrapped in a
// fixed 64 pt date column). Every cell reports its own text width (the cell must not be
// stretched by the column: alignSelf 'flex-start', numberOfLines={1}); the column takes the
// largest one, never less than `min`. Kept per `resetKey` (the app language): on a new
// language the column starts over and a late layout from the old rows is ignored, so it
// shrinks back (review 2026-10-02). Pure logic: lib/columnWidth.
import { useCallback, useRef, useState } from 'react';
import { columnWidthState, columnWidthOf } from '../lib/columnWidth';

export default function useColumnWidth(min, resetKey) {
  const keyRef = useRef(resetKey);
  keyRef.current = resetKey;
  const [state, setState] = useState(null);
  const onLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    setState((prev) => columnWidthState(prev, { key: resetKey, w, current: keyRef.current }));
  }, [resetKey]);
  return [columnWidthOf(state, resetKey, min), onLayout];
}
