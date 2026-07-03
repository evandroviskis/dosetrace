import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { getAllLogs, getLogsSince, updateDoseLog } from '../lib/database';
import { requestSync } from '../lib/sync';
import { summarizeStored } from '../lib/injectionSites';
import BodyMapModal from './components/BodyMapModal';

const LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

export default function LogScreen() {
  const { t, language } = useLanguage();
  const locale = LOCALES[language] || 'en-US';
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('All');

  // Body-map editor state (tap a row to edit its injection site)
  const [bodyMapVisible, setBodyMapVisible] = useState(false);
  const [bodyMapTarget, setBodyMapTarget] = useState(null);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [])
  );

  async function openSiteEditor(log) {
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

  function outcomeColor(outcome) {
    if (outcome === 'Taken') return '#1D9E75';
    if (outcome === 'Skipped') return '#E24B4A';
    return '#BA7517';
  }

  function outcomeBg(outcome) {
    if (outcome === 'Taken') return '#E1F5EE';
    if (outcome === 'Skipped') return '#FCEBEB';
    return '#FAEEDA';
  }

  function outcomeTextColor(outcome) {
    if (outcome === 'Taken') return '#085041';
    if (outcome === 'Skipped') return '#A32D2D';
    return '#633806';
  }

  function outcomeLabel(outcome) {
    if (outcome === 'Taken') return t('log_taken');
    if (outcome === 'Skipped') return t('log_skipped');
    return t('log_delayed');
  }

  function typeIcon(type) {
    if (type === 'recon') return '🧪';
    if (type === 'rtu') return '💉';
    if (type === 'oral') return '💊';
    return '💉';
  }

  const sections = buildSections(filteredLogs);

  const takenCount = logs.filter(l => l.outcome === 'Taken').length;
  const skippedCount = logs.filter(l => l.outcome === 'Skipped').length;
  const delayedCount = logs.filter(l => l.outcome === 'Delayed').length;

  const filters = [
    { key: 'All', label: t('log_all') },
    { key: 'Taken', label: t('log_taken') },
    { key: 'Skipped', label: t('log_skipped') },
    { key: 'Delayed', label: t('log_delayed') },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('log_title')}</Text>
      </View>

      <View style={s.statsRow}>
        <View style={[s.statCard, { backgroundColor: '#E1F5EE' }]}>
          <Text style={[s.statVal, { color: '#085041' }]}>{takenCount}</Text>
          <Text style={[s.statLbl, { color: '#0F6E56' }]}>{t('log_taken')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#FCEBEB' }]}>
          <Text style={[s.statVal, { color: '#A32D2D' }]}>{skippedCount}</Text>
          <Text style={[s.statLbl, { color: '#A32D2D' }]}>{t('log_skipped')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#FAEEDA' }]}>
          <Text style={[s.statVal, { color: '#633806' }]}>{delayedCount}</Text>
          <Text style={[s.statLbl, { color: '#BA7517' }]}>{t('log_delayed')}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterBtn, filter === f.key && s.filterBtnOn]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterBtnText, filter === f.key && s.filterBtnTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        style={s.scroll}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📓</Text>
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
            <Text style={s.groupDate}>{section.title}</Text>
            <Text style={s.groupCount}>
              {section.data.length} {section.data.length > 1 ? t('log_doses') : t('log_dose')}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: 20 }} />}
        renderItem={({ item: log }) => {
          const tags = parseTags(log.pre_tags);
          return (
            <TouchableOpacity
              style={s.logEntry}
              onPress={() => openSiteEditor(log)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('bodymap_title')}
            >
              <View style={[s.logDot, { backgroundColor: outcomeColor(log.outcome) }]} />
              <View style={s.logInfo}>
                <View style={s.logNameRow}>
                  <Text style={s.logTypeIcon}>{typeIcon(log.protocols?.type)}</Text>
                  <Text style={s.logName}>{log.protocols?.name || t('log_protocol_deleted')}</Text>
                </View>
                {log.injection_site ? <Text style={s.logDetail}>📍 {summarizeStored(log.injection_site, t) || log.injection_site}</Text> : null}
                {log.notes ? <Text style={s.logDetail}>📝 {log.notes}</Text> : null}
                {tags.length > 0 && (
                  <View style={s.tagRow}>
                    {tags.map(tag => (
                      <View key={String(tag)} style={s.tag}>
                        <Text style={s.tagText}>{String(tag)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={s.logRight}>
                <Text style={s.logTime}>
                  {new Date(log.logged_at).toLocaleTimeString(locale, {
                    hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
                <View style={[s.logBadge, { backgroundColor: outcomeBg(log.outcome) }]}>
                  <Text style={[s.logBadgeText, { color: outcomeTextColor(log.outcome) }]}>
                    {outcomeLabel(log.outcome)}
                  </Text>
                </View>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111' },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  statCard: { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '600' },
  statLbl: { fontSize: 10, marginTop: 2 },
  filterBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 12, borderWidth: 0.5, borderColor: '#ddd', marginRight: 8, backgroundColor: '#f9f9f9' },
  filterBtnOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  filterBtnText: { fontSize: 12, color: '#666' },
  filterBtnTextOn: { color: 'white', fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  groupDate: { fontSize: 12, fontWeight: '600', color: '#888' },
  groupCount: { fontSize: 12, color: '#aaa' },
  logEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: '#eee', marginBottom: 6 },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  logInfo: { flex: 1 },
  logNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  logTypeIcon: { fontSize: 12 },
  logName: { fontSize: 13, fontWeight: '600', color: '#111' },
  logDetail: { fontSize: 11, color: '#888', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tagText: { fontSize: 10, color: '#666' },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logTime: { fontSize: 11, color: '#888' },
  logBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  logBadgeText: { fontSize: 10, fontWeight: '500' },
});