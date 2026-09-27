import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { getAllLogs, getLogsSince, updateDoseLog } from '../lib/database';
import { scanMissedDoses } from '../lib/doseActions';
import { requestSync } from '../lib/sync';
import { summarizeStored } from '../lib/injectionSites';
import { hour12Pref } from '../lib/timeFormat';
import { isPremium } from '../lib/purchases';
import { Analytics } from '../lib/analytics';
import BodyMapModal from './components/BodyMapModal';
import Svg, { Path } from 'react-native-svg';
import { useTheme, TYPE } from '../lib/theme';
import { Card, Chip, Dot, CircleButton, ScreenTitle, SectionLabel } from '../components/ui';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

function ChevronLeft({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

export default function LogScreen() {
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALES[language] || 'en-US';
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  { const _h12 = hour12Pref(timeFormat); if (_h12 !== undefined) timeOpts.hour12 = _h12; }
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('All');

  // Body-map editor state (tap a row to edit its injection site)
  const [bodyMapVisible, setBodyMapVisible] = useState(false);
  const [bodyMapTarget, setBodyMapTarget] = useState(null);

  useFocusEffect(
    useCallback(() => {
      // Materialize any newly-missed doses (12h+ unlogged) before listing, so
      // they appear in history; then load. scanMissedDoses is best-effort.
      scanMissedDoses().then((n) => {
        if (n > 0) requestSync();
        fetchLogs();
      }).catch(() => fetchLogs());
    }, [])
  );

  // A dose auto-marked "Missed" can be corrected here — the user took it but
  // didn't log it in time. Changing the outcome updates the same row (no new
  // log), so the streak/adherence recompute on the next focus.
  function openMissedEditor(log) {
    Alert.alert(
      t('log_missed_edit_title'),
      t('log_missed_edit_msg'),
      [
        { text: t('log_mark_taken'), onPress: () => setMissedOutcome(log.id, 'Taken') },
        { text: t('log_mark_skipped'), onPress: () => setMissedOutcome(log.id, 'Skipped') },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }

  function setMissedOutcome(logId, outcome) {
    try {
      updateDoseLog(logId, { outcome });
      requestSync();
      fetchLogs();
    } catch { /* ignore */ }
  }

  async function openSiteEditor(log) {
    // Oral supplements have no injection site — nothing to edit here.
    if (!['recon', 'rtu'].includes(log.protocols?.type)) return;
    const user = await getCachedUser();
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const recent = getLogsSince(user.id, since.toISOString()) || [];
    setBodyMapTarget({
      logId: log.id,
      protocolName: log.protocols?.name || null,
      initialStored: log.injection_site || null,
      recentLogs: recent,
    });
    setBodyMapVisible(true);
  }

  function handleSiteSave({ stored }) {
    if (bodyMapTarget?.logId) {
      try {
        updateDoseLog(bodyMapTarget.logId, { injection_site: stored });
        requestSync();
        fetchLogs();
      } catch { /* ignore */ }
    }
    setBodyMapVisible(false);
    setBodyMapTarget(null);
  }

  function handleSiteClose() {
    setBodyMapVisible(false);
    setBodyMapTarget(null);
  }

  async function fetchLogs() {
    const user = await getCachedUser();
    if (!user) return;
    const data = getAllLogs(user.id);
    // Map local join fields to match expected shape: { protocols: { name, color, type } }
    const mapped = (data || []).map(row => ({
      ...row,
      protocols: row.protocol_name ? { name: row.protocol_name, color: row.protocol_color, type: row.protocol_type } : null,
    }));
    setLogs(mapped);
  }

  const filteredLogs = logs.filter(l => {
    if (filter === 'All') return true;
    return l.outcome === filter;
  });

  // Group by local calendar day (year included in the key so e.g. Jul 3 2025
  // and Jul 3 2026 stay separate); returns SectionList-shaped sections.
  function buildSections(logs) {
    const groups = {};
    const currentYear = new Date().getFullYear();
    const order = [];
    logs.forEach(log => {
      const d = new Date(log.logged_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          title: d.toLocaleDateString(locale, {
            weekday: 'long', month: 'short', day: 'numeric',
            ...(d.getFullYear() !== currentYear ? { year: 'numeric' } : {}),
          }),
          data: [],
        };
        order.push(key);
      }
      groups[key].data.push(log);
    });
    return order.map(key => groups[key]);
  }

  // pre_tags may arrive as a JSON string from the cloud — parse defensively
  function parseTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function outcomeLabel(outcome) {
    if (outcome === 'Taken') return t('log_taken');
    if (outcome === 'Skipped') return t('log_skipped');
    return t('log_missed');
  }

  const sections = buildSections(filteredLogs);

  const takenCount = logs.filter(l => l.outcome === 'Taken').length;
  const skippedCount = logs.filter(l => l.outcome === 'Skipped').length;
  const missedCount = logs.filter(l => l.outcome === 'Missed').length;

  const filters = [
    { key: 'All', label: t('log_all') },
    { key: 'Taken', label: t('log_taken') },
    { key: 'Skipped', label: t('log_skipped') },
    { key: 'Missed', label: t('log_missed') },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <CircleButton
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common_back')}
        >
          <ChevronLeft color={colors.text} />
        </CircleButton>
        <TouchableOpacity
          style={s.curveBtn}
          onPress={async () => { Analytics.viewed('serum_curve'); const pro = await isPremium(); navigation.navigate(pro ? 'SerumCurve' : 'Paywall', pro ? undefined : { source: 'log_serum' }); }}
          accessibilityRole="button"
          accessibilityLabel={t('curve_btn')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <FeatureIcon name="curve" size={14} color={colors.accentText} />
            <Text style={s.curveBtnText}>{t('curve_btn')}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <ScreenTitle title={t('log_title')} style={s.titleWrap} />

      <Card style={s.statsRow}>
        {[
          { n: takenCount, label: t('log_taken'), dot: colors.success },
          { n: skippedCount, label: t('log_skipped'), dot: colors.danger },
          { n: missedCount, label: t('log_missed'), dot: colors.warning },
        ].map((st, i) => (
          <View key={st.label} style={[s.statCard, i > 0 && s.statDivider]} accessible accessibilityLabel={`${st.n} ${st.label}`}>
            <Text style={s.statVal}>{st.n}</Text>
            <View style={s.statLblRow}>
              <Dot color={st.dot} size={7} />
              <Text style={s.statLbl} numberOfLines={1}>{st.label}</Text>
            </View>
          </View>
        ))}
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={s.filterBtn}
            onPress={() => setFilter(f.key)}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Chip
              label={f.label}
              tone={filter === f.key ? 'accent' : 'neutral'}
              style={s.filterChip}
              textStyle={s.filterChipText}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        style={s.scroll}
        contentContainerStyle={s.centered}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <View style={s.emptyIcon}><FeatureIcon name="journal" size={48} color={colors.textMuted} /></View>
            <Text style={s.emptyTitle}>
              {filter === 'All'
                ? t('log_empty_title')
                : `${t('log_no_filter')} ${(filters.find(f => f.key === filter)?.label || filter).toLowerCase()}`}
            </Text>
            <Text style={s.emptySub}>{t('log_empty_sub')}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={s.groupHeader}>
            <SectionLabel>{section.title}</SectionLabel>
            <Text style={s.groupCount}>
              {section.data.length} {section.data.length > 1 ? t('log_doses') : t('log_dose')}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: 20 }} />}
        renderItem={({ item: log, index, section }) => {
          const tags = parseTags(log.pre_tags);
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <TouchableOpacity
              style={[s.logEntry, first && s.logEntryFirst, last && s.logEntryLast, !first && s.logEntryDivider]}
              onPress={() => log.outcome === 'Missed' ? openMissedEditor(log) : openSiteEditor(log)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={log.outcome === 'Missed' ? t('log_missed_edit_title') : t('bodymap_title')}
            >
              <Dot color={log.protocols?.color || colors.textFaint} size={10} style={s.logDot} />
              <View style={s.logInfo}>
                <View style={s.logNameRow}>
                  <Text style={s.logName}>{log.protocols?.name || t('log_protocol_deleted')}</Text>
                </View>
                {log.injection_site ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <FeatureIcon name="pin" size={13} color={colors.textMuted} />
                    <Text style={[s.logDetail, { marginTop: 0 }]}>{summarizeStored(log.injection_site, t) || log.injection_site}</Text>
                  </View>
                ) : null}
                {log.notes ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <FeatureIcon name="journal" size={13} color={colors.textMuted} />
                    <Text style={[s.logDetail, { marginTop: 0 }]}>{log.notes}</Text>
                  </View>
                ) : null}
                {tags.length > 0 && (
                  <View style={s.tagRow}>
                    {tags.map(tag => (
                      <Chip key={String(tag)} label={String(tag)} style={s.tag} textStyle={s.tagText} />
                    ))}
                  </View>
                )}
              </View>
              <View style={s.logRight}>
                <Text style={s.logTime}>
                  {new Date(log.logged_at).toLocaleTimeString(locale, timeOpts)}
                </Text>
                <Chip
                  label={outcomeLabel(log.outcome)}
                  tone={log.outcome === 'Taken' ? 'success' : log.outcome === 'Skipped' ? 'danger' : 'warning'}
                  style={s.logBadge}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      <BodyMapModal
        visible={bodyMapVisible}
        onClose={handleSiteClose}
        onSave={handleSiteSave}
        initialStored={bodyMapTarget?.initialStored || null}
        protocolName={bodyMapTarget?.protocolName || null}
        recentLogs={bodyMapTarget?.recentLogs || []}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  titleWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  curveBtn: {
    backgroundColor: c.accent,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  curveBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, paddingVertical: 14, paddingHorizontal: 0 },
  statCard: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border },
  statVal: { fontSize: 30, lineHeight: 34, fontWeight: '300', color: c.text, fontVariant: ['tabular-nums'] },
  statLblRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statLbl: { ...TYPE.caption, color: c.textMuted, flexShrink: 1 },
  filterBar: { flexGrow: 0, paddingHorizontal: 16, paddingVertical: 12 },
  filterBtn: { marginRight: 8, justifyContent: 'center' },
  filterChip: { height: 34, borderRadius: 17, paddingHorizontal: 14 },
  filterChipText: { fontSize: 13.5 },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { ...TYPE.heading, color: c.text, marginBottom: 8, textAlign: 'center' },
  emptySub: { ...TYPE.sub, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  groupCount: { ...TYPE.caption, color: c.textSubtle },
  // Rows of one day sit together in a single card, split by hairlines.
  logEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: c.card },
  logEntryFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  logEntryLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  logEntryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  logDot: { marginTop: 5, flexShrink: 0 },
  logInfo: { flex: 1 },
  logNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  logName: { fontSize: 15, fontWeight: '500', color: c.text, flexShrink: 1 },
  logDetail: { fontSize: 13, color: c.textMuted, marginTop: 2, flexShrink: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { height: 22, paddingHorizontal: 8, borderRadius: 11 },
  tagText: { fontSize: 11, fontWeight: '500' },
  logRight: { alignItems: 'flex-end', gap: 6 },
  logTime: { fontSize: 12.5, color: c.textMuted, fontVariant: ['tabular-nums'] },
  logBadge: { height: 24, paddingHorizontal: 9, borderRadius: 12 },
});
