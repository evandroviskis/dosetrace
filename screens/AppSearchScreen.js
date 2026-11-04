// "Buscar no DoseTrace" (docs/specs/app-search.md, founder pick B2 2026-11-04; picture
// docs/design/app-search.html sections 3–11). Phone: a full screen of MainStack ("AppSearch"),
// opened by the magnifier of a tab root (components/SearchCorner) — the field focused with the
// keyboard up, "Cancelar" back to that tab. Unfolded Fold (embedded): the right page of the tab it
// was opened from, without "Cancelar" (BK-22); the field's clear button empties it.
// Offline and private (logic 1, 6, AS-14): everything is read from the phone; nothing typed is
// stored or sent anywhere. The search only navigates (logic 4, AS-10, AS-13): no row shows a value,
// unit, date, dose or note, and no tap saves, changes, deletes, sends, exports or signs out.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Keyboard, BackHandler, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, TabActions } from '@react-navigation/native';
import FeatureIcon from '../components/FeatureIcon';
import RowChevron from '../components/RowChevron';
import LegalModal from '../components/LegalModal';
import { useBook } from '../components/BookPanes';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { translations } from '../i18n/translations';
import { TAB_SCREEN_EDGES } from '../lib/tabBarStyle';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { pluralKey } from '../lib/plural';
import { getActiveProtocols, getEndedProtocols, getDeletedProtocols, getBiomarkers, getVaccines, getLocalDataUserId } from '../lib/database';
import { setSelection, clearSelection } from '../lib/bookSelection';
import { buildPlaceIndex, searchPlaces, groupRows, shortcutsFor } from '../lib/appSearch';
import { buildTextIndex, makeTextSearch, markedPieces, legalContent, LEGAL } from '../lib/appSearchText';
import { protocolEntries, markerRecords, vaccineRecords } from '../lib/appSearchRecords';
import { placeAction, textAction } from '../lib/appSearchNav';
import { todayFlags, getQuery, setQuery, clearQuery, askFocusBack } from '../lib/appSearchStore';
import { SEARCH_PAGE } from '../components/SearchCorner';

const TEXT_LIMIT = 5; // "Ajuda e textos legais": the best 5, then "Mostrar mais {n}" (AS-26)
const TOP_ROW_MAX_SCALE = 1.4; // the field and Cancelar stop growing here (AS-22); the results grow freely

// The person's names on this phone (AS-28): active protocols, markers of saved lab reports, vaccines.
// Read from the local database only, for the account whose data the phone holds (DV-242 keeps it the
// signed-in account on the main screens); never a network call (AS-14).
async function readRecords(t, language) {
  let uid = null;
  try { uid = getLocalDataUserId(); } catch { uid = null; }
  if (!uid) return { protocols: [], records: [], ended: false, deleted: false };
  const safe = (fn) => { try { return fn() || []; } catch { return []; } };
  const active = safe(() => getActiveProtocols(uid));
  return {
    protocols: protocolEntries(active, { translations, t }),
    records: markerRecords(safe(() => getBiomarkers(uid)), language).concat(vaccineRecords(safe(() => getVaccines(uid)))),
    ended: safe(() => getEndedProtocols(uid)).length > 0,
    deleted: safe(() => getDeletedProtocols(uid)).length > 0,
  };
}

export default function AppSearchScreen({ embedded = false, tab: tabProp = null }) {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const book = useBook();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const fromTab = embedded ? tabProp : (route && route.params && route.params.from) || 'Today';
  const [q, setQ] = useState(() => getQuery());
  const [focused, setFocused] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [legal, setLegal] = useState(null); // { doc, block, q } — the LegalModal over the search
  const [data, setData] = useState({ protocols: [], records: [], ended: false, deleted: false });
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const onType = (v) => { setQ(v); setQuery(v); setShowAll(false); };

  // Re-read the names each time the search shows (a protocol added meanwhile is found).
  useFocusEffect(useMemo(() => () => {
    let alive = true;
    readRecords(t, language).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [language])); // eslint-disable-line react-hooks/exhaustive-deps

  const flags = todayFlags();
  const placeIndex = useMemo(() => buildPlaceIndex({
    translations, language, protocols: data.protocols, records: data.records,
    flags: { pending: flags.pending, alerts: flags.alerts, ended: data.ended, deleted: data.deleted },
  }), [language, data, flags.pending, flags.alerts]);
  const searchText = useMemo(() => makeTextSearch(buildTextIndex(t, Platform.OS)), [language]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = useMemo(() => searchPlaces(placeIndex, q), [placeIndex, q]);
  const texts = useMemo(() => (q.trim() ? searchText(q) : []), [searchText, q]);
  const groups = useMemo(() => groupRows(places), [places]);
  const shortcuts = useMemo(() => shortcutsFor(placeIndex, fromTab), [placeIndex, fromTab]);
  const typed = q.trim().length > 0;
  const none = typed && places.length === 0 && texts.length === 0;
  const total = places.length + texts.length;

  // AS-19: the count is announced politely once typing stops; the no-result text too.
  useEffect(() => {
    if (!typed) return undefined;
    const id = setTimeout(() => {
      const msg = none
        ? `${t('search_none_title').replace('{q}', q.trim())}. ${t('search_none_body')}`
        : t(pluralKey('search_count', total, language)).replace('{n}', String(total));
      try { AccessibilityInfo.announceForAccessibility(msg); } catch { /* not available */ }
    }, 900);
    return () => clearTimeout(id);
  }, [q, total, none]); // eslint-disable-line react-hooks/exhaustive-deps

  // BK-10 / BK-14: unfolding with the phone search open puts it on that tab's right page, with the
  // typed text (kept in memory by lib/appSearchStore).
  useEffect(() => {
    if (embedded || !book || !navigation.isFocused()) return;
    setSelection(fromTab, SEARCH_PAGE, { explicit: true });
    navigation.popTo('MainTabs', { screen: fromTab });
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    Keyboard.dismiss();
    clearQuery();
    if (embedded) { clearSelection(fromTab); return; }
    askFocusBack(fromTab); // AS-19: focus back on the magnifier
    navigation.goBack();
  }

  // AS-21 (Android back): first the keyboard, then the search.
  useFocusEffect(useMemo(() => () => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (Keyboard.isVisible && Keyboard.isVisible()) { Keyboard.dismiss(); return true; }
      if (embedded) { close(); return true; }
      clearQuery();
      askFocusBack(fromTab);
      return false; // the stack's own back closes the search
    });
    return () => sub.remove();
  }, [embedded, fromTab])); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab under the stack switches without popping (so the place's back names that tab, AS-9).
  function jumpUnder(tab, params) {
    try {
      const st = navigation.getState();
      const tabs = st && st.routes ? st.routes.find((r) => r.name === 'MainTabs') : null;
      const key = tabs && tabs.state && tabs.state.key;
      if (key) { navigation.dispatch({ ...TabActions.jumpTo(tab, params), target: key }); return true; }
    } catch { /* fall back below */ }
    return false;
  }

  // A place or record: the search closes and the place opens through its normal path (logic 3).
  function openPlace(row) {
    Keyboard.dismiss();
    clearQuery();
    const a = placeAction(row, { book: embedded });
    if (embedded) {
      if (a.tab !== fromTab) clearSelection(fromTab);
      if (a.type === 'bookPage') { setSelection(a.tab, a.sel, { explicit: true, params: a.params }); navigation.navigate(a.tab); return; }
      if (a.type === 'push') { navigation.navigate(a.tab); navigation.navigate(a.route, a.params || undefined); return; }
      if (a.tab === fromTab) clearSelection(fromTab);
      navigation.navigate(a.tab, a.params);
      return;
    }
    if (a.type === 'push') {
      if (jumpUnder(a.tab)) navigation.replace(a.route, a.params || undefined);
      else { navigation.popTo('MainTabs', { screen: a.tab }); navigation.navigate(a.route, a.params || undefined); }
      return;
    }
    if (jumpUnder(a.tab, a.params)) navigation.goBack();
    else navigation.popTo('MainTabs', { screen: a.tab, params: a.params });
  }

  // A text: it opens over the search; "Concluído" / back returns here with the typed text (AS-27).
  function openText(hit) {
    Keyboard.dismiss();
    const a = textAction(hit, q);
    if (!a) return;
    if (a.type === 'legal') { setLegal(a); return; }
    navigation.navigate(a.route, a.params);
  }

  // The text stays in the sheet while it slides away (sim 2026-11-04: it went blank on Done).
  const lastLegal = useRef(null);
  if (legal) lastLegal.current = legal;
  const shownLegal = legal || lastLegal.current;
  const legalDoc = shownLegal ? LEGAL.find((d) => d.doc === shownLegal.doc) : null;

  const placeRow = (r, i) => (
    <TouchableOpacity
      key={r.id}
      style={[s.row, i > 0 && s.rowSep]}
      activeOpacity={0.7}
      onPress={() => openPlace(r)}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}, ${r.path}`}
    >
      {r.proto
        ? <View style={s.dotBox}><View style={[s.dot, { backgroundColor: r.color || colors.data }]} /></View>
        : <FeatureIcon name={r.icon} size={22} color={colors.ink2} />}
      <View style={s.rtext}>
        <Text style={s.rtitle}>{r.title}</Text>
        <Text style={s.rpath}>{r.path}</Text>
      </View>
      <RowChevron color={colors.tick} />
    </TouchableOpacity>
  );

  const textRow = (h, i) => (
    <TouchableOpacity
      key={`${h.unit.src}-${h.k}`}
      style={[s.row, s.rowText, i > 0 && s.rowSep]}
      activeOpacity={0.7}
      onPress={() => openText(h)}
      accessibilityRole="button"
      accessibilityLabel={`${h.unit.title}, ${h.unit.heading || h.unit.where}, ${h.text}`}
    >
      <View style={s.iconTop}><FeatureIcon name={h.unit.icon} size={22} color={colors.ink2} /></View>
      <View style={s.rtext}>
        <Text style={s.rtitle}>{h.unit.title}</Text>
        <Text style={s.rpath}>{h.unit.where}</Text>
        <Text style={s.rex} numberOfLines={2}>
          {h.pre ? '…' : ''}
          {markedPieces(h.text, h.marks).map((p, k) => (p.mark ? <Text key={k} style={s.mark}>{p.text}</Text> : p.text))}
          {h.post ? '…' : ''}
        </Text>
      </View>
      <View style={s.chevTop}><RowChevron color={colors.tick} /></View>
    </TouchableOpacity>
  );

  const block = (label, count, children, key) => (
    <View key={key} style={s.block}>
      <View style={s.lab}>
        <Text style={s.labText} accessibilityRole="header">{label}</Text>
        {count != null ? <Text style={s.labCount}>{count}</Text> : null}
      </View>
      <View style={s.list}>{children}</View>
    </View>
  );

  const shownTexts = showAll ? texts : texts.slice(0, TEXT_LIMIT);

  return (
    <SafeAreaView style={s.container} edges={embedded ? ['left', 'right'] : TAB_SCREEN_EDGES}>
      <View style={[s.centered, s.top]}>
        <View style={[s.field, focused && s.fieldOn]}>
          <View style={s.fieldIcon}><FeatureIcon name="search" size={20} color={colors.ink3} /></View>
          <TextInput
            ref={inputRef}
            style={s.input}
            // Uncontrolled (sim 2026-11-04: a controlled field dropped letters typed right after the
            // search opened); the clear button empties it through the ref.
            defaultValue={q}
            onChangeText={onType}
            placeholder={t('search_field')}
            placeholderTextColor={colors.ink3}
            maxFontSizeMultiplier={TOP_ROW_MAX_SCALE}
            accessibilityLabel={t('search_field')}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            blurOnSubmit
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            selectionColor={colors.ink}
          />
          {q.length > 0 && (
            <TouchableOpacity
              style={s.clear}
              onPress={() => { onType(''); if (inputRef.current) { inputRef.current.clear(); inputRef.current.focus(); } }}
              accessibilityRole="button"
              accessibilityLabel={t('search_clear')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FeatureIcon name="close" size={12} color={colors.raised} />
            </TouchableOpacity>
          )}
        </View>
        {!embedded && (
          <TouchableOpacity onPress={close} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }} style={s.cancel}>
            {/* AS-22 (sim 2026-11-04, largest text): "Abbrechen" grew until the field was a few points wide; the
                top row's two controls stop growing at 1.4x, as the system search bar does. */}
            <Text style={s.cancelText} maxFontSizeMultiplier={TOP_ROW_MAX_SCALE}>{t('cancel')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={listRef}
        style={s.scroll}
        contentContainerStyle={[s.centered, s.listPad]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        showsVerticalScrollIndicator={false}
      >
        {!typed && block(t('search_shortcuts'), null, shortcuts.map(placeRow), 'short')}

        {none && (
          <>
            <View style={s.none}>
              <FeatureIcon name="search" size={44} color={colors.ink2} />
              <Text style={s.noneT}>{t('search_none_title').replace('{q}', q.trim())}</Text>
              <Text style={s.noneB}>{t('search_none_body')}</Text>
            </View>
            {block(t('search_shortcuts'), null, shortcuts.slice(0, 3).map(placeRow), 'noneShort')}
          </>
        )}

        {typed && groups.map((g) => block(t(g.titleKey), g.rows.length, g.rows.map(placeRow), g.g))}

        {typed && texts.length > 0 && block(t('search_text_group'), texts.length, (
          <>
            {shownTexts.map(textRow)}
            {texts.length > shownTexts.length && (
              <TouchableOpacity style={s.more} onPress={() => setShowAll(true)} accessibilityRole="button">
                <Text style={s.moreText}>{t('search_more').replace('{n}', String(texts.length - shownTexts.length))}</Text>
              </TouchableOpacity>
            )}
          </>
        ), 'texts')}
      </ScrollView>

      <LegalModal
        visible={!!legal}
        onClose={() => setLegal(null)}
        title={legalDoc ? t(legalDoc.title) : ''}
        content={shownLegal ? legalContent(t, shownLegal.doc, Platform.OS) : ''}
        doneLabel={t('done')}
        focusBlock={shownLegal ? shownLegal.block : null}
        mark={shownLegal ? shownLegal.q : null}
      />
    </SafeAreaView>
  );
}

// docs/design/app-search.html ".s-top … .more": theme tokens only (AS-16); the protocol dot is the
// protocol's own colour.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 16 },
  field: { flex: 1, minWidth: 0, minHeight: 46, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', paddingLeft: 42, paddingRight: 40 },
  fieldOn: { borderWidth: 2, borderColor: c.ink },
  fieldIcon: { position: 'absolute', left: 13, top: 0, bottom: 0, justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, fontSize: 17, color: c.ink, paddingVertical: 10 },
  clear: { position: 'absolute', right: 11, width: 22, height: 22, borderRadius: 11, backgroundColor: c.ink3, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 17, color: c.ink },
  scroll: { flex: 1 },
  listPad: { paddingBottom: 32 },
  block: { paddingHorizontal: 16, marginBottom: 22, gap: 10 },
  lab: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, gap: 8 },
  labText: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
  labCount: { fontSize: 15, fontWeight: '500', color: c.ink3, fontVariant: ['tabular-nums'] },
  list: { backgroundColor: c.raised, borderRadius: 22, paddingLeft: 16, paddingRight: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  rowText: { alignItems: 'flex-start', paddingVertical: 12 },
  iconTop: { marginTop: 1 },
  chevTop: { marginTop: 4 },
  rtext: { flex: 1, minWidth: 0, gap: 2 },
  rtitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  rpath: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  rex: { fontSize: 14, lineHeight: 19, color: c.ink2, marginTop: 3 },
  mark: { backgroundColor: c.mark, color: c.ink },
  dotBox: { width: 22, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  more: { minHeight: 48, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  moreText: { fontSize: 15, fontWeight: '600', color: c.ink },
  none: { alignItems: 'center', gap: 10, paddingTop: 34, paddingHorizontal: 28, paddingBottom: 30 },
  noneT: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: c.ink, textAlign: 'center' },
  noneB: { fontSize: 15, lineHeight: 20, color: c.ink2, textAlign: 'center', maxWidth: 310 },
});
