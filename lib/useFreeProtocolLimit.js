// The signed-in account's free protocol count for the screens that SHOW it (paywall, its preview,
// the entry offer, the FAQ, the app search) — lib/freePlan, OB-28: 1 for a new account, 3 for one
// made before the rule. The gates never use this hook: they ask freeProtocolLimit(user) at the moment
// of the action. null until the stored session is read (a few milliseconds); the texts then show the
// existing accounts' 3, the same answer the gates give an unknown account. The last answer is kept
// so a screen opened later starts with it.
import { useEffect, useState } from 'react';
import { getCachedUser } from './supabase';
import { freeProtocolLimit } from './freePlan';

let last = null;

export default function useFreeProtocolLimit() {
  const [n, setN] = useState(last);
  useEffect(() => {
    let on = true;
    getCachedUser()
      .then((user) => { const v = freeProtocolLimit(user); last = v; if (on) setN(v); })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return n;
}
