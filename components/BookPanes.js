// Book layout (S-26, docs/specs/book-layout.md): the two pages and the hooks the screens use.
// Rules live in lib/bookLayout.js (tested); the open item per tab in lib/bookSelection.js.
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Platform, AccessibilityInfo, findNodeHandle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { isBook, GUTTER, foldPlan, unfoldPlan } from '../lib/bookLayout';
import { getSelection, setSelection, onSelectionChange } from '../lib/bookSelection';

// BK-1: true when the window is wide and tall enough for two pages.
export function useBook() {
  const { width, height } = useWindowDimensions();
  return isBook(width, height, Platform.OS);
}

// The open item of a tab's right page (BK-8). `fallback` is the default when the user has
// not chosen anything (it is not stored, so it never becomes a pushed screen on fold).
export function useBookSelection(tab, fallback) {
  const [cur, setCur] = useState(() => getSelection(tab));
  useEffect(() => onSelectionChange((t, v) => { if (t === tab) setCur(v); }), [tab]);
  const sel = cur ? cur.sel : fallback;
  const select = (value, params = null) => setSelection(tab, value, { explicit: true, params });
  return { sel, explicit: !!(cur && cur.explicit), params: cur ? cur.params : null, select };
}

// The route on top of the main stack (MainTabs, or a pushed screen like Paywall).
function topRouteName(navigation) {
  try {
    const stack = navigation.getParent ? navigation.getParent() : null;
    const st = stack && stack.getState ? stack.getState() : null;
    return st && st.routes && st.routes[st.index] ? st.routes[st.index].name : null;
  } catch { return null; }
}

// The tab showing under the stack (read from a pushed stack screen's navigation).
function tabUnderStack(navigation) {
  try {
    const st = navigation.getState();
    const tabs = st && st.routes ? st.routes.find((r) => r.name === 'MainTabs') : null;
    const ts = tabs && tabs.state;
    return ts && ts.routes && ts.routes[ts.index || 0] ? ts.routes[ts.index || 0].name : 'Today';
  } catch { return null; }
}

// BK-10, folding (tab screens): an item the user opened on the right page that lives on a
// pushed stack screen is pushed when the window becomes one column. Only the tab the user
// is looking at pushes, and never over another stack screen (Paywall, chat) (F1). Other
// tabs keep their item and show it when the user returns.
export function useFoldPush(tab) {
  const book = useBook();
  const navigation = useNavigation();
  const was = useRef(book);
  useEffect(() => {
    if (was.current && !book && navigation.isFocused() && topRouteName(navigation) === 'MainTabs') {
      const cur = getSelection(tab);
      const plan = cur && foldPlan({ tab, sel: cur.sel, explicit: cur.explicit });
      if (plan) navigation.navigate(plan.route, cur.params || undefined);
    }
    was.current = book;
  }, [book, tab, navigation]);
}

// BK-10, unfolding (pushed stack screens, when not embedded): the screen moves onto its tab's
// right page. Call it from Log, Progress, SerumCurve and FoodChat with their route name.
// `beforeLeave` lets a screen flush anything typed before it unmounts (never lose data).
// Only the screen on top moves (F3: Log → Curve moves once), back to the SAME tab it was
// opened from, and by popping to the tabs, never by pushing a second copy of them (F2).
export function useUnfoldToPage(routeName, { embedded, params, beforeLeave } = {}) {
  const book = useBook();
  const navigation = useNavigation();
  useEffect(() => {
    if (embedded || !book || !navigation.isFocused()) return;
    const plan = unfoldPlan(routeName, tabUnderStack(navigation));
    if (!plan) return;
    try { if (beforeLeave) beforeLeave(); } catch { /* the flush never blocks the move */ }
    setSelection(plan.tab, plan.sel, { explicit: true, params: params || null });
    navigation.popTo('MainTabs', { screen: plan.tab });
  }, [book, embedded, routeName]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The two pages (BK-3…BK-9): equal halves around a centred gutter with a hairline, each page
// scrolls on its own (the page content brings its own ScrollView). The tab bar stays outside,
// so it spans the full width (BK-8).
export default function BookPanes({ left, right, rightKey }) {
  const { colors } = useTheme();
  // BK-21: when the user opens another item, the screen reader moves to the right page.
  const rightRef = useRef(null);
  const firstKey = useRef(rightKey);
  useEffect(() => {
    if (rightKey === firstKey.current) return;
    firstKey.current = rightKey;
    const node = rightRef.current ? findNodeHandle(rightRef.current) : null;
    if (node) setTimeout(() => { try { AccessibilityInfo.setAccessibilityFocus(node); } catch { /* not available */ } }, 250);
  }, [rightKey]);
  return (
    <View style={s.row}>
      <View style={s.pane}>{left}</View>
      <View style={s.gutter} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[s.hair, { backgroundColor: colors.line }]} />
      </View>
      <View style={s.pane} key={rightKey} ref={rightRef} accessible={false}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  pane: { flex: 1, minWidth: 0 },
  gutter: { width: GUTTER, alignItems: 'center', paddingVertical: 8 },
  hair: { width: StyleSheet.hairlineWidth, flex: 1, opacity: 0.7 },
});
