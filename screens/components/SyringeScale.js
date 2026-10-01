// The protocol's own syringe drawn to scale (Today v2.1 item 9 + item 21, founder 2026-09-29):
// barrel of syringe_size units (default 100), the dose as a solid data fill with onData
// ticks inside it, the stopper and rod in ink; a number every 10 units starting at 0,
// minor ticks every 2, longer every 10. Graduated tokens only (DESIGN.md §5).
import { View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';

export default function SyringeScale({ units, size = 100, width = 300 }) {
  const { colors: c } = useTheme();
  const max = size || 100;
  const u = Math.max(0, Math.min(max, Number(units) || 0));
  const H = 46, x0 = 8, x1 = width - 26, top = 6, barH = 18;
  const per = (x1 - x0) / max;
  const X = (v) => x0 + v * per;
  const ticks = [];
  const step = max <= 30 ? 1 : 2;
  for (let k = step; k < max; k += step) {
    const long = k % 10 === 0;
    const inFill = k < u;
    ticks.push(<Line key={'t' + k} x1={X(k)} y1={top + 1} x2={X(k)} y2={top + (long ? 11 : 6)} stroke={inFill ? c.onData : c.tick} strokeWidth={long ? 1.4 : 1} />);
  }
  const labels = [];
  for (let L = 0; L <= max; L += 10) {
    labels.push(<SvgText key={'n' + L} x={X(L)} y={top + barH + 15} fontSize={10} fill={c.ink3} textAnchor="middle">{String(L)}</SvgText>);
  }
  return (
    <View accessible accessibilityLabel={`${u} / ${max}`}>
      <Svg width={width} height={H}>
        <Rect x={x0} y={top} width={x1 - x0} height={barH} rx={5} fill={c.raised} stroke={c.tick} strokeWidth={1} />
        {u > 0 && <Rect x={x0 + 0.5} y={top + 0.5} width={Math.max(0, X(u) - x0 - 0.5)} height={barH - 1} rx={4.5} fill={c.data} />}
        {ticks}
        <Rect x={X(u) - 2} y={top - 3} width={4} height={barH + 6} rx={1.5} fill={c.ink} />
        <Line x1={x1} y1={top + barH / 2} x2={width - 4} y2={top + barH / 2} stroke={c.ink} strokeWidth={2.5} />
        {labels}
      </Svg>
    </View>
  );
}
