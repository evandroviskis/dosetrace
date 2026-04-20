import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';

export default function FAQScreen({ navigation }) {
  const { t } = useLanguage();
  const [openItem, setOpenItem] = useState(null);

  const faqData = t('faq_categories') || [];

  function toggle(key) {
    setOpenItem(openItem === key ? null : key);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← {t('back')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('faq_title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        <Text style={s.intro}>{t('faq_intro')}</Text>

        {faqData.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionLabel}>{section.category}</Text>
            {section.questions.map((item, qi) => {
              const key = `${si}-${qi}`;
              const isOpen = openItem === key;
              return (
                <TouchableOpacity
                  key={qi}
                  style={[s.item, isOpen && s.itemOpen]}
                  onPress={() => toggle(key)}
                  activeOpacity={0.7}
                >
                  <View style={s.itemHeader}>
                    <Text style={s.itemQ}>{item.q}</Text>
                    <Text style={s.itemChevron}>{isOpen ? '▲' : '▶'}</Text>
                  </View>
                  {isOpen && (
                    <Text style={s.itemA}>{item.a}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerTitle}>{t('faq_still_questions')}</Text>
          <Text style={s.footerText}>
            {t('faq_contact_us')}{'\n'}
            <Text style={s.footerEmail}>hello@dosetrace.io</Text>
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff' },
  backBtn: { width: 60 },
  backText: { fontSize: 14, color: '#185FA5' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  scroll: { flex: 1 },
  intro: { fontSize: 13, color: '#888', lineHeight: 20, margin: 16, marginBottom: 8 },
  section: { marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginLeft: 16, marginTop: 16, marginBottom: 8 },
  item: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 6, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#eee' },
  itemOpen: { borderColor: '#185FA5', borderWidth: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  itemQ: { fontSize: 13, fontWeight: '600', color: '#111', flex: 1, lineHeight: 20 },
  itemChevron: { fontSize: 10, color: '#aaa', marginTop: 2, flexShrink: 0 },
  itemA: { fontSize: 13, color: '#444', lineHeight: 22, marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#f0f0f0' },
  footer: { margin: 16, padding: 16, backgroundColor: '#E6F1FB', borderRadius: 16, alignItems: 'center' },
  footerTitle: { fontSize: 14, fontWeight: '600', color: '#0C447C', marginBottom: 6 },
  footerText: { fontSize: 13, color: '#185FA5', textAlign: 'center', lineHeight: 20 },
  footerEmail: { fontWeight: '600' },
});