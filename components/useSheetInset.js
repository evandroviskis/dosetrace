// The bottom gap of a sheet, from the system's bottom inset (A-136 (2)). Rules: lib/sheetInset.
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sheetGap, sheetEdgePad } from '../lib/sheetInset';

// A floating sheet: the scrim's paddingBottom.
export function useSheetGap(base) {
  const insets = useSafeAreaInsets();
  return sheetGap(base, insets.bottom, Platform.OS);
}

// An edge sheet: the sheet's own paddingBottom.
export function useSheetEdgePad(base) {
  const insets = useSafeAreaInsets();
  return sheetEdgePad(base, insets.bottom, Platform.OS);
}
