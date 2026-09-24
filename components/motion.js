// Shared motion vocabulary (the "Version B" language): one easing set, the dose
// "drop" glyph, a UI-thread animated number, and a safe haptic tap. Everything
// here runs on Reanimated's UI thread — no per-frame React re-renders.
//
// Rules this module encodes (see the motion proposal):
//   • Time is true — doses land instantly, levels decay gradually.
//   • A dose is an event — it drops in, a ring pulses, the number bumps.
//   • One moment per screen; nothing loops once it settles.
//   • Reduce Motion → callers jump straight to the final state.
import { StyleSheet, TextInput } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { fontFamilyFor } from '../lib/fonts';

// ── easings (worklets) ──────────────────────────────────────────────
export function clamp01(v) { 'worklet'; return v < 0 ? 0 : v > 1 ? 1 : v; }
export function eOutQuad(t) { 'worklet'; return 1 - (1 - t) * (1 - t); }
export function eInOutQuad(t) { 'worklet'; return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
export function eInOutSine(t) { 'worklet'; return -(Math.cos(Math.PI * t) - 1) / 2; }
export function eInOutCubic(t) { 'worklet'; return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function eOutCubic(t) { 'worklet'; return 1 - Math.pow(1 - t, 3); }
export function eOutBack(t) { 'worklet'; const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
// Inverse of eInOutSine: the progress p at which eInOutSine(p) === y.
export function invInOutSine(y) { return Math.acos(1 - 2 * Math.min(1, Math.max(0, y))) / Math.PI; }

// A number "bump": each event time in `hits` adds a short scale pulse that peaks
// at 30% of `dur` (e.g. 1.16) and settles back to 1.
export function bumpScale(t, hits, dur, amp) {
  'worklet';
  let s = 1;
  for (let i = 0; i < hits.length; i++) {
    const k = (t - hits[i]) / dur;
    if (k >= 0 && k < 1) s += amp * (k < 0.3 ? eOutQuad(k / 0.3) : 1 - eInOutQuad((k - 0.3) / 0.7));
  }
  return s;
}

// The dose drop glyph (tip up), centred on (x, y) at scale s — an SVG path.
export function dropPath(x, y, s) {
  'worklet';
  const P = (dx, dy) => (x + dx * s).toFixed(1) + ' ' + (y + dy * s).toFixed(1);
  return 'M ' + P(0, -7) + ' C ' + P(3, -2) + ' ' + P(4.5, 0.5) + ' ' + P(4.5, 2.5)
    + ' A ' + (4.5 * s).toFixed(2) + ' ' + (4.5 * s).toFixed(2) + ' 0 0 1 ' + P(-4.5, 2.5)
    + ' C ' + P(-4.5, 0.5) + ' ' + P(-3, -2) + ' ' + P(0, -7) + ' Z';
}

// ── UI-thread number ────────────────────────────────────────────────
// A read-only TextInput whose `text` is driven by a shared value, so a counting
// number never re-renders React. `format` MUST be a worklet: (v) => string.
// Give it a fixed `width` (the widest value it will show) so the field never
// clips or jitters while the digits change.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function AnimatedNumber({ value, format, style, width, align = 'left', accessibilityLabel }) {
  const flat = StyleSheet.flatten(style) || {};
  const animatedProps = useAnimatedProps(() => {
    const txt = format(value.value);
    return { text: txt, defaultValue: txt };
  });
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      caretHidden
      scrollEnabled={false}
      contextMenuHidden
      underlineColorAndroid="transparent"
      accessibilityLabel={accessibilityLabel}
      defaultValue={format(value.value)}
      animatedProps={animatedProps}
      style={[
        style,
        {
          padding: 0, margin: 0, borderWidth: 0,
          fontFamily: fontFamilyFor(flat.fontWeight),
          includeFontPadding: false,
          textAlign: align,
          ...(width != null ? { width } : null),
        },
      ]}
    />
  );
}

// ── haptics ─────────────────────────────────────────────────────────
// Lazy + guarded: a binary built before expo-haptics was added simply skips it.
export function lightHaptic() {
  try {
    const H = require('expo-haptics');
    H.impactAsync(H.ImpactFeedbackStyle.Light).catch(() => {});
  } catch { /* native module absent — no-op */ }
}
