// App search entry, B2 (docs/specs/app-search.md AS-1, AS-1b, AS-18, AS-19): the one corner slot the
// five tab roots share — the 44 pt round magnifier (raised, the "search" glyph of FeatureIcon), with an
// optional control just left of it (My Protocols "+ Adicionar"). Geometry in lib/searchCorner.js.
// Phone: opens the search full screen (MainStack "AppSearch"), from this tab. Unfolded Fold: the
// search opens as this tab's right page and the magnifier is outlined as the chosen item (BK-8).
import { useCallback, useEffect, useRef } from 'react';
import { clearSelection } from '../lib/bookSelection';
import { View, TouchableOpacity, StyleSheet, AccessibilityInfo, findNodeHandle } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import FeatureIcon from './FeatureIcon';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { useBook, useBookSelection } from './BookPanes';
import { CORNER, slotMarginTop } from '../lib/searchCorner';
import { takeFocusBack, clearQuery } from '../lib/appSearchStore';

export const SEARCH_PAGE = 'search'; // the right-page item of the search on the Fold

// offsetTop: how far below the top safe area the header's content box begins (the slot always lands
// at CORNER.top).
export default function SearchCorner({ tab, leading = null, offsetTop = CORNER.top }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const navigation = useNavigation();
  const book = useBook();
  const { sel, select } = useBookSelection(tab, null);
  const on = book && sel === SEARCH_PAGE;
  const ref = useRef(null);
  // AS-19: after "Cancelar" the screen reader lands back on this button.
  useFocusEffect(useCallback(() => {
    if (!takeFocusBack(tab)) return;
    const node = ref.current ? findNodeHandle(ref.current) : null;
    if (node) setTimeout(() => { try { AccessibilityInfo.setAccessibilityFocus(node); } catch { /* not available */ } }, 400);
  }, [tab]));
  // BK-10 / BK-14: folding with the search open on the right page moves it to the phone's search
  // screen, with the typed text (lib/appSearchStore keeps it in memory).
  const wasBook = useRef(book);
  useEffect(() => {
    if (wasBook.current && !book && sel === SEARCH_PAGE) {
      clearSelection(tab);
      if (navigation.isFocused()) navigation.navigate('AppSearch', { from: tab, keep: true });
    }
    wasBook.current = book;
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => {
    if (book) { if (!on) { clearQuery(); select(SEARCH_PAGE); } return; }
    clearQuery();
    navigation.navigate('AppSearch', { from: tab });
  };
  return (
    <View style={[s.slot, { marginTop: slotMarginTop(offsetTop) }]}>
      {leading}
      <TouchableOpacity
        ref={ref}
        onPress={open}
        activeOpacity={0.7}
        style={[s.mag, { backgroundColor: colors.raised }, on && { borderColor: colors.ink }]}
        accessibilityRole="button"
        accessibilityLabel={t('search_button')}
        accessibilityState={{ selected: on }}
      >
        <FeatureIcon name="search" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'center', gap: CORNER.gap, flexShrink: 0 },
  // The outline (BK-8, prototype .mag.sel: an inset 1.5 pt ink ring) is drawn by the border colour.
  mag: { width: CORNER.size, height: CORNER.size, borderRadius: CORNER.size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
});
