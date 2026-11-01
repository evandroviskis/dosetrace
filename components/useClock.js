import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { dayKeyAt, nextTickDelay } from '../lib/dayChange';

// DV-148: a screen left open follows the clock — it re-renders at the next local midnight (and, with
// everyMinute, every minute) while enabled, and when the app comes back to the front. Returns the
// moment and its local day / minute, for the memos that depend on them.
export default function useClock({ everyMinute = false, enabled = true } = {}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { setNowMs(Date.now()); arm(); }, nextTickDelay(Date.now(), everyMinute));
    };
    setNowMs(Date.now());
    arm();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { setNowMs(Date.now()); arm(); } });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [enabled, everyMinute]);
  return { nowMs, dayKey: dayKeyAt(nowMs), minuteKey: Math.floor(nowMs / 60000) };
}
