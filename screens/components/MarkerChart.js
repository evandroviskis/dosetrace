/**
 * DoseTrace — marker evolution chart
 *
 * Plots one marker's values across the user's own tests, oldest → newest.
 * Drawn with react-native-svg (hybrid restyle): an accent line, open points
 * for past readings and a filled point for the newest one, soft neutral
 * gridlines and the value extents on the right.
 *
 * IMPORTANT — regulatory framing:
 *   This is a neutral plot of the user's OWN entered values. NO reference
 *   ranges, NO shaded "normal" band, NO good/bad coloring, NO trend verdict.
 *   (Stored biomarkers carry no printed lab range — the extractor is told not
 *   to read one — so there is nothing to draw a band from.) It shows the
 *   numbers the user uploaded and nothing more. The user draws their own
 *   conclusions; the app never interprets.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../lib/theme';

const CHART_H = 150;   // plot area height
const PAD_TOP = 12;    // headroom so the top point isn't clipped
const PAD_BOTTOM = 12;
const PAD_X = 8;       // side room so the first/last point isn't clipped
const Y_GUTTER = 40;   // right gutter for the y-axis extents

// Format a YYYY-MM-DD date compactly for the x-axis (locale month + day).
function shortDate(dateStr, locale) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Trim trailing zeros from a numeric label (12.30 → 12.3, 12.00 → 12).
function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

export default function MarkerChart({ points, unit, locale = 'en-US', width }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const plotW = Math.max((width || 300) - Y_GUTTER, 40);

  const { xy, path, minV, maxV } = useMemo(() => {
    const vals = points.map(p => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; } // flat series → give it room so the line sits mid-height
    const span = hi - lo;
    const usableH = CHART_H - PAD_TOP - PAD_BOTTOM;
    const usableW = plotW - PAD_X * 2;
    const n = points.length;
    const pts = points.map((p, i) => ({
      x: PAD_X + (n === 1 ? usableW / 2 : (usableW * i) / (n - 1)),
      y: PAD_TOP + usableH * (1 - (p.value - lo) / span),
    }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { xy: pts, path: d, minV: lo, maxV: hi };
  }, [points, plotW]);

  // Screen-reader summary: the user's own values in order, nothing else.
  const a11y = points
    .map(p => `${shortDate(p.date, locale)} ${fmt(p.value)}${unit ? ' ' + unit : ''}`)
    .join(', ');
  const last = xy.length - 1;
  // Label every point when they fit; otherwise just the first and last.
  const labelAll = points.length <= 5;

  return (
    <View style={s.wrap} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      <View style={{ flexDirection: 'row' }}>
        <Svg width={plotW} height={CHART_H}>
          {[PAD_TOP, CHART_H / 2, CHART_H - PAD_BOTTOM].map((y, i) => (
            <Line key={`g${i}`} x1={0} x2={plotW} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />
          ))}
          <Path d={path} fill="none" stroke={colors.accent} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {xy.map((p, i) => (
            <Circle
              key={`p${i}`}
              cx={p.x}
              cy={p.y}
              r={i === last ? 5.5 : 4}
              fill={i === last ? colors.accent : colors.card}
              stroke={colors.accent}
              strokeWidth={2}
            />
          ))}
        </Svg>
        {/* y-axis extents */}
        <View style={[s.yLabels, { height: CHART_H }]}>
          <Text style={s.yLabel} numberOfLines={1}>{fmt(maxV)}</Text>
          <Text style={s.yLabel} numberOfLines={1}>{fmt(minV)}</Text>
        </View>
      </View>

      {/* x-axis dates */}
      <View style={[s.xLabels, { width: plotW }]}>
        {labelAll ? (
          xy.map((p, i) => (
            <Text
              key={`x${i}`}
              numberOfLines={1}
              style={[s.xLabel, { position: 'absolute', width: 60, left: Math.min(Math.max(p.x - 30, 0), plotW - 60), textAlign: i === 0 && points.length > 1 ? 'left' : i === last && points.length > 1 ? 'right' : 'center' }]}
            >
              {shortDate(points[i].date, locale)}
            </Text>
          ))
        ) : (
          <>
            <Text style={[s.xLabel, { position: 'absolute', left: 0 }]}>{shortDate(points[0].date, locale)}</Text>
            <Text style={[s.xLabel, { position: 'absolute', right: 0 }]}>{shortDate(points[last].date, locale)}</Text>
          </>
        )}
      </View>

      {unit ? <Text style={s.unitLabel}>{unit}</Text> : null}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { paddingTop: 4 },
  yLabels: { width: Y_GUTTER, paddingTop: PAD_TOP - 7, paddingBottom: PAD_BOTTOM - 7, justifyContent: 'space-between', alignItems: 'flex-end' },
  yLabel: { fontSize: 11, color: c.textSubtle, fontVariant: ['tabular-nums'] },
  xLabels: { height: 18, marginTop: 6, position: 'relative' },
  xLabel: { fontSize: 11, color: c.textSubtle },
  unitLabel: { fontSize: 11, color: c.textSubtle, textAlign: 'center', marginTop: 2 },
});
