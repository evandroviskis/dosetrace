// The curve explained, the three cards (docs/specs/curve-explained.md CE-5 / CE-8; picture
// docs/design/curve-explained.html section 2; rules and storage in lib/curveCards.js).
//  • CurveCardsSheet: a bottom sheet, one card at a time — "Dose no corpo · n de 3", the title, the
//    text, the estimate footer, the dots, Pular / Voltar and Próximo / Entendi, "Saiba mais" on the
//    last card. Shown on the first opening of the curve; the help mark reopens it.
//  • CurveCardsList: the same three cards one under the other, for the curve's Premium lock (the
//    preview sheet free users see before the paywall button).
// Concepts only — never what the person should do. Theme tokens only, both themes.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Platform } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Modal from './PresenceModal';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { useWindowSize } from '../lib/windowSize';
import { CURVE_CARDS, cardButtons, stepText } from '../lib/curveCards';

// The slide-in only on iOS: inside a Modal on Android a Reanimated entering keeps the first layout
// (__tests__/foodEditorAndroidSheet.test.js); Android gets the Modal's fade.
const SHEET_ENTERING = Platform.OS === 'ios' ? SlideInDown.duration(280) : undefined;

export function CurveCardsList() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.list}>
      {CURVE_CARDS.map((c, i) => (
        <View key={c.titleKey} style={[s.listItem, i > 0 && s.listSep]}>
          <Text style={s.listTitle} accessibilityRole="header">{t(c.titleKey)}</Text>
          <Text style={s.listBody}>{t(c.bodyKey)}</Text>
        </View>
      ))}
      <Text style={s.foot}>{t('curve_foot')}</Text>
    </View>
  );
}

export function CurveCardsSheet({ visible, onClose, onLearnMore }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowSize(); // the measured window: the sheet fits the closed Fold
  const [i, setI] = useState(0);
  useEffect(() => { if (visible) setI(0); }, [visible]);
  const card = CURVE_CARDS[Math.min(i, CURVE_CARDS.length - 1)];
  const b = cardButtons(i);
  const onSec = () => (i === 0 ? onClose() : setI(i - 1));
  const onPri = () => (b.more ? onClose() : setI(i + 1));
  return (
    <Modal visible={!!visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.wrap}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('curve_cards_skip')} />
        {visible ? (
          <Animated.View entering={SHEET_ENTERING} style={[s.sheet, { width: Math.min(winW - 16, 560), marginBottom: Math.max(insets.bottom, 8) + 8 }]}>
            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={s.grab} />
              <Text style={s.step}>{t('body_card_dosing_title')} · {stepText(t, i)}</Text>
              <Text style={s.title} accessibilityRole="header">{t(card.titleKey)}</Text>
              <Text style={s.text}>{t(card.bodyKey)}</Text>
              <Text style={s.foot}>{t('curve_foot')}</Text>
              <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {CURVE_CARDS.map((_, j) => <View key={j} style={[s.dot, j === i && s.dotOn]} />)}
              </View>
              <View style={s.btns}>
                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onSec} activeOpacity={0.8} accessibilityRole="button">
                  <Text style={s.btnSecText}>{t(b.secKey)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnPri]} onPress={onPri} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={s.btnPriText}>{t(b.priKey)}</Text>
                </TouchableOpacity>
              </View>
              {b.more ? (
                <TouchableOpacity style={s.more} onPress={onLearnMore} accessibilityRole="link" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={s.moreText}>{t('curve_cards_more')}</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
  sheet: { maxHeight: '92%', backgroundColor: c.raised, borderRadius: 24, overflow: 'hidden' },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 14 },
  step: { fontSize: 13, lineHeight: 18, color: c.ink3, marginBottom: 6 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: c.ink, marginBottom: 6 },
  text: { fontSize: 15, lineHeight: 22, color: c.ink2 },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink3, marginTop: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.line },
  dotOn: { backgroundColor: c.ink },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
  btnPri: { backgroundColor: c.act },
  btnPriText: { fontSize: 16, fontWeight: '600', color: c.onAct },
  more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  moreText: { fontSize: 15, color: c.data, textDecorationLine: 'underline' },
  // Premium lock (CE-8)
  list: { backgroundColor: c.well, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4, paddingBottom: 12 },
  listItem: { paddingVertical: 10, gap: 4 },
  listSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  listTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.ink },
  listBody: { fontSize: 14, lineHeight: 20, color: c.ink2 },
});
