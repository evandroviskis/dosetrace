import Svg, { Path } from 'react-native-svg';

// The fold arrow from the approved prototype (DOWN / UP: 15 x 9, stroke 2, round caps):
// down when a list is closed, up when it is open. Drawn, never a "⌄ / ⌃" text glyph
// (Today redesign parts 10 and 12, founder 2026-10-02). The colour is a theme token.
export default function FoldChevron({ open, color }) {
  return (
    <Svg width={15} height={9} viewBox="0 0 16 10" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={open ? 'M2 8l6-6 6 6' : 'M2 2l6 6 6-6'} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
