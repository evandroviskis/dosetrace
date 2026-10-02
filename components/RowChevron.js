import Svg, { Path } from 'react-native-svg';

// The row arrow from the approved prototype (CHEV: 9 x 15, stroke 2, round caps), in the
// theme's tick colour unless the row says otherwise (Delete account = risk). Drawn, never a
// "›" text glyph: the glyph was too small and thin to see (founder 2026-10-02).
export default function RowChevron({ color }) {
  return (
    <Svg width={9} height={15} viewBox="0 0 10 16" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M2 2l6 6-6 6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
