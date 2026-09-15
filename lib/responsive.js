// Responsive layout helpers — the app is phone-first but must render correctly in
// landscape and on large screens (unfolded foldables like the Z Fold, tablets).
// The whole strategy is: never let content stretch edge-to-edge on a wide
// viewport. Content lives in a readable, centered column capped at
// CONTENT_MAX_WIDTH; the surplus width becomes calm background gutters. On a
// normal portrait phone (~360–430pt wide) the cap never bites, so nothing
// changes there.
//
// Usage in a screen:
//   const { contentStyle } = useResponsive();
//   <ScrollView contentContainerStyle={[s.scroll, contentStyle]}>…
// `contentStyle` caps + centers the scroll content. For charts/grids that need a
// live width, read `contentWidth` (the actual column width, never the full window)
// so an SVG or a column count is computed against the column, not the whole
// unfolded screen.

import { useWindowDimensions } from 'react-native';

// The readable column cap. Chosen so a portrait phone is never affected and a
// wide screen shows one comfortable column rather than a stretched-out sheet.
export const CONTENT_MAX_WIDTH = 640;

// A viewport at/above this is treated as "wide" (landscape phone, unfolded
// foldable, tablet) — screens may use it to relax a portrait-only assumption.
export const WIDE_BREAKPOINT = 700;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const wide = width >= WIDE_BREAKPOINT;
  // The actual content column width: the window, capped. Use this for charts,
  // SVGs and grid math — NOT the raw window width, which on an unfolded foldable
  // is far wider than the column we actually render into.
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  // Spread onto a ScrollView's contentContainerStyle (or a root View) to cap and
  // center the content column. width:'100%' lets it shrink on a phone; maxWidth
  // caps it on a wide screen; alignSelf centers the capped column.
  const contentStyle = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' };
  return { width, height, landscape, wide, contentWidth, contentStyle };
}
