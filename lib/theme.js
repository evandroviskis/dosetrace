import { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Semantic color tokens. Screens reference these (never raw hex) so light/dark
// stay in one place. Keep the KEYS identical across LIGHT and DARK.
//
// Graduated identity (docs/design/DESIGN.md §2, approved; founder 2026-09-28/29): a
// green-grey "bench" ground, white raised objects with NO border, shadow or tint,
// ink text in three steps, Cobalt blue for data only, the primary action drawn in
// ink. The legacy keys keep their names (every screen uses them) and take the
// Graduated values per DESIGN.md §10; the new names are for redesigned screens.
export const LIGHT = {
  scheme: 'light',
  // Graduated names
  ground: '#DDE0DB', raised: '#FFFFFF', well: '#EEF0EC', line: '#C3C7C0', tick: '#71766F',
  ink: '#111315', ink2: '#454A4F', ink3: '#53585D', onInk: '#FFFFFF',
  data: '#2350D8', onData: '#FFFFFF', act: '#111315', onAct: '#FFFFFF',
  attention: '#7E4A00', risk: '#9E1F19', ok: '#17623F',
  slab: '#383C41', // Today tracker block (DESIGN.md, measured)
  // The tracker slab's own interior palette (prototype .ph.light .inv, measured; Today
  // redesign part 3, founder 2026-10-02) — not the opposite page palette.
  slabInv: { ink: '#F2F3EF', ink2: '#C4C8C3', ink3: '#A9AEA9', tick: '#8A9095', line: '#4B5056', data: '#8AA8FF', onData: '#0F1114', attention: '#E3A54E', ok: '#62C597' },
  // legacy keys → Graduated (DESIGN.md §10)
  bg: '#DDE0DB',          // ground
  card: '#FFFFFF',        // raised
  card2: '#EEF0EC',       // well
  text: '#111315',        // ink
  textMuted: '#454A4F',   // ink2
  textFaint: '#53585D',   // ink3 (readable: 5.4:1 on ground)
  border: '#C3C7C0',      // line
  accent: '#2350D8',      // Cobalt (data); redesigned screens draw the one action in act
  accentText: '#FFFFFF',  // onData
  accentSoft: '#EEF0EC',  // tinted surfaces are retired → well
  accentSoftText: '#111315',
  danger: '#9E1F19',      // risk
  dangerSoft: '#EEF0EC',
  dangerSoftText: '#9E1F19',
  success: '#17623F',     // ok
  successSoft: '#EEF0EC',
  successSoftText: '#17623F',
  warning: '#7E4A00',     // attention
  warningSoft: '#EEF0EC',
  warningSoftText: '#7E4A00',
  overlay: 'rgba(0,0,0,0.45)',
  tabInactive: '#53585D', // ink3 (tab bar: never blue)
  switchTrack: '#111315', // switch on = ink
  toast: '#111315',       // ink block, onInk text
  toastText: '#FFFFFF',
  ringTrack: '#EEF0EC',
  // Graduated: no shadows (the raised step is visible on its own, 1.33:1)
  shadowCard: { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  shadowSoft: { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
};

export const DARK = {
  scheme: 'dark',
  // Graduated names (charcoal, never pitch black)
  ground: '#121416', raised: '#282B30', well: '#1D2024', line: '#3C4147', tick: '#747A7F',
  ink: '#EEEFEB', ink2: '#B5B9B4', ink3: '#9A9F9A', onInk: '#121416',
  data: '#8AA8FF', onData: '#0F1114', act: '#EEEFEB', onAct: '#121416',
  attention: '#E3A54E', risk: '#F08A80', ok: '#62C597',
  slab: '#EEEFEB', // Today tracker block
  // prototype .ph.dark .inv (measured): softer ticks and track than the light page palette
  slabInv: { ink: '#111315', ink2: '#454A4F', ink3: '#5D6267', tick: '#A5AAA3', line: '#D6D9D2', data: '#2350D8', onData: '#FFFFFF', attention: '#7E4A00', ok: '#17623F' },
  // legacy keys → Graduated (DESIGN.md §10)
  bg: '#121416',
  card: '#282B30',
  card2: '#1D2024',
  text: '#EEEFEB',
  textMuted: '#B5B9B4',
  textFaint: '#9A9F9A',
  border: '#3C4147',
  accent: '#8AA8FF',
  accentText: '#0F1114',
  accentSoft: '#1D2024',
  accentSoftText: '#EEEFEB',
  danger: '#F08A80',
  dangerSoft: '#1D2024',
  dangerSoftText: '#F08A80',
  success: '#62C597',
  successSoft: '#1D2024',
  successSoftText: '#62C597',
  warning: '#E3A54E',
  warningSoft: '#1D2024',
  warningSoftText: '#E3A54E',
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#9A9F9A',
  switchTrack: '#EEEFEB',
  toast: '#EEEFEB',
  toastText: '#121416',
  ringTrack: '#1D2024',
  shadowCard: { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  shadowSoft: { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
};

// Corner-radius scale shared across screens (scheme-independent).
export const RADIUS = { chip: 12, card: 20, cardLg: 24, pill: 22 }; // Graduated: card 20, raised object 24

const MODES = ['light', 'dark', 'system'];
const STORAGE_KEY = 'dosetrace_theme_mode';

const ThemeContext = createContext({
  mode: 'system', setMode: () => {}, colors: LIGHT, isDark: false,
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null (live)
  const [mode, setModeState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (MODES.includes(v)) { setModeState(v); applyNative(v); } })
      .catch(() => {});
  }, []);

  // Force native components (alerts, pickers, keyboard) to match an explicit
  // choice; 'system' hands control back to the OS.
  function applyNative(m) {
    try { Appearance.setColorScheme(m === 'system' ? null : m); } catch {}
  }

  function setMode(m) {
    if (!MODES.includes(m)) return;
    setModeState(m);
    applyNative(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }

  const effective = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const isDark = effective === 'dark';
  const colors = isDark ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ mode, setMode, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
