import { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Semantic color tokens. Screens reference these (never raw hex) so light/dark
// stay in one place. Keep the KEYS identical across LIGHT and DARK.
export const LIGHT = {
  scheme: 'light',
  bg: '#fafafa',          // screen background
  card: '#ffffff',        // cards / grouped surfaces
  card2: '#f5f5f6',       // secondary surface (search rows, pills)
  text: '#111111',        // primary text
  textMuted: '#666666',   // secondary text
  textFaint: '#9a9a9a',   // hints / placeholders / tertiary
  border: '#ececec',      // dividers / hairlines
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
};

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
