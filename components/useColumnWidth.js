// A list column as wide as its widest cell (founder 2026-10-02: "30 de / set." wrapped in a
// fixed 64 pt date column). Every cell reports its laid-out width; the column takes the
// largest one, never less than `min`. The cells must not have a fixed width (their natural
// width is what gets measured) and should be numberOfLines={1}. The width only grows, so it
// settles after one pass; it starts over when `resetKey` changes (e.g. the app language).
import { useCallback, useEffect, useState } from 'react';

export default function useColumnWidth(min, resetKey) {
  const [measured, setMeasured] = useState(0);
  useEffect(() => { setMeasured(0); }, [resetKey]);
  const onLayout = useCallback((e) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setMeasured((prev) => (w > prev ? w : prev));
  }, []);
  return [Math.max(min, measured), onLayout];
}
