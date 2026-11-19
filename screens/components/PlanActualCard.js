/**
 * DoseTrace — Progress › "Plan and actual" (docs/specs/food-plan-actual.md PA-5/PA-6; picture
 * docs/design/food-goals-progress.html part 1). Under Your daily plan: a 7 days / 14 days switch and one
 * chart each for calories, protein and carbs — a column per day, filled up to the plan, the part above
 * the plan hatched, the shortfall a dashed outline, the plan a dashed line — with the counts under each
 * chart ("On plan X · above Y · below Z of N days"). The math is lib/planActual planVsActual.
 *
 * Facts side by side only: the counts are arithmetic; the conclusion is the person's (AI hard line).
 * Founder 2026-11-18: this replaces the 2026-11-08 "one line, not a planning screen" limit.
 */
import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, Pattern, Line, Rect, G } from 'react-native-svg';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { formatInt } from '../../lib/localeFormat';
import { pluralKey } from '../../lib/plural';
import { planVsActual, columnParts } from '../../lib/planActual';
import SegmentedBar from '../../components/SegmentedBar';

const CHART_H = 84;
const HATCH = 5; // the hatch's step, in points
const DAYS_KEY = 'dosetrace_plan_actual_days'; // per-device convenience (the chosen 7 / 14), not user data
const LABEL = { kcal: 'pa_kcal', protein: 'pa_protein', carbs: 'pa_carbs' };

// The counts line with its numbers in bold ("On plan **5** · above **3** · below **2** of 10 days").
function Counts({ text, values, style, boldStyle }) {
  const parts = text.split(/(\{on\}|\{above\}|\{below\})/);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        const k = p === '{on}' ? 'on' : p === '{above}' ? 'above' : p === '{below}' ? 'below' : null;
        return k ? <Text key={i} style={boldStyle}>{values[k]}</Text> : p;
      })}
    </Text>
  );
}

function Chart({ m, width, colors }) {
  const hatchId = `pa-hatch-${m.key}`;
  const n = m.cols.length;
  const gap = n > 7 ? 3 : 6;
  const colW = width > 0 ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  const y = (v) => CHART_H - (Math.max(0, v) / m.top) * CHART_H;
  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <Pattern id={hatchId} patternUnits="userSpaceOnUse" width={HATCH} height={HATCH} patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={HATCH} stroke={colors.ink2} strokeWidth={2} />
        </Pattern>
      </Defs>
      {m.cols.map((c, i) => {
        const x = i * (colW + gap);
        if (c.value == null) {
          // A day with no food read: empty, a short mark on the floor.
          return <Line key={c.date} x1={x + colW * 0.3} y1={CHART_H - 1} x2={x + colW * 0.7} y2={CHART_H - 1} stroke={colors.ink3} strokeWidth={2} />;
        }
        const p = columnParts(c.value, m.plan, c.today);
        return (
          <G key={c.date}>
            {p.fill > 0 ? <Rect x={x} y={y(p.fill)} width={colW} height={CHART_H - y(p.fill)} fill={colors.data} opacity={c.today ? 0.4 : 1} /> : null}
            {p.over > 0 ? (
              <Rect x={x + 0.5} y={y(m.plan + p.over)} width={Math.max(0, colW - 1)} height={y(m.plan) - y(m.plan + p.over)} fill={`url(#${hatchId})`} stroke={colors.ink2} strokeWidth={1} opacity={c.today ? 0.6 : 1} />
            ) : null}
            {p.short > 0 ? (
              <Rect x={x + 0.75} y={y(m.plan)} width={Math.max(0, colW - 1.5)} height={y(c.value) - y(m.plan)} fill="none" stroke={colors.data} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.7} />
            ) : null}
          </G>
        );
      })}
      {/* The plan: a dashed line across the chart. */}
      <Line x1={0} y1={y(m.plan)} x2={width} y2={y(m.plan)} stroke={colors.ink2} strokeWidth={1.5} strokeDasharray="4 3" />
    </Svg>
  );
}

export default function PlanActualCard({ rows, plan, todayISO }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [days, setDays] = useState(14);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    AsyncStorage.getItem(DAYS_KEY).then((v) => { if (v === '7' || v === '14') setDays(Number(v)); }).catch(() => {});
  }, []);
  const choose = (k) => {
    if (k !== 7 && k !== 14) return;
    setDays(k);
    AsyncStorage.setItem(DAYS_KEY, String(k)).catch(() => {});
  };
  const pva = useMemo(() => planVsActual(rows, plan, todayISO, days), [rows, plan, todayISO, days]);
  if (!pva) return null;
  const fmt = (v) => formatInt(v, language);

  return (
    <View style={s.card}>
      <Text style={s.title}>{t('pa_title')}</Text>
      <SegmentedBar
        items={[{ key: 7, label: t('pa_days_7') }, { key: 14, label: t('pa_days_14') }]}
        value={days}
        onChange={choose}
        compact
      />
      <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={s.charts}>
        {pva.metrics.map((m) => {
          const countsText = m.counts.n > 0
            ? t(pluralKey('pa_counts', m.counts.n, language)).replace('{n}', fmt(m.counts.n))
            : null;
          return (
            <View key={m.key} style={s.metric}>
              <View style={s.head}>
                <Text style={s.metricName}>{t(LABEL[m.key])}</Text>
                <Text style={s.planText}>{t(m.unit === 'g' ? 'pa_chart_plan_g' : 'pa_chart_plan_kcal').replace('{p}', fmt(m.plan))}</Text>
              </View>
              <View accessible accessibilityLabel={`${t(LABEL[m.key])}. ${countsText ? countsText.replace('{on}', m.counts.on).replace('{above}', m.counts.above).replace('{below}', m.counts.below) : t('pa_counts_none')}`}>
                {width > 0 ? <Chart m={m} width={width} colors={colors} /> : <View style={{ height: CHART_H }} />}
              </View>
              {countsText
                ? <Counts text={countsText} values={m.counts} style={s.counts} boldStyle={s.countsB} />
                : <Text style={s.counts}>{t('pa_counts_none')}</Text>}
            </View>
          );
        })}
      </View>
      <View style={s.legend}>
        <View style={s.lg}><View style={s.swIn} /><Text style={s.lgText}>{t('pa_legend_in')}</Text></View>
        <View style={s.lg}>
          <Svg width={12} height={10}>
            <Defs>
              <Pattern id="pa-hatch-legend" patternUnits="userSpaceOnUse" width={HATCH} height={HATCH} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={HATCH} stroke={colors.ink2} strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect x={0.5} y={0.5} width={11} height={9} fill="url(#pa-hatch-legend)" stroke={colors.ink2} strokeWidth={1} />
          </Svg>
          <Text style={s.lgText}>{t('pa_legend_over')}</Text>
        </View>
        <View style={s.lg}><View style={s.swShort} /><Text style={s.lgText}>{t('pa_legend_short')}</Text></View>
      </View>
      <Text style={s.note}>{t('pa_note')}</Text>
      <Text style={s.note}>{t('nutri_week_talk')}</Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  charts: { gap: 16 },
  metric: { gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  metricName: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  planText: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'right', fontVariant: ['tabular-nums'] },
  counts: { fontSize: 13, lineHeight: 18, color: c.ink, fontVariant: ['tabular-nums'] },
  countsB: { fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  lg: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lgText: { fontSize: 12, lineHeight: 16, color: c.ink2 },
  swIn: { width: 12, height: 10, borderRadius: 2, backgroundColor: c.data },
  swShort: { width: 12, height: 10, borderRadius: 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.data },
  note: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
