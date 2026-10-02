// The protocol's own syringe drawn to scale: the approved prototype drawing (Today redesign
// part 6, founder 2026-10-02; docs/design/prototype.html syr()). Geometry: lib/syringeGeometry.js
// (needle + hub on the left, barrel, the dose in data, ticks every 2 / long every 10, a Geist
// Mono 9 number every 10 from 0, stopper, ink2 rod and thumb rest). Over capacity the full
// syringe is drawn with the fill in risk (prototype syrOver). Graduated tokens only.
import { View } from 'react-native';
import Svg, { Rect, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import { syringeParts, SYR_VIEW } from '../../lib/syringeGeometry';

export default function SyringeScale({ units, size = 100, width = 300 }) {
  const { colors: c } = useTheme();
  const max = size || 100;
  const g = syringeParts(max, units);
  const fill = g.fillTone === 'risk' ? c.risk : c.data;
  const height = (width * SYR_VIEW.h) / SYR_VIEW.w;
  const shown = Math.max(0, Number(units) || 0);
  return (
    <View accessible accessibilityLabel={`${shown} / ${max}`}>
      <Svg width={width} height={height} viewBox={`0 0 ${SYR_VIEW.w} ${SYR_VIEW.h}`}>
        <Line x1={g.needle.x1} y1={g.needle.y1} x2={g.needle.x2} y2={g.needle.y2} stroke={c.ink3} strokeWidth={g.needle.width} strokeLinecap="round" />
        <Path d={g.hub} fill={c.ink3} />
        <Rect x={g.barrel.x} y={g.barrel.y} width={g.barrel.w} height={g.barrel.h} rx={g.barrel.rx} fill={c.raised} stroke={c.tick} strokeWidth={g.barrel.stroke} />
        {g.fill.w > 0 && <Rect x={g.fill.x} y={g.fill.y} width={g.fill.w} height={g.fill.h} rx={g.fill.rx} fill={fill} />}
        {g.ticks.map((k) => (
          <Line key={'t' + k.u} x1={k.x} y1={k.y1} x2={k.x} y2={k.y2} stroke={k.inFill ? c.onData : c.tick} strokeOpacity={k.inFill ? 0.75 : 1} strokeWidth={k.width} />
        ))}
        {g.labels.map((l) => (
          <SvgText key={'n' + l.text} x={l.x} y={l.y} textAnchor="middle" fill={c.ink3} fontFamily={MONO['400']} fontSize={9}>{l.text}</SvgText>
        ))}
        <Rect x={g.stopper.x} y={g.stopper.y} width={g.stopper.w} height={g.stopper.h} rx={g.stopper.rx} fill={c.ink} />
        {g.rod.w > 0 && <Rect x={g.rod.x} y={g.rod.y} width={g.rod.w} height={g.rod.h} rx={g.rod.rx} fill={c.ink2} />}
        <Rect x={g.thumb.x} y={g.thumb.y} width={g.thumb.w} height={g.thumb.h} rx={g.thumb.rx} fill={c.ink} />
      </Svg>
    </View>
  );
}
