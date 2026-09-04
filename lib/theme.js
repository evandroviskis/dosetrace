import { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Semantic color tokens. Screens reference these (never raw hex) so light/dark
// stay in one place. Keep the KEYS identical across LIGHT and DARK.
export const LIGHT = {
  scheme: 'light',
  // Calm Clinical: a cool, airy off-white ground with pure-white cards that
  // lift on soft shadows. Blue stays the single accent.
  bg: '#F4F7FB',          // screen background (cool, not grey)
  card: '#ffffff',        // cards / grouped surfaces
  card2: '#EEF3F9',       // secondary surface (search rows, pills)
  text: '#111827',        // primary text (slightly cool near-black)
  textMuted: '#5B6673',   // secondary text
  textFaint: '#98A2B3',   // hints / placeholders / tertiary
  border: '#E4EBF3',      // dividers / hairlines (cool, soft)
  accent: '#185FA5',      // brand blue
  accentText: '#ffffff',  // text/icon on an accent fill
  accentSoft: '#E6F1FB',  // soft accent surface (badges)
  accentSoftText: '#0C447C',
  danger: '#E24B4A',
  dangerSoft: '#FCEBEB',
  dangerSoftText: '#A32D2D',
  success: '#1D9E75',     // solid: dots, checkmarks
  successSoft: '#E1F5EE',
  successSoftText: '#085041',
  warning: '#BA7517',
  warningSoft: '#FAEEDA',
  warningSoftText: '#633806',
  overlay: 'rgba(0,0,0,0.4)',
  tabInactive: '#888888',
  switchTrack: '#185FA5',
  toast: '#1a1a1a',       // high-contrast toast/undo bar
  toastText: '#ffffff',
  ringTrack: '#E7EDF5',   // unfilled arc of the progress ring
  // Calm Clinical elevation: cards sit on a soft, cool-tinted double shadow
  // instead of a hairline border. Spread `...c.shadowCard` into a card style.
  shadowCard: {
    shadowColor: '#12233B', shadowOpacity: 0.10, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  shadowSoft: {
    shadowColor: '#12233B', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
};

export const DARK = {
  scheme: 'dark',
  // Surfaces step up bg -> card -> card2 so cards visibly "lift" off the
  // background instead of blending into it (avoids the flat/dull look).
  bg: '#121417',          // softer than pure black
  card: '#1e242c',        // clearly elevated above bg
  card2: '#2a313b',       // secondary surface, another step up
  text: '#f3f5f8',        // primary text (crisp near-white)
  textMuted: '#c6ccd4',   // secondary text — brighter so it doesn't read dull-grey
  textFaint: '#99a1ab',   // hints / placeholders — lifted from a dim grey
  border: '#343b45',      // dividers — more visible so structure reads
  accent: '#4C93E0',
  accentText: '#0b1015',
  accentSoft: '#183454',  // soft accent surface, richer so badges register
  accentSoftText: '#a6c9f0',
  danger: '#F26D6A',
  // Semantic colors, dark variants: dark-tinted surfaces + bright text so
  // status chips/banners read on dark instead of being light chips on a void.
  dangerSoft: '#3a2122',
  dangerSoftText: '#f4a6a4',
  success: '#46c99b',     // solid: dots, checkmarks
  successSoft: '#133a2f',
  successSoftText: '#84e2c0',
  warning: '#e3a850',
  warningSoft: '#382c14',
  warningSoftText: '#f2cd88',
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#8b929c',
  switchTrack: '#4C93E0',
  toast: '#2c3036',
  toastText: '#f2f3f5',
  ringTrack: '#2a313b',
  // Dark mode: cards separate by their lifted surface color, so keep the
  // shadow deep but subtle (a faint black lift), never a glow.
  shadowCard: {
    shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  shadowSoft: {
    shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
};

// Corner-radius scale shared across screens (scheme-independent).
export const RADIUS = { chip: 12, card: 18, cardLg: 20, pill: 22 };

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
