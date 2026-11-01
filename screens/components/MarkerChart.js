/**
 * DoseTrace — marker evolution chart (Graduated, prototype markerChart())
 *
 * Plots one marker's values across the user's own tests, oldest → newest:
 * three dotted guide lines, the readings joined by a line in the data color,
 * each reading as a point with its value above it and its test date below.
 *
 * DV-080 (DL-43, picture rodada2 #dv080 option A): one chart per unit — a marker
 * read in two units (ng/dL and nmol/L) is never joined in one line and never
 * converted; with more than one unit each small chart is titled with its unit.
 * Points sit at their DATE on one time axis shared by the unit charts
 * (lib/markerChart), not evenly spaced.
 *
 * IMPORTANT — regulatory framing:
 *   This is a neutral plot of the user's OWN entered values. NO reference
 *   ranges, NO shaded "normal" band, NO good/bad coloring, NO trend verdict.
 *   It shows the numbers the user uploaded and nothing more. The user draws
 *   their own conclusions; the app never interprets. (DESIGN.md §7, §9)
 */

import { View, Text } from 'react-native';
import { useMemo } from 'react';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import { formatDate } from '../../lib/localeFormat';
import { chartPoints, labNumberText } from '../../lib/labValue';
import { unitSeries, dateDomain, dateX, distinctDates, labelPlan, labelPos } from '../../lib/markerChart';

const H_ONE = 170;    // drawing height of the one chart (prototype 326 × 170)
const H_SMALL = 128;  // each small chart when the marker has several units (picture: ~3/4 height)
const SIDE = 12;      // left/right inset of the guide lines
const INSET = 16;     // extra inset of the first/last date from the guide ends
const TOP = 26;       // room above the highest point for its value
const BOTTOM_ROOM = 30; // room below the lowest point for the dates
const MIN_LABEL_GAP = 56; // px between labelled points before labels are thinned

// Format a YYYY-MM-DD date compactly for the x-axis, in the app language ("19 de out.").
const shortDate = (dateStr, language) => formatDate(dateStr, language, 'dayMonth') || dateStr;

export default function MarkerChart({ points, unit, language = 'en', width }) {
  const { colors } = useTheme();
  const W = Math.max(width || 300, 120);
  // A-203: only readings with a number are drawn (a result in words is never a point); a reading
  // with a sign sits at its number and carries the sign in its label ("> 2000").
  const drawn = useMemo(() => chartPoints(points), [points]);

  const charts = useMemo(() => {
    const series = unitSeries(drawn, unit);
    const H = series.length > 1 ? H_SMALL : H_ONE;
    const BOTTOM = H - BOTTOM_ROOM;
    // One time axis for every unit: the first and last date of all the drawn readings.
    const { from, to } = dateDomain(drawn);
    const L = SIDE + INSET, R = W - SIDE - INSET;
    return series.map((s) => {
      const vals = s.points.map(p => p.value);
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      // Headroom above and below so points and their labels never touch the edges;
      // a flat series (or a single reading) sits in the middle.
      const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1;
      lo -= pad; hi += pad;
      const Y = (v) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);
      const xy = s.points.map(p => ({ x: dateX(p.date, from, to, L, R), y: Y(p.value), value: p.value, qualifier: p.qualifier, date: p.date }));
      // Every point keeps its label, also when two readings share a date (one above, one under its
      // point, the date once); many dates: the newest, then every date far enough from the last label.
      const plan = labelPlan(xy.map(p => ({ x: p.x, y: p.y })), MIN_LABEL_GAP);
      // A line only joins readings of 2+ different days (one day: its points, never a vertical line).
      return { unit: s.unit, H, xy, guides: [TOP, (TOP + BOTTOM) / 2, BOTTOM], plan, line: distinctDates(s.points) >= 2 };
    });
  }, [drawn, unit, W]);

  const a11y = drawn.map(p => `${shortDate(p.date, language)}: ${labNumberText(p, language, ' ')}${p.unit ? ' ' + p.unit : ''}`).join(', ');
  const titled = charts.length > 1;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y}>
      {charts.map((c, k) => (
        <View key={`u${k}`}>
          {titled ? (
            <Text style={{ fontFamily: MONO['500'], fontSize: 12, color: colors.ink3, marginTop: k === 0 ? 8 : 4 }}>{c.unit || '–'}</Text>
          ) : null}
          <Svg width={W} height={c.H}>
            {c.guides.map((y, i) => (
              <Line key={`g${i}`} x1={SIDE} x2={W - SIDE} y1={y} y2={y} stroke={colors.line} strokeWidth={1} strokeDasharray="2 3" />
            ))}
            {c.line && (
              <Polyline
                points={c.xy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={colors.data}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {c.xy.map((p, i) => (
              <Circle key={`p${i}`} cx={p.x} cy={p.y} r={4.5} fill={colors.data} />
            ))}
            {c.xy.map((p, i) => {
              if (!c.plan[i].value) return null;
              // A-203: the number as the readings list writes it, with its sign ("< 0,01").
              const at = labelPos(p, c.plan[i].value);
              return (
                <SvgText key={`v${i}`} x={at.x} y={at.y} textAnchor={at.anchor} fontFamily={MONO['500']} fontSize={11} fill={colors.ink}>
                  {labNumberText(p, language)}
                </SvgText>
              );
            })}
            {c.xy.map((p, i) => (c.plan[i].date ? (
              <SvgText key={`d${i}`} x={p.x} y={c.H - 8} textAnchor="middle" fontSize={11} fill={colors.ink3}>
                {shortDate(p.date, language)}
              </SvgText>
            ) : null))}
          </Svg>
        </View>
      ))}
    </View>
  );
}
