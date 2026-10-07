// A-112 (founder 2026-10-07, picture B): the items of "Make sure your reminders arrive" — the ready
// bar and one row per phone setting with its real state and the button that opens the right Android
// screen. Shared by the one screen (screens/ReminderCheckScreen.js, with the automatic refresh row)
// and the Android onboarding step (items only). The rules live in lib/reminderHealth (pure).
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import FeatureIcon from './FeatureIcon';
import { openReminderFix } from '../lib/notifications';
import { reminderChecks, setupSteps, rowTitleKey } from '../lib/reminderHealth';
import { formatDate } from '../lib/localeFormat';
import { formatTime } from '../lib/timeFormat';

export const ROW = {
  notifications: { icon: 'bell', title: 'rc_notif', ok: 'rc_notif_ok', block: 'rc_notif_block', fix: 'rc_fix_turn_on' },
  channel: { icon: 'bell', title: 'rc_channel', ok: 'rc_channel_ok', block: 'rc_channel_block', fix: 'rc_fix_turn_on' },
  battery: { icon: 'calc_bolt', title: 'rc_battery', ok: 'rc_battery_ok', warn: 'rc_battery_warn', fix: 'rc_fix_adjust' },
  // A-106: readable on Android 12+; 'open' (cannot be read) keeps the old text and Open button.
  alarms: { icon: 'clock', title: 'rc_alarms', ok: 'rc_alarms_ok', warn: 'rc_alarms_warn', open: 'rc_alarms_sub', fix: 'rc_fix_turn_on' },
  // A-110: the hibernation switch (its title is the phone's own name, rowTitleKey) and the refresh.
  hibernation: { icon: 'pause', title: 'rc_hibernation', ok: 'rc_hibernation_ok', warn: 'rc_hibernation_warn', open: 'rc_hibernation_open', fix: 'rc_fix_turn_off' },
  refresh: { icon: 'refresh', title: 'rc_refresh', ok: 'rc_refresh_ok', warn: 'rc_refresh_warn', fix: 'rc_fix_adjust' },
  deep_sleep: { icon: 'moon', title: 'rc_deep_sleep', open: 'rc_deep_sleep_sub', fix: 'rc_fix_open' },
};

// health: lib/notifications readReminderHealth(); setup: Android lists (setupSteps), iPhone the
// plain checks; focus: the row a Today alert pointed at.
export default function ReminderSetupList({ health, setup = true, withRefresh = false, focus = null }) {
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (!health) return null;
  const steps = setup ? setupSteps(health, { withRefresh }) : null;
  const checks = setup ? steps.rows : reminderChecks(health);
  const progress = steps ? t('rc_setup_progress').replace('{n}', String(steps.ready)).replace('{total}', String(steps.total)) : null;

  function stateText(c) {
    const r = ROW[c.id];
    if (c.id === 'refresh') {
      if (c.pending) return t('rc_refresh_pending');
      if (c.state === 'warn') return t('rc_refresh_warn').replace('{n}', String(c.days));
      const d = new Date(c.at);
      const when = t('rc_refresh_ok').replace('{when}', `${formatDate(d, language, 'weekdayDayMonth')}, ${formatTime(d.toTimeString().slice(0, 5), language, timeFormat)}`);
      return c.until ? `${when} · ${t('rc_refresh_until').replace('{date}', formatDate(new Date(c.until), language, 'dayMonth'))}` : when;
    }
    if (c.state === 'open') return t(r.open);
    return t(r[c.state] || r.ok);
  }
  function stateColor(c) {
    if (c.state === 'block') return colors.risk;
    if (c.state === 'warn') return colors.attention;
    return colors.ink2;
  }

  return (
    <>
      {steps && steps.total > 0 ? (
        <View style={s.progress} accessible accessibilityLabel={progress}>
          <Text style={s.progressText}>{progress}</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${(steps.ready / steps.total) * 100}%` }]} /></View>
        </View>
      ) : null}
      <View style={s.group}>
        {checks.map((c, i) => {
          const r = ROW[c.id];
          const needsFix = c.state !== 'ok';
          const fixKey = c.state === 'open' ? 'rc_fix_open' : r.fix; // a row it cannot read only opens
          const title = t(rowTitleKey(c.id, health.manufacturer) || r.title);
          return (
            <View key={c.id} style={[s.row, i === checks.length - 1 && s.rowLast, c.id === focus && s.rowFocus]}>
              <FeatureIcon name={c.state === 'block' ? 'warning' : r.icon} size={24} color={c.state === 'block' ? colors.risk : colors.ink} />
              <View style={s.rowText}>
                <Text style={s.rowLabel}>{title}</Text>
                <Text style={[s.rowSub, { color: stateColor(c) }]}>{stateText(c)}</Text>
              </View>
              {needsFix ? (
                <TouchableOpacity style={s.fixBtn} onPress={() => openReminderFix(c.fix)} accessibilityRole="button" accessibilityLabel={`${t(fixKey)}: ${title}`}>
                  <Text style={s.fixText}>{t(fixKey)}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={s.okPill}>OK</Text>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  group: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, minHeight: 60, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line },
  rowLast: { borderBottomWidth: 0 },
  // The row a Today alert pointed at (A-110 RG-5): the well tone across the card, the same as a pressed row.
  rowFocus: { backgroundColor: c.well, marginHorizontal: 0, paddingHorizontal: 16 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 17, color: c.ink },
  rowSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  fixBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  fixText: { fontSize: 14, fontWeight: '600', color: c.onAct },
  okPill: { fontSize: 12, fontWeight: '600', color: c.ok, borderWidth: 1, borderColor: c.ok, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  progress: { marginHorizontal: 20, marginBottom: 12 },
  progressText: { fontSize: 13, color: c.ink2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: c.well, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: c.ok },
});
