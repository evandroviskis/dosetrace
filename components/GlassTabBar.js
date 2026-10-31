// A-206 (founder 2026-10-31, docs/specs/a206-glass-tab-bar.md): the floating "Liquid Glass" tab bar
// of the approved preview, imitated on Android (Apple's glass exists only on iOS 26): a capsule with
// a light edge, a sheen on its upper half and a soft shadow; the chosen tab sits in a glossy lens that
// slides to the next one with a spring and a short stretch, as Apple's bubble does. Active = ink,
// never blue. It takes its own room in the layout (lib/tabBarStyle glassBarRoom), so no screen ends
// behind it. Colours: theme tokens glass* only (lib/theme).
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../lib/theme';
import { glassBarRoom } from '../lib/tabBarStyle';

const PAD = 4;

// The glass highlight: the sheen colour fading out over the upper half (Apple's glass catches the
// light along its top edge).
function Sheen({ id, color, strength, radius }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="0.5" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={strength * 0.25} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

export default function GlassTabBar({ state, descriptors, navigation, insets }) {
  const { colors: c, isDark } = useTheme();
  const room = glassBarRoom(insets.bottom);
  const [w, setW] = useState(0);
  const n = state.routes.length;
  const tabW = w > 0 ? (w - PAD * 2) / n : 0;
  const x = useSharedValue(0);
  const sx = useSharedValue(1);

  useEffect(() => {
    if (!tabW) return;
    x.value = withSpring(PAD + state.index * tabW, { damping: 15, stiffness: 170, mass: 0.9 });
    sx.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 180 }));
  }, [state.index, tabW]); // eslint-disable-line react-hooks/exhaustive-deps

  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scaleX: sx.value }] }));

  // GB-5: a screen that hides the bar (Recently deleted selection) still hides it.
  const { options: focusedOptions } = descriptors[state.routes[state.index].key];
  if (focusedOptions.tabBarStyle && StyleSheet.flatten(focusedOptions.tabBarStyle)?.display === 'none') return null;

  const lensH = room.barHeight - PAD * 2;
  return (
    <View style={{ height: room.total, paddingTop: room.topGap, paddingBottom: room.bottomGap + room.inset, backgroundColor: c.ground }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[s.bar, { height: room.barHeight, borderRadius: room.barHeight / 2, backgroundColor: c.glassFill, borderColor: c.glassEdge, shadowColor: c.glassShade }]}
      >
        <Sheen id="glassBarSheen" color={c.glassSheen} strength={isDark ? 0.14 : 0.85} radius={room.barHeight / 2} />
        {tabW > 0 && (
          <Animated.View pointerEvents="none" style={[s.lens, { width: tabW, height: lensH, borderRadius: lensH / 2, backgroundColor: c.glassLens, borderColor: c.glassEdge }, lens]}>
            <Sheen id="glassLensSheen" color={c.glassSheen} strength={isDark ? 0.22 : 1} radius={lensH / 2} />
          </Animated.View>
        )}
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const color = focused ? c.ink : c.ink3;
          const onPress = () => {
            const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !ev.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable key={route.key} onPress={onPress} style={[s.tab, { height: lensH }]} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={options.tabBarLabel}>
              {options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 23 }) : null}
              <Text numberOfLines={1} style={[s.label, { color, fontWeight: focused ? '700' : '600' }]}>{options.tabBarLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    marginHorizontal: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, overflow: 'visible',
    borderWidth: StyleSheet.hairlineWidth, elevation: 10, shadowOpacity: 1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  lens: { position: 'absolute', left: 0, top: PAD, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5 },
});
