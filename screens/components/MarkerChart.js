/**
 * DoseTrace — marker evolution chart (Graduated, prototype markerChart())
 *
 * Plots one marker's values across the user's own tests, oldest → newest:
 * three dotted guide lines, the readings joined by a line in the data color,
 * each reading as a point with its value above it and its test date below.
 *
 * IMPORTANT — regulatory framing:
 *   This is a neutral plot of the user's OWN entered values. NO reference
 *   ranges, NO shaded "normal" band, NO good/bad coloring, NO trend verdict.
 *   It shows the numbers the user uploaded and nothing more. The user draws
 *   their own conclusions; the app never interprets. (DESIGN.md §7, §9)
 */

import { View } from 'react-native';
import { useMemo } from 'react';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';

const H = 170;        // drawing height (prototype 326 × 170)
const SIDE = 12;      // left/right inset of the guide lines
const INSET = 16;     // extra inset of the first/last point from the guide ends
const TOP = 26;       // room above the highest point for its value
const BOTTOM = H - 30; // room below the lowest point for the dates
const MIN_LABEL_GAP = 56; // px between labelled points before labels are thinned

// Format a YYYY-MM-DD date compactly for the x-axis (locale month + day).
function shortDate(dateStr, locale) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function MarkerChart({ points, unit, locale = 'en-US', width }) {
  const { colors } = useTheme();
  const W = Math.max(width || 300, 120);

  const { xy, guides, labelled } = useMemo(() => {
    const vals = points.map(p => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    // Headroom above and below so points and their labels never touch the edges;
    // a flat series sits in the middle.
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    const n = points.length;
    const L = SIDE + INSET, R = W - SIDE - INSET;
    const X = (i) => (n === 1 ? W / 2 : L + (i / (n - 1)) * (R - L));
    const Y = (v) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);
    const pts = points.map((p, i) => ({ x: X(i), y: Y(p.value), value: p.value, date: p.date }));
    // Many readings: label every k-th point (always the newest) so labels never collide.
    const step = n <= 1 ? 1 : Math.max(1, Math.ceil(MIN_LABEL_GAP / ((R - L) / (n - 1))));
    const show = new Set();
    for (let i = n - 1; i >= 0; i -= step) show.add(i);
    return { xy: pts, guides: [TOP, (TOP + BOTTOM) / 2, BOTTOM], labelled: show };
  }, [points, W]);

  const a11y = points.map(p => `${shortDate(p.date, locale)}: ${p.value}${unit ? ' ' + unit : ''}`).join(', ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y}>
      <Svg width={W} height={H}>
        {guides.map((y, i) => (
          <Line key={`g${i}`} x1={SIDE} x2={W - SIDE} y1={y} y2={y} stroke={colors.line} strokeWidth={1} strokeDasharray="2 3" />
        ))}
        {xy.length > 1 && (
          <Polyline
            points={xy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={colors.data}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {xy.map((p, i) => (
          <Circle key={`p${i}`} cx={p.x} cy={p.y} r={4.5} fill={colors.data} />
        ))}
        {xy.map((p, i) => (labelled.has(i) ? (
          <SvgText key={`v${i}`} x={p.x} y={p.y - 10} textAnchor="middle" fontFamily={MONO['500']} fontSize={11} fill={colors.ink}>
            {String(p.value)}
          </SvgText>
        ) : null))}
        {xy.map((p, i) => (labelled.has(i) ? (
          <SvgText key={`d${i}`} x={p.x} y={H - 8} textAnchor="middle" fontSize={11} fill={colors.ink3}>
            {shortDate(p.date, locale)}
          </SvgText>
        ) : null))}
      </Svg>
    </View>
  );
}
