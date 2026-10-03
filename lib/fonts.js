// Graduated type (docs/design/DESIGN.md §3, approved by the founder 2026-09-29, v4):
// reading text and controls use the phone's own font (San Francisco / Roboto);
// Geist is for titles and big numbers (22 pt and up); Geist Mono only for measured
// values (screens opt in with fontFamily: MONO[...]). Applied app-wide.
//
// React Native maps a fontWeight to a *separate* font file, not a synthesized
// weight, so every Geist weight we use is loaded and a large Text's fontWeight is
// translated to the matching Geist family. Every existing screen adopts the type
// WITHOUT editing its StyleSheet.
//
// The interception point is the JSX runtime. Under React 19 + RN 0.81, <Text>
// is built with the new `component()` syntax (no `.render` to monkeypatch), but
// every compiled JSX element — however Text was imported — flows through
// jsx/jsxs (prod) or jsxDEV (dev). We wrap those and, whenever the element type
// is RN's Text/TextInput, append a font-family override to its style.
import React, { useEffect, useState } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';

// fontWeight (string or number) → loaded Geist family (titles and big numbers).
const WEIGHT_TO_FAMILY = {
  '100': 'Geist_300Light',
  '200': 'Geist_300Light',
  '300': 'Geist_300Light',
  '400': 'Geist_400Regular',
  normal: 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  bold: 'Geist_700Bold',
  '800': 'Geist_700Bold',
  '900': 'Geist_700Bold',
};
const DEFAULT_FAMILY = 'Geist_400Regular';
// Text at this size and up is a title or a big number → Geist (role table, DESIGN.md §3).
const GEIST_MIN_SIZE = 22;
// Measured values (amounts, weights, kcal) — screens set fontFamily: MONO['500'].
export const MONO = { '400': 'GeistMono_400Regular', '500': 'GeistMono_500Medium' };


// Explicit family for a weight — for components the JSX-runtime patch below may
// not reach (e.g. a Reanimated-wrapped TextInput used for UI-thread numbers).
export function fontFamilyFor(weight) {
  return WEIGHT_TO_FAMILY[String(weight == null ? '400' : weight)] || DEFAULT_FAMILY;
}

// Google's own typeface for the "Continue with Google" button only (Sign in with Google
// branding guidelines, updated 2026-07-07: Google Sans Medium, no substitute). SIL OFL 1.1,
// bundled unmodified: assets/fonts/GoogleSans-OFL.txt. Loaded by AuthScreen itself
// (useFonts there), not in the startup gate below.
export const GOOGLE_SANS_MEDIUM = 'GoogleSans_500Medium';

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold,
    GeistMono_400Regular, GeistMono_500Medium,
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
// pinning the Geist family for a title or big number — or null to leave it alone
// (the system font, with the platform's own weights). Respects an explicit
// fontFamily the caller set on purpose (e.g. a Geist Mono value).
function familyOverride(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return null; // caller chose a font on purpose
  if (typeof flat.fontSize !== 'number' || flat.fontSize < GEIST_MIN_SIZE) return null; // reading text: system font
  return { fontFamily: WEIGHT_TO_FAMILY[flat.fontWeight] || DEFAULT_FAMILY, fontWeight: undefined };
}

function withFont(type, props) {
  if (!props || (type !== Text && type !== TextInput)) return props;
  const override = familyOverride(props.style);
  if (!override) return props;
  return { ...props, style: [props.style, override] };
}

// Patch the jsx/jsxs/jsxDEV factory functions on a runtime module in place.
function patchRuntime(mod, keys) {
  if (!mod || mod.__fontPatched) return;
  for (const key of keys) {
    const orig = mod[key];
    if (typeof orig !== 'function') continue;
    mod[key] = function fontJsx(type, props, ...rest) {
      return orig.call(this, type, withFont(type, props), ...rest);
    };
  }
  mod.__fontPatched = true;
}

// Install once, before anything renders. Idempotent, and never allowed to
// crash the app — worst case the app just keeps the system font.
export function installFontMapping() {
  try {
    // Automatic JSX runtime — dev build (Expo Go) uses jsx-dev-runtime.
    try { patchRuntime(require('react/jsx-dev-runtime'), ['jsxDEV']); } catch {}
    try { patchRuntime(require('react/jsx-runtime'), ['jsx', 'jsxs']); } catch {}
    // Classic runtime fallback, for any file compiled with createElement.
    if (!React.createElement.__fontPatched) {
      const orig = React.createElement;
      const patched = function createElement(type, props, ...children) {
        return orig.apply(React, [type, withFont(type, props), ...children]);
      };
      patched.__fontPatched = true;
      React.createElement = patched;
    }
  } catch {
    // Fall back to system font.
  }
}
