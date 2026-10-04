// The one segmented bar of the app (founder 2026-10-02, "Barras: Q4=B"): the Settings bar he
// approved (prototype .segw.fill), used everywhere. A well track (padding 3, gap 2, radius 14)
// with equal segments across the full width (minHeight 42, radius 11, 15/500 ink2); the chosen
// segment is raised with a 1 pt line ring and ink 700 text. Labels stay on one line and shrink
// to fit long languages (German "Eingenommen", "Übersprungen").
//
// Props:
//   items:          [{ key, label, hint?, accessibilityLabel? }]  (key: string or number)
//   value:          the chosen key, or null for none
//   onChange:       (key | null) => void — called on every tap (the tap rule: lib/segmented.js)
//   allowDeselect:  tapping the chosen segment clears it (onChange(null))
//   compact:        38 pt / 14 pt, for a bar inside a list row (site picker areas)
//   onWell:         the bar sits on a well-coloured surface: the track takes the ground colour
//                   so it still reads as one bar (site picker list, both themes)
//   accessibilityLabel, style: for the track
// A segment with hint: true (e.g. "longest unused in your log") gets a dashed outline.
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import { segmentNext } from '../lib/segmented';

export default function SegmentedBar({ items, value, onChange, allowDeselect = false, compact = false, onWell = false, accessibilityLabel, style }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[s.track, onWell && s.trackOnWell, style]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {(items || []).map((it) => {
        const on = value != null && value === it.key;
        return (
          <TouchableOpacity
            key={String(it.key)}
            style={[s.item, onWell && s.itemOnWell, compact && s.itemCompact, it.hint && !on && s.itemHint, on && s.itemOn]}
            onPress={() => onChange && onChange(segmentNext(value, it.key, allowDeselect))}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={it.accessibilityLabel || it.label}
          >
            <Text
              style={[s.text, compact && s.textCompact, on && s.textOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  track: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 14, backgroundColor: c.well, alignSelf: 'stretch' },
  // Every segment carries the 1 pt ring (in the track colour when not chosen) so choosing
  // one never shifts the labels.
  item: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: c.well },
  trackOnWell: { backgroundColor: c.ground },
  itemOnWell: { borderColor: c.ground },
  itemCompact: { minHeight: 38 },
  itemHint: { borderStyle: 'dashed', borderColor: c.ink2 },
  itemOn: { backgroundColor: c.segOn, borderColor: c.segOnLine },
  text: { fontSize: 15, fontWeight: '500', color: c.ink2, textAlign: 'center' },
  textCompact: { fontSize: 14 },
  textOn: { color: c.ink, fontWeight: '700' },
});
