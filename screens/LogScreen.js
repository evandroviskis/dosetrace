import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { getAllLogs } from '../lib/database';

export default function LogScreen() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('All');

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [])
  );

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

  function groupByDate(logs) {
    const groups = {};
    logs.forEach(log => {
      const date = new Date(log.logged_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    });
    return groups;
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

  const grouped = groupByDate(filteredLogs);

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

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        {filteredLogs.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📓</Text>
            <Text style={s.emptyTitle}>
              {filter === 'All' ? t('log_empty_title') : `${t('log_no_filter')} ${filter.toLowerCase()}`}
            </Text>
            <Text style={s.emptySub}>{t('log_empty_sub')}</Text>
          </View>
        )}

        {Object.entries(grouped).map(([date, entries]) => (
          <View key={date} style={s.group}>
            <View style={s.groupHeader}>
              <Text style={s.groupDate}>{date}</Text>
              <Text style={s.groupCount}>
                {entries.length} {entries.length > 1 ? t('log_doses') : t('log_dose')}
              </Text>
            </View>
            {entries.map(log => (
              <View key={log.id} style={s.logEntry}>
                <View style={[s.logDot, { backgroundColor: outcomeColor(log.outcome) }]} />
                <View style={s.logInfo}>
                  <View style={s.logNameRow}>
                    <Text style={s.logTypeIcon}>{typeIcon(log.protocols?.type)}</Text>
                    <Text style={s.logName}>{log.protocols?.name || '—'}</Text>
                  </View>
                  {log.injection_site ? <Text style={s.logDetail}>📍 {log.injection_site}</Text> : null}
                  {log.notes ? <Text style={s.logDetail}>📝 {log.notes}</Text> : null}
                  {log.pre_tags && log.pre_tags.length > 0 && (
                    <View style={s.tagRow}>
                      {log.pre_tags.map(tag => (
                        <View key={tag} style={s.tag}>
                          <Text style={s.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={s.logRight}>
                  <Text style={s.logTime}>
                    {new Date(log.logged_at).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </Text>
                  <View style={[s.logBadge, { backgroundColor: outcomeBg(log.outcome) }]}>
                    <Text style={[s.logBadgeText, { color: outcomeTextColor(log.outcome) }]}>
                      {outcomeLabel(log.outcome)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  group: { marginBottom: 20 },
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