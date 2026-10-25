// A-163 TM-17 (approved picture a163-messages.html, "A e B · Mensagens da equipe"): every message
// the DoseTrace team sent to this account that was not withdrawn, newest first, read-only, with a
// pointer to Settings › Support › Contact us for replies (there is no chat in the app). Opened
// from Settings › Support › Team messages, a row that exists only after the first message — and from a
// tap on a notification whose message was withdrawn (council 2026-10-22). When nothing is left
// (everything withdrawn, also while the screen is open) one ink3 line says so. Theme tokens only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { getCachedUser } from '../lib/supabase';
import { teamMessages, messageWhen } from '../lib/teamMessages';
import { useTeamMessageList } from '../lib/useTeamMessages';

export default function TeamMessagesScreen({ navigation }) {
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [userId, setUserId] = useState(null);
  useEffect(() => { getCachedUser().then((u) => setUserId((u && u.id) || null)).catch(() => {}); }, []);
  const { list, loaded } = useTeamMessageList(userId);
  // The list is read again on every visit (a message withdrawn by the team disappears).
  useFocusEffect(useCallback(() => { teamMessages().refresh().catch(() => {}); }, []));
  const now = Date.now();

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.centered, s.navRow]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Svg width={10} height={16} viewBox="0 0 10 16">
            <Path d="M8 2L2 8l6 6" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
        <Text style={s.title} accessibilityRole="header">{t('settings_team_messages')}</Text>
        {loaded && !list.length ? (
          <Text style={s.empty}>{t('team_msgs_empty')}</Text>
        ) : null}
        <View style={s.list}>
          {list.map((m) => (
            <View key={m.id} style={s.item}>
              <Text style={s.date}>{messageWhen(m.created_at, now, t, language, timeFormat)}</Text>
              <Text style={s.text} selectable>{m.body}</Text>
            </View>
          ))}
        </View>
        <Text style={s.foot}>{t('team_msgs_footer')}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// picture: .stk-top / .back (40 round raised) / .t-title 34/41 / .mlist / .mitem / .mdate2 / .mtext / .mfoot
const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.ground },
  navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingTop: 4 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700', color: c.ink, letterSpacing: -0.8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  list: { marginHorizontal: 16, marginTop: 10, gap: 10 },
  empty: { marginHorizontal: 24, marginTop: 14, fontSize: 17, lineHeight: 22, color: c.ink3 },
  item: { backgroundColor: c.raised, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, gap: 6 },
  date: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  text: { fontSize: 17, lineHeight: 23, color: c.ink },
  foot: { marginHorizontal: 24, marginTop: 18, fontSize: 13, lineHeight: 18, color: c.ink2 },
});
