import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

// Graduated (Settings part 2, prototype faqScreen): back row, large title, each
// category is a plain raised list card with hairlines between questions, the open
// answer in ink2, and the contact card with the address as an underlined ink link.
// Same items, same order, same words as before.

// Monoline chevrons (prototype CHEV / DOWN / UP), drawn in the theme's ink.
function Chevron({ dir, color }) {
  if (dir === 'left') {
    return (
      <Svg width={10} height={16} viewBox="0 0 10 16">
        <Path d="M8 2L2 8l6 6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={15} height={9} viewBox="0 0 16 10">
      <Path d={dir === 'up' ? 'M2 8l6-6 6 6' : 'M2 2l6 6 6-6'} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
      <View style={[s.centered, s.navRow]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Chevron dir="left" color={colors.ink} />
          <Text style={s.backText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
        <Text style={s.headerTitle} accessibilityRole="header">{t('faq_title')}</Text>
        <Text style={s.intro}>{t('faq_intro')}</Text>

        {faqData.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionLabel}>{section.category}</Text>
            <View style={s.list}>
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
                      <Text style={s.itemQ}>{item.q}</Text>
                      <View style={s.itemChevron}>
                        <Chevron dir={isOpen ? 'up' : 'down'} color={colors.ink2} />
                      </View>
                    </View>
                    {isOpen && (
                      <Text style={s.itemA}>{item.a}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerTitle}>{t('faq_still_questions')}</Text>
          <Text style={s.footerText}>{t('faq_contact_us')}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:hello@dosetrace.io').catch(() => {})}
            accessibilityRole="link"
            style={s.footerLink}
          >
            <Text style={s.footerEmail}>hello@dosetrace.io</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.ground },
  navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: 12 },
  backText: { fontSize: 17, color: c.ink },
  scroll: { flex: 1 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, paddingHorizontal: 20, paddingTop: 4 },
  intro: { fontSize: 15, lineHeight: 20, color: c.ink2, marginHorizontal: 20, marginTop: 4, marginBottom: 4 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 17, fontWeight: '600', color: c.ink, marginHorizontal: 20, marginBottom: 10 },
  list: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  item: { paddingVertical: 14, minHeight: 56, justifyContent: 'center' },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemQ: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, flex: 1 },
  itemChevron: { paddingTop: 7, flexShrink: 0 },
  itemA: { fontSize: 15, lineHeight: 21, color: c.ink2, marginTop: 8 },
  footer: { marginHorizontal: 16, marginTop: 24, padding: 18, backgroundColor: c.raised, borderRadius: 24, alignItems: 'center', gap: 4 },
  footerTitle: { fontSize: 17, fontWeight: '600', color: c.ink, textAlign: 'center' },
  footerText: { fontSize: 15, lineHeight: 20, color: c.ink2, textAlign: 'center' },
  footerLink: { minHeight: 44, justifyContent: 'center' },
  footerEmail: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
});
