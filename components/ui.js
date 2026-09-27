// Hybrid design primitives (Cabin's calm inside Refined's cards).
// Every screen composes these so cards, labels, chips and controls look the
// same everywhere. Colors always come from the theme, so both themes resolve.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, TYPE } from '../lib/theme';

export function Card({ children, style, padded = true }) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: 20 }, c.shadowSoft, padded && { padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children, color, style }) {
  const { colors: c } = useTheme();
  return <Text style={[TYPE.label, { color: color || c.textSubtle }, style]}>{children}</Text>;
}

export function Dot({ color, size = 10, style }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

const TONES = {
  neutral: (c) => [c.card2, c.textMuted],
  accent: (c) => [c.accentSoft, c.accentSoftText],
  success: (c) => [c.successSoft, c.successSoftText],
  warning: (c) => [c.warningSoft, c.warningSoftText],
  danger: (c) => [c.dangerSoft, c.dangerSoftText],
};
export function Chip({ label, tone = 'neutral', style, textStyle }) {
  const { colors: c } = useTheme();
  const [bg, fg] = (TONES[tone] || TONES.neutral)(c);
  return (
    <View style={[{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text numberOfLines={1} style={[{ color: fg, fontSize: 12, fontWeight: '600' }, textStyle]}>{label}</Text>
    </View>
  );
}

// Cabin's round control: a 56pt circle with a label under it.
export function RoundAction({ icon, label, onPress, primary, disabled, accessibilityLabel }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={{ flex: 1, alignItems: 'center', gap: 6, opacity: disabled ? 0.45 : 1 }}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: primary ? c.accent : c.card2, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ fontSize: 12, fontWeight: '500', color: c.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function CircleButton({ children, onPress, accessibilityLabel, size = 44, style }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }, c.shadowSoft, style]}
    >
      {children}
    </TouchableOpacity>
  );
}

// One big thin number with a small unit — the hybrid's hero.
export function BigNumber({ value, unit, size = 56, style }) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline' }, style]}>
      <Text style={{ fontSize: size, lineHeight: Math.round(size * 1.08), fontWeight: '200', letterSpacing: -size / 28, color: c.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {!!unit && <Text style={{ fontSize: Math.max(15, Math.round(size / 3.4)), color: c.textMuted, marginLeft: 5 }}>{unit}</Text>}
    </View>
  );
}

export function ScreenTitle({ title, eyebrow, right, style }) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, style]}>
      <View style={{ flexShrink: 1 }}>
        {!!eyebrow && <Text style={{ fontSize: 13, fontWeight: '500', color: c.textMuted }}>{eyebrow}</Text>}
        <Text style={[TYPE.title, { color: c.text, lineHeight: 36 }]} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

// Label/value strip under a hairline — the protocol facts row.
// Optional per item: flex (column weight), lines (value line cap), tone.
export function FactStrip({ items, style }) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: 8, paddingTop: 12, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, style]}>
      {items.map((it, i) => (
        <View key={i} style={{ flex: it.flex || 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[TYPE.label, { color: c.textSubtle }]}>{it.label}</Text>
          <Text numberOfLines={it.lines || 1} style={{ fontSize: 14, fontWeight: '500', marginTop: 2, color: it.tone === 'warning' ? (c.warningText || c.warning) : it.tone === 'danger' ? c.dangerSoftText : c.text }}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Segmented({ options, value, onChange, style }) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: 12, backgroundColor: c.card2 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange && onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[{ flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.card : 'transparent' }, on && c.shadowSoft]}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.text : c.textMuted }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
