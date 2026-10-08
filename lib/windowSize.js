// The real window size on a foldable (founder's Fold 2026-10-07: closing the phone left the two-page
// book on the cover screen). MainActivity handles fold changes itself (plugins/withFoldConfigChanges),
// and the new-architecture host refreshes React Native's window size only behind a feature flag, so
// useWindowDimensions can keep the unfolded size. The app's root view is always laid out at the real
// window size: measure it, and let every width decision read that (lib/bookLayout pickWindowSize).
import { createContext, useContext, useState, useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { pickWindowSize } from './bookLayout';

const SizeContext = createContext(null);

export function WindowSizeRoot({ children }) {
  const [size, setSize] = useState(null);
  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  }, []);
  return (
    <SizeContext.Provider value={size}>
      <View style={{ flex: 1 }} onLayout={onLayout} collapsable={false}>{children}</View>
    </SizeContext.Provider>
  );
}

// useWindowDimensions with the measured width and height (fontScale and scale unchanged).
export function useWindowSize() {
  const win = useWindowDimensions();
  return pickWindowSize(useContext(SizeContext), win);
}
