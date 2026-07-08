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
  overlay: 'rgba(0,0,0,0.4)',
  tabInactive: '#888888',
  switchTrack: '#185FA5',
};

export const DARK = {
  scheme: 'dark',
  bg: '#0f1113',
  card: '#1a1d21',
  card2: '#24282e',
  text: '#f0f2f4',
  textMuted: '#a6acb4',
  textFaint: '#767c85',
  border: '#2b2f35',
  accent: '#4C93E0',
  accentText: '#0b1015',
  accentSoft: '#14304a',
  accentSoftText: '#9CC4EE',
  danger: '#F26D6A',
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#7f858d',
  switchTrack: '#4C93E0',
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
