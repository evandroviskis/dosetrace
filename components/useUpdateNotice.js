// A-127 in-app update notice: the React wiring of lib/updateGate (which decides WHEN; the rules are
// lib/updateRules + lib/updateFlow). App.js ThemedRoot calls it and passes poke() to the navigator's
// onStateChange, so a pending required screen / invitation is re-checked when the route returns to a
// tab; lib/sheetPresence re-checks it when the last Modal closes.
//   required — read from the cache at once (every open, offline too), again after each server read,
//              when the A-119 device state changes (DT003 path) and when the language changes.
//              Turning it ON waits for a calm screen (no Modal open, a tab or sign-in screen), so a
//              form being filled is never pulled away; OFF is at once.
//   invite   — asked at app open (Main up for the first time in this run, and each return to the
//              foreground) and by a tap on the version push; it waits for a calm tab screen while the
//              app stays in the foreground, and is re-checked right before it shows.
//   ready    — Android Play finished the flexible download.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { updateFlow, takeForcedInvite, onForcedInvite } from '../lib/updateRuntime';
import { subscribeDevice } from '../lib/deviceRuntime';
import { createUpdateGate } from '../lib/updateGate';
import { openSheetCount, onSheetsChange } from '../lib/sheetPresence';

export function useUpdateNotice({ session, onMain, language, navigationRef, blocked }) {
  const [required, setRequired] = useState(null);
  const [invite, setInvite] = useState(null);
  const [ready, setReady] = useState(false);
  const uid = (session && session.user && session.user.id) || null;
  const live = useRef({});
  live.current = { uid, meta: (session && session.user && session.user.user_metadata) || {}, onMain, language, blocked };

  const gateRef = useRef(null);
  // Made on first use (and again after a cleanup: React may run an effect twice in development).
  const getGate = () => {
    if (gateRef.current) return gateRef.current;
    gateRef.current = createUpdateGate({
      flow: updateFlow(),
      sheets: { count: openSheetCount, subscribe: onSheetsChange },
      rootState: () => {
        const nav = navigationRef && navigationRef.current;
        try { return nav && (!nav.isReady || nav.isReady()) && nav.getRootState ? nav.getRootState() : null; } catch { return null; }
      },
      ctx: () => live.current,
      onRequired: setRequired,
      onInvite: setInvite,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h),
    });
    return gateRef.current;
  };

  useEffect(() => {
    const gate = getGate();
    const f = updateFlow();
    const refresh = () => { const p = f.refresh().catch(() => false).then(() => gate.evalRequired()); gate.setReading(p); return p; };
    const unsub = f.subscribe((s) => { setReady(!!(s && s.ready)); });
    const unsubDev = subscribeDevice(() => { gate.evalRequired(); });
    const unsubForced = onForcedInvite(() => { if (takeForcedInvite()) gate.requestInvite(true); });
    gate.evalRequired();
    refresh();
    if (takeForcedInvite()) gate.requestInvite(true);
    const app = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { gate.background(); return; }
      refresh();
      gate.requestInvite(false);
    });
    return () => { unsub(); unsubDev(); unsubForced(); app.remove(); gate.dispose(); gateRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The first time Main is up in this run (a cold start, or right after signing in).
  const mainSeen = useRef(false);
  useEffect(() => {
    if (!onMain || !uid || mainSeen.current) return;
    mainSeen.current = true;
    getGate().requestInvite(false);
  }, [onMain, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!uid) mainSeen.current = false; }, [uid]);
  // The language or the account changed: the reason line / the device floor follow.
  useEffect(() => { getGate().evalRequired(); }, [language, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Something around the screen changed (another sheet of the app, Main up): re-check what waits.
  useEffect(() => { getGate().poke(); }, [onMain, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (inv, optIn) => {
    setInvite(null);
    if (inv && inv.askOptIn && optIn != null) updateFlow().answerOptIn(inv.userId, optIn === true).catch(() => {});
  };
  return {
    required,
    invite,
    ready: ready && !!uid && !!onMain,
    poke: () => getGate().poke(),
    onLater: (optIn) => close(invite, optIn),
    onUpdate: (optIn) => { const inv = invite; close(inv, optIn); updateFlow().update('invite').catch(() => {}); },
    onRequiredUpdate: () => { updateFlow().update('required').catch(() => {}); },
    onRestart: () => { updateFlow().restart().catch(() => {}); },
  };
}
