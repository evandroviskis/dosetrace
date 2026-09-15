/**
 * DoseTrace — progress chart (weight vs waist over snapshots)
 *
 * Two independently-scaled lines on a shared date axis: the divergence IS the
 * story (waist falling while weight stalls = recomposition). View primitives
 * only, no SVG. Each series auto-scales to its own min/max (twin axes), so two
 * quantities in different units share one plot.
 *
 * Reports the user's own snapshots. No targets, no "good/bad" zones, no
 * interpretation — the user reads the divergence themselves.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../../lib/theme';

const CHART_H = 150;
const PAD = 12;
const DOT = 6;
const LINE = 2;
const Y_GUTTER = 6;

function shortDate(dateStr, locale) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
const fmt = n => (Number.isFinite(n) ? String(Number(n.toFixed(1))) : '');

// Map a series' points onto x (by date position within the global range) and
// y (scaled to the series' own min/max). Returns { segments, dots }.
function layoutSeries(points, minDate, maxDate, plotW) {
  const span = (maxDate - minDate) || 1;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const vspan = hi - lo;
  const usableH = CHART_H - PAD * 2;
  const xy = points.map(p => {
    const t = (new Date(p.date + 'T12:00:00') - minDate) / span;
    return {
      x: t * plotW,
      y: PAD + usableH * (1 - (p.value - lo) / vspan),
    };
  });
  const segments = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i], b = xy[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ left: (a.x + b.x) / 2 - len / 2, top: (a.y + b.y) / 2 - LINE / 2, width: len, angle: Math.atan2(dy, dx) });
  }
  return { segments, dots: xy };
}

export default function ProgressChart({ series, locale = 'en-US', width }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const plotW = Math.max((width || 300) - DOT - Y_GUTTER, 40);

  // Global date range across all series with ≥1 point.
  const active = series.filter(sr => sr.points.length > 0);
  const allDates = active.flatMap(sr => sr.points.map(p => new Date(p.date + 'T12:00:00')));
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));

  const laid = active.map(sr => ({ ...sr, ...layoutSeries(sr.points, minDate, maxDate, plotW) }));

  return (
    <View style={s.wrap}>
      <View style={[s.plot, { height: CHART_H }]}>
        {laid.map((sr) => (
          <View key={sr.key} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {sr.segments.map((seg, i) => (
              <View key={`s${i}`} style={{ position: 'absolute', left: seg.left, top: seg.top, width: seg.width, height: LINE, borderRadius: LINE, backgroundColor: sr.color, transform: [{ rotate: `${seg.angle}rad` }] }} />
            ))}
            {sr.dots.map((d, i) => (
              <View key={`d${i}`} style={{ position: 'absolute', left: d.x - DOT / 2, top: d.y - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: sr.color, borderWidth: 1.5, borderColor: colors.card }} />
            ))}
          </View>
        ))}
      </View>

      <View style={s.xLabels}>
        <Text style={s.xLabel}>{shortDate(active[0]?.points[0]?.date, locale)}</Text>
        <Text style={s.xLabel}>{shortDate(active[0]?.points[active[0].points.length - 1]?.date, locale)}</Text>
      </View>

      <View style={s.legend}>
        {laid.map(sr => {
          const latest = sr.points[sr.points.length - 1];
          return (
            <View key={sr.key} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: sr.color }]} />
              <Text style={s.legendText}>{sr.label} · {fmt(latest.value)} {sr.unit}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { paddingTop: 4 },
  plot: { position: 'relative', marginRight: Y_GUTTER },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginRight: Y_GUTTER },
  xLabel: { fontSize: 10, color: c.textFaint },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
});
