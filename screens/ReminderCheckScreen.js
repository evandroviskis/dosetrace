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
import FeatureIcon from '../components/FeatureIcon';
import { readReminderHealth, sendTestReminder, openReminderFix } from '../lib/notifications';
import { reminderChecks, scheduleState } from '../lib/reminderHealth';
import { formatDate } from '../lib/localeFormat';
import { formatTime } from '../lib/timeFormat';
import { pluralKey } from '../lib/plural';

const ROW = {
  notifications: { icon: 'bell', title: 'rc_notif', ok: 'rc_notif_ok', block: 'rc_notif_block', fix: 'rc_fix_turn_on' },
  channel: { icon: 'bell', title: 'rc_channel', ok: 'rc_channel_ok', block: 'rc_channel_block', fix: 'rc_fix_turn_on' },
  battery: { icon: 'calc_bolt', title: 'rc_battery', ok: 'rc_battery_ok', warn: 'rc_battery_warn', fix: 'rc_fix_adjust' },
  // A-106: readable on Android 12+; 'open' (cannot be read) keeps the old text and Open button.
  alarms: { icon: 'clock', title: 'rc_alarms', ok: 'rc_alarms_ok', warn: 'rc_alarms_warn', open: 'rc_alarms_sub', fix: 'rc_fix_turn_on' },
  deep_sleep: { icon: 'snooze', title: 'rc_deep_sleep', open: 'rc_deep_sleep_sub', fix: 'rc_fix_open' },
};

function Back({ color }) {
  return (
    <Svg width={10} height={16} viewBox="0 0 10 16">
      <Path d="M8 2L2 8l6 6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ReminderCheckScreen({ navigation }) {
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

  const checks = health ? reminderChecks(health) : [];
  const sched = health ? scheduleState(health) : null;

  function stateText(c) {
    const r = ROW[c.id];
    if (c.state === 'open') return t(r.open);
    return t(r[c.state] || r.ok);
  }
  function stateColor(c) {
    if (c.state === 'block') return colors.risk;
    if (c.state === 'warn') return colors.attention;
    return colors.ink2;
  }

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
        <Text style={s.title} accessibilityRole="header">{t('settings_rc_title')}</Text>
        <Text style={s.intro}>{t('rc_intro')}</Text>

        <View style={s.group}>
          {checks.map((c, i) => {
            const r = ROW[c.id];
            const needsFix = c.state !== 'ok';
            const fixKey = c.state === 'open' ? 'rc_fix_open' : r.fix; // a row it cannot read only opens
            return (
              <View key={c.id} style={[s.row, i === checks.length - 1 && s.rowLast]}>
                <FeatureIcon name={c.state === 'block' ? 'warning' : r.icon} size={24} color={c.state === 'block' ? colors.risk : colors.ink} />
                <View style={s.rowText}>
                  <Text style={s.rowLabel}>{t(r.title)}</Text>
                  <Text style={[s.rowSub, { color: stateColor(c) }]}>{stateText(c)}</Text>
                </View>
                {needsFix ? (
                  <TouchableOpacity style={s.fixBtn} onPress={() => openReminderFix(c.fix)} accessibilityRole="button" accessibilityLabel={`${t(fixKey)}: ${t(r.title)}`}>
                    <Text style={s.fixText}>{t(fixKey)}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.okPill}>OK</Text>
                )}
              </View>
            );
          })}
        </View>

        <Text style={s.section}>{t('rc_sched_title')}</Text>
        <View style={s.card}>
          {sched === 'off' ? (
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
  group: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, minHeight: 60, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 17, color: c.ink },
  rowSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  fixBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  fixText: { fontSize: 14, fontWeight: '600', color: c.onAct },
  okPill: { fontSize: 12, fontWeight: '600', color: c.ok, borderWidth: 1, borderColor: c.ok, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  section: { fontSize: 13, color: c.ink2, marginHorizontal: 32, marginTop: 22, marginBottom: 8 },
  card: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, padding: 16 },
  cardKey: { fontSize: 13, color: c.ink2 },
  cardMain: { fontSize: 20, fontWeight: '600', color: c.ink, marginTop: 2, fontVariant: ['tabular-nums'] },
  cardSub: { fontSize: 13, color: c.ink2, marginTop: 2 },
  testBtn: { marginHorizontal: 16, marginTop: 16, minHeight: 50, borderRadius: 25, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  testText: { fontSize: 16, fontWeight: '600', color: c.onAct },
  hint: { fontSize: 13, lineHeight: 18, color: c.ink2, marginHorizontal: 32, marginTop: 10 },
});
