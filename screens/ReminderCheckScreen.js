// Reminder check (docs/specs/reminder-check.md, founder 2026-10-05 "1 B"; picture
// claude.ai/artifact/LdqvnH85t2VgFb4FidmW36). What this phone allows DoseTrace right now, one row per
// check with a way to fix it, what is scheduled, and a test reminder. The rules live in
// lib/reminderHealth (pure); the phone is read by lib/notifications readReminderHealth.
import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import ReminderSetupList from '../components/ReminderSetupList';
import { readReminderHealth, sendTestReminder } from '../lib/notifications';
import { scheduleState } from '../lib/reminderHealth';
import { formatDate } from '../lib/localeFormat';
import { formatTime } from '../lib/timeFormat';
import { pluralKey } from '../lib/plural';

function Back({ color }) {
  return (
    <Svg width={10} height={16} viewBox="0 0 10 16">
      <Path d="M8 2L2 8l6 6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// A-112 (founder 2026-10-07, picture B): on Android this is THE "Make sure your reminders arrive"
// screen — the ready bar, every item with its button, the automatic refresh, then the schedule and the
// test reminder (the separate setup mode is gone). iPhone keeps "Check reminders".
export default function ReminderCheckScreen({ navigation, route }) {
  const focus = route?.params?.focus; // the row a Today alert pointed at
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [health, setHealth] = useState(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => { readReminderHealth().then(setHealth).catch(() => {}); }, []);
  useFocusEffect(load);
  // Coming back from a system settings screen: read again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  const android = health ? health.os === 'android' : false;
  const sched = health ? scheduleState(health) : null;

  async function test() {
    const ok = await sendTestReminder();
    setSent(ok);
    load();
  }

  const nextLine = health && health.next
    ? `${formatDate(new Date(health.next.atMs), language, 'weekdayDayMonth')}, ${formatTime(new Date(health.next.atMs).toTimeString().slice(0, 5), language, timeFormat)}`
    : null;

  return (
    <SafeAreaView style={s.container}>
      <View style={[s.centered, s.navRow]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Back color={colors.ink} />
          <Text style={s.backText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.centered, s.pad]}>
        <Text style={s.title} accessibilityRole="header">{t(android ? 'rc_setup_title' : 'settings_rc_title')}</Text>
        <Text style={s.intro}>{t(android ? 'rc_setup_intro' : 'rc_intro')}</Text>
        <ReminderSetupList health={health} setup={android} withRefresh focus={focus} />

        <Text style={s.section}>{t('rc_sched_title')}</Text>
        <View style={s.card}>
          {sched === 'silent' ? (
            <Text style={s.cardMain}>{t('rc_silent_on')}</Text>
          ) : sched === 'off' ? (
            <Text style={s.cardMain}>{t('rc_reminders_off')}</Text>
          ) : sched === 'block' ? (
            <>
              <Text style={[s.cardMain, { color: colors.risk }]}>{t('rc_none')}</Text>
              <Text style={s.cardSub}>{t('rc_none_sub')}</Text>
            </>
          ) : nextLine ? (
            <>
              <Text style={s.cardKey}>{t('rc_next')}</Text>
              <Text style={s.cardMain}>{nextLine}</Text>
              <Text style={s.cardSub}>
                {[health.next.title, t(pluralKey('rc_count', health.scheduledCount, language)).replace('{n}', String(health.scheduledCount))].filter(Boolean).join(' · ')}
              </Text>
            </>
          ) : (
            <Text style={s.cardMain}>{t(pluralKey('rc_count', health ? health.scheduledCount : 0, language)).replace('{n}', String(health ? health.scheduledCount : 0))}</Text>
          )}
        </View>

        <TouchableOpacity style={s.testBtn} onPress={test} accessibilityRole="button">
          <Text style={s.testText}>{t('rc_test_btn')}</Text>
        </TouchableOpacity>
        <Text style={s.hint}>{sent ? t('rc_test_sent') : t('rc_test_hint')}</Text>
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
  pad: { paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, paddingHorizontal: 20, paddingTop: 4 },
  intro: { fontSize: 15, lineHeight: 20, color: c.ink2, marginHorizontal: 20, marginTop: 4, marginBottom: 14 },
  section: { fontSize: 13, color: c.ink2, marginHorizontal: 32, marginTop: 22, marginBottom: 8 },
  card: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, padding: 16 },
  cardKey: { fontSize: 13, color: c.ink2 },
  cardMain: { fontSize: 20, fontWeight: '600', color: c.ink, marginTop: 2, fontVariant: ['tabular-nums'] },
  cardSub: { fontSize: 13, color: c.ink2, marginTop: 2 },
  testBtn: { marginHorizontal: 16, marginTop: 16, minHeight: 50, borderRadius: 25, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  testText: { fontSize: 16, fontWeight: '600', color: c.onAct },
  hint: { fontSize: 13, lineHeight: 18, color: c.ink2, marginHorizontal: 32, marginTop: 10 },
});
