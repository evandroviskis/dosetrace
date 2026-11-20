// "Para que você usa {produto}?" (docs/specs/purpose-question.md PQ-1, PQ-2, PQ-10, PQ-11; picture
// docs/design/sleep-purpose.html screen 1): the protocol goals as equal tiles, 2 per row (the
// onboarding tile look, tileStyles), 6 visible then "Ver todos os objetivos (N)". A selected tile
// always shows; a stored key outside the list shows selected so it can be kept or removed. ONE
// component for the manual form and the protocol assistant. ordered: lib/protocolPurpose
// purposeOrder; value: the selected keys (protocols.goal split); onToggle(key).
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import CheckMark from './CheckMark';
import { tileStyles } from './CompoundPills';
import { purposeTiles } from '../lib/protocolPurpose';

export default function PurposeTiles({ name, ordered, value, onToggle, t, limit = 6 }) {
  const { colors } = useTheme();
  const s = useMemo(() => StyleSheet.create({ ...tileStyles(colors), ...styles(colors) }), [colors]);
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(value) ? value : [];
  const v = purposeTiles(ordered, list, { expanded, limit });
  const tile = (key, on) => (
    <TouchableOpacity key={key} style={[s.tile, on && s.tileOn]} onPress={() => onToggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Text style={[s.tileText, on && s.tileTextOn]}>{t(key) || key}</Text>
      {on ? <View style={s.tileCheck}><CheckMark size={18} color={colors.ink} /></View> : null}
    </TouchableOpacity>
  );
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">{t('purpose_q').replace('{name}', name || '')}</Text>
        <Text style={s.sub}>{t('purpose_sub')}</Text>
      </View>
      <View style={s.tileGrid}>
        {v.keys.map((k) => tile(k, list.includes(k)))}
        {v.legacy.map((k) => tile(k, true))}
      </View>
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
    wrap: { gap: 12 },
    head: { gap: 4 },
    title: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    sub: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
    moreText: { fontSize: 15, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  };
}
