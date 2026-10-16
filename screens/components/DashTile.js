/**
 * DoseTrace — the dashboard tile (Evolução's tiles, A-52 approved 2026-09-29; shared with My Body
 * since A-125, docs/specs/my-body-tiles.md MB2-1: "using Evolução's tile exactly").
 *
 * A raised card: the feature icon (22 pt) and the chevron — or a tag such as "Premium" — on
 * top, the title, then whatever the screen puts in it (`children`, styled with
 * dashTileStyles: num / big / unit / cap / foot / desc). On a book (unfolded foldable) the
 * tile whose page is open on the right has the 2 pt ink outline (BK-8) and reports itself as
 * selected (BK-21); on a phone neither. Theme tokens only, in both palettes.
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FeatureIcon from '../../components/FeatureIcon';
import RowChevron from '../../components/RowChevron';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';

export default function DashTile({ icon, iconColor = null, title, tag = null, onPress, book = false, selected = false, children = null }) {
  const { colors } = useTheme();
  const s = useMemo(() => StyleSheet.create(dashTileStyles(colors)), [colors]);
  return (
    <TouchableOpacity
      style={s.tile}
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={book ? { selected: !!selected } : undefined}
    >
      {book && selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.selected]} /> : null}
      <View style={s.tileTop}>
        <FeatureIcon name={icon} size={22} color={iconColor || colors.ink2} />
        {tag ? <Text style={s.tag}>{tag}</Text> : <RowChevron color={colors.tick} />}
      </View>
      <Text style={s.tileTitle}>{title}</Text>
      {children}
    </TouchableOpacity>
  );
}

// Graduated (DESIGN.md §3–§5): tiles as tall as their content, 34 pt numbers. The content
// styles are spread into each screen's own styles, so a tile reads the same everywhere.
export const dashTileStyles = (c) => ({
  tile: { flex: 1, backgroundColor: c.raised, borderRadius: 24, padding: 16, gap: 8, minWidth: 0 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: -2 },
  tag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, minHeight: 24, lineHeight: 20, paddingHorizontal: 9, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  tileTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  // prototype .tile .num (gap 4); .sep adds 10 on top with a line; .end sits at the bottom.
  num: { gap: 4 },
  numSep: { paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line },
  numEnd: { marginTop: 'auto' },
  cap: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  big: { fontSize: 34, fontWeight: '500', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, fontWeight: '400', color: c.ink3, fontFamily: MONO['400'], letterSpacing: 0 },
  desc: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  // BK-8: the card open on the right page has an ink outline (same radius as the cards).
  selected: { borderWidth: 2, borderColor: c.ink, borderRadius: 24 },
});
