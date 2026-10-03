// The Premium preview engine (docs/design/prototype.html "FX", design handoff item 25):
// every preview is ONE timeline clock (a Reanimated shared value, UI thread) and a
// set of small elements whose style is a worklet of that clock — no React re-render
// per frame. Each preview is drawn on a fixed 326-wide canvas (the prototype's
// viewBox) scaled to the available width, so the choreography ports 1:1.
// Reduce Motion: the clock starts at the end, so the last frame shows at once.
// Colours come from the theme tokens passed in (`c`); no colour literals here.
import { useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useDerivedValue,
  withTiming, cancelAnimation, Easing, useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { clamp01, eOutQuad, eInOutCubic } from './motion';
import { MONO } from '../lib/fonts';
import { formatDate } from '../lib/localeFormat';
import CheckMark from './CheckMark';

export const FX_W = 326;

// Same curves as the prototype: eBack overshoots a little (c1 = 1.4).
export function eBack(t) { 'worklet'; const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
export function kf(t, a, d) { 'worklet'; return clamp01((t - a) / d); }
function ease(name, raw) {
  'worklet';
  if (name === 'back') return eBack(raw);
  if (name === 'out') return eOutQuad(raw);
  if (name === 'io') return eInOutCubic(raw);
  return raw;
}

// Thousands grouping for example numbers (worklet-safe, no Intl on the UI thread).
// sep / min: the language's thousands separator and the smallest number it groups
// (numGroup(language) — "2,320" in English, "2.320" in Portuguese, "2320" in Spanish).
export function groupNum(n, sep = ',', min = 1000) {
  'worklet';
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  const grouped = Math.abs(Math.round(n)) >= min;
  for (let i = 0; i < s.length; i++) {
    if (grouped && i > 0 && (s.length - i) % 3 === 0) out += sep;
    out += s[i];
  }
  return (n < 0 ? '−' : '') + out;
}

// The grouping of the app language for groupNum (lib/localeFormat's rule), as primitives a
// worklet can capture.
export function numGroup(language) {
  if (language === 'en') return { sep: ',', min: 1000 };
  if (language === 'fr') return { sep: '\u00A0', min: 1000 };
  if (language === 'es') return { sep: '.', min: 10000 };
  return { sep: '.', min: 1000 };
}

// A demo value ("21.4 ng/dL", "−0.6 kg") with the app language's decimal separator.
export function demoDec(str, language) {
  return language === 'en' || !language ? String(str) : String(str).replace(/(\d)\.(\d)/g, '$1,$2');
}

// The clock: 0 → dur once, linear. Reduce Motion → dur at once (the last frame).
export function useFxClock(dur) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? dur : 0);
  useEffect(() => {
    if (reduce) { t.value = dur; return undefined; }
    t.value = 0;
    t.value = withTiming(dur, { duration: dur, easing: Easing.linear });
    return () => cancelAnimation(t);
  }, [reduce, dur]);
  return t;
}

// Fixed design canvas (FX_W x h) scaled to `width`. The drawing is an illustration,
// read out as one image with its label.
export function FxCanvas({ width, h, label, children }) {
  const sc = width / FX_W;
  return (
    <View style={{ width, height: h * sc }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, top: 0, width: FX_W, height: h, transform: [{ scale: sc }], transformOrigin: 'top left' }}
      >
        {children}
      </View>
    </View>
  );
}

// An element that enters at `at` over `dur` with an easing, optional slide (dx/dy)
// and grow; `dim` multiplies its opacity; `out` fades it away from out.at.
// Without x/y/w/h it covers the whole canvas (children then use canvas coordinates).
export function Box({ t, at = 0, dur = 420, ease: e = 'back', dx = 0, dy = 0, grow = false, dim = 1, out = null, x = 0, y = 0, w, h, style, children }) {
  const st = useAnimatedStyle(() => {
    const raw = kf(t.value, at, dur);
    const a = ease(e, raw);
    let op = t.value < at ? 0 : (e === 'back' ? clamp01(a * 1.5) : clamp01(a)) * dim;
    let ox = 0, oy = 0;
    if (out) {
      const o = out.dur ? kf(t.value, out.at, out.dur) : (t.value >= out.at ? 1 : 0);
      op *= 1 - o; ox = (out.dx || 0) * o; oy = (out.dy || 0) * o;
    }
    const tr = [{ translateX: dx * (1 - a) + ox }, { translateY: dy * (1 - a) + oy }];
    if (grow) tr.push({ scale: Math.max(0, a) });
    return { opacity: op, transform: tr };
  });
  const box = w == null ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: x, top: y, width: w, height: h };
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, box, style, st]}>{children}</Animated.View>;
}

// Free-form animated element: `fx` is a worklet (t) => style.
export function Anim({ t, fx, style, children }) {
  const st = useAnimatedStyle(() => fx(t.value));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, style, st]}>{children}</Animated.View>;
}

// A bar whose width grows from 0 to w * frac.
export function Bar({ t, at, dur, x, y, w, h, r = 0, color, frac = 1, ease: e = 'io' }) {
  const st = useAnimatedStyle(() => ({ width: w * frac * ease(e, kf(t.value, at, dur)), opacity: t.value < at ? 0 : 1 }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, height: h, borderRadius: r, backgroundColor: color }, st]} />;
}

// Plain rectangle (well, raised paper, outline tag …).
export function Rect({ x, y, w, h, r = 0, fill, stroke, sw = 1, style }) {
  return (
    <View style={[{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: r, backgroundColor: fill || 'transparent' },
      stroke ? { borderWidth: sw, borderColor: stroke } : null, style]} />
  );
}

// Positioned text. `y` is the BASELINE (as in the prototype's SVG); anchor start /
// middle / end at x. Canvas text does not follow the phone text size (it is part of
// a fixed drawing); long translations shrink to fit.
export function T({ x, y, size = 12, weight = '400', color, mono = false, anchor = 'start', width, lines = 1, style, children }) {
  const lh = Math.round(size * 1.25);
  const top = y - size * 1.02 - (lh - size * 1.2) / 2;
  let pos;
  if (anchor === 'end') { const ww = width || 300; pos = { left: x - ww, width: ww, textAlign: 'right' }; }
  else if (anchor === 'middle') { const ww = width || 318; pos = { left: x - ww / 2, width: ww, textAlign: 'center' }; }
  else pos = { left: x, width: width || FX_W - x };
  const font = mono ? { fontFamily: MONO[Number(weight) >= 500 ? '500' : '400'], fontWeight: undefined } : { fontWeight: weight };
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines}
      adjustsFontSizeToFit={lines === 1}
      minimumFontScale={0.7}
      style={[{ position: 'absolute', top, fontSize: size, lineHeight: lh, color }, font, mono && { fontVariant: ['tabular-nums'] }, pos, style]}
    >
      {children}
    </Text>
  );
}

// UI-thread text: `format` is a worklet (v) => string over the derived value `v`.
const ATextInput = Animated.createAnimatedComponent(TextInput);
export function LiveText({ value, format, style }) {
  const flat = StyleSheet.flatten(style) || {};
  const props = useAnimatedProps(() => { const s = format(value.value); return { text: s, defaultValue: s }; });
  return (
    <ATextInput
      editable={false}
      focusable={false}
      pointerEvents="none"
      caretHidden
      scrollEnabled={false}
      contextMenuHidden
      allowFontScaling={false}
      underlineColorAndroid="transparent"
      importantForAccessibility="no"
      defaultValue={format(value.value)}
      animatedProps={props}
      style={[style, { padding: 0, margin: 0, borderWidth: 0, includeFontPadding: false, fontWeight: flat.fontFamily ? undefined : flat.fontWeight }]}
    />
  );
}

// A number counting from `from` to `to` (eInOutCubic) between at and at + dur,
// rendered by `format` (worklet). Positioned like T (baseline y, anchor).
export function Count({ t, at, dur, from = 0, to, format, x, y, size = 12, weight = '400', color, mono = true, anchor = 'start', width }) {
  const v = useDerivedValue(() => from + (to - from) * eInOutCubic(kf(t.value, at, dur)));
  const lh = Math.round(size * 1.25);
  const top = y - size * 1.02 - (lh - size * 1.2) / 2;
  const ww = width || 200;
  const pos = anchor === 'end' ? { left: x - ww, width: ww, textAlign: 'right' }
    : anchor === 'middle' ? { left: x - ww / 2, width: ww, textAlign: 'center' } : { left: x, width: ww, textAlign: 'left' };
  const font = mono ? { fontFamily: MONO[Number(weight) >= 500 ? '500' : '400'] } : { fontWeight: weight };
  return <LiveText value={v} format={format} style={[{ position: 'absolute', top, height: lh, fontSize: size, color, fontVariant: ['tabular-nums'] }, font, pos]} />;
}

// Text typed one character at a time between at and at + dur, with a blinking caret
// while typing. Positioned with an explicit top (it lives inside a field).
export function Typed({ t, text, at, dur, caretUntil, x, top, size = 13, color, mono = false, width }) {
  const v = useDerivedValue(() => t.value);
  const len = text.length;
  const format = (tv) => {
    'worklet';
    const n = Math.floor(kf(tv, at, dur) * len);
    const caret = tv > at - 300 && tv < caretUntil && Math.floor(tv / 420) % 2 === 1 ? '▏' : '';
    return text.slice(0, n) + caret;
  };
  const font = mono ? { fontFamily: MONO['400'] } : null;
  return <LiveText value={v} format={format} style={[{ position: 'absolute', left: x, top, width: width || 260, height: Math.round(size * 1.4), fontSize: size, color }, font]} />;
}

// The "done" mark: a filled ok circle with a check, growing in.
export function OkMark({ t, at, cx, cy, c }) {
  return (
    <Box t={t} at={at} dur={450} grow x={cx - 11} y={cy - 11} w={22} h={22}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.ok, alignItems: 'center', justifyContent: 'center' }}>
        <CheckMark size={15} color={c.onInk} strokeWidth={2.4} />
      </View>
    </Box>
  );
}

// Camera-frame corners around a document (scan previews).
export function Corners({ x, y, w, h, color }) {
  const k = 12;
  const d = `M${x} ${y + k}V${y}H${x + k}M${x + w - k} ${y}H${x + w}V${y + k}M${x} ${y + h - k}V${y + h}H${x + k}M${x + w - k} ${y + h}H${x + w}V${y + h - k}`;
  return (
    <Svg width={FX_W} height={y + h + 4} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// The scan beam: a soft band and a line sweeping down a document between at and at + dur,
// visible until `until`.
export function ScanBeam({ t, at, dur, until, x, y, w, h, c }) {
  const fx = (tv) => {
    'worklet';
    const p = eInOutCubic(kf(tv, at, dur));
    return { opacity: tv > at && tv < until ? 1 : 0, transform: [{ translateY: y + h * p - 14 }] };
  };
  return (
    <Anim t={t} fx={fx} style={{ left: x - 4, top: 0, width: w + 8, height: 16 }}>
      <View style={{ position: 'absolute', left: 4, top: 0, width: w, height: 14, backgroundColor: c.data, opacity: 0.1 }} />
      <View style={{ position: 'absolute', left: 0, top: 13, width: w + 8, height: 2, backgroundColor: c.data }} />
    </Anim>
  );
}

// Example dates in the app language (lib/localeFormat, the same as the screens).
export function fmtDate(language, y, m, d, withYear = true) {
  return formatDate(new Date(y, m, d, 12), language, withYear ? 'dayMonthYear' : 'dayMonth');
}
