// App search entry, B2 (docs/specs/app-search.md AS-1, AS-1b, AS-18, AS-19): the one corner slot the
// five tab roots share — the 44 pt round magnifier (raised, the "search" glyph of FeatureIcon), with an
// optional control just left of it (My Protocols "+ Adicionar"). Geometry in lib/searchCorner.js.
// Phone: opens the search full screen (MainStack "AppSearch"), from this tab. Unfolded Fold: the
// search opens as this tab's right page and the magnifier is outlined as the chosen item (BK-8).
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSelection } from '../lib/bookSelection';
import { View, Text, TouchableOpacity, StyleSheet, AccessibilityInfo, findNodeHandle, PixelRatio } from 'react-native';
import { useWindowSize } from '../lib/windowSize';
import { fontFamilyFor } from '../lib/fonts';
import { paneWidths } from '../lib/bookLayout';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import FeatureIcon from './FeatureIcon';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { useBook, useBookSelection } from './BookPanes';
import { CORNER, slotMarginTop, titleFits, titleScale } from '../lib/searchCorner';
import { takeFocusBack, clearQuery } from '../lib/appSearchStore';

export const SEARCH_PAGE = 'search'; // the right-page item of the search on the Fold

// AS-1b / AS-22: a word never breaks inside itself. The title's words are measured in the title's own
// style (one per line, out of the flow, never shown or read); when the longest one cannot fit beside
// the corner slot, the tab's header stacks (HEADER_STACKED): the corner keeps the top right and the
// title goes under it at full width, in its own font.
// AS-22: the cap factor (1 = untouched): stacked and the longest word still wider than the full width
// → the size where it fits; never under the default size (k >= 1 / font scale).
function capFactor({ stacked, pageWidth, wordWidth }) {
  const scale = stacked ? titleScale({ pageWidth, wordWidth }) : 1;
  return scale < 1 ? Math.max(1 / PixelRatio.getFontScale(), scale) : 1;
}

// The title style capped by k. lib/fonts gives Geist only from 22 pt up: the capped title keeps its
// own face explicitly.
function capWith(style, k) {
  if (k >= 1) return style;
  const f = StyleSheet.flatten(style) || {};
  return [style, { fontSize: (f.fontSize || 34) * k, ...(f.lineHeight ? { lineHeight: f.lineHeight * k } : null), fontFamily: fontFamilyFor(f.fontWeight), fontWeight: undefined }];
}

// The same cap for a screen that measures its own title (My Protocols).
export function titleCapStyle({ stacked, pageWidth, wordWidth, base }) {
  return capWith(base, capFactor({ stacked, pageWidth, wordWidth }));
}

export function useTitleFit(title) {
  const { width } = useWindowSize();
  const book = useBook();
  const [wordW, setWordW] = useState(null);
  const [slotW, setSlotW] = useState(null);
  const pageWidth = book ? paneWidths(width).left : width;
  const stacked = !titleFits({ pageWidth, wordWidth: wordW, slotWidth: slotW });
  const onWords = (e) => {
    const w = Math.max(0, ...((e.nativeEvent && e.nativeEvent.lines) || []).map((l) => l.width || 0));
    if (w > 0 && w !== wordW) setWordW(w);
  };
  // The words are always measured in the uncapped style (measure gets the screen's own title style),
  // so the cap never feeds back into the measure. Never under the default size (scale >= 1 / font scale).
  const k = capFactor({ stacked, pageWidth, wordWidth: wordW });
  const cap = (style) => capWith(style, k);
  const onSlotLayout = (e) => { const w = e.nativeEvent.layout.width; if (w > 0 && w !== slotW) setSlotW(w); };
  const measure = (style) => <WordsMeasure title={title} style={style} onWords={onWords} />;
  return { stacked, onSlotLayout, measure, cap, scale: k };
}

// The title's words, one per line, in the title's own style: out of the flow, never shown or read.
// One element for the five tabs (My Protocols' own box measured 359 pt for a 580 pt word at the
// largest size, sim 2026-11-04).
export function WordsMeasure({ title, style, onWords }) {
  return (
    <View style={m.box} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[style, m.text]} onTextLayout={onWords}>{String(title || '').split(/\s+/).join('\n')}</Text>
    </View>
  );
}

const m = StyleSheet.create({
  box: { position: 'absolute', left: -3000, top: 0, width: 1000, height: 1, overflow: 'hidden', opacity: 0 },
  text: { flex: 0, flexShrink: 0, minWidth: 0, alignSelf: 'flex-start' },
});

// offsetTop: how far below the top safe area the header's content box begins (the slot always lands
// at CORNER.top).
// alignEnd: the header is stacked (the title under the corner), the slot keeps the top right.
// onSlotLayout: reports the slot's width (the title-fit rule, lib/searchCorner titleFits).
// measure: an out-of-flow element the screen measures with (My Protocols' title words), never shown.
export default function SearchCorner({ tab, leading = null, offsetTop = CORNER.top, alignEnd = false, onSlotLayout = null, measure = null }) {
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
    <View style={[s.slot, { marginTop: slotMarginTop(offsetTop) }, alignEnd && { alignSelf: 'flex-end' }]} onLayout={onSlotLayout || undefined}>
      {measure}
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
