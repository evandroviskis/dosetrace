// Plus Jakarta Sans, applied app-wide.
//
// React Native maps a fontWeight to a *separate* font file, not a synthesized
// weight, so we load each weight we use and translate every `fontWeight` in the
// app to the matching Jakarta family. This lets every existing screen adopt the
// font WITHOUT editing its StyleSheet.
//
// The interception point is the JSX runtime. Under React 19 + RN 0.81, <Text>
// is built with the new `component()` syntax (no `.render` to monkeypatch), but
// every compiled JSX element — however Text was imported — flows through
// jsx/jsxs (prod) or jsxDEV (dev). We wrap those and, whenever the element type
// is RN's Text/TextInput, append a font-family override to its style.
import React, { useEffect, useState } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// fontWeight (string or number) → loaded family. Weights we don't ship map to
// the nearest one we do, so nothing falls back to the system font.
const WEIGHT_TO_FAMILY = {
  '100': 'PlusJakartaSans_400Regular',
  '200': 'PlusJakartaSans_400Regular',
  '300': 'PlusJakartaSans_400Regular',
  '400': 'PlusJakartaSans_400Regular',
  normal: 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  bold: 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
  '900': 'PlusJakartaSans_800ExtraBold',
};
const DEFAULT_FAMILY = 'PlusJakartaSans_400Regular';

export function useAppFonts() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Never let a font problem trap the app on the splash: proceed once fonts
  // load, OR if loading errors, OR after a short timeout. If they didn't load,
  // the mapping just points at absent families and RN falls back to the system
  // font — the app still renders.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(id);
  }, []);
  return loaded || !!error || timedOut;
}

// Given a component's (possibly array/nested) style, return an override style
// pinning the correct Jakarta family — or null to leave it alone. Respects an
// explicit fontFamily the caller set on purpose (e.g. a monospace numeral run)
// and drops fontWeight so the platform doesn't re-weight an already-weighted
// face.
function familyOverride(style, allowLineHeight) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return null; // caller chose a font on purpose
  const family = WEIGHT_TO_FAMILY[flat.fontWeight] || DEFAULT_FAMILY;
  const out = { fontFamily: family };
  if (flat.fontWeight != null) out.fontWeight = undefined;
  // Density: Plus Jakarta Sans sits in a taller line box than the system font,
  // which pushed long forms out of view. Pin a slightly tighter line-height
  // (1.35×) where a size is known and none was set — recovers most of the
  // density without clipping accents/diacritics (5 languages) or emoji tiles.
  // Text ONLY: a lineHeight on a single-line TextInput drifts the Android
  // cursor/baseline, and inputs are fixed-height anyway. Explicit lineHeights
  // are respected (skipped).
  if (allowLineHeight && typeof flat.fontSize === 'number' && flat.lineHeight == null) {
    out.lineHeight = Math.round(flat.fontSize * 1.35);
  }
  return out;
}

function withFont(type, props) {
  if (!props || (type !== Text && type !== TextInput)) return props;
  const override = familyOverride(props.style, type === Text);
  if (!override) return props;
  return { ...props, style: [props.style, override] };
}

// Patch the jsx/jsxs/jsxDEV factory functions on a runtime module in place.
function patchRuntime(mod, keys) {
  if (!mod || mod.__jakartaPatched) return;
  for (const key of keys) {
    const orig = mod[key];
    if (typeof orig !== 'function') continue;
    mod[key] = function jakartaJsx(type, props, ...rest) {
      return orig.call(this, type, withFont(type, props), ...rest);
    };
  }
  mod.__jakartaPatched = true;
}

// Install once, before anything renders. Idempotent, and never allowed to
// crash the app — worst case the app just keeps the system font.
export function installFontMapping() {
  try {
    // Automatic JSX runtime — dev build (Expo Go) uses jsx-dev-runtime.
    try { patchRuntime(require('react/jsx-dev-runtime'), ['jsxDEV']); } catch {}
    try { patchRuntime(require('react/jsx-runtime'), ['jsx', 'jsxs']); } catch {}
    // Classic runtime fallback, for any file compiled with createElement.
    if (!React.createElement.__jakartaPatched) {
      const orig = React.createElement;
      const patched = function createElement(type, props, ...children) {
        return orig.apply(React, [type, withFont(type, props), ...children]);
      };
      patched.__jakartaPatched = true;
      React.createElement = patched;
    }
  } catch {
    // Fall back to system font.
  }
}
