// The one help mark of the app (docs/specs/curve-explained.md CE-4; picture
// docs/design/curve-explained.html): the "help" glyph of the vector set (components/FeatureIcon), in
// the theme's ink2, inside a 44 pt touch area, a button with a label for the screen reader. The curve's
// title row ends with it; the "?" beside the dose label in Protocols uses it. Without onPress it draws
// only the glyph (the FAQ row in Settings, where the whole row is the button), at the size and colour
// the row asks for. Theme tokens only.
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import FeatureIcon from './FeatureIcon';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';

export const HELP_MARK_TOUCH = 44;
// The glyph's circle is 560/1024 of its box: 40 pt draws the 22 pt circle the app already used.
const GLYPH = 40;

export default function HelpMark({ onPress, label, size, color, style }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const glyph = <FeatureIcon name="help" size={size || GLYPH} color={color || colors.ink2} />;
  if (!onPress) {
    return <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{glyph}</View>;
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.touch, style]}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label || t('help_mark_label')}
    >
      {glyph}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  touch: { width: HELP_MARK_TOUCH, height: HELP_MARK_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
