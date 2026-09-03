import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Svg, { Polyline, Line, Rect } from 'react-native-svg';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { translations } from '../i18n/translations';
import { getActiveProtocols, getTakenLogsSince } from '../lib/database';
import { getHalfLifeEntry } from '../lib/halfLives';
import { useTheme } from '../lib/theme';

const PAST_DAYS = 14;
const FUTURE_DAYS = 7;
const STEP_HOURS = 6;
const FETCH_DAYS = 28; // look back further than the window so the curve starts realistic

// Matching must run on the ENGLISH compound name: compound_id renders localized
// via t(), but the half-life table is keyed in English.
function matchName(protocol) {
  if (protocol.compound_id && translations.en[protocol.compound_id]) {
    return translations.en[protocol.compound_id];
  }
  return protocol.name || '';
}

function doseInMg(protocol) {
  const dose = Number(protocol.dose);
  if (!dose || !isFinite(dose) || dose <= 0) return 1;
  return (protocol.dose_unit || '').toLowerCase() === 'mcg' ? dose / 1000 : dose;
}

function halfLifeLabel(hours) {
  if (hours == null) return '—';
  if (hours >= 48) {
    const days = hours / 24;
    return `${Number.isInteger(days) ? days : days.toFixed(1)}d`;
  }
  return `${hours}h`;
}

export default function SerumCurveScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [protocols, setProtocols] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  async function fetchData() {
    const user = await getCachedUser();
    if (!user) return;
    const active = (getActiveProtocols(user.id) || [])
      .filter(p => ['recon', 'rtu'].includes(p.type))
      .filter(p => getHalfLifeEntry(matchName(p)) != null);
    setProtocols(active);
    // Keep any still-valid selection; otherwise default to the first compound.
    setSelectedIds(prev => {
      const kept = prev.filter(id => active.some(p => p.id === id));
      return kept.length ? kept : (active[0] ? [active[0].id] : []);
    });

    const since = new Date();
    since.setDate(since.getDate() - FETCH_DAYS);
    setLogs(getTakenLogsSince(user.id, since.toISOString()) || []);
  }

  function toggle(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        // Never allow zero selected — keep the last one.
        return prev.length === 1 ? prev : prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  }

  const chartWidth = windowWidth - 32 - 28;
  const chartHeight = 220;
  const stepMs = STEP_HOURS * 3600 * 1000;

  // One decay series per selected compound, all on a SHARED time axis and a
  // SHARED vertical scale (max across every selected series) so overlaid curves
  // are directly comparable.
  const model = useMemo(() => {
    const selected = protocols.filter(p => selectedIds.includes(p.id));
    if (!selected.length) return null;
    const now = Date.now();
    const start = now - PAST_DAYS * 24 * 3600 * 1000;
    const end = now + FUTURE_DAYS * 24 * 3600 * 1000;
    const nSteps = Math.round((end - start) / stepMs);

    const series = selected.map(p => {
      const entry = getHalfLifeEntry(matchName(p));
      const doseMg = doseInMg(p);
      const halfLifeMs = entry.hours * 3600 * 1000;
      const doses = logs
        .filter(l => l.protocol_id === p.id)
        .map(l => new Date(l.logged_at).getTime())
        .filter(ts => isFinite(ts));
      const points = [];
      for (let i = 0; i <= nSteps; i++) {
        const ts = start + i * stepMs;
        let level = 0;
        for (const d of doses) if (d <= ts) level += doseMg * Math.exp((-Math.LN2 * (ts - d)) / halfLifeMs);
        points.push(level);
      }
      const dosesInWindow = doses.filter(ts => ts >= start && ts <= now).length;
      return {
        id: p.id,
        name: p.compound_id ? t(p.compound_id) : p.name,
        color: p.color || colors.accent,
        entry,
        points,
        dosesInWindow,
      };
    });

    const max = series.reduce((m, ser) => Math.max(m, ...ser.points), 0);
    const nowIdx = Math.min(nSteps, Math.round((now - start) / stepMs));
    return { series, max, nowIdx, nSteps };
  }, [protocols, selectedIds, logs, t, colors.accent]);

  function polylineFor(points) {
    if (!model || model.max <= 0) return '';
    const n = points.length;
    return points
      .map((lv, i) => {
        const x = (i / (n - 1)) * chartWidth;
        const y = chartHeight - (lv / model.max) * (chartHeight - 12) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const nowX = model ? (model.nowIdx / model.nSteps) * chartWidth : 0;
  const single = model && model.series.length === 1 ? model.series[0] : null;

  // Dropdown button label: the single compound's name, or "N compounds".
  const selCount = selectedIds.length;
  const buttonLabel = single
    ? single.name
    : `${selCount} ${t('curve_compounds_label')}`;

  const tierCfg = {
    clinical: { bg: colors.successSoft, fg: colors.successSoftText, label: t('curve_tier_clinical') },
    studied: { bg: colors.accentSoft, fg: colors.accentSoftText, label: t('curve_tier_studied') },
    estimated: { bg: colors.warningSoft, fg: colors.warningSoftText, label: t('curve_tier_estimated') },
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common_back')}
        >
          <Text style={s.headerBack}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('curve_title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {protocols.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>📈</Text>
          <Text style={s.emptyTitle}>{t('curve_empty_title')}</Text>
          <Text style={s.emptySub}>{t('curve_empty_sub')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Dropdown trigger — multi-select compound picker */}
          <TouchableOpacity
            style={s.dropdown}
            activeOpacity={0.7}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('curve_choose_title')}
          >
            <View style={s.dropdownLeft}>
              {single && <View style={[s.dot, { backgroundColor: single.color }]} />}
              <Text style={s.dropdownText} numberOfLines={1}>{buttonLabel}</Text>
            </View>
            <Text style={s.dropdownChevron}>⌄</Text>
          </TouchableOpacity>

          <View style={s.card}>
            <View style={s.cardTopRow}>
              <Text style={s.rangeLabel}>
                {t('curve_last_days')} {PAST_DAYS}d · +{FUTURE_DAYS}d {t('curve_projection')}
              </Text>
              {single && (
                <View style={[s.tierBadge, { backgroundColor: tierCfg[single.entry.tier].bg }]}>
                  <Text style={[s.tierBadgeText, { color: tierCfg[single.entry.tier].fg }]}>
                    {tierCfg[single.entry.tier].label}
                  </Text>
                </View>
              )}
            </View>

            <Svg width={chartWidth} height={chartHeight}>
              <Rect x={nowX} y={0} width={Math.max(0, chartWidth - nowX)} height={chartHeight} fill={colors.accentSoft} opacity={0.55} />
              {[0.25, 0.5, 0.75].map(f => (
                <Line key={f} x1={0} y1={chartHeight * f} x2={chartWidth} y2={chartHeight * f} stroke={colors.border} strokeWidth={1} />
              ))}
              <Line x1={nowX} y1={0} x2={nowX} y2={chartHeight} stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="4,4" />
              {/* one overlaid curve per selected compound */}
              {model && model.max > 0 && model.series.map(ser => (
                <Polyline
                  key={ser.id}
                  points={polylineFor(ser.points)}
                  fill="none"
                  stroke={ser.color}
                  strokeWidth={2.5}
                  // Explicit in both cases: react-native-svg keeps a prior dash when
                  // the prop returns to undefined, so estimated→clinical would stay dashed.
                  strokeDasharray={ser.entry.tier === 'estimated' ? '6,4' : '0'}
                />
              ))}
            </Svg>

            <View style={s.axisRow}>
              <Text style={s.axisLabel}>−{PAST_DAYS}d</Text>
              <Text style={[s.axisLabel, { color: colors.text, fontWeight: '700' }]}>{t('curve_now')}</Text>
              <Text style={s.axisLabel}>+{FUTURE_DAYS}d</Text>
            </View>
          </View>

          {single ? (
            // One compound → the 3-stat detail row.
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statVal}>
                  {model.max > 0 ? `${Math.round((single.points[model.nowIdx] / model.max) * 100)}%` : '—'}
                </Text>
                <Text style={s.statLbl}>{t('curve_current_level')}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{halfLifeLabel(single.entry.hours)}</Text>
                <Text style={s.statLbl}>{t('curve_half_life')}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{single.dosesInWindow}</Text>
                <Text style={s.statLbl}>{t('curve_doses_counted')}</Text>
              </View>
            </View>
          ) : (
            // Multiple compounds → a legend, one row each, sharing the y-scale.
            <View style={s.legend}>
              {model && model.series.map(ser => (
                <View key={ser.id} style={s.legendRow}>
                  <View style={[s.dot, { backgroundColor: ser.color }]} />
                  <Text style={s.legendName} numberOfLines={1}>{ser.name}</Text>
                  <Text style={s.legendLevel}>
                    {model.max > 0 ? `${Math.round((ser.points[model.nowIdx] / model.max) * 100)}%` : '—'}
                  </Text>
                  <Text style={s.legendHalf}>t½ {halfLifeLabel(ser.entry.hours)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.disclaimerBox}>
            <Text style={s.disclaimerText}>{t('curve_disclaimer')}</Text>
          </View>
        </ScrollView>
      )}

      {/* Multi-select picker sheet */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalScrim} onPress={() => setPickerOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{t('curve_choose_title')}</Text>
            <Text style={s.sheetHint}>{t('curve_choose_hint')}</Text>
            <ScrollView style={s.sheetList}>
              {protocols.map(p => {
                const on = selectedIds.includes(p.id);
                const entry = getHalfLifeEntry(matchName(p));
                return (
                  <TouchableOpacity key={p.id} style={s.optionRow} activeOpacity={0.7} onPress={() => toggle(p.id)}>
                    <View style={[s.dot, { backgroundColor: p.color || colors.accent }]} />
                    <View style={s.optionMain}>
                      <Text style={s.optionName} numberOfLines={1}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                      <Text style={s.optionSub}>t½ {halfLifeLabel(entry.hours)} · {tierCfg[entry.tier].label}</Text>
                    </View>
                    <View style={[s.check, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                      {on && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.sheetDone} onPress={() => setPickerOpen(false)}>
              <Text style={s.sheetDoneText}>{t('curve_done')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    headerBack: { fontSize: 32, color: colors.accent, marginRight: 10, marginTop: -4 },
    headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
    headerSpacer: { width: 32 },
    scroll: { paddingHorizontal: 16, paddingBottom: 32 },

    dropdown: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    },
    dropdownLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    dropdownText: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
    dropdownChevron: { fontSize: 20, color: colors.textMuted, fontWeight: '700', marginLeft: 8 },

    dot: { width: 11, height: 11, borderRadius: 6, marginRight: 9 },

    card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 },
    rangeLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    tierBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tierBadgeText: { fontSize: 11, fontWeight: '700' },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    axisLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
    statVal: { fontSize: 18, fontWeight: '800', color: colors.text },
    statLbl: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    legend: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: 12, paddingHorizontal: 12, paddingVertical: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    legendName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    legendLevel: { fontSize: 14, fontWeight: '800', color: colors.text, width: 52, textAlign: 'right', fontVariant: ['tabular-nums'] },
    legendHalf: { fontSize: 12, color: colors.textMuted, width: 78, textAlign: 'right' },

    disclaimerBox: { backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12, marginTop: 12 },
    disclaimerText: { fontSize: 12, lineHeight: 17, color: colors.warningSoftText },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
    emptySub: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },

    modalScrim: { flex: 1, backgroundColor: colors.overlay || 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, maxHeight: '80%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    sheetHint: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 8 },
    sheetList: { flexGrow: 0 },
    optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    optionMain: { flex: 1 },
    optionName: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkMark: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
    sheetDone: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
    sheetDoneText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  });
}
