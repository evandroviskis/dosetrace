/**
 * DoseTrace — Weigh-ins trend chart (weight vs waist over the user's weigh-ins).
 *
 * Journey redesign part 13 (founder 2026-10-02, prototype trendChart): one 320 x 150 drawing
 * scaled to the card width — three dashed grid lines, weight in data blue (round marks) and
 * waist in ink2 (square marks), each scaled to its own range (twin axes, labelled left in
 * data / right in ink2), dates under the plot (first, middle, last) and a legend.
 *
 * Reports the user's own weigh-ins. No targets, no "good/bad" zones, no interpretation —
 * the user reads the divergence (waist falling while weight stalls) themselves.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import Svg, { Line, Polyline, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';

const W = 320, H = 150, L = 26, R = W - 26, TOP = 14, BOT = 114;

function shortDate(dateStr, locale) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
// Axis value: whole numbers when the range allows, else one decimal.
const axis = (v, span) => (span >= 2 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

// A series' own range, padded so the marks never sit on the plot edge.
function rangeOf(points) {
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(0.4, (hi - lo) * 0.05);
  lo -= pad; hi += pad;
  return { lo, hi };
}

export default function ProgressChart({ series, locale = 'en-US', width }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const active = series.filter(sr => sr.points.length > 0);
  if (!active.length) return null;
  const allDates = active.flatMap(sr => sr.points.map(p => p.date)).sort();
  const t0 = new Date(allDates[0] + 'T12:00:00').getTime();
  const t1 = new Date(allDates[allDates.length - 1] + 'T12:00:00').getTime();
  const span = (t1 - t0) || 1;
  const X = d => L + ((new Date(d + 'T12:00:00').getTime() - t0) / span) * (R - L);
  const mid = allDates[Math.floor((allDates.length - 1) / 2)];
  const labels = [...new Set([allDates[0], mid, allDates[allDates.length - 1]])];
  const weight = active.find(sr => sr.key === 'weight');
  const waist = active.find(sr => sr.key === 'waist');
  const draw = (sr) => {
    const { lo, hi } = rangeOf(sr.points);
    const Y = v => TOP + ((hi - v) / (hi - lo)) * (BOT - TOP);
    return { lo, hi, pts: sr.points.map(p => ({ x: X(p.date), y: Y(p.value) })) };
  };
  const w = weight ? draw(weight) : null;
  const c = waist ? draw(waist) : null;
  const h = Math.round(((width || W) * H) / W);
  return (
    <View style={s.wrap}>
      <Svg width="100%" height={h} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={active.map(sr => sr.label).join(', ')}>
        {[14, 64, 114].map(y => <Line key={y} x1={L} x2={R} y1={y} y2={y} stroke={colors.line} strokeDasharray="2 3" />)}
        {c ? (
          <>
            <Polyline fill="none" stroke={colors.ink2} strokeWidth={1.3} points={c.pts.map(p => `${p.x},${p.y.toFixed(1)}`).join(' ')} />
            {c.pts.map((p, i) => <Rect key={`c${i}`} x={p.x - 3} y={p.y - 3} width={6} height={6} fill={colors.raised} stroke={colors.ink2} strokeWidth={1.3} />)}
            <SvgText x={R + 4} y={18} fontFamily={MONO['400']} fontSize={11} fill={colors.ink2}>{axis(c.hi, c.hi - c.lo)}</SvgText>
            <SvgText x={R + 4} y={118} fontFamily={MONO['400']} fontSize={11} fill={colors.ink2}>{axis(c.lo, c.hi - c.lo)}</SvgText>
          </>
        ) : null}
        {w ? (
          <>
            <Polyline fill="none" stroke={colors.data} strokeWidth={2} points={w.pts.map(p => `${p.x},${p.y.toFixed(1)}`).join(' ')} />
            {w.pts.map((p, i) => <Circle key={`w${i}`} cx={p.x} cy={p.y} r={4} fill={colors.data} />)}
            <SvgText x={L - 4} y={18} textAnchor="end" fontFamily={MONO['400']} fontSize={11} fill={colors.data}>{axis(w.hi, w.hi - w.lo)}</SvgText>
            <SvgText x={L - 4} y={118} textAnchor="end" fontFamily={MONO['400']} fontSize={11} fill={colors.data}>{axis(w.lo, w.hi - w.lo)}</SvgText>
          </>
        ) : null}
        {labels.map((d, i) => (
          <SvgText key={d} x={X(d)} y={H - 6} textAnchor={labels.length === 1 ? 'middle' : i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize={11} fill={colors.ink3}>{shortDate(d, locale)}</SvgText>
        ))}
      </Svg>
      <View style={s.legend}>
        {weight ? (
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: colors.data }]} />
            <Text style={s.legendText}>{weight.label} ({weight.unit})</Text>
          </View>
        ) : null}
        {waist ? (
          <View style={s.legendItem}>
            <View style={s.legendSquare} />
            <Text style={s.legendText}>{waist.label} ({waist.unit})</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { gap: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendSquare: { width: 8, height: 8, borderWidth: 1.3, borderColor: c.ink2 },
  legendText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
});
