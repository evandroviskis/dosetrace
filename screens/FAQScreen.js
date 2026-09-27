import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme, TYPE } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { Card, SectionLabel, CircleButton, ScreenTitle } from '../components/ui';

// Hybrid chevron (replaces the ▶ / ▲ / ← text glyphs).
function Chevron({ dir = 'right', color, size = 16 }) {
  const d = dir === 'left' ? 'M15 5l-7 7 7 7' : dir === 'up' ? 'M5 15l7-7 7 7' : dir === 'down' ? 'M5 9l7 7 7-7' : 'M9 5l7 7-7 7';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function FAQScreen({ navigation }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [openItem, setOpenItem] = useState(null);

  const faqData = t('faq_categories') || [];

  function toggle(key) {
    setOpenItem(openItem === key ? null : key);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <CircleButton onPress={() => navigation.goBack()} accessibilityLabel={t('back')}>
          <Chevron dir="left" color={colors.text} size={20} />
        </CircleButton>
      </View>
      <ScreenTitle title={t('faq_title')} style={s.titleWrap} />

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
        <Text style={s.intro}>{t('faq_intro')}</Text>

        {faqData.map((section, si) => (
          <View key={si} style={s.section}>
            <SectionLabel style={s.sectionLabel}>{section.category}</SectionLabel>
            <Card padded={false} style={s.card}>
              {section.questions.map((item, qi) => {
                const key = `${si}-${qi}`;
                const isOpen = openItem === key;
                return (
                  <TouchableOpacity
                    key={qi}
                    style={[s.item, qi > 0 && s.itemDivider]}
                    onPress={() => toggle(key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <View style={s.itemHeader}>
                      <Text style={[s.itemQ, isOpen && { color: colors.accent }]}>{item.q}</Text>
                      <View style={s.itemChevron}>
                        <Chevron dir={isOpen ? 'up' : 'down'} color={isOpen ? colors.accent : colors.textSubtle} />
                      </View>
                    </View>
                    {isOpen && (
                      <Text style={s.itemA}>{item.a}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        ))}

        <Card style={s.footer}>
          <Text style={s.footerTitle}>{t('faq_still_questions')}</Text>
          <Text style={s.footerText}>
            {t('faq_contact_us')}{'\n'}
            <Text style={s.footerEmail}>hello@dosetrace.io</Text>
          </Text>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  titleWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  scroll: { flex: 1 },
  intro: { ...TYPE.sub, color: c.textMuted, lineHeight: 21, marginHorizontal: 20, marginTop: 8, marginBottom: 4 },
  section: { marginBottom: 4 },
  sectionLabel: { marginLeft: 20, marginTop: 18, marginBottom: 8 },
  card: { marginHorizontal: 16 },
  item: { paddingHorizontal: 16, paddingVertical: 14, minHeight: 48 },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemQ: { fontSize: 15, fontWeight: '500', color: c.text, flex: 1, lineHeight: 21 },
  itemChevron: { marginTop: 3, flexShrink: 0 },
  itemA: { ...TYPE.sub, color: c.textMuted, lineHeight: 22, marginTop: 10 },
  footer: { margin: 16, marginTop: 20, alignItems: 'center' },
  footerTitle: { fontSize: 15, fontWeight: '600', color: c.text, marginBottom: 6 },
  footerText: { ...TYPE.sub, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
  footerEmail: { fontWeight: '600', color: c.accent },
});
