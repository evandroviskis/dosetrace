// "What you use" — the four options of onboarding's question (peptides, hormones, GLP-1, oral), drawn
// as its outline pills with an icon (selected = 1.5 pt ink on raised). ONE component for onboarding and
// Edit profile (DV-113 / DL-58: Edit profile edits everything sign-up asks, with the same options,
// labels, icons and look). value: the selected keys (tracking_types); onToggle(key).
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import FeatureIcon from './FeatureIcon';

export const COMPOUND_OPTIONS = [
  { key: 'peptides', labelKey: 'onboarding_compound_peptides', icon: 'type_vial' },
  { key: 'hormones', labelKey: 'onboarding_compound_hormones', icon: 'reconstitution' },
  { key: 'glp1', labelKey: 'onboarding_compound_glp1', icon: 'type_glp1' },
  { key: 'oral', labelKey: 'onboarding_compound_oral', icon: 'type_capsule' },
];

// The pill look (onboarding's own; its other pills — goals — use it too). c: the theme's tokens.
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

export default function CompoundPills({ value, onToggle, t }) {
  const { colors } = useTheme();
  const s = useMemo(() => StyleSheet.create(compoundPillStyles(colors)), [colors]);
  const list = Array.isArray(value) ? value : [];
  return (
    <View style={s.pillRow}>
      {COMPOUND_OPTIONS.map((o) => {
        const on = list.includes(o.key);
        return (
          <TouchableOpacity key={o.key} style={[s.pill, s.pillIcon, on && s.pillOn]} onPress={() => onToggle(o.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <FeatureIcon name={o.icon} size={20} color={on ? colors.ink : colors.ink2} />
            <Text style={[s.pillText, on && s.pillTextOn]}>{t(o.labelKey)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
