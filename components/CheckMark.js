// The one checkmark used across the app: a drawn monoline tick (same path and
// weight as the Today "Mark taken" check), never a font glyph. Colour and size
// can come straight from an existing text style (its `color` / `fontSize`), so
// a former <Text style={s.x}>✓</Text> becomes <CheckMark style={s.x} />.
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export default function CheckMark({ style, size, color, strokeWidth }) {
  const f = StyleSheet.flatten(style) || {};
  const px = size || f.fontSize || 14;
  const tint = color || f.color;
  const box = f.width != null ? { width: f.width, alignItems: 'center' } : null;
  return (
    <View style={[{ justifyContent: 'center' }, box, f.margin != null && { margin: f.margin }, f.marginLeft != null && { marginLeft: f.marginLeft }, f.marginRight != null && { marginRight: f.marginRight }]}>
      <Svg width={px} height={px} viewBox="0 0 16 16">
        <Path
          d="M3.5 8.5 L6.8 11.5 L12.5 5"
          fill="none"
          stroke={tint}
          strokeWidth={strokeWidth || 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Its partner for "not included" (same weight and box).
export function CrossMark({ style, size, color, strokeWidth }) {
  const f = StyleSheet.flatten(style) || {};
  const px = size || f.fontSize || 14;
  return (
    <View style={{ justifyContent: 'center' }}>
      <Svg width={px} height={px} viewBox="0 0 16 16">
        <Path d="M4.8 4.8 L11.2 11.2 M11.2 4.8 L4.8 11.2" fill="none" stroke={color || f.color} strokeWidth={strokeWidth || 2.2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
