// Shows a free-feature explainer the first time the user reaches a screen whose feature they
// have not used (Today redesign part 18; rules in lib/featureExplainers.js). Placed on the
// feature's own screen — never on Today (the dose-logging path) and never on launch: it runs
// when the screen gains focus, after a short pause, at most one explainer a day.
// `candidates`: (userId) => [{ key, used }], read at focus time from the user's own synced data.
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from '../lib/supabase';
import { pickExplainer, loadExplainerState, saveShown } from '../lib/featureExplainers';
import { FeatureExplainerSheet } from './FeatureExplainers';

const SETTLE_MS = 700; // let the screen settle before the sheet slides up

export default function FeatureExplainerGate({ candidates }) {
  const [key, setKey] = useState(null);
  const candRef = useRef(candidates);
  candRef.current = candidates;
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const timer = setTimeout(async () => {
        try {
          const user = await getCachedUser();
          if (!user || !live) return;
          const list = typeof candRef.current === 'function' ? candRef.current(user.id) : candRef.current;
          const state = await loadExplainerState(AsyncStorage, user.id);
          const k = pickExplainer(state, list, Date.now());
          if (!k || !live) return;
          // Remembered as soon as it is shown: a closed app never shows it twice.
          await saveShown(AsyncStorage, user.id, k, Date.now());
          if (live) setKey(k);
        } catch { /* an explainer is never worth an error */ }
      }, SETTLE_MS);
      return () => { live = false; clearTimeout(timer); setKey(null); };
    }, [])
  );
  return <FeatureExplainerSheet featureKey={key} onClose={() => setKey(null)} />;
}
