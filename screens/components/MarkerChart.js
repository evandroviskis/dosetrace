/**
 * DoseTrace — marker evolution chart
 *
 * Plots one marker's values across the user's own tests, oldest → newest.
 * Drawn with React Native primitives only — no react-native-svg — matching
 * the house pattern used by BodyMapModal. Line segments are thin Views
 * centered on each pair's midpoint and rotated to the segment angle.
 *
 * IMPORTANT — regulatory framing:
 *   This is a neutral plot of the user's OWN entered values. NO reference
 *   ranges, NO shaded "normal" band, NO good/bad coloring, NO trend verdict.
 *   It shows the numbers the user uploaded and nothing more. The user draws
 *   their own conclusions; the app never interprets.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../../lib/theme';

const CHART_H = 130;   // plot area height
const PAD_TOP = 10;    // headroom so the top dot isn't clipped
const PAD_BOTTOM = 10;
const DOT = 7;
const LINE_THICKNESS = 2;

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

  // Plot area width, reserving a right gutter for the y-axis value labels so
  // the newest data point doesn't sit underneath them.
  const Y_GUTTER = 36;
  const plotW = Math.max((width || 300) - Y_GUTTER, 40);

  const { segments, dots, minV, maxV } = useMemo(() => {
    const vals = points.map(p => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; } // flat series → give it a band so the line sits mid-height
    const span = hi - lo;
    const usableH = CHART_H - PAD_TOP - PAD_BOTTOM;
    const n = points.length;

    const xy = points.map((p, i) => {
      const x = n === 1 ? plotW / 2 : (plotW * i) / (n - 1);
      const y = PAD_TOP + usableH * (1 - (p.value - lo) / span);
      return { x, y, value: p.value };
    });

    const segs = [];
    for (let i = 0; i < xy.length - 1; i++) {
      const a = xy[i], b = xy[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx); // radians
      segs.push({
        left: (a.x + b.x) / 2 - len / 2,
        top: (a.y + b.y) / 2 - LINE_THICKNESS / 2,
        width: len,
        angle,
      });
    }
    return { segments: segs, dots: xy, minV: lo, maxV: hi };
  }, [points, plotW]);

  return (
    <View style={s.wrap}>
      {/* y-axis extents */}
      <View style={s.yLabels}>
        <Text style={s.yLabel}>{fmt(maxV)}</Text>
        <Text style={s.yLabel}>{fmt(minV)}</Text>
      </View>

      <View style={[s.plot, { height: CHART_H }]}>
        {segments.map((seg, i) => (
          <View
            key={`seg${i}`}
            style={{
              position: 'absolute',
              left: seg.left,
              top: seg.top,
              width: seg.width,
              height: LINE_THICKNESS,
              borderRadius: LINE_THICKNESS,
              backgroundColor: colors.accent,
              transform: [{ rotate: `${seg.angle}rad` }],
            }}
          />
        ))}
        {dots.map((d, i) => (
          <View
            key={`dot${i}`}
            style={{
              position: 'absolute',
              left: d.x - DOT / 2,
              top: d.y - DOT / 2,
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: colors.accent,
              borderWidth: 1.5,
              borderColor: colors.card,
            }}
          />
        ))}
      </View>

      {/* x-axis: first + last test dates */}
      <View style={s.xLabels}>
        <Text style={s.xLabel}>{shortDate(points[0].date, locale)}</Text>
        {points.length > 1 && (
          <Text style={s.xLabel}>{shortDate(points[points.length - 1].date, locale)}</Text>
        )}
      </View>

      {unit ? <Text style={s.unitLabel}>{unit}</Text> : null}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { paddingTop: 4 },
  yLabels: { position: 'absolute', right: 0, top: 0, width: 32, height: CHART_H, justifyContent: 'space-between', alignItems: 'flex-end' },
  yLabel: { fontSize: 10, color: c.textFaint },
  plot: { position: 'relative' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginRight: 36 },
  xLabel: { fontSize: 10, color: c.textFaint },
  unitLabel: { fontSize: 10, color: c.textFaint, textAlign: 'center', marginTop: 2 },
});
