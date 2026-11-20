// The goals by category (docs/specs/onboarding-protocol.md OB-10 / OB-11, picture
// docs/design/onboarding-protocolo.html section 8): the 4 categories with their icon and name, the
// goals as equal tiles 2 per row, alphabetical, 12 visible and "Ver todos os objetivos (18)". ONE
// component for onboarding and Ajustes › Editar perfil (DV-113). The rules are lib/goalCategories.
// value: the selected goal keys (primary_goal, same keys as before); onToggle(key).
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import FeatureIcon from './FeatureIcon';
import CheckMark from './CheckMark';
import { tileStyles } from './CompoundPills';
import { goalSections, legacyGoals } from '../lib/goalCategories';

export default function GoalTiles({ value, onToggle, t }) {
  const { colors } = useTheme();
  const s = useMemo(() => StyleSheet.create({ ...tileStyles(colors), ...styles(colors) }), [colors]);
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(value) ? value : [];
  const v = goalSections(t, { expanded, selected: list });
  const legacy = legacyGoals(list);
  const tile = (key, label, on) => (
    <TouchableOpacity key={key} style={[s.tile, on && s.tileOn]} onPress={() => onToggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Text style={[s.tileText, on && s.tileTextOn]}>{label}</Text>
      {on ? <View style={s.tileCheck}><CheckMark size={18} color={colors.ink} /></View> : null}
    </TouchableOpacity>
  );
  return (
    <View style={s.wrap}>
      {v.sections.map((sec) => (
        <View key={sec.key} style={s.section}>
          <View style={s.head}>
            <FeatureIcon name={sec.icon} size={18} color={colors.ink2} />
            <Text style={s.headText}>{sec.label.toUpperCase()}</Text>
          </View>
          <View style={s.tileGrid}>{sec.items.map((g) => tile(g.key, g.label, list.includes(g.key)))}</View>
        </View>
      ))}
      {/* A stored key outside the 18 (an old "athletic") stays visible, selected, so it can be removed. */}
      {legacy.length ? <View style={s.tileGrid}>{legacy.map((k) => tile(k, t('profile_goal_' + k) || k, true))}</View> : null}
      {v.hidden > 0 ? (
        <TouchableOpacity style={s.more} onPress={() => setExpanded(true)} accessibilityRole="button">
          <Text style={s.moreText}>{t('ob_goal_see_all').replace('{n}', String(v.total))}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function styles(c) {
  return {
    wrap: { gap: 18 },
    section: { gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
    headText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6, color: c.ink2 },
    more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
    moreText: { fontSize: 15, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  };
}
