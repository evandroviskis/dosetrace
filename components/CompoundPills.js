// "What you use" — the four options of onboarding's question (peptides, hormones, GLP-1, oral). ONE
// component for onboarding and Edit profile (DV-113 / DL-58: Edit profile edits everything sign-up asks,
// with the same options, labels, icons and look). OB-13 (docs/specs/onboarding-protocol.md, founder
// 2026-11-20): drawn as 4 equal icon tiles, 2 per row, the icon on top (selected = 1.5 pt ink on raised,
// a check in the corner). value: the selected keys (tracking_types, same keys as before); onToggle(key).
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import FeatureIcon from './FeatureIcon';
import CheckMark from './CheckMark';

export const COMPOUND_OPTIONS = [
  { key: 'peptides', labelKey: 'onboarding_compound_peptides', icon: 'type_vial' },
  { key: 'hormones', labelKey: 'onboarding_compound_hormones', icon: 'reconstitution' },
  { key: 'glp1', labelKey: 'onboarding_compound_glp1', icon: 'type_glp1' },
  { key: 'oral', labelKey: 'onboarding_compound_oral', icon: 'type_capsule' },
];

// The onboarding's outline pills (months of the birth date use them). c: the theme's tokens.
export function compoundPillStyles(c) {
  return {
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
    pillIcon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised },
    pillText: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    pillTextOn: { color: c.ink, fontWeight: '600' },
  };
}

// The equal tiles (OB-10 goals and OB-13 "what you use" share this look). c: the theme's tokens.
export function tileStyles(c) {
  return {
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: { width: '48%', flexGrow: 1, flexBasis: '45%', minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
    tileTall: { minHeight: 104, gap: 10, justifyContent: 'flex-start' },
    tileOn: { borderWidth: 1.5, borderColor: c.ink },
    tileText: { fontSize: 15, lineHeight: 20, color: c.ink2, paddingRight: 18 },
    tileTextOn: { color: c.ink, fontWeight: '600' },
    tileCheck: { position: 'absolute', top: 10, right: 10 },
  };
}

export default function CompoundPills({ value, onToggle, t }) {
  const { colors } = useTheme();
  const s = useMemo(() => StyleSheet.create(tileStyles(colors)), [colors]);
  const list = Array.isArray(value) ? value : [];
  return (
    <View style={s.tileGrid}>
      {COMPOUND_OPTIONS.map((o) => {
        const on = list.includes(o.key);
        return (
          <TouchableOpacity key={o.key} style={[s.tile, s.tileTall, on && s.tileOn]} onPress={() => onToggle(o.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <FeatureIcon name={o.icon} size={30} color={on ? colors.ink : colors.ink2} />
            <Text style={[s.tileText, on && s.tileTextOn]}>{t(o.labelKey)}</Text>
            {on ? <View style={s.tileCheck}><CheckMark size={18} color={colors.ink} /></View> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
