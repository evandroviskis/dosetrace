// Graduated switch (prototype .switch, DESIGN.md "Switch | on = ink track"): 51×31 track,
// ink when on and line when off, a raised knob. Drawn instead of the native Switch because
// iOS ignores thumbColor, which left a white knob on the light ink track in dark theme (A-70).
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';

const W = 51, H = 31, KNOB = 27, PAD = 2;

export default function GradSwitch({ value, onValueChange, disabled = false, accessibilityLabel, style }) {
  const { colors } = useTheme();
  const on = !!value;
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [on, x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, W - KNOB - PAD * 2] });
  return (
    <Pressable
      onPress={() => { if (!disabled && onValueChange) onValueChange(!on); }}
      disabled={disabled}
      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[s.track, { backgroundColor: on ? colors.ink : colors.line, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Animated.View style={[s.knob, { backgroundColor: colors.raised, transform: [{ translateX }] }]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, padding: PAD, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
