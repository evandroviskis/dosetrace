import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Svg, { Polyline, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { translations } from '../i18n/translations';
import { getActiveProtocols } from '../lib/database';
import { expectedDosesOn } from '../lib/schedule';
import { getHalfLifeEntry } from '../lib/halfLives';
import { useTheme } from '../lib/theme';

const PAST_DAYS = 14;
const FUTURE_PRESETS = [7, 14, 30, 60, 90];
const STEP_HOURS = 6;

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

// Estimated amount still in the body (mg), from the summed-decay model. Rough,
// not a serum concentration — the disclaimer says so.
function mgLabel(v) {
  if (!isFinite(v) || v <= 0) return '0';
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v));
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showCombined, setShowCombined] = useState(true);
  const [futureDays, setFutureDays] = useState(7);   // projection horizon

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
  const AXIS_W = 38;            // left gutter for mg labels
  const PLOT_TOP = 8;           // headroom above the peak
  const PLOT_BOTTOM = chartHeight - 4;
  const plotLeft = AXIS_W;
  const plotRight = chartWidth;
  const stepMs = STEP_HOURS * 3600 * 1000;

  // Shared plot mappers (used by the curves, the NOW dots, and the y-axis ticks).
  const yForLevel = (lv) => {
    if (!model || model.max <= 0) return PLOT_BOTTOM;
    return PLOT_BOTTOM - (lv / model.max) * (PLOT_BOTTOM - PLOT_TOP);
  };
  const xForIndex = (i) => {
    const n = model ? model.nSteps : 1;
    return plotLeft + (i / (n || 1)) * (plotRight - plotLeft);
  };

  // One decay series per selected compound, all on a SHARED time axis and a
  // SHARED vertical scale (max across every selected series) so overlaid curves
  // are directly comparable.
  const model = useMemo(() => {
    const selected = protocols.filter(p => selectedIds.includes(p.id));
    if (!selected.length) return null;
    const now = Date.now();
    const start = now - PAST_DAYS * 24 * 3600 * 1000;
    const end = now + futureDays * 24 * 3600 * 1000;
    const nSteps = Math.round((end - start) / stepMs);

    const DAY_MS = 86400000;
    const series = selected.map(p => {
      const entry = getHalfLifeEntry(matchName(p));
      const doseMg = doseInMg(p);
      const halfLifeMs = entry.hours * 3600 * 1000;
      // Dose events come from the protocol's SCHEDULE (start date + interval +
      // doses/day), not from hand-logged doses — so the curve reflects the
      // protocol automatically, past and projected. Scan back far enough that
      // long esters' earlier doses still contribute at the window start.
      const lookbackDays = Math.min(365, Math.max(PAST_DAYS + 2, Math.ceil(6 * entry.hours / 24)));
      let scanStart = now - lookbackDays * DAY_MS;
      if (p.start_date) {
        const sd = new Date(p.start_date + 'T00:00:00').getTime();
        if (isFinite(sd) && sd > scanStart) scanStart = sd;
      }
      const scanStartDay = new Date(scanStart); scanStartDay.setHours(0, 0, 0, 0);
      const doses = [];
      for (let dts = scanStartDay.getTime(); dts <= end; dts += DAY_MS) {
        const day = new Date(dts);
        // Count of scheduled doses that day (reminder-time-independent); place
        // them at midday so the daily accumulation is captured at 6h sampling.
        const cnt = expectedDosesOn(p, day);
        if (cnt > 0) {
          const dd = new Date(day); dd.setHours(12, 0, 0, 0);
          for (let k = 0; k < cnt; k++) doses.push(dd.getTime());
        }
      }
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

    // Auto-group by shared active substance (e.g. two testosterone esters).
    // A "combined" line sums the point-by-point levels of a group's members —
    // meaningful only within one active substance, which is why ungrouped
    // compounds (no `substance` tag) never contribute to a total.
    const bySubstance = {};
    for (const ser of series) {
      const sub = ser.entry.substance;
      if (!sub) continue;
      (bySubstance[sub] ||= []).push(ser);
    }
    const combined = Object.entries(bySubstance)
      .filter(([, members]) => members.length >= 2)
      .map(([sub, members]) => {
        const points = new Array(nSteps + 1).fill(0);
        for (const ser of members) for (let i = 0; i <= nSteps; i++) points[i] += ser.points[i];
        return { id: `combined:${sub}`, substance: sub, members: members.map(m => m.id), points };
      });

    // Shared vertical scale spans the individual series and, when shown, the
    // (taller) combined totals — so every line is directly comparable.
    let max = series.reduce((m, ser) => Math.max(m, ...ser.points), 0);
    if (showCombined) max = combined.reduce((m, c) => Math.max(m, ...c.points), max);
    const nowIdx = Math.min(nSteps, Math.round((now - start) / stepMs));
    return { series, combined, max, nowIdx, nSteps };
  }, [protocols, selectedIds, t, colors.accent, showCombined, futureDays]);

  function polylineFor(points) {
    if (!model || model.max <= 0) return '';
    return points.map((lv, i) => `${xForIndex(i).toFixed(1)},${yForLevel(lv).toFixed(1)}`).join(' ');
  }

  // "Nice" mg tick values for the y-axis (0 → peak, rounded to readable steps).
  function yTicks() {
    if (!model || model.max <= 0) return [];
    const raw = model.max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = (raw / mag >= 5 ? 5 : raw / mag >= 2 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = 0; v <= model.max + 0.001; v += step) ticks.push(v);
    return ticks;
  }

  const nowX = model ? xForIndex(model.nowIdx) : plotLeft;
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
                {t('curve_last_days')} {PAST_DAYS}d · +{futureDays}d {t('curve_projection')}
                {model && model.max > 0 ? `  ·  ${t('curve_peak')} ≈ ${mgLabel(model.max)} mg` : ''}
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
              {/* future projection zone */}
              <Rect x={nowX} y={PLOT_TOP} width={Math.max(0, plotRight - nowX)} height={PLOT_BOTTOM - PLOT_TOP} fill={colors.accentSoft} opacity={0.55} />
              {/* y-axis: mg gridlines + labels */}
              {yTicks().map((v, i) => (
                <React.Fragment key={i}>
                  <Line x1={plotLeft} y1={yForLevel(v)} x2={plotRight} y2={yForLevel(v)} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={plotLeft - 6} y={yForLevel(v) + 3.5} fontSize={9} fill={colors.textMuted} textAnchor="end">
                    {mgLabel(v)}
                  </SvgText>
                </React.Fragment>
              ))}
              <SvgText x={2} y={PLOT_TOP + 2} fontSize={9} fill={colors.textMuted} textAnchor="start">mg</SvgText>
              {/* NOW line */}
              <Line x1={nowX} y1={PLOT_TOP} x2={nowX} y2={PLOT_BOTTOM} stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="4,4" />
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
              {/* combined total per substance group — bold, on top */}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <Polyline key={c.id} points={polylineFor(c.points)} fill="none" stroke={colors.text} strokeWidth={3.5} strokeDasharray="0" />
              ))}
              {/* dots marking each line's level right now */}
              {model && model.max > 0 && model.series.map(ser => (
                <Circle key={`d-${ser.id}`} cx={nowX} cy={yForLevel(ser.points[model.nowIdx])} r={3.5} fill={ser.color} />
              ))}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <Circle key={`d-${c.id}`} cx={nowX} cy={yForLevel(c.points[model.nowIdx])} r={4} fill={colors.text} />
              ))}
            </Svg>

            <View style={[s.axisRow, { marginLeft: AXIS_W }]}>
              <Text style={s.axisLabel}>−{PAST_DAYS}d</Text>
              <Text style={[s.axisLabel, { color: colors.text, fontWeight: '700' }]}>{t('curve_now')}</Text>
              <Text style={s.axisLabel}>+{futureDays}d</Text>
            </View>

            {/* Projection horizon selector */}
            <View style={s.horizonRow}>
              <Text style={s.horizonLabel}>{t('curve_project_ahead')}</Text>
              <View style={s.horizonChips}>
                {FUTURE_PRESETS.map(d => {
                  const on = futureDays === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[s.horizonChip, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                      onPress={() => setFutureDays(d)}
                    >
                      <Text style={[s.horizonChipText, on && { color: colors.accentText }]}>+{d}d</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {single ? (
            // One compound → the 3-stat detail row.
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statVal}>{mgLabel(single.points[model.nowIdx])} mg</Text>
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
                  <Text style={s.legendLevel}>{mgLabel(ser.points[model.nowIdx])} mg</Text>
                  <Text style={s.legendHalf}>t½ {halfLifeLabel(ser.entry.hours)}</Text>
                </View>
              ))}
              {showCombined && model && model.combined.map(c => (
                <View key={c.id} style={s.legendRow}>
                  <View style={[s.combinedSwatch, { backgroundColor: colors.text }]} />
                  <Text style={[s.legendName, { fontWeight: '800' }]} numberOfLines={1}>
                    {t('curve_combined')} · {t(`substance_${c.substance}`)}
                  </Text>
                  <Text style={[s.legendLevel, { fontWeight: '800' }]}>{mgLabel(c.points[model.nowIdx])} mg</Text>
                  <Text style={s.legendHalf}> </Text>
                </View>
              ))}
            </View>
          )}

          {/* Combined-total toggle — only when a same-substance group exists */}
          {model && model.combined.length > 0 && (
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>{t('curve_combined_toggle')}</Text>
                <Text style={s.toggleHint}>{t('curve_combined_hint')}</Text>
              </View>
              <Switch
                value={showCombined}
                onValueChange={setShowCombined}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
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
    horizonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 6 },
    horizonLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    horizonChips: { flexDirection: 'row', gap: 6 },
    horizonChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    horizonChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
    statVal: { fontSize: 18, fontWeight: '800', color: colors.text },
    statLbl: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    legend: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: 12, paddingHorizontal: 12, paddingVertical: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    legendName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    legendLevel: { fontSize: 14, fontWeight: '800', color: colors.text, width: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
    legendHalf: { fontSize: 12, color: colors.textMuted, width: 74, textAlign: 'right' },
    combinedSwatch: { width: 16, height: 4, borderRadius: 2, marginRight: 6 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
    toggleLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    toggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

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
