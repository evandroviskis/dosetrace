import { useEffect, useRef } from 'react';
import { subscribePremium } from './premiumState';

// A-164: calls onChange(premium, snapshot) whenever the shared Premium state of the signed-in
// user changes while the screen is mounted (a panel grant/revoke, a store expiry, a refund, a
// foreground re-read). Unknown states (a user change, nothing read yet) are skipped: the
// screen's own load still sets the first value.
export function usePremiumUpdates(onChange) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => subscribePremium((s) => {
    if (s.known) latest.current(s.premium, s);
  }), []);
}
