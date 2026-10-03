// One labelled field of the sign-in, create-account and reset-password screens (prototype
// authField): a 13 pt ink2 label above a well input (radius 16), and on a password field a
// drawn eye button (44 pt) that shows / hides what was typed. Theme tokens only.
import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../lib/theme';

function Eye({ off, color }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <Path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.5 7.4A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1" />
          <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <Circle cx={12} cy={12} r={3} />
        </>
      )}
    </Svg>
  );
}

export default function AuthField({ label, value, onChangeText, password = false, email = false, placeholder, showLabel, hideLabel, autoComplete, textContentType }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [shown, setShown] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.wrap}>
        <TextInput
          style={[s.input, password && s.inputPw]}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          secureTextEntry={password && !shown}
          keyboardType={email ? 'email-address' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
        />
        {password ? (
          <TouchableOpacity
            style={s.eye}
            onPress={() => setShown((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={shown ? hideLabel : showLabel}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Eye off={shown} color={colors.ink2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  field: { gap: 10 },
  label: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  wrap: { justifyContent: 'center' },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: c.ink },
  inputPw: { paddingRight: 52 },
  eye: { position: 'absolute', right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
